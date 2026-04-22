/**
 * Services Index
 * Central export point for all production services.
 * Initializes and wires all services at application startup.
 */

// Core infrastructure
export { getRedisClient, checkRedisHealth } from "./redis";
export {
  scrapeQueue, aiResponseQueue, facebookPostQueue, notificationQueue,
  enqueueScrapeJob, enqueueAIResponseJob, enqueueFacebookPostJob, enqueueNotification,
  getQueueHealth, registerJobProcessors,
} from "./queue";
export {
  createGlobalLimiter, createAuthLimiter, createSensitiveLimiter, createWebhookLimiter,
} from "./rate-limit";

// GHL notifications (email + SMS)
export { sendEmail, sendSMS, sendTemplate, getDailyUsage } from "./ghl-notifications";
export type { SendEmailOptions, SendSMSOptions, SendResult } from "./ghl-notifications";

// Scraping
export { validateScrape } from "./scrape-validator";
export type { ScrapedVehicleData, ScrapeValidationResult } from "./scrape-validator";
export { deduplicateAndStore, findDuplicates, mergeDuplicates } from "./vehicle-dedup";
export type { DedupResult } from "./vehicle-dedup";

// Scraping alerts
export {
  sendScrapeFailureAlert, sendPartialScrapeAlert, sendStaleDataAlert,
  sendQualityAlert, sendFacebookTokenExpiryAlert, sendAICostAlert,
  runScheduledAlertChecks,
} from "./scrape-alerts";

// AI cost tracking
export { recordAICall, isUnderBudget, selectModel, getDailyUsage as getAIDailyUsage, getMonthlyUsage, getTopSpenders } from "./ai-cost-tracker";
export type { AICallRecord } from "./ai-cost-tracker";

// Security
export {
  verifyGhlWebhook, verifyFacebookWebhook, verifyBrowserlessWebhook,
  verifyGenericWebhook, createWebhookVerifier, queueWebhookRetry, processWebhookRetries,
} from "./webhook-verifier";
export {
  checkExternalApiRateLimit, validateApiToken, hasPermission,
  createExternalApiMiddleware, createWebhookMiddleware, detectAbuse,
} from "./external-api-guard";

// Photo guard
export { addManualPhoto, enrichPhotosSafely, getPhotoProvenance, stripManualPrefix, migratePhotoProvenance } from "./photo-guard";

// Feature flags
export { isEnabled, enable, disable, setDealershipFlag, getAllFlags, initializeFlagsFromEnv } from "./feature-flags";
export { FEATURE_FLAGS } from "./feature-flags";

// Facebook ban recovery
export { checkAccountHealth, getAccountStatus, startRecoveryRampUp, getCurrentPostingLimit, recordPostAttempt, resetAccountHealth } from "./fb-ban-recovery";
export type { FbAccountStatus } from "./fb-ban-recovery";

// AI posting optimizer
export { getOptimizedPosting, getOptimalPostTime, applyPricePsychology, recordPostingResult } from "./ai-posting-optimizer";

// Calendar sync
export { syncAppointment, sendCalendarInvite, sendAppointmentReminders, deleteSyncMapping } from "./calendar-sync";
export type { CalendarProvider, CalendarEvent, SyncConfig } from "./calendar-sync";

// A/B testing
export { createExperiment, startExperiment, assignVariant, recordMetric, getResults, concludeExperiment, listExperiments } from "./ab-testing";
export type { ABExperiment, ABVariant, ABMetrics } from "./ab-testing";

// Admin dashboard
export {
  getSystemHealth, getBusinessMetrics, getDealershipActivity,
  getAIMetrics, getScrapingMetrics, getFBMarketplaceMetrics,
  getSystemAlerts, resolveAlert, getRevenueMetrics,
} from "./admin-dashboard";
export type { SystemHealth, BusinessMetrics, DealershipActivity, AIMetrics, SystemAlert } from "./admin-dashboard";
