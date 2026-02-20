import puppeteer, { Browser, Page } from 'puppeteer';
import puppeteerExtra from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { db } from './db';
import { 
  fbMarketplaceAccounts, 
  fbMarketplaceListings, 
  fbMarketplaceQueue, 
  fbMarketplaceActivityLog,
  fbMarketplaceSettings,
  vehicles,
  dealerships
} from '@shared/schema';
import { eq, and, lt, isNull, or, desc, asc } from 'drizzle-orm';

puppeteerExtra.use(StealthPlugin());

const PROFILES_DIR = '/tmp/fb_marketplace_profiles';
const ENCRYPTION_KEY = process.env.FB_PROFILE_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

interface PostResult {
  success: boolean;
  listingId?: string;
  listingUrl?: string;
  error?: string;
}

interface VehicleData {
  id: number;
  year: number;
  make: string;
  model: string;
  trim: string;
  price: number;
  mileage: number | null;
  vin: string | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  transmission: string | null;
  fuelType: string | null;
  bodyType: string | null;
  drivetrain: string | null;
  images: string[];
  description: string | null;
}

export class FBMarketplaceService {
  private dealershipId: number;

  constructor(dealershipId: number) {
    this.dealershipId = dealershipId;
    if (!fs.existsSync(PROFILES_DIR)) {
      fs.mkdirSync(PROFILES_DIR, { recursive: true });
    }
  }

  private getProfilePath(profileId: string): string {
    return path.join(PROFILES_DIR, `profile_${profileId}`);
  }

  private async logActivity(
    action: string,
    status: 'success' | 'failed' | 'warning',
    options: {
      accountId?: number;
      listingId?: number;
      vehicleId?: number;
      details?: string;
      errorMessage?: string;
      duration?: number;
    } = {}
  ) {
    try {
      await db.insert(fbMarketplaceActivityLog).values({
        dealershipId: this.dealershipId,
        accountId: options.accountId ?? null,
        listingId: options.listingId ?? null,
        vehicleId: options.vehicleId ?? null,
        action,
        status,
        details: options.details ?? null,
        errorMessage: options.errorMessage ?? null,
        duration: options.duration ?? null,
      });
    } catch (error) {
      console.error('[FBMarketplace] Failed to log activity:', error);
    }
  }

  async getAccountsByUserId(userId: number): Promise<any[]> {
    return db
      .select()
      .from(fbMarketplaceAccounts)
      .where(and(
        eq(fbMarketplaceAccounts.userId, userId),
        eq(fbMarketplaceAccounts.dealershipId, this.dealershipId)
      ))
      .orderBy(asc(fbMarketplaceAccounts.accountSlot));
  }

  async createAccount(accountName: string, facebookEmail: string, userId: number, accountSlot?: number): Promise<number> {
    const existingAccounts = await this.getAccountsByUserId(userId);
    
    if (existingAccounts.length >= 2) {
      throw new Error('Maximum of 2 Facebook accounts allowed per user');
    }

    const usedSlots = existingAccounts.map(a => a.accountSlot);
    const slot = accountSlot || (usedSlots.includes(1) ? 2 : 1);

    if (usedSlots.includes(slot)) {
      throw new Error(`Account slot ${slot} is already in use`);
    }

    const profileId = crypto.randomUUID();
    
    const [account] = await db.insert(fbMarketplaceAccounts).values({
      dealershipId: this.dealershipId,
      userId,
      accountSlot: slot,
      accountName,
      facebookEmail,
      profileId,
      status: 'needs_auth',
    }).returning();

    await this.logActivity('account_created', 'success', {
      accountId: account.id,
      details: JSON.stringify({ accountName, facebookEmail, userId, accountSlot: slot }),
    });

    return account.id;
  }

  async initiateAuth(accountId: number): Promise<{ authUrl: string; profileId: string }> {
    const [account] = await db
      .select()
      .from(fbMarketplaceAccounts)
      .where(and(
        eq(fbMarketplaceAccounts.id, accountId),
        eq(fbMarketplaceAccounts.dealershipId, this.dealershipId)
      ));

    if (!account) {
      throw new Error('Account not found');
    }

    const profilePath = this.getProfilePath(account.profileId);
    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
    }

    return {
      authUrl: 'https://www.facebook.com/login',
      profileId: account.profileId,
    };
  }

  async launchBrowserForAuth(profileId: string): Promise<Browser> {
    const profilePath = this.getProfilePath(profileId);
    
    const browser = await puppeteerExtra.launch({
      headless: false,
      userDataDir: profilePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1366,768',
      ],
      defaultViewport: { width: 1366, height: 768 },
    });

    return browser;
  }

  async verifyAndSaveSession(accountId: number): Promise<boolean> {
    const [account] = await db
      .select()
      .from(fbMarketplaceAccounts)
      .where(eq(fbMarketplaceAccounts.id, accountId));

    if (!account) return false;

    const profilePath = this.getProfilePath(account.profileId);
    
    let browser: Browser | null = null;
    try {
      browser = await puppeteerExtra.launch({
        headless: true,
        userDataDir: profilePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.goto('https://www.facebook.com/marketplace/', { waitUntil: 'networkidle2', timeout: 30000 });

      const isLoggedIn = await page.evaluate(() => {
        return !document.querySelector('form[action*="login"]') && 
               (document.body.innerText.includes('Marketplace') || 
                document.body.innerText.includes('Your Listings'));
      });

      if (isLoggedIn) {
        const fbUserId = await page.evaluate(() => {
          const scripts = document.querySelectorAll('script');
          for (const script of scripts) {
            const match = script.textContent?.match(/"USER_ID":"(\d+)"/);
            if (match) return match[1];
          }
          return null;
        });

        await db.update(fbMarketplaceAccounts)
          .set({
            status: 'active',
            lastAuthAt: new Date(),
            sessionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            facebookUserId: fbUserId,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(fbMarketplaceAccounts.id, accountId));

        await this.logActivity('auth_verified', 'success', { accountId });
        return true;
      } else {
        await db.update(fbMarketplaceAccounts)
          .set({
            status: 'session_expired',
            lastError: 'Session verification failed - not logged in',
            updatedAt: new Date(),
          })
          .where(eq(fbMarketplaceAccounts.id, accountId));

        await this.logActivity('auth_failed', 'failed', { 
          accountId, 
          errorMessage: 'Not logged in to Facebook' 
        });
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await db.update(fbMarketplaceAccounts)
        .set({
          status: 'session_expired',
          lastError: errorMsg,
          updatedAt: new Date(),
        })
        .where(eq(fbMarketplaceAccounts.id, accountId));

      await this.logActivity('auth_error', 'failed', { accountId, errorMessage: errorMsg });
      return false;
    } finally {
      if (browser) await browser.close();
    }
  }

  async postVehicleToMarketplace(vehicleId: number, accountId: number): Promise<PostResult> {
    const startTime = Date.now();
    
    const [account] = await db
      .select()
      .from(fbMarketplaceAccounts)
      .where(and(
        eq(fbMarketplaceAccounts.id, accountId),
        eq(fbMarketplaceAccounts.status, 'active')
      ));

    if (!account) {
      return { success: false, error: 'Account not active or not found' };
    }

    if (account.postsToday >= account.dailyLimit) {
      return { success: false, error: 'Daily posting limit reached for this account' };
    }

    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(eq(vehicles.id, vehicleId));

    if (!vehicle) {
      return { success: false, error: 'Vehicle not found' };
    }

    const [settings] = await db
      .select()
      .from(fbMarketplaceSettings)
      .where(eq(fbMarketplaceSettings.dealershipId, this.dealershipId));

    const profilePath = this.getProfilePath(account.profileId);
    let browser: Browser | null = null;
    let page: Page | null = null;

    try {
      browser = await puppeteerExtra.launch({
        headless: true,
        userDataDir: profilePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
        ],
      });

      page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

      await page.goto('https://www.facebook.com/marketplace/create/vehicle', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      await this.randomDelay(2000, 4000);

      const isLoggedIn = await page.evaluate(() => {
        return !document.querySelector('form[action*="login"]');
      });

      if (!isLoggedIn) {
        await db.update(fbMarketplaceAccounts)
          .set({ status: 'session_expired', updatedAt: new Date() })
          .where(eq(fbMarketplaceAccounts.id, accountId));
        return { success: false, error: 'Session expired - re-authentication required' };
      }

      await this.fillVehicleForm(page, vehicle, settings);

      await this.randomDelay(1000, 2000);
      
      const submitButton = await page.$('div[aria-label="Publish"], button[aria-label="Publish"], div[role="button"]:has-text("Publish")');
      if (submitButton) {
        await submitButton.click();
        await this.randomDelay(3000, 5000);
      }

      const currentUrl = page.url();
      const listingIdMatch = currentUrl.match(/\/item\/(\d+)/);
      const listingId = listingIdMatch ? listingIdMatch[1] : null;

      const [listing] = await db.insert(fbMarketplaceListings).values({
        dealershipId: this.dealershipId,
        vehicleId: vehicle.id,
        accountId: account.id,
        fbListingId: listingId,
        fbListingUrl: listingId ? `https://www.facebook.com/marketplace/item/${listingId}` : null,
        status: 'posted',
        postedPrice: vehicle.price,
        currentPrice: vehicle.price,
        postedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      }).returning();

      await db.update(fbMarketplaceAccounts)
        .set({
          postsToday: account.postsToday + 1,
          postsThisWeek: account.postsThisWeek + 1,
          totalPosts: account.totalPosts + 1,
          lastPostAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(fbMarketplaceAccounts.id, accountId));

      const duration = Date.now() - startTime;
      await this.logActivity('post', 'success', {
        accountId,
        listingId: listing.id,
        vehicleId: vehicle.id,
        duration,
        details: JSON.stringify({ fbListingId: listingId }),
      });

      return {
        success: true,
        listingId: listingId || undefined,
        listingUrl: listing.fbListingUrl || undefined,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const duration = Date.now() - startTime;
      
      await this.logActivity('post', 'failed', {
        accountId,
        vehicleId,
        errorMessage: errorMsg,
        duration,
      });

      return { success: false, error: errorMsg };
    } finally {
      if (browser) await browser.close();
    }
  }

  private async fillVehicleForm(page: Page, vehicle: any, settings: any) {
    const title = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}`.trim();
    
    const yearSelector = 'input[aria-label*="Year"], input[placeholder*="Year"]';
    await page.waitForSelector(yearSelector, { timeout: 10000 }).catch(() => null);
    await page.type(yearSelector, String(vehicle.year));
    await this.randomDelay(500, 1000);

    const makeSelector = 'input[aria-label*="Make"], input[placeholder*="Make"]';
    await page.type(makeSelector, vehicle.make);
    await this.randomDelay(500, 1000);

    const modelSelector = 'input[aria-label*="Model"], input[placeholder*="Model"]';
    await page.type(modelSelector, vehicle.model);
    await this.randomDelay(500, 1000);

    const priceSelector = 'input[aria-label*="Price"], input[placeholder*="Price"]';
    await page.type(priceSelector, String(Math.round(vehicle.price / 100)));
    await this.randomDelay(500, 1000);

    if (vehicle.mileage) {
      const mileageSelector = 'input[aria-label*="Mileage"], input[aria-label*="mileage"], input[placeholder*="Mileage"]';
      await page.type(mileageSelector, String(vehicle.mileage)).catch(() => null);
      await this.randomDelay(300, 600);
    }

    if (vehicle.vin) {
      const vinSelector = 'input[aria-label*="VIN"], input[placeholder*="VIN"]';
      await page.type(vinSelector, vehicle.vin).catch(() => null);
      await this.randomDelay(300, 600);
    }

    let description = vehicle.description || '';
    if (settings?.descriptionTemplate) {
      description = settings.descriptionTemplate
        .replace('{year}', vehicle.year)
        .replace('{make}', vehicle.make)
        .replace('{model}', vehicle.model)
        .replace('{trim}', vehicle.trim || '')
        .replace('{price}', (vehicle.price / 100).toLocaleString())
        .replace('{mileage}', vehicle.mileage?.toLocaleString() || 'N/A')
        .replace('{vin}', vehicle.vin || '')
        .replace('{description}', description);
    }

    const descSelector = 'textarea[aria-label*="Description"], textarea[placeholder*="Description"]';
    await page.type(descSelector, description.substring(0, 1000)).catch(() => null);
    await this.randomDelay(500, 1000);

    const images = Array.isArray(vehicle.images) ? vehicle.images : [];
    if (images.length > 0) {
      const fileInput = await page.$('input[type="file"][accept*="image"]');
      if (fileInput) {
        for (const imageUrl of images.slice(0, 10)) {
          try {
            const response = await fetch(imageUrl);
            const buffer = await response.arrayBuffer();
            const tempPath = `/tmp/fb_img_${Date.now()}.jpg`;
            fs.writeFileSync(tempPath, Buffer.from(buffer));
            await fileInput.uploadFile(tempPath);
            fs.unlinkSync(tempPath);
            await this.randomDelay(1000, 2000);
          } catch (e) {
            console.error('[FBMarketplace] Failed to upload image:', imageUrl);
          }
        }
      }
    }
  }

  private randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  async processQueue(): Promise<{ processed: number; succeeded: number; failed: number }> {
    const [settings] = await db
      .select()
      .from(fbMarketplaceSettings)
      .where(eq(fbMarketplaceSettings.dealershipId, this.dealershipId));

    if (!settings?.isEnabled) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const now = new Date();
    const currentHour = now.getHours();
    
    if (currentHour < settings.postingStartHour || currentHour >= settings.postingEndHour) {
      console.log(`[FBMarketplace] Outside posting hours (${settings.postingStartHour}-${settings.postingEndHour})`);
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    const pendingItems = await db
      .select()
      .from(fbMarketplaceQueue)
      .where(and(
        eq(fbMarketplaceQueue.dealershipId, this.dealershipId),
        eq(fbMarketplaceQueue.status, 'pending'),
        or(
          isNull(fbMarketplaceQueue.scheduledFor),
          lt(fbMarketplaceQueue.scheduledFor, now)
        )
      ))
      .orderBy(asc(fbMarketplaceQueue.priority), asc(fbMarketplaceQueue.createdAt))
      .limit(5);

    let processed = 0, succeeded = 0, failed = 0;

    for (const item of pendingItems) {
      const strictMode = item.accountId !== null;
      const account = await this.selectAccountForPosting(item.accountId, strictMode);
      if (!account) {
        const errorMsg = strictMode 
          ? 'Assigned account is not available (inactive or limit reached)' 
          : 'No active accounts available';
        await db.update(fbMarketplaceQueue)
          .set({ 
            status: 'failed', 
            lastError: errorMsg,
            updatedAt: new Date() 
          })
          .where(eq(fbMarketplaceQueue.id, item.id));
        failed++;
        continue;
      }

      await db.update(fbMarketplaceQueue)
        .set({ status: 'processing', startedAt: new Date(), updatedAt: new Date() })
        .where(eq(fbMarketplaceQueue.id, item.id));

      try {
        let result: PostResult;
        
        switch (item.action) {
          case 'post':
            result = await this.postVehicleToMarketplace(item.vehicleId, account.id);
            break;
          case 'mark_sold':
            result = await this.markListingSold(item.vehicleId);
            break;
          case 'remove':
            result = await this.removeListing(item.vehicleId);
            break;
          default:
            result = { success: false, error: `Unknown action: ${item.action}` };
        }

        if (result.success) {
          await db.update(fbMarketplaceQueue)
            .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
            .where(eq(fbMarketplaceQueue.id, item.id));
          succeeded++;
        } else {
          const attempts = item.attempts + 1;
          if (attempts >= item.maxAttempts) {
            await db.update(fbMarketplaceQueue)
              .set({ 
                status: 'failed', 
                lastError: result.error,
                attempts,
                updatedAt: new Date() 
              })
              .where(eq(fbMarketplaceQueue.id, item.id));
            failed++;
          } else {
            await db.update(fbMarketplaceQueue)
              .set({ 
                status: 'pending', 
                lastError: result.error,
                attempts,
                scheduledFor: new Date(Date.now() + 30 * 60 * 1000),
                updatedAt: new Date() 
              })
              .where(eq(fbMarketplaceQueue.id, item.id));
          }
        }

        const delayMinutes = Math.floor(
          Math.random() * (settings.maxDelayMinutes - settings.minDelayMinutes + 1) + settings.minDelayMinutes
        );
        await this.randomDelay(delayMinutes * 60 * 1000 * 0.1, delayMinutes * 60 * 1000 * 0.2);

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        await db.update(fbMarketplaceQueue)
          .set({ 
            status: 'failed', 
            lastError: errorMsg,
            attempts: item.attempts + 1,
            updatedAt: new Date() 
          })
          .where(eq(fbMarketplaceQueue.id, item.id));
        failed++;
      }

      processed++;
    }

    return { processed, succeeded, failed };
  }

  private async selectAccountForPosting(preferredAccountId: number | null, strictMode: boolean = false): Promise<typeof fbMarketplaceAccounts.$inferSelect | null> {
    if (preferredAccountId) {
      const [account] = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(and(
          eq(fbMarketplaceAccounts.id, preferredAccountId),
          eq(fbMarketplaceAccounts.status, 'active')
        ));
      
      if (account && account.postsToday < account.dailyLimit) {
        return account;
      }
      
      if (strictMode) {
        return null;
      }
    }

    if (strictMode && preferredAccountId) {
      return null;
    }

    const accounts = await db
      .select()
      .from(fbMarketplaceAccounts)
      .where(and(
        eq(fbMarketplaceAccounts.dealershipId, this.dealershipId),
        eq(fbMarketplaceAccounts.status, 'active')
      ))
      .orderBy(asc(fbMarketplaceAccounts.postsToday));

    for (const account of accounts) {
      if (account.postsToday < account.dailyLimit) {
        return account;
      }
    }

    return null;
  }

  async markListingSold(vehicleId: number): Promise<PostResult> {
    const [listing] = await db
      .select()
      .from(fbMarketplaceListings)
      .where(and(
        eq(fbMarketplaceListings.vehicleId, vehicleId),
        eq(fbMarketplaceListings.status, 'posted')
      ));

    if (!listing) {
      return { success: false, error: 'No active listing found for this vehicle' };
    }

    await db.update(fbMarketplaceListings)
      .set({
        status: 'sold',
        soldAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fbMarketplaceListings.id, listing.id));

    await this.logActivity('mark_sold', 'success', {
      listingId: listing.id,
      vehicleId,
    });

    return { success: true };
  }

  async removeListing(vehicleId: number): Promise<PostResult> {
    const [listing] = await db
      .select()
      .from(fbMarketplaceListings)
      .where(and(
        eq(fbMarketplaceListings.vehicleId, vehicleId),
        eq(fbMarketplaceListings.status, 'posted')
      ));

    if (!listing) {
      return { success: false, error: 'No active listing found' };
    }

    await db.update(fbMarketplaceListings)
      .set({
        status: 'removed',
        removedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fbMarketplaceListings.id, listing.id));

    await this.logActivity('remove', 'success', {
      listingId: listing.id,
      vehicleId,
    });

    return { success: true };
  }

  async queueVehicleForPosting(vehicleId: number, priority: number = 5, options?: { userId?: number; accountId?: number }): Promise<number> {
    const [vehicle] = await db
      .select()
      .from(vehicles)
      .where(and(
        eq(vehicles.id, vehicleId),
        eq(vehicles.dealershipId, this.dealershipId)
      ));

    if (!vehicle) {
      throw new Error('Vehicle not found or not in this dealership');
    }

    const existing = await db
      .select()
      .from(fbMarketplaceQueue)
      .where(and(
        eq(fbMarketplaceQueue.vehicleId, vehicleId),
        eq(fbMarketplaceQueue.action, 'post'),
        eq(fbMarketplaceQueue.status, 'pending')
      ));

    if (existing.length > 0) {
      return existing[0].id;
    }

    let accountId = options?.accountId;
    
    if (options?.userId) {
      const userAccounts = await this.getAccountsByUserId(options.userId);
      
      if (!accountId) {
        const activeAccount = userAccounts.find(a => a.status === 'active' && a.postsToday < a.dailyLimit);
        if (activeAccount) {
          accountId = activeAccount.id;
        } else {
          throw new Error('No active Facebook account available. Please connect an account first.');
        }
      } else {
        const ownedAccount = userAccounts.find(a => a.id === accountId);
        if (!ownedAccount) {
          throw new Error('You do not own this Facebook account');
        }
        if (ownedAccount.status !== 'active') {
          throw new Error('This Facebook account is not active. Please reconnect it.');
        }
        if (ownedAccount.postsToday >= ownedAccount.dailyLimit) {
          throw new Error('This account has reached its daily posting limit. Try another account or wait until tomorrow.');
        }
      }
    }

    const [queueItem] = await db.insert(fbMarketplaceQueue).values({
      dealershipId: this.dealershipId,
      vehicleId,
      accountId: accountId ?? null,
      action: 'post',
      priority,
      status: 'pending',
    }).returning();

    return queueItem.id;
  }

  async getAccountStats() {
    const accounts = await db
      .select()
      .from(fbMarketplaceAccounts)
      .where(eq(fbMarketplaceAccounts.dealershipId, this.dealershipId));

    const listings = await db
      .select()
      .from(fbMarketplaceListings)
      .where(eq(fbMarketplaceListings.dealershipId, this.dealershipId));

    const queue = await db
      .select()
      .from(fbMarketplaceQueue)
      .where(and(
        eq(fbMarketplaceQueue.dealershipId, this.dealershipId),
        eq(fbMarketplaceQueue.status, 'pending')
      ));

    return {
      accounts: {
        total: accounts.length,
        active: accounts.filter(a => a.status === 'active').length,
        pending: accounts.filter(a => a.status === 'pending').length,
        expired: accounts.filter(a => a.status === 'session_expired').length,
      },
      listings: {
        total: listings.length,
        posted: listings.filter(l => l.status === 'posted').length,
        sold: listings.filter(l => l.status === 'sold').length,
        removed: listings.filter(l => l.status === 'removed').length,
        failed: listings.filter(l => l.status === 'failed').length,
      },
      queue: {
        pending: queue.length,
      },
    };
  }

  async resetDailyCounters() {
    await db.update(fbMarketplaceAccounts)
      .set({ postsToday: 0, updatedAt: new Date() })
      .where(eq(fbMarketplaceAccounts.dealershipId, this.dealershipId));
  }

  async resetWeeklyCounters() {
    await db.update(fbMarketplaceAccounts)
      .set({ postsThisWeek: 0, updatedAt: new Date() })
      .where(eq(fbMarketplaceAccounts.dealershipId, this.dealershipId));
  }
}

export async function createFBMarketplaceScheduler() {
  console.log('[FBMarketplace] Scheduler initialized');
  
  setInterval(async () => {
    try {
      const allDealerships = await db.select().from(dealerships).where(eq(dealerships.isActive, true));
      
      for (const dealership of allDealerships) {
        const service = new FBMarketplaceService(dealership.id);
        const result = await service.processQueue();
        
        if (result.processed > 0) {
          console.log(`[FBMarketplace] Dealership ${dealership.id}: processed=${result.processed}, succeeded=${result.succeeded}, failed=${result.failed}`);
        }
      }
    } catch (error) {
      console.error('[FBMarketplace] Scheduler error:', error);
    }
  }, 5 * 60 * 1000);
}
