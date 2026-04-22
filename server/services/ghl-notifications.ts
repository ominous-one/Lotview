/**
 * GHL Notification Service
 * Routes ALL dealership emails and SMS through their connected GHL account.
 *
 * Architecture: Each dealership connects ONE GHL account. All notifications
 * (emails, SMS, alerts) flow through that account. Emails come from the
 * dealership's domain via GHL, maintaining deliverability reputation.
 *
 * Features:
 * - Automatic token refresh before sending
 * - Rate limiting: 100 messages/minute per dealership (GHL API limit)
 * - Circuit breaker: stops after 5 consecutive failures, retries after 10 min
 * - Exponential backoff: 3 attempts (1s, 5s, 25s delays)
 * - Template engine with variable substitution
 * - Delivery tracking via GHL webhook callbacks
 * - Cost tracking per dealership (GHL API call counting)
 * - Fallback to emailOutbox queue if GHL not connected
 */

import { createGhlApiService, type GhlApiResponse } from "../ghl-api-service";
import { storage } from "../storage";
import { logInfo, logError, logWarn } from "../error-utils";
import { getRedisClient, cacheSet, cacheGet } from "./redis";
import { enqueueNotification } from "./queue";

// ---- Circuit Breaker State ----

interface CircuitState {
  failures: number;
  lastFailure: number;
  status: "closed" | "open" | "half-open";
}

const circuitBreakers = new Map<number, CircuitState>();
const CIRCUIT_THRESHOLD = 5;      // Trip after 5 consecutive failures
const CIRCUIT_RESET_MS = 600_000; // 10 minutes before half-open
const CIRCUIT_SUCCESS_TO_CLOSE = 3; // 3 successes to close from half-open

function getCircuit(dealershipId: number): CircuitState {
  if (!circuitBreakers.has(dealershipId)) {
    circuitBreakers.set(dealershipId, { failures: 0, lastFailure: 0, status: "closed" });
  }
  return circuitBreakers.get(dealershipId)!;
}

function recordSuccess(dealershipId: number): void {
  const cb = getCircuit(dealershipId);
  if (cb.status === "half-open") {
    cb.failures = Math.max(0, cb.failures - 1);
    if (cb.failures <= 0) {
      cb.status = "closed";
      cb.failures = 0;
      logInfo(`[GHLNotify] Circuit closed for dealership ${dealershipId}`);
    }
  } else {
    cb.failures = 0;
  }
}

function recordFailure(dealershipId: number): void {
  const cb = getCircuit(dealershipId);
  cb.failures++;
  cb.lastFailure = Date.now();

  if (cb.failures >= CIRCUIT_THRESHOLD) {
    cb.status = "open";
    logError(
      `[GHLNotify] Circuit OPENED for dealership ${dealershipId} after ${cb.failures} failures`,
      null,
      { dealershipId }
    );
  }
}

function isCircuitOpen(dealershipId: number): boolean {
  const cb = getCircuit(dealershipId);
  if (cb.status === "closed") return false;

  if (cb.status === "open" && Date.now() - cb.lastFailure > CIRCUIT_RESET_MS) {
    cb.status = "half-open";
    logInfo(`[GHLNotify] Circuit half-open for dealership ${dealershipId}`);
    return false;
  }

  return cb.status === "open";
}

// ---- Rate Limiting ----

const RATE_LIMIT_MAX = 100; // GHL's rate limit: 100 req/min
const RATE_LIMIT_WINDOW_MS = 60_000;

async function checkRateLimit(dealershipId: number): Promise<boolean> {
  const redis = getRedisClient();
  const key = `ghl:rate:${dealershipId}:${Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS)}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, 60);
  }
  return current <= RATE_LIMIT_MAX;
}

// ---- Retry Logic ----

async function withRetry<T>(
  fn: () => Promise<T>,
  dealershipId: number,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | undefined;
  const delays = [1000, 5000, 25000]; // Exponential-ish backoff

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      recordSuccess(dealershipId);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      recordFailure(dealershipId);

      if (attempt < maxRetries) {
        const delay = delays[attempt] || 25000;
        logWarn(
          `[GHLNotify] Attempt ${attempt + 1} failed, retrying in ${delay}ms`,
          { dealershipId, error: lastError.message }
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error("All retry attempts exhausted");
}

// ---- Template Engine ----

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}

// ---- Delivery Tracking ----

async function trackDelivery(
  dealershipId: number,
  messageId: string,
  type: "email" | "sms",
  recipient: string,
  status: "sent" | "delivered" | "failed"
): Promise<void> {
  try {
    await storage.createNotificationLog?.({
      dealershipId,
      messageId,
      type,
      recipient,
      status,
      sentAt: new Date(),
    });
  } catch {
    // Non-critical: don't fail the send if tracking fails
  }
}

// ---- Cost Tracking ----

async function trackGhlApiCall(dealershipId: number, operation: string): Promise<void> {
  const redis = getRedisClient();
  const dayKey = `ghl:api_calls:${dealershipId}:${new Date().toISOString().split("T")[0]}`;
  await redis.hincrby(dayKey, operation, 1);
  await redis.expire(dayKey, 86400 * 30); // Keep 30 days
}

// ==================== PUBLIC API ====================

export interface SendEmailOptions {
  to: string;
  subject: string;
  body: string;
  contactId?: string;
  templateName?: string;
  variables?: Record<string, string>;
}

export interface SendSMSOptions {
  to: string;
  message: string;
  contactId?: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  fallbackQueued?: boolean;
}

/**
 * Send an email through the dealership's GHL account.
 */
export async function sendEmail(
  dealershipId: number,
  options: SendEmailOptions
): Promise<SendResult> {
  // 1. Check circuit breaker
  if (isCircuitOpen(dealershipId)) {
    logWarn(`[GHLNotify] Circuit open, queueing email for later`, { dealershipId, to: options.to });
    await fallbackToOutbox(dealershipId, "email", options);
    return { success: false, fallbackQueued: true, error: "GHL circuit open, queued for retry" };
  }

  // 2. Check rate limit
  const withinLimit = await checkRateLimit(dealershipId);
  if (!withinLimit) {
    logWarn(`[GHLNotify] Rate limit hit for dealership ${dealershipId}`);
    await fallbackToOutbox(dealershipId, "email", options);
    return { success: false, fallbackQueued: true, error: "Rate limit hit, queued" };
  }

  // 3. Resolve GHL account
  const account = await storage.getGhlAccountByDealership(dealershipId);
  if (!account) {
    logWarn(`[GHLNotify] No GHL account for dealership ${dealershipId}`);
    await fallbackToOutbox(dealershipId, "email", options);
    return { success: false, fallbackQueued: true, error: "No GHL account connected" };
  }

  // 4. Refresh token
  const ghlService = createGhlApiService(dealershipId);
  const tokenValid = await ghlService.refreshAccessToken();
  if (!tokenValid) {
    logError(`[GHLNotify] Token refresh failed for dealership ${dealershipId}`, null);
    await fallbackToOutbox(dealershipId, "email", options);
    return { success: false, fallbackQueued: true, error: "GHL token refresh failed" };
  }

  const refreshedAccount = await storage.getGhlAccountByDealership(dealershipId);
  if (!refreshedAccount) {
    return { success: false, error: "GHL account not found after refresh" };
  }

  // 5. Render template if provided
  const body = options.templateName && options.variables
    ? renderTemplate(options.body, options.variables)
    : options.body;

  const subject = options.variables
    ? renderTemplate(options.subject, options.variables)
    : options.subject;

  // 6. Send via GHL
  try {
    const response = await withRetry(async () => {
      const res = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshedAccount!.accessToken}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
        body: JSON.stringify({
          type: "Email",
          to: options.to,
          subject,
          html: body,
          ...(options.contactId && { contactId: options.contactId }),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GHL email failed: ${res.status} ${text}`);
      }

      return await res.json();
    }, dealershipId);

    const messageId = response?.messageId || response?.id;

    // 7. Track delivery
    await trackDelivery(dealershipId, messageId, "email", options.to, "sent");
    await trackGhlApiCall(dealershipId, "email_send");

    logInfo(`[GHLNotify] Email sent to ${options.to}`, { dealershipId, messageId });
    return { success: true, messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`[GHLNotify] Email send failed: ${msg}`, error, { dealershipId, to: options.to });
    await fallbackToOutbox(dealershipId, "email", options);
    return { success: false, fallbackQueued: true, error: msg };
  }
}

/**
 * Send an SMS through the dealership's GHL account.
 */
export async function sendSMS(
  dealershipId: number,
  options: SendSMSOptions
): Promise<SendResult> {
  if (isCircuitOpen(dealershipId)) {
    await fallbackToOutbox(dealershipId, "sms", options);
    return { success: false, fallbackQueued: true, error: "GHL circuit open" };
  }

  const withinLimit = await checkRateLimit(dealershipId);
  if (!withinLimit) {
    await fallbackToOutbox(dealershipId, "sms", options);
    return { success: false, fallbackQueued: true, error: "Rate limit hit" };
  }

  const account = await storage.getGhlAccountByDealership(dealershipId);
  if (!account) {
    await fallbackToOutbox(dealershipId, "sms", options);
    return { success: false, fallbackQueued: true, error: "No GHL account" };
  }

  const ghlService = createGhlApiService(dealershipId);
  const tokenValid = await ghlService.refreshAccessToken();
  if (!tokenValid) {
    await fallbackToOutbox(dealershipId, "sms", options);
    return { success: false, fallbackQueued: true, error: "Token refresh failed" };
  }

  const refreshedAccount = await storage.getGhlAccountByDealership(dealershipId);
  if (!refreshedAccount) {
    return { success: false, error: "Account not found" };
  }

  try {
    const response = await withRetry(async () => {
      const res = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${refreshedAccount!.accessToken}`,
          "Content-Type": "application/json",
          Version: "2021-07-28",
        },
        body: JSON.stringify({
          type: "SMS",
          to: options.to,
          message: options.message,
          ...(options.contactId && { contactId: options.contactId }),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GHL SMS failed: ${res.status} ${text}`);
      }
      return await res.json();
    }, dealershipId);

    const messageId = response?.messageId || response?.id;
    await trackDelivery(dealershipId, messageId, "sms", options.to, "sent");
    await trackGhlApiCall(dealershipId, "sms_send");

    logInfo(`[GHLNotify] SMS sent to ${options.to}`, { dealershipId, messageId });
    return { success: true, messageId };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`[GHLNotify] SMS failed: ${msg}`, error, { dealershipId, to: options.to });
    await fallbackToOutbox(dealershipId, "sms", options);
    return { success: false, fallbackQueued: true, error: msg };
  }
}

/**
 * Send using a template from the database.
 */
export async function sendTemplate(
  dealershipId: number,
  templateName: string,
  variables: Record<string, string>,
  to: string,
  contactId?: string
): Promise<SendResult> {
  const template = await storage.getMessageTemplateByName?.(dealershipId, templateName);
  if (!template) {
    return { success: false, error: `Template "${templateName}" not found` };
  }

  return sendEmail(dealershipId, {
    to,
    subject: renderTemplate(template.subject, variables),
    body: renderTemplate(template.bodyHtml, variables),
    contactId,
    templateName,
    variables,
  });
}

/**
 * Get daily API usage for a dealership.
 */
export async function getDailyUsage(dealershipId: number): Promise<{
  emails: number;
  sms: number;
  total: number;
}> {
  const redis = getRedisClient();
  const dayKey = `ghl:api_calls:${dealershipId}:${new Date().toISOString().split("T")[0]}`;
  const data = await redis.hgetall(dayKey);

  return {
    emails: parseInt(data.email_send || "0", 10),
    sms: parseInt(data.sms_send || "0", 10),
    total: Object.values(data).reduce((sum, v) => sum + parseInt(v || "0", 10), 0),
  };
}

// ---- Internal: Fallback to outbox queue ----

async function fallbackToOutbox(
  dealershipId: number,
  type: "email" | "sms",
  options: SendEmailOptions | SendSMSOptions
): Promise<void> {
  try {
    if (type === "email") {
      const emailOpts = options as SendEmailOptions;
      await storage.createEmailOutboxItem?.({
        dealershipId,
        to: emailOpts.to,
        subject: emailOpts.subject,
        body: emailOpts.body,
        status: "pending",
        retryCount: 0,
        createdAt: new Date(),
      });
    } else {
      const smsOpts = options as SendSMSOptions;
      await storage.createEmailOutboxItem?.({
        dealershipId,
        to: smsOpts.to,
        subject: "SMS",
        body: smsOpts.message,
        status: "pending_sms",
        retryCount: 0,
        createdAt: new Date(),
      });
    }

    logInfo(`[GHLNotify] Queued ${type} in outbox for retry`, { dealershipId });
  } catch (err) {
    logError(`[GHLNotify] Failed to queue fallback: ${err}`, err, { dealershipId });
  }
}
