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

// ─── NEW: Carfax scraper + AI trainer
export { scrapeCarfaxByVin, getCarfaxSellingPoints, getCarfaxConfidenceScore, buildCarfaxAiContext } from "./carfax-scraper";
export type { CarfaxReport } from "./carfax-scraper";

// ─── NEW: Smart merge
export { smartMerge, applyMerge, buildSmartMergeStoragePatch, createDefaultMergeRules, detectFieldSources, isSmartMergeScrapeField } from "./smart-merge";
export type { SmartMergeRules, MergeResult, FieldSource, VehicleFieldLock } from "./smart-merge";

// ─── NEW: Vehicle edit permissions
export { getVehicleEditPermission, canEditField, getPhotoLimit, requiresApproval, sanitizeVehicleEdit } from "./vehicle-edit-permissions";
export type { VehicleEditPermission, VehicleEditRole } from "./vehicle-edit-permissions";

// ─── NEW: AI Carfax trainer
export { buildAiCarfaxContext, generateAiSalesResponse, calculateConfidenceScore } from "./ai-carfax-trainer";
export type { AiTrainingVehicle, AiSalesContext } from "./ai-carfax-trainer";

// ─── NEW: Market intelligence
export { analyzeMarketPosition, getPriceRecommendation, generateUrgencyLanguage } from "./market-intelligence";
export type { MarketAnalysis, PriceRecommendation } from "./market-intelligence";

// ─── NEW: Photo quality + AI description
export { scorePhotos, generateVehicleDescription, generatePhotoChecklist } from "./photo-description-ai";
export type { PhotoScore, VehicleDescription } from "./photo-description-ai";

// ─── NEW: Data retention
export { applyDataRetention, anonymizeDeletedUsers } from "./data-retention";
export type { RetentionPolicy } from "./data-retention";

// ─── NEW: Logger
export { createLogger, logger, logDebug, logInfo, logWarn, logError } from "./logger";
export type { LogLevel, LogContext } from "./logger";

// ─── NEW: Olympic Hyundai scraper
export { scrapeOlympicHyundai, extractVehiclesFromHtml, OLYMPIC_HYUNDAI_CONFIG } from "./scraper-olympic-hyundai";
export type { ScrapedVehicle } from "./scraper-olympic-hyundai";
