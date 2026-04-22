/**
 * Webhook Signature Verification Service
 * Verifies webhook signatures from GHL, Facebook, Browserless.io, and other providers.
 * Prevents fake webhook data injection attacks.
 */

import { logInfo, logError, logWarn } from "../error-utils";
import { getRedisClient } from "./redis";

// ---- Idempotency Key Store ----

const IDEMPOTENCY_TTL = 86400; // 24 hours

async function isDuplicate(webhookId: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = `webhook:idempotency:${webhookId}`;
  const exists = await redis.exists(key);
  if (!exists) {
    await redis.setex(key, IDEMPOTENCY_TTL, "1");
  }
  return exists === 1;
}

// ---- GHL Webhook Verification ----

/**
 * Verify GHL webhook signature using HMAC-SHA256.
 *
 * GHL sends: X-GHL-Signature: sha256=<hex_hmac>
 * We verify: HMAC_SHA256(secret, payload) === signature
 */
export async function verifyGhlWebhook(
  payload: string,
  signature: string | undefined,
  secret: string
): Promise<{ valid: boolean; reason?: string }> {
  if (!signature) {
    return { valid: false, reason: "Missing X-GHL-Signature header" };
  }

  // Extract the hex digest from "sha256=..."
  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) {
    return { valid: false, reason: "Invalid signature format (expected sha256=...)" };
  }

  const providedDigest = signature.slice(expectedPrefix.length);

  // Compute expected signature
  const crypto = await import("crypto");
  const expectedDigest = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");

  // Timing-safe comparison
  try {
    const providedBuf = Buffer.from(providedDigest, "hex");
    const expectedBuf = Buffer.from(expectedDigest, "hex");

    if (providedBuf.length !== expectedBuf.length) {
      return { valid: false, reason: "Signature length mismatch" };
    }

    const match = crypto.timingSafeEqual(providedBuf, expectedBuf);
    if (!match) {
      return { valid: false, reason: "Signature mismatch" };
    }
  } catch {
    return { valid: false, reason: "Signature comparison failed" };
  }

  // Check idempotency
  const body = JSON.parse(payload);
  const webhookId = body?.id || body?.eventId || providedDigest.slice(0, 16);
  if (await isDuplicate(`ghl:${webhookId}`)) {
    return { valid: false, reason: "Duplicate webhook (idempotency)" };
  }

  return { valid: true };
}

// ---- Facebook Webhook Verification ----

/**
 * Verify Facebook webhook signature.
 *
 * Facebook sends: X-Hub-Signature-256: sha256=<hex_hmac>
 */
export async function verifyFacebookWebhook(
  payload: string,
  signature: string | undefined,
  appSecret: string
): Promise<{ valid: boolean; reason?: string }> {
  if (!signature) {
    return { valid: false, reason: "Missing X-Hub-Signature-256 header" };
  }

  const expectedPrefix = "sha256=";
  if (!signature.startsWith(expectedPrefix)) {
    return { valid: false, reason: "Invalid signature format" };
  }

  const providedDigest = signature.slice(expectedPrefix.length);

  const crypto = await import("crypto");
  const expectedDigest = crypto
    .createHmac("sha256", appSecret)
    .update(payload, "utf8")
    .digest("hex");

  try {
    const providedBuf = Buffer.from(providedDigest, "hex");
    const expectedBuf = Buffer.from(expectedDigest, "hex");
    if (providedBuf.length !== expectedBuf.length) {
      return { valid: false, reason: "Signature length mismatch" };
    }
    if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return { valid: false, reason: "Signature mismatch" };
    }
  } catch {
    return { valid: false, reason: "Signature comparison failed" };
  }

  return { valid: true };
}

// ---- Browserless.io Webhook Verification ----

/**
 * Verify Browserless.io webhook using API key header.
 */
export async function verifyBrowserlessWebhook(
  apiKey: string | undefined,
  expectedKey: string
): Promise<{ valid: boolean; reason?: string }> {
  if (!apiKey) {
    return { valid: false, reason: "Missing Authorization header" };
  }

  // Strip "Bearer " prefix if present
  const token = apiKey.startsWith("Bearer ") ? apiKey.slice(7) : apiKey;

  if (token !== expectedKey) {
    return { valid: false, reason: "Invalid API key" };
  }

  return { valid: true };
}

// ---- Generic Webhook Verification ----

/**
 * Verify any webhook with a shared secret.
 */
export async function verifyGenericWebhook(
  payload: string,
  signature: string | undefined,
  secret: string,
  headerName: string = "X-Webhook-Signature"
): Promise<{ valid: boolean; reason?: string }> {
  if (!signature) {
    return { valid: false, reason: `Missing ${headerName} header` };
  }

  const crypto = await import("crypto");
  const expectedDigest = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");

  try {
    const providedBuf = Buffer.from(signature, "hex");
    const expectedBuf = Buffer.from(expectedDigest, "hex");
    if (providedBuf.length !== expectedBuf.length) {
      return { valid: false, reason: "Signature length mismatch" };
    }
    if (!crypto.timingSafeEqual(providedBuf, expectedBuf)) {
      return { valid: false, reason: "Signature mismatch" };
    }
  } catch {
    return { valid: false, reason: "Signature comparison failed" };
  }

  return { valid: true };
}

// ---- Webhook Retry Logic ----

/**
 * Store a failed webhook for retry.
 */
export async function queueWebhookRetry(
  provider: string,
  payload: string,
  attempt: number = 1
): Promise<void> {
  const redis = getRedisClient();
  const key = `webhook:retry:${provider}:${Date.now()}`;
  await redis.setex(
    key,
    86400, // 24 hour TTL
    JSON.stringify({ payload, attempt, queuedAt: Date.now() })
  );

  logWarn(`[Webhook] Queued ${provider} webhook for retry (attempt ${attempt})`);
}

/**
 * Process retry queue for a provider.
 * Call from scheduler.
 */
export async function processWebhookRetries(provider: string): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const redis = getRedisClient();
  const keys = await redis.keys(`webhook:retry:${provider}:*`);

  let succeeded = 0;
  let failed = 0;

  for (const key of keys) {
    const data = await redis.get(key);
    if (!data) continue;

    const { payload, attempt } = JSON.parse(data);

    // Exponential backoff: only retry after sufficient delay
    const retryDelay = Math.pow(5, attempt) * 1000; // 5s, 25s, 125s
    if (Date.now() - JSON.parse(data).queuedAt < retryDelay) {
      continue;
    }

    if (attempt >= 3) {
      // Max retries exceeded — log and discard
      logError(`[Webhook] Max retries exceeded for ${provider} webhook`, null);
      await redis.del(key);
      failed++;
      continue;
    }

    // Re-queue with incremented attempt
    await queueWebhookRetry(provider, payload, attempt + 1);
    await redis.del(key);
    succeeded++;
  }

  return { processed: keys.length, succeeded, failed };
}

// ---- Middleware Factory ----

/**
 * Create Express middleware that verifies webhook signatures.
 */
export function createWebhookVerifier(
  provider: "ghl" | "facebook" | "browserless" | "generic",
  config: { secret: string; headerName?: string }
) {
  return async (req: any, res: any, next: any) => {
    try {
      const payload = JSON.stringify(req.body);
      let result: { valid: boolean; reason?: string };

      switch (provider) {
        case "ghl":
          result = await verifyGhlWebhook(
            payload,
            req.headers["x-ghl-signature"] || req.headers["x-gohighlevel-signature"],
            config.secret
          );
          break;
        case "facebook":
          result = await verifyFacebookWebhook(
            payload,
            req.headers["x-hub-signature-256"],
            config.secret
          );
          break;
        case "browserless":
          result = await verifyBrowserlessWebhook(
            req.headers.authorization,
            config.secret
          );
          break;
        case "generic":
          result = await verifyGenericWebhook(
            payload,
            req.headers[(config.headerName || "x-webhook-signature").toLowerCase()],
            config.secret,
            config.headerName
          );
          break;
      }

      if (!result.valid) {
        logWarn(`[Webhook] ${provider} verification failed: ${result.reason}`, {
          ip: req.ip,
          path: req.path,
        });
        return res.status(401).json({ error: "Invalid webhook signature", reason: result.reason });
      }

      next();
    } catch (error) {
      logError(`[Webhook] ${provider} verification error: ${error}`, error);
      res.status(500).json({ error: "Webhook verification failed" });
    }
  };
}
