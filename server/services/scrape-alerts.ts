/**
 * Scrape Alert Service
 * Sends proactive alerts when scraping fails, produces low-quality data,
 * or when inventory data becomes stale. All alerts route through GHL.
 */

import { sendEmail, sendSMS } from "./ghl-notifications";
import { logInfo, logError } from "../error-utils";
import { storage } from "../storage";
import { enqueueNotification } from "./queue";

// ---- Alert Types ----

export type ScrapeAlertType =
  | "scrape_failed"        // Scrape completely failed
  | "scrape_partial"       // <80% of expected vehicles found
  | "scrape_stale"         // Last successful scrape > 48h ago
  | "scrape_quality"       // <90% valid VINs or <50% with photos
  | "scrape_duplicate"     // Duplicate vehicles detected
  | "facebook_token_expiry" // FB token expires within 7 days
  | "ai_cost_threshold";   // Daily AI cost > $50

interface ScrapeAlert {
  type: ScrapeAlertType;
  dealershipId: number;
  severity: "critical" | "high" | "medium";
  title: string;
  message: string;
  details: Record<string, unknown>;
}

// ---- Alert Thresholds ----

const THRESHOLDS = {
  partialVehicleRatio: 0.8,     // Flag if <80% of expected vehicles scraped
  staleDataHours: 48,           // Flag if last scrape > 48 hours ago
  validVinRatio: 0.9,           // Flag if <90% of VINs are valid
  photoCoverageRatio: 0.5,      // Flag if <50% of vehicles have photos
  duplicateRatio: 0.05,         // Flag if >5% of vehicles are duplicates
  facebookTokenExpiryDays: 7,   // Alert 7 days before FB token expiry
  aiDailyCostUsd: 50,           // Alert when daily AI cost exceeds $50
};

// ---- Core Alert Functions ----

/**
 * Send a scrape failure alert immediately.
 * Routes through GHL SMS + Email to dealership manager.
 */
export async function sendScrapeFailureAlert(dealershipId: number, error: string): Promise<void> {
  const dealership = await storage.getDealershipById(dealershipId);
  if (!dealership) return;

  const alert: ScrapeAlert = {
    type: "scrape_failed",
    dealershipId,
    severity: "critical",
    title: `Inventory sync failed for ${dealership.name}`,
    message: `Your inventory sync failed with error: ${error}. No vehicles were updated. Please check your scrape source configuration or contact support.`,
    details: { error, dealershipName: dealership.name },
  };

  await dispatchAlert(alert);
}

/**
 * Send partial scrape alert when fewer vehicles than expected are found.
 */
export async function sendPartialScrapeAlert(
  dealershipId: number,
  vehiclesFound: number,
  expectedVehicles: number
): Promise<void> {
  const ratio = expectedVehicles > 0 ? vehiclesFound / expectedVehicles : 1;
  if (ratio >= THRESHOLDS.partialVehicleRatio) return; // Above threshold, no alert

  const dealership = await storage.getDealershipById(dealershipId);
  if (!dealership) return;

  const alert: ScrapeAlert = {
    type: "scrape_partial",
    dealershipId,
    severity: "high",
    title: `Partial inventory sync for ${dealership.name}`,
    message: `Only ${vehiclesFound} of ${expectedVehicles} expected vehicles were found (${Math.round(ratio * 100)}%). This may indicate a change in your website structure.`,
    details: { vehiclesFound, expectedVehicles, ratio },
  };

  await dispatchAlert(alert);
}

/**
 * Send stale data alert when last successful scrape is too old.
 */
export async function sendStaleDataAlert(dealershipId: number, lastScrapeAt: Date): Promise<void> {
  const hoursSince = (Date.now() - lastScrapeAt.getTime()) / 3600000;
  if (hoursSince < THRESHOLDS.staleDataHours) return;

  const dealership = await storage.getDealershipById(dealershipId);
  if (!dealership) return;

  const alert: ScrapeAlert = {
    type: "scrape_stale",
    dealershipId,
    severity: "high",
    title: `Inventory data is stale for ${dealership.name}`,
    message: `Last successful inventory sync was ${Math.round(hoursSince)} hours ago. Your Facebook listings and website may be out of date.`,
    details: { hoursSince, lastScrapeAt: lastScrapeAt.toISOString() },
  };

  await dispatchAlert(alert);
}

/**
 * Send data quality alert for invalid VINs or missing photos.
 */
export async function sendQualityAlert(
  dealershipId: number,
  vinValidity: number,
  photoCoverage: number
): Promise<void> {
  const issues: string[] = [];
  if (vinValidity < THRESHOLDS.validVinRatio) {
    issues.push(`Only ${Math.round(vinValidity * 100)}% of VINs are valid (expected >90%)`);
  }
  if (photoCoverage < THRESHOLDS.photoCoverageRatio) {
    issues.push(`Only ${Math.round(photoCoverage * 100)}% of vehicles have photos (expected >50%)`);
  }
  if (issues.length === 0) return;

  const dealership = await storage.getDealershipById(dealershipId);
  if (!dealership) return;

  const alert: ScrapeAlert = {
    type: "scrape_quality",
    dealershipId,
    severity: "medium",
    title: `Data quality issues for ${dealership.name}`,
    message: issues.join(". ") + ". This may affect your Facebook Marketplace listings.",
    details: { vinValidity, photoCoverage },
  };

  await dispatchAlert(alert);
}

/**
 * Alert when Facebook token is about to expire.
 */
export async function sendFacebookTokenExpiryAlert(
  dealershipId: number,
  expiresAt: Date
): Promise<void> {
  const daysUntil = (expiresAt.getTime() - Date.now()) / 86400000;
  if (daysUntil > THRESHOLDS.facebookTokenExpiryDays) return;

  const dealership = await storage.getDealershipById(dealershipId);
  if (!dealership) return;

  const alert: ScrapeAlert = {
    type: "facebook_token_expiry",
    dealershipId,
    severity: daysUntil < 2 ? "critical" : "high",
    title: `Facebook connection expiring for ${dealership.name}`,
    message: `Your Facebook connection expires in ${Math.ceil(daysUntil)} days. Reconnect to avoid interruption in Marketplace postings.`,
    details: { expiresAt: expiresAt.toISOString(), daysUntil },
  };

  await dispatchAlert(alert);
}

/**
 * Alert when AI daily cost exceeds threshold.
 */
export async function sendAICostAlert(dealershipId: number, dailyCost: number): Promise<void> {
  if (dailyCost < THRESHOLDS.aiDailyCostUsd) return;

  const dealership = await storage.getDealershipById(dealershipId);
  if (!dealership) return;

  const alert: ScrapeAlert = {
    type: "ai_cost_threshold",
    dealershipId,
    severity: "medium",
    title: `AI usage alert for ${dealership.name}`,
    message: `Today's AI usage cost is $${dailyCost.toFixed(2)}, exceeding the $${THRESHOLDS.aiDailyCostUsd} threshold. Review your AI settings if this is unexpected.`,
    details: { dailyCost, threshold: THRESHOLDS.aiDailyCostUsd },
  };

  await dispatchAlert(alert);
}

// ---- Alert Dispatch ----

async function dispatchAlert(alert: ScrapeAlert): Promise<void> {
  try {
    // Get dealership manager contact
    const managers = await storage.getDealershipManagers?.(alert.dealershipId);
    const primaryManager = managers?.[0];

    if (!primaryManager) {
      logError(`[ScrapeAlert] No manager found for dealership ${alert.dealershipId}`);
      return;
    }

    // Send SMS for critical/high alerts
    if (alert.severity === "critical" || alert.severity === "high") {
      await sendSMS(alert.dealershipId, {
        to: primaryManager.phone || primaryManager.email,
        message: `${alert.title}: ${alert.message}`,
      });
    }

    // Send email for all severities
    await sendEmail(alert.dealershipId, {
      to: primaryManager.email,
      subject: `[Lotview ${alert.severity.toUpperCase()}] ${alert.title}`,
      body: `<h2>${alert.title}</h2><p>${alert.message}</p><pre>${JSON.stringify(alert.details, null, 2)}</pre>`,
    });

    // Store alert in database for audit trail
    await storage.createSystemAlert?.({
      dealershipId: alert.dealershipId,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      details: alert.details,
      resolved: false,
      createdAt: new Date(),
    });

    logInfo(`[ScrapeAlert] Dispatched ${alert.type} alert`, {
      dealershipId: alert.dealershipId,
      severity: alert.severity,
    });
  } catch (error) {
    logError(`[ScrapeAlert] Failed to dispatch alert: ${error}`, error, {
      dealershipId: alert.dealershipId,
      type: alert.type,
    });
  }
}

/**
 * Run all scheduled checks for a dealership.
 * Call this from the automation scheduler every hour.
 */
export async function runScheduledAlertChecks(dealershipId: number): Promise<void> {
  try {
    // Check stale data
    const lastScrape = await storage.getLastSuccessfulScrape?.(dealershipId);
    if (lastScrape?.completedAt) {
      await sendStaleDataAlert(dealershipId, lastScrape.completedAt);
    }

    // Check Facebook token expiry
    const fbAccount = await storage.getFacebookAccountByDealership?.(dealershipId);
    if (fbAccount?.tokenExpiresAt) {
      await sendFacebookTokenExpiryAlert(dealershipId, fbAccount.tokenExpiresAt);
    }

    // Check AI cost
    const { getDailyUsage } = await import("./ghl-notifications");
    const usage = await getDailyUsage(dealershipId);
    // Approximate cost: $0.005 per email, $0.001 per SMS (GHL rates)
    const estimatedCost = usage.emails * 0.005 + usage.sms * 0.001;
    await sendAICostAlert(dealershipId, estimatedCost);
  } catch (error) {
    logError(`[ScrapeAlert] Scheduled checks failed: ${error}`, error, { dealershipId });
  }
}
