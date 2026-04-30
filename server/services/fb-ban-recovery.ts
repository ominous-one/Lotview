/**
 * Facebook Ban Detection & Recovery Service
 * Detects Facebook account restrictions, pauses posting automatically,
 * guides recovery, and gradually ramps back up after resolution.
 *
 * Facebook aggressively bans accounts for automated Marketplace posting.
 * This service provides detection, prevention, and recovery.
 */

import { logInfo, logWarn, logError } from "../error-utils";
import { storage } from "../storage";
import { getRedisClient } from "./redis";
import { sendEmail, sendSMS } from "./ghl-notifications";
import { db } from "../db";
import { facebookAccounts } from "@shared/schema";
import { eq } from "drizzle-orm";

// ---- Detection Configuration ----

const BAN_DETECTION = {
  http403Threshold: 3,           // 3 consecutive 403s = suspected ban
  postingSuccessWindowMs: 86400000, // 24 hours
  minSuccessRate: 0.2,           // < 20% success rate = suspected ban
  rampUpSchedule: [1, 3, 5, 10, 20], // Posts per day during ramp-up
  rampUpDaysPerLevel: 2,         // Days at each level before advancing
};

// ---- Types ----

export type FbAccountStatus =
  | "healthy"          // Normal posting
  | "suspected_ban"    // Detection triggered, investigating
  | "confirmed_ban"    // Confirmed restricted/banned
  | "recovery_pending" // Awaiting dealership action
  | "ramp_up"          // Gradually increasing post volume
  | "paused";          // Manually paused

interface BanDetectionResult {
  status: FbAccountStatus;
  reason: string;
  confidence: number; // 0-1
  recommendedAction: string;
  postsToday: number;
  postsSuccessToday: number;
}

interface RecoveryState {
  accountId: number;
  status: FbAccountStatus;
  detectedAt: Date;
  lastError: string;
  rampUpLevel: number;
  rampUpStartedAt: Date | null;
  postsAtCurrentLevel: number;
  notifiedAt: Date | null;
  resolvedAt: Date | null;
}

// ---- Detection ----

/**
 * Check Facebook account health after each posting attempt.
 * Call this after every FB Marketplace post attempt.
 */
export async function checkAccountHealth(
  dealershipId: number,
  accountId: number,
  postResult: { success: boolean; statusCode?: number; error?: string }
): Promise<BanDetectionResult> {
  const redis = getRedisClient();
  const today = new Date().toISOString().split("T")[0];

  // Track posting stats
  const statsKey = `fb:post_stats:${accountId}:${today}`;
  await redis.hincrby(statsKey, "total", 1);
  if (postResult.success) {
    await redis.hincrby(statsKey, "success", 1);
  }
  if (postResult.statusCode === 403) {
    await redis.hincrby(statsKey, "forbidden", 1);
  }
  await redis.expire(statsKey, 86400 * 7);

  // Get recent stats
  const stats = await redis.hgetall(statsKey);
  const totalToday = parseInt(stats.total || "0", 10);
  const successToday = parseInt(stats.success || "0", 10);
  const forbiddenCount = parseInt(stats.forbidden || "0", 10);

  // Detection rules
  let status: FbAccountStatus = "healthy";
  let reason = "";
  let confidence = 0;
  let recommendedAction = "";

  // Rule 1: Multiple 403s
  if (forbiddenCount >= BAN_DETECTION.http403Threshold) {
    status = "confirmed_ban";
    reason = `Received ${forbiddenCount} HTTP 403 responses`;
    confidence = 0.95;
    recommendedAction = "Pause posting and notify dealership";
  }
  // Rule 2: Low success rate
  else if (totalToday >= 5) {
    const successRate = successToday / totalToday;
    if (successRate < BAN_DETECTION.minSuccessRate) {
      status = "suspected_ban";
      reason = `Success rate ${Math.round(successRate * 100)}% below threshold ${Math.round(BAN_DETECTION.minSuccessRate * 100)}%`;
      confidence = 0.7;
      recommendedAction = "Monitor closely, reduce posting frequency";
    }
  }
  // Rule 3: Explicit ban error message
  else if (postResult.error && isBanErrorMessage(postResult.error)) {
    status = "confirmed_ban";
    reason = `Ban error message: ${postResult.error}`;
    confidence = 0.99;
    recommendedAction = "Immediate pause and recovery flow";
  }

  // If banned, update account status and trigger recovery
  if (status === "confirmed_ban" || status === "suspected_ban") {
    await handleBanDetected(dealershipId, accountId, status, reason);
  }

  return {
    status,
    reason,
    confidence,
    recommendedAction,
    postsToday: totalToday,
    postsSuccessToday: successToday,
  };
}

/**
 * Get current account status with full recovery state.
 */
export async function getAccountStatus(
  dealershipId: number,
  accountId: number
): Promise<RecoveryState | null> {
  const redis = getRedisClient();
  const data = await redis.get(`fb:recovery:${accountId}`);
  if (!data) return null;
  return JSON.parse(data);
}

/**
 * Start recovery process after dealership confirms appeal submitted.
 */
export async function startRecoveryRampUp(
  dealershipId: number,
  accountId: number
): Promise<{ success: boolean; rampUpLevel: number; maxPostsToday: number }> {
  const redis = getRedisClient();

  const state: RecoveryState = {
    accountId,
    status: "ramp_up",
    detectedAt: new Date(),
    lastError: "",
    rampUpLevel: 0,
    rampUpStartedAt: new Date(),
    postsAtCurrentLevel: 0,
    notifiedAt: new Date(),
    resolvedAt: new Date(),
  };

  await redis.setex(
    `fb:recovery:${accountId}`,
    86400 * 30, // 30 day TTL
    JSON.stringify(state)
  );

  const maxPosts = BAN_DETECTION.rampUpSchedule[0]; // Start at level 0

  // Update account status in database
  await db
    .update(facebookAccounts)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(facebookAccounts.id, accountId));

  logInfo(`[FBBan] Started ramp-up for account ${accountId}, level 0 (${maxPosts} posts/day)`);

  return { success: true, rampUpLevel: 0, maxPostsToday: maxPosts };
}

/**
 * Get current posting limit based on ramp-up level.
 * Call this before each posting decision.
 */
export async function getCurrentPostingLimit(accountId: number): Promise<number> {
  const state = await getAccountStatus(0, accountId);
  if (!state || state.status !== "ramp_up") {
    return 20; // Default: 20 posts/day for healthy accounts
  }

  // Check if we should advance to next level
  const daysAtLevel = state.rampUpStartedAt
    ? Math.floor((Date.now() - new Date(state.rampUpStartedAt).getTime()) / 86400000)
    : 0;

  if (daysAtLevel >= BAN_DETECTION.rampUpDaysPerLevel && state.rampUpLevel < BAN_DETECTION.rampUpSchedule.length - 1) {
    // Advance level
    const newLevel = state.rampUpLevel + 1;
    state.rampUpLevel = newLevel;
    state.rampUpStartedAt = new Date();
    state.postsAtCurrentLevel = 0;

    const redis = getRedisClient();
    await redis.setex(`fb:recovery:${accountId}`, 86400 * 30, JSON.stringify(state));

    logInfo(`[FBBan] Advanced account ${accountId} to ramp-up level ${newLevel} (${BAN_DETECTION.rampUpSchedule[newLevel]} posts/day)`);
  }

  return BAN_DETECTION.rampUpSchedule[state.rampUpLevel];
}

/**
 * Increment post counter for ramp-up tracking.
 */
export async function recordPostAttempt(accountId: number): Promise<void> {
  const redis = getRedisClient();
  const state = await getAccountStatus(0, accountId);
  if (state && state.status === "ramp_up") {
    state.postsAtCurrentLevel++;
    await redis.setex(`fb:recovery:${accountId}`, 86400 * 30, JSON.stringify(state));
  }
}

// ---- Prevention: Human-Like Patterns ----

/**
 * Get randomized posting time to appear human.
 * Returns a time within ±30 minutes of the scheduled time.
 */
export function getHumanizedPostTime(scheduledTime: Date): Date {
  const jitter = (Math.random() - 0.5) * 60 * 60 * 1000; // ±30 minutes
  return new Date(scheduledTime.getTime() + jitter);
}

/**
 * Get daily posting budget with human-like variation.
 * Some days post more, some days less.
 */
export function getDailyPostBudget(baseLimit: number): number {
  const variation = 0.8 + Math.random() * 0.4; // 80%-120% of base
  return Math.round(baseLimit * variation);
}

/**
 * Add realistic delay between actions.
 */
export async function humanizedDelay(): Promise<void> {
  // Random delay: 2-8 seconds
  const delay = 2000 + Math.random() * 6000;
  await new Promise((r) => setTimeout(r, delay));
}

// ---- Internal ----

async function handleBanDetected(
  dealershipId: number,
  accountId: number,
  status: FbAccountStatus,
  reason: string
): Promise<void> {
  const redis = getRedisClient();

  // Check if we already notified (prevent spam)
  const existing = await getAccountStatus(dealershipId, accountId);
  if (existing && existing.notifiedAt) {
    const hoursSinceNotify = (Date.now() - new Date(existing.notifiedAt).getTime()) / 3600000;
    if (hoursSinceNotify < 4) return; // Don't notify more than every 4 hours
  }

  // Store recovery state
  const state: RecoveryState = {
    accountId,
    status,
    detectedAt: new Date(),
    lastError: reason,
    rampUpLevel: 0,
    rampUpStartedAt: null,
    postsAtCurrentLevel: 0,
    notifiedAt: new Date(),
    resolvedAt: null,
  };

  await redis.setex(`fb:recovery:${accountId}`, 86400 * 30, JSON.stringify(state));

  // Update database
  await db
    .update(facebookAccounts)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(facebookAccounts.id, accountId));

  // Send alert to dealership
  const account = await (storage as any).getFacebookAccountById?.(accountId);
  const dealership = await storage.getDealershipById(dealershipId);

  if (dealership) {
    const managers = await storage.getDealershipManagers?.(dealershipId);
    const manager = managers?.[0];

    if (manager) {
      // SMS alert
      await sendSMS(dealershipId, {
        to: manager.phone || manager.email,
        message: `ALERT: Your Facebook Marketplace account${account ? ` (${account.accountName || account.name})` : ""} has been ${status === "confirmed_ban" ? "restricted" : "flagged"}. Reason: ${reason}. Posting has been paused. Log in to Lotview to resolve.`,
      });

      // Email with recovery instructions
      await sendEmail(dealershipId, {
        to: manager.email,
        subject: `[ACTION REQUIRED] Facebook Marketplace ${status === "confirmed_ban" ? "Restriction" : "Warning"}`,
        body: `<h2>Facebook Marketplace Alert</h2>
<p>Your Facebook account has been ${status === "confirmed_ban" ? "<strong>restricted</strong>" : "<strong>flagged</strong>"} for automated posting.</p>
<p><strong>Reason:</strong> ${reason}</p>
<p><strong>Impact:</strong> Automatic posting to Facebook Marketplace has been paused. Your existing listings remain visible.</p>
<h3>Recovery Steps:</h3>
<ol>
  <li>Log into Facebook Business Manager</li>
  <li>Go to Account Quality</li>
  <li>Submit an appeal if your account was restricted</li>
  <li>Click "Start Recovery" in Lotview once resolved</li>
</ol>
<p>After recovery, we'll gradually ramp up posting volume to prevent re-triggering restrictions.</p>`,
      });
    }
  }

  logWarn(`[FBBan] ${status} detected for account ${accountId}: ${reason}`);
}

function isBanErrorMessage(error: string): boolean {
  const banPatterns = [
    /account.*restrict/i,
    /account.*ban/i,
    /account.*suspend/i,
    /unusual.*activity/i,
    /automated.*behavior/i,
    /rate.*limit/i,
    /checkpoint/i,
    /confirm.*identity/i,
    /temporarily.*unavailable/i,
  ];
  return banPatterns.some((p) => p.test(error));
}

/**
 * Reset account to healthy status (called after successful recovery).
 */
export async function resetAccountHealth(accountId: number): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`fb:recovery:${accountId}`);

  // Clear posting stats
  const keys = await redis.keys(`fb:post_stats:${accountId}:*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }

  await db
    .update(facebookAccounts)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(facebookAccounts.id, accountId));

  logInfo(`[FBBan] Account ${accountId} reset to healthy`);
}
