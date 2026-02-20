import cron from 'node-cron';
import { scrapeAllDealerships, scrapeAllDealershipsIncremental } from './scraper';
import { runRobustScrape } from './robust-scraper';
import { scrapeWithZenRows } from './run-zenrows-scrape';
import { storage } from './storage';
import { facebookService } from './facebook-service';
import { facebookCatalogService } from './facebook-catalog-service';
import { processScheduledMessages } from './scheduled-message-service';

let schedulerInitialized = false;
let marketAnalysisSchedulerInitialized = false;
let facebookCatalogSchedulerInitialized = false;
let scheduledMessageSchedulerInitialized = false;

// Helper to get active dealership IDs for multi-tenant operations
async function getActiveDealershipIds(targetDealershipId?: number): Promise<number[]> {
  if (typeof targetDealershipId === 'number' && Number.isFinite(targetDealershipId)) {
    return [targetDealershipId];
  }
  try {
    const dealerships = await storage.getAllDealerships();
    return dealerships.filter(d => d.isActive).map(d => d.id);
  } catch (error) {
    console.error('[Scheduler] Failed to load dealerships for scraping:', error);
    return [];
  }
}

export function startInventoryScheduler() {
  if (schedulerInitialized) {
    console.log('Inventory scheduler already running');
    return;
  }

  // Run scraper every night at 2 AM Pacific - uses ZenRows/Zyte scraping logic
  // with full VDP extraction (trim, fuel type, images, Carfax badges, etc.)
  cron.schedule('0 2 * * *', async () => {
    console.log('🕐 Running nightly inventory sync (ZenRows/Zyte scraper)...');
    try {
      await scrapeWithZenRows();
      console.log('✓ Nightly inventory sync complete');
    } catch (error) {
      console.error('✗ Nightly inventory sync failed:', error);
      // Fallback to robust scraper if ZenRows fails
      console.log('🔄 Attempting fallback with robust scraper...');
      try {
        const targetIds = await getActiveDealershipIds();
        for (const dealershipId of targetIds) {
          const result = await runRobustScrape('scheduler', dealershipId);
          if (result.success) {
            console.log(`✓ Fallback: Dealership ${dealershipId}: ${result.vehiclesFound} vehicles`);
          } else {
            console.error(`✗ Fallback: Dealership ${dealershipId}: failed (${result.error})`);
          }
        }
      } catch (fallbackError) {
        console.error('✗ Fallback scraper also failed:', fallbackError);
      }
    }
  });

  // Check and refresh Facebook tokens daily at 3 AM
  // Refreshes tokens that expire within the next 7 days
  cron.schedule('0 3 * * *', async () => {
    console.log('🔑 Checking for expiring Facebook tokens...');
    try {
      await refreshExpiringFacebookTokens();
      console.log('✓ Facebook token refresh check complete');
    } catch (error) {
      console.error('✗ Facebook token refresh failed:', error);
    }
  });

  schedulerInitialized = true;
  console.log('✓ Inventory scheduler started (runs nightly at 2 AM using ZenRows/Zyte scraper)');
  console.log('✓ Facebook token refresh scheduler started (runs daily at 3 AM)');
}

/**
 * Refresh Facebook tokens that are expiring within 7 days.
 * This ensures users don't have to re-authenticate frequently.
 * Handles both user-scoped accounts and dealership-level accounts.
 */
async function refreshExpiringFacebookTokens(): Promise<void> {
  try {
    // Get all dealerships
    const dealerships = await storage.getAllDealerships();
    
    for (const dealership of dealerships) {
      try {
        // Get API keys for this dealership (for Facebook App credentials)
        const apiKeys = await storage.getDealershipApiKeys(dealership.id);
        if (!apiKeys?.facebookAppId || !apiKeys?.facebookAppSecret) {
          console.log(`Skipping dealership ${dealership.id}: No Facebook credentials configured`);
          continue;
        }
        
        const dealershipConfig = { 
          facebookAppId: apiKeys.facebookAppId, 
          facebookAppSecret: apiKeys.facebookAppSecret 
        };
        
        // Process all Facebook accounts for this dealership (both user-scoped and dealership-level)
        const allAccounts = await storage.getAllFacebookAccountsByDealership(dealership.id);
        
        if (allAccounts.length === 0) {
          console.log(`Skipping dealership ${dealership.id}: No Facebook accounts found`);
          continue;
        }
        
        console.log(`Processing ${allAccounts.length} Facebook account(s) for dealership ${dealership.id}`);
        
        for (const account of allAccounts) {
          // Skip accounts without valid tokens
          if (!account.accessToken || !account.tokenExpiresAt) {
            continue;
          }
          
          // Check if token needs refresh (expires within 7 days)
          if (facebookService.tokenNeedsRefresh(account.tokenExpiresAt, 7)) {
            // Create a typed account object for the refresh function
            const accountToRefresh = {
              id: account.id,
              userId: account.userId,
              accessToken: account.accessToken, // Known to be string at this point
              tokenExpiresAt: account.tokenExpiresAt // Known to be Date at this point
            };
            await refreshSingleAccount(accountToRefresh, dealershipConfig, dealership.id);
          }
        }
      } catch (error) {
        console.error(`Error processing dealership ${dealership.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Error in refreshExpiringFacebookTokens:', error);
    throw error;
  }
}

/**
 * Helper to refresh a single Facebook account token.
 */
async function refreshSingleAccount(
  account: { id: number; userId: number | null; accessToken: string; tokenExpiresAt: Date },
  dealershipConfig: { facebookAppId: string; facebookAppSecret: string },
  dealershipId: number
): Promise<void> {
  try {
    console.log(`Checking token for account ${account.id} (expires: ${account.tokenExpiresAt}, userId: ${account.userId || 'dealership-level'})`);
    
    // First validate the token is still valid before attempting refresh
    const validation = await facebookService.validateToken(account.accessToken, dealershipConfig);
    
    if (!validation || !validation.isValid) {
      // Token is revoked/invalid - mark account as needing re-authentication
      console.warn(`Token for account ${account.id} is invalid/revoked - marking as inactive`);
      await storage.updateFacebookAccountDirect(account.id, { isActive: false });
      return;
    }
    
    console.log(`Refreshing token for account ${account.id}`);
    const newToken = await facebookService.refreshLongLivedToken(account.accessToken, dealershipConfig);
    
    const newExpiresAt = new Date(Date.now() + newToken.expiresIn * 1000);
    
    await storage.updateFacebookAccountDirect(account.id, {
      accessToken: newToken.accessToken,
      tokenExpiresAt: newExpiresAt
    });
    
    console.log(`✓ Refreshed token for account ${account.id} (new expiry: ${newExpiresAt})`);
  } catch (error) {
    console.error(`Failed to refresh token for account ${account.id}:`, error);
  }
}

// Manual trigger function - uses ROBUST SCRAPER with fallback chain
export async function triggerManualSync(dealershipId?: number) {
  console.log('🔄 Manual inventory sync triggered (ROBUST MODE with retry + fallback)...');
  try {
    const targetIds = await getActiveDealershipIds(dealershipId);
    if (targetIds.length === 0) {
      return { success: false, error: 'No active dealerships available for sync' };
    }

    const responses: Array<{ dealershipId: number } & Awaited<ReturnType<typeof runRobustScrape>>> = [];

    for (const targetId of targetIds) {
      console.log(`→ Manual sync for dealership ${targetId}`);
      const result = await runRobustScrape('manual', targetId);
      responses.push({ dealershipId: targetId, ...result });
    }

    if (responses.length === 1) {
      const r = responses[0];
      if (r.success) {
        console.log(`✓ Manual sync complete: ${r.vehiclesFound} vehicles (method: ${r.method}, retries: ${r.retryCount})`);
        return { 
          success: true, 
          count: r.vehiclesFound,
          method: r.method,
          retryCount: r.retryCount
        };
      } else {
        console.error(`✗ Manual sync failed after ${r.retryCount} retries: ${r.error}`);
        return { 
          success: false, 
          error: r.error,
          method: r.method,
          retryCount: r.retryCount
        };
      }
    }

    const overallSuccess = responses.every(res => res.success);
    return { success: overallSuccess, results: responses };
  } catch (error) {
    console.error('✗ Manual sync failed:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Start the market analysis scheduler
 * Runs daily at 3 AM to refresh market data for all dealerships
 */
export function startMarketAnalysisScheduler() {
  if (marketAnalysisSchedulerInitialized) {
    console.log('Market analysis scheduler already running');
    return;
  }

  // Run market analysis at 3 AM daily (Pacific Time - adjusted for server timezone)
  cron.schedule('0 3 * * *', async () => {
    console.log('📊 Running scheduled market analysis...');
    try {
      await refreshAllDealershipMarketData();
      console.log('✓ Scheduled market analysis complete');
    } catch (error) {
      console.error('✗ Scheduled market analysis failed:', error);
    }
  });

  marketAnalysisSchedulerInitialized = true;
  console.log('✓ Market analysis scheduler started (runs daily at 3 AM)');
}

/**
 * Start the Facebook Catalog auto-sync scheduler.
 * This syncs dealership inventory to Facebook Catalogs for automotive ads.
 */
export function startFacebookCatalogScheduler() {
  if (facebookCatalogSchedulerInitialized) {
    console.log('Facebook Catalog scheduler already running');
    return;
  }

  // Sync Facebook Catalogs daily at 4 AM (after inventory sync at midnight)
  cron.schedule('0 4 * * *', async () => {
    console.log('📘 Running scheduled Facebook Catalog sync...');
    try {
      await syncAllFacebookCatalogs();
      console.log('✓ Facebook Catalog sync complete');
    } catch (error) {
      console.error('✗ Facebook Catalog sync failed:', error);
    }
  });

  facebookCatalogSchedulerInitialized = true;
  console.log('✓ Facebook Catalog scheduler started (runs daily at 4 AM)');
}

/**
 * Sync inventory to all Facebook Catalogs with auto-sync enabled.
 */
async function syncAllFacebookCatalogs(): Promise<void> {
  try {
    // Get all active catalog configs with auto-sync enabled
    const configs = await storage.getAllFacebookCatalogConfigs();
    const autoSyncConfigs = configs.filter(c => c.isActive && c.autoSyncEnabled);

    console.log(`[FB Catalog] Found ${autoSyncConfigs.length} catalogs to sync`);

    for (const config of autoSyncConfigs) {
      try {
        console.log(`[FB Catalog] Syncing dealership ${config.dealershipId}...`);
        
        // Get dealership's vehicles
        const { vehicles } = await storage.getVehicles(config.dealershipId, 500, 0);
        
        if (vehicles.length === 0) {
          console.log(`[FB Catalog] No vehicles for dealership ${config.dealershipId}, skipping`);
          await storage.updateCatalogSyncStatus(config.dealershipId, {
            lastSyncAt: new Date(),
            lastSyncStatus: 'success',
            lastSyncMessage: 'No vehicles to sync',
            vehiclesSynced: 0
          });
          continue;
        }

        // Get dealership for URL
        const dealership = await storage.getDealershipById(config.dealershipId);
        const baseUrl = dealership?.subdomain 
          ? `https://${dealership.subdomain}.example.com` 
          : 'https://olympicautogroup.ca';

        // Sync to Facebook Catalog
        const catalogConfig = { catalogId: config.catalogId, accessToken: config.accessToken };
        const result = await facebookCatalogService.syncVehiclesToCatalog(
          catalogConfig,
          vehicles, 
          baseUrl
        );

        // Build status message
        const statusMessage = result.success 
          ? `Created: ${result.created}, Updated: ${result.updated}, Deleted: ${result.deleted}`
          : result.errors.join('; ');

        // Update sync status
        await storage.updateCatalogSyncStatus(config.dealershipId, {
          lastSyncAt: new Date(),
          lastSyncStatus: result.success ? 'success' : 'failed',
          lastSyncMessage: statusMessage,
          vehiclesSynced: result.created + result.updated
        });

        console.log(`[FB Catalog] Dealership ${config.dealershipId}: ${result.success ? 'Success' : 'Failed'} - ${statusMessage}`);
        
      } catch (error) {
        console.error(`[FB Catalog] Error syncing dealership ${config.dealershipId}:`, error);
        
        await storage.updateCatalogSyncStatus(config.dealershipId, {
          lastSyncAt: new Date(),
          lastSyncStatus: 'failed',
          lastSyncMessage: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  } catch (error) {
    console.error('[FB Catalog] Error in syncAllFacebookCatalogs:', error);
    throw error;
  }
}

/**
 * Refresh market data for all active dealerships
 */
async function refreshAllDealershipMarketData(): Promise<void> {
  try {
    const dealerships = await storage.getAllDealerships();
    
    for (const dealership of dealerships) {
      if (!dealership.isActive) continue;
      
      console.log(`[MarketAnalysis] Processing dealership ${dealership.id}: ${dealership.name}`);
      
      try {
        // Get dealership's vehicles
        const { vehicles } = await storage.getVehicles(dealership.id, 500, 0);
        
        if (vehicles.length === 0) {
          console.log(`[MarketAnalysis] No vehicles for dealership ${dealership.id}, skipping`);
          continue;
        }
        
        // Get manager settings for postal code
        const settings = await storage.getManagerSettingsByDealership(dealership.id);
        const postalCode = settings?.postalCode || 'V6H 1G9';
        
        // Get unique make/model combinations
        const uniqueVehicles = new Map<string, { make: string; model: string; yearMin: number; yearMax: number }>();
        
        vehicles.forEach(v => {
          if (v.make && v.model) {
            const key = `${v.make}-${v.model}`;
            const existing = uniqueVehicles.get(key);
            if (existing) {
              existing.yearMin = Math.min(existing.yearMin, v.year || existing.yearMin);
              existing.yearMax = Math.max(existing.yearMax, v.year || existing.yearMax);
            } else {
              uniqueVehicles.set(key, {
                make: v.make,
                model: v.model,
                yearMin: v.year || new Date().getFullYear() - 3,
                yearMax: v.year || new Date().getFullYear()
              });
            }
          }
        });
        
        // Import market aggregation service
        const { marketAggregationService } = await import('./market-aggregation-service');
        
        // Aggregate market data for each unique vehicle
        let totalNewListings = 0;
        const vehicleEntries = Array.from(uniqueVehicles.entries());
        
        for (const [key, vehicleInfo] of vehicleEntries) {
          try {
            const result = await marketAggregationService.aggregateMarketData({
              make: vehicleInfo.make,
              model: vehicleInfo.model,
              yearMin: vehicleInfo.yearMin,
              yearMax: vehicleInfo.yearMax,
              postalCode,
              radiusKm: 250, // Default to 250km for scheduled refresh
              maxResults: 100,
              dealershipId: dealership.id
            });
            totalNewListings += result.totalListings;
          } catch (e) {
            console.error(`[MarketAnalysis] Error for ${key}:`, e);
          }
        }
        
        console.log(`[MarketAnalysis] Dealership ${dealership.id}: ${uniqueVehicles.size} vehicles analyzed, ${totalNewListings} new listings`);
        
      } catch (error) {
        console.error(`[MarketAnalysis] Error processing dealership ${dealership.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[MarketAnalysis] Error in refreshAllDealershipMarketData:', error);
    throw error;
  }
}

// ===== GOHIGHLEVEL CRM SYNC SCHEDULER =====

let ghlSyncSchedulerInitialized = false;

/**
 * Start the GoHighLevel CRM sync scheduler.
 * Runs daily at 5 AM to sync contacts and appointments between GHL, Lotview, and PBS.
 */
export function startGhlSyncScheduler() {
  if (ghlSyncSchedulerInitialized) {
    console.log('GHL sync scheduler already running');
    return;
  }

  // Sync GHL data daily at 5 AM (after Facebook Catalog sync at 4 AM)
  cron.schedule('0 5 * * *', async () => {
    console.log('🔄 Running scheduled GHL CRM sync...');
    try {
      await runGhlBatchSync();
      console.log('✓ GHL CRM sync complete');
    } catch (error) {
      console.error('✗ GHL CRM sync failed:', error);
    }
  });

  ghlSyncSchedulerInitialized = true;
  console.log('✓ GHL sync scheduler started (runs daily at 5 AM)');
}

/**
 * Run batch sync for all dealerships with GHL bidirectional sync enabled.
 */
async function runGhlBatchSync(): Promise<void> {
  try {
    const { runGhlSyncForAllDealerships } = await import('./ghl-sync-service');
    await runGhlSyncForAllDealerships();
  } catch (error) {
    console.error('[GHL Sync] Error in batch sync:', error);
    throw error;
  }
}

// ===== AUTOMATION ENGINE SCHEDULER =====

let automationSchedulerInitialized = false;

/**
 * Start the automation engine scheduler.
 * Runs every 5 minutes to process follow-up sequences, appointment reminders, and price alerts.
 */
export function startAutomationScheduler() {
  if (automationSchedulerInitialized) {
    console.log('Automation scheduler already running');
    return;
  }

  // Process follow-ups every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    console.log('🤖 Running automation engine...');
    try {
      await runAutomationEngine();
      console.log('✓ Automation engine cycle complete');
    } catch (error) {
      console.error('✗ Automation engine failed:', error);
    }
  });

  automationSchedulerInitialized = true;
  console.log('✓ Automation scheduler started (runs every 5 minutes)');
}

/**
 * Run all automation tasks for all dealerships.
 */
async function runAutomationEngine(): Promise<void> {
  try {
    const { processAllDealershipFollowUps } = await import('./automation-service');
    await processAllDealershipFollowUps();
  } catch (error) {
    console.error('[Automation] Error in automation engine:', error);
    throw error;
  }
}

// ===== RE-ENGAGEMENT CAMPAIGN SCHEDULER =====

let reengagementSchedulerInitialized = false;

/**
 * Start the re-engagement campaign scheduler.
 * Runs daily at 6 AM to find inactive contacts (90+ days) and enroll them in re-engagement sequences.
 */
export function startReengagementScheduler() {
  if (reengagementSchedulerInitialized) {
    console.log('Re-engagement scheduler already running');
    return;
  }

  // Process re-engagement campaigns daily at 6 AM (after GHL sync at 5 AM)
  cron.schedule('0 6 * * *', async () => {
    console.log('🔄 Running re-engagement campaign engine...');
    try {
      await runReengagementEngine();
      console.log('✓ Re-engagement campaign cycle complete');
    } catch (error) {
      console.error('✗ Re-engagement campaign failed:', error);
    }
  });

  reengagementSchedulerInitialized = true;
  console.log('✓ Re-engagement scheduler started (runs daily at 6 AM)');
}

/**
 * Process all due re-engagement campaigns across all dealerships.
 * Finds inactive contacts and enrolls them in configured follow-up sequences.
 */
async function runReengagementEngine(): Promise<void> {
  try {
    // Get all campaigns that are due to run
    const dueCampaigns = await storage.getDueReengagementCampaigns();
    
    console.log(`[Re-engagement] Found ${dueCampaigns.length} campaigns due to run`);
    
    for (const campaign of dueCampaigns) {
      try {
        console.log(`[Re-engagement] Processing campaign ${campaign.id}: ${campaign.name} (dealership ${campaign.dealershipId})`);
        
        // Skip if no sequence configured
        if (!campaign.sequenceId) {
          console.log(`[Re-engagement] No sequence configured for campaign ${campaign.id}, skipping`);
          continue;
        }
        
        // Find inactive contacts for this dealership
        const inactiveContacts = await storage.getInactiveContacts(
          campaign.dealershipId, 
          campaign.inactiveDaysThreshold,
          campaign.maxContactsPerRun || 50
        );
        
        if (inactiveContacts.length === 0) {
          console.log(`[Re-engagement] No inactive contacts found for campaign ${campaign.id}`);
          
          // Update campaign stats
          await storage.updateReengagementCampaign(campaign.id, campaign.dealershipId, {
            lastRunAt: new Date(),
            nextRunAt: getNextRunDate(campaign.runFrequency),
          });
          continue;
        }
        
        console.log(`[Re-engagement] Found ${inactiveContacts.length} inactive contacts for campaign ${campaign.id}`);
        
        // Enroll contacts in the configured sequence
        let enrolledCount = 0;
        const { createAutomationService } = await import('./automation-service');
        const automation = createAutomationService(campaign.dealershipId);
        
        for (const contact of inactiveContacts) {
          try {
            // Create a sequence execution for tracking
            const execution = await storage.createSequenceExecution({
              dealershipId: campaign.dealershipId,
              sequenceId: campaign.sequenceId!,
              contactPhone: contact.contactPhone || '',
              contactEmail: contact.contactEmail || '',
              contactName: contact.contactName || '',
              triggerType: 'reengagement_campaign',
              totalSteps: 1,
              status: 'active',
              currentStep: 1,
            });
            
            // Trigger the follow-up sequence via automation service
            await automation.triggerFollowUp({
              contactPhone: contact.contactPhone || undefined,
              contactEmail: contact.contactEmail || undefined,
              contactName: contact.contactName || undefined,
              sourceType: 'reengagement',
              triggerType: 'sequence',
            });
            
            // Update contact activity to mark as contacted
            await storage.updateContactActivity(contact.id, campaign.dealershipId, {
              reengagementStatus: 'contacted',
              lastReengagementAt: new Date(),
              reengagementCount: (contact.reengagementCount || 0) + 1,
            });
            
            enrolledCount++;
          } catch (e) {
            console.error(`[Re-engagement] Error enrolling contact ${contact.id}:`, e);
          }
        }
        
        // Update campaign stats
        await storage.updateReengagementCampaign(campaign.id, campaign.dealershipId, {
          lastRunAt: new Date(),
          nextRunAt: getNextRunDate(campaign.runFrequency),
          totalContactsTargeted: (campaign.totalContactsTargeted || 0) + enrolledCount,
        });
        
        console.log(`[Re-engagement] Campaign ${campaign.id}: Enrolled ${enrolledCount} contacts`);
        
      } catch (error) {
        console.error(`[Re-engagement] Error processing campaign ${campaign.id}:`, error);
      }
    }
  } catch (error) {
    console.error('[Re-engagement] Error in re-engagement engine:', error);
    throw error;
  }
}

/**
 * Calculate the next run date based on campaign frequency.
 */
function getNextRunDate(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case 'daily':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case 'weekly':
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case 'biweekly':
      return new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    case 'monthly':
    default:
      return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  }
}

// ===== SCHEDULED MESSAGE SCHEDULER =====

/**
 * Start the scheduled message scheduler.
 * Runs every minute to check for due messages and send them.
 */
export function startScheduledMessageScheduler() {
  if (scheduledMessageSchedulerInitialized) {
    console.log('Scheduled message scheduler already running');
    return;
  }

  // Check for due messages every minute
  cron.schedule('* * * * *', async () => {
    try {
      await processScheduledMessages();
    } catch (error) {
      console.error('✗ Scheduled message processing failed:', error);
    }
  });

  scheduledMessageSchedulerInitialized = true;
  console.log('✓ Scheduled message scheduler started (runs every minute)');
}
