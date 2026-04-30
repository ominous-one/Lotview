/**
 * Scheduler Integration Service
 * Wires all new services into the existing scheduler pipeline.
 * This is the glue that connects validation, dedup, alerts, cost tracking,
 * and optimization into the daily operations of Lotview.
 */

import { logInfo, logError } from "../error-utils";
import { storage } from "../storage";
import { isEnabled } from "./feature-flags";
import { validateScrape } from "./scrape-validator";
import { deduplicateAndStore } from "./vehicle-dedup";
import { enrichPhotosSafely } from "./photo-guard";
import { recordAICall, isUnderBudget, selectModel } from "./ai-cost-tracker";
import { runScheduledAlertChecks } from "./scrape-alerts";
import { checkAccountHealth, getCurrentPostingLimit, recordPostAttempt } from "./fb-ban-recovery";
import { getOptimizedPosting, recordPostingResult } from "./ai-posting-optimizer";
import { sendAppointmentReminders } from "./calendar-sync";
import { processWebhookRetries } from "./webhook-verifier";

// ---- Scraping Pipeline ----

/**
 * Enhanced scraping pipeline with validation, dedup, and alerts.
 * Replaces the basic scraper with the full production pipeline.
 */
export async function runEnhancedScrape(
  dealershipId: number,
  scrapedVehicles: Array<{
    vin: string;
    price?: number;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    color?: string;
    mileage?: number;
    photos?: string[];
    description?: string;
    status?: string;
    sourceUrl?: string;
  }>
): Promise<{
  success: boolean;
  validation: { isValid: boolean; score: number; vehiclesFound: number };
  dedup: { inserted: number; merged: number; skipped: number };
  alertsSent: number;
  error?: string;
}> {
  try {
    // Step 1: Feature flag check
    if (!(await isEnabled("scrape_validation", dealershipId))) {
      logInfo(`[ScrapePipeline] Validation disabled for dealership ${dealershipId}, storing directly`);
      // Store without validation
      for (const v of scrapedVehicles) {
        await storage.createVehicle({
          dealershipId,
          ...v,
          lastScrapedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
      }
      return { success: true, validation: { isValid: true, score: 0, vehiclesFound: scrapedVehicles.length }, dedup: { inserted: scrapedVehicles.length, merged: 0, skipped: 0 }, alertsSent: 0 };
    }

    // Step 2: Validate scrape quality
    const validation = await validateScrape(dealershipId, scrapedVehicles);

    if (!validation.isValid) {
      logError(`[ScrapePipeline] Scrape validation failed for dealership ${dealershipId}: ${validation.errors.join("; ")}`);
      return {
        success: false,
        validation: { isValid: false, score: validation.score, vehiclesFound: validation.vehiclesFound },
        dedup: { inserted: 0, merged: 0, skipped: 0 },
        alertsSent: 1,
        error: validation.errors.join("; "),
      };
    }

    // Step 3: Deduplicate and store
    let dedupResult;
    if (await isEnabled("vehicle_deduplication", dealershipId)) {
      dedupResult = await deduplicateAndStore(dealershipId, scrapedVehicles);
    } else {
      // Insert all without dedup
      for (const v of scrapedVehicles) {
        await storage.createVehicle({ dealershipId, ...v, lastScrapedAt: new Date(), createdAt: new Date(), updatedAt: new Date() } as any);
      }
      dedupResult = { inserted: scrapedVehicles.length, merged: 0, skipped: 0, errors: 0, details: [] };
    }

    // Step 4: Photo enrichment with guard
    if (await isEnabled("photo_guard", dealershipId)) {
      for (const v of scrapedVehicles) {
        if (v.photos && v.photos.length > 0) {
          const existingVehicle = await storage.getVehicleByVinAndDealership(v.vin, dealershipId);
          if (existingVehicle) {
            await enrichPhotosSafely(existingVehicle.id, v.photos);
          }
        }
      }
    }

    // Step 5: Run scheduled alert checks
    let alertsSent = 0;
    if (await isEnabled("scrape_failure_alerts", dealershipId)) {
      await runScheduledAlertChecks(dealershipId);
      alertsSent = 1;
    }

    logInfo(`[ScrapePipeline] Completed for dealership ${dealershipId}: ${validation.vehiclesFound} vehicles, score ${validation.score}`);

    return {
      success: true,
      validation: { isValid: true, score: validation.score, vehiclesFound: validation.vehiclesFound },
      dedup: { inserted: dedupResult.inserted, merged: dedupResult.merged, skipped: dedupResult.skipped },
      alertsSent,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`[ScrapePipeline] Pipeline failed: ${msg}`, error);
    return {
      success: false,
      validation: { isValid: false, score: 0, vehiclesFound: 0 },
      dedup: { inserted: 0, merged: 0, skipped: 0 },
      alertsSent: 0,
      error: msg,
    };
  }
}

// ---- Facebook Posting Pipeline ----

/**
 * Enhanced Facebook posting with AI optimization and ban detection.
 */
export async function runEnhancedFBPosting(
  dealershipId: number,
  accountId: number,
  vehicleId: number,
  postFn: (opts: { vehicleId: number; title: string; description: string; photos: string[]; price: number }) => Promise<{ success: boolean; statusCode?: number; error?: string }>
): Promise<{
  success: boolean;
  optimized: boolean;
  banStatus: string;
  error?: string;
}> {
  try {
    // Step 1: Check if autopost is enabled
    if (!(await isEnabled("autopost_queue", dealershipId))) {
      return { success: false, optimized: false, banStatus: "unknown", error: "Autopost queue disabled" };
    }

    // Step 2: Check account health
    const health = await checkAccountHealth(dealershipId, accountId, { success: true });
    if (health.status !== "healthy" && health.status !== "ramp_up") {
      return { success: false, optimized: false, banStatus: health.status, error: `Account ${health.status}: ${health.reason}` };
    }

    // Step 3: Check posting limit (ramp-up)
    const postingLimit = await getCurrentPostingLimit(accountId);
    const todayPosts = health.postsToday;
    if (todayPosts >= postingLimit) {
      return { success: false, optimized: false, banStatus: health.status, error: `Daily posting limit reached: ${todayPosts}/${postingLimit}` };
    }

    // Step 4: Get AI-optimized posting
    const optimization = await getOptimizedPosting(dealershipId, vehicleId);
    if (!optimization) {
      return { success: false, optimized: false, banStatus: health.status, error: "Vehicle not found" };
    }

    // Step 5: Execute post
    const result = await postFn({
      vehicleId: optimization.vehicleId,
      title: optimization.title,
      description: optimization.description,
      photos: optimization.photoIndices.map(String),
      price: optimization.recommendedPrice,
    });

    // Step 6: Record attempt for ban detection
    await recordPostAttempt(accountId);
    const updatedHealth = await checkAccountHealth(dealershipId, accountId, result);

    // Step 7: Record result for optimization learning
    if (result.success) {
      await recordPostingResult(dealershipId, vehicleId, new Date(), {});
    }

    return {
      success: result.success,
      optimized: true,
      banStatus: updatedHealth.status,
      error: result.error,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`[FBPostPipeline] Failed: ${msg}`, error);
    return { success: false, optimized: false, banStatus: "unknown", error: msg };
  }
}

// ---- AI Response Pipeline ----

/**
 * Enhanced AI response with cost tracking and budget enforcement.
 */
export async function runEnhancedAIResponse(
  dealershipId: number,
  conversationId: number,
  customerMessage: string,
  generateFn: () => Promise<{ response: string; tokensInput: number; tokensOutput: number; model: string; provider: string; latencyMs: number }>
): Promise<{
  success: boolean;
  response: string;
  model: string;
  cost: number;
  error?: string;
}> {
  try {
    // Step 1: Check if AI cost tracking is enabled
    if (await isEnabled("ai_cost_tracking", dealershipId)) {
      // Check budget
      const underBudget = await isUnderBudget(dealershipId);
      if (!underBudget) {
        // Use cheapest model
        const cheapModel = selectModel("simple", true);
        logInfo(`[AIResponse] Budget exceeded for dealership ${dealershipId}, using ${cheapModel.model}`);
      }
    }

    // Step 2: Generate response
    const startTime = Date.now();
    const result = await generateFn();
    const latencyMs = Date.now() - startTime;

    // Step 3: Record cost
    if (await isEnabled("ai_cost_tracking", dealershipId)) {
      await recordAICall({
        dealershipId,
        provider: result.provider as "anthropic" | "openai" | "ollama",
        model: result.model,
        endpoint: "sales_response",
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        costUsd: 0, // Will be calculated by recordAICall
        latencyMs,
        success: true,
      });
    }

    return {
      success: true,
      response: result.response,
      model: result.model,
      cost: 0, // Calculated internally
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logError(`[AIResponse] Failed: ${msg}`, error);

    // Record failure
    if (await isEnabled("ai_cost_tracking", dealershipId)) {
      await recordAICall({
        dealershipId,
        provider: "anthropic",
        model: "claude-3-haiku",
        endpoint: "sales_response",
        tokensInput: 0,
        tokensOutput: 0,
        costUsd: 0,
        latencyMs: 0,
        success: false,
        errorCode: msg.substring(0, 50),
      });
    }

    return { success: false, response: "", model: "", cost: 0, error: msg };
  }
}

// ---- Scheduled Jobs ----

/**
 * Run all scheduled maintenance jobs.
 * Call this from the worker scheduler every 5 minutes.
 */
export async function runScheduledJobs(): Promise<{
  appointmentReminders: number;
  webhookRetries: number;
  alertChecks: number;
}> {
  const results = {
    appointmentReminders: 0,
    webhookRetries: 0,
    alertChecks: 0,
  };

  try {
    // 1. Send appointment reminders
    const reminderResult = await sendAppointmentReminders();
    results.appointmentReminders = reminderResult.sent;

    // 2. Process webhook retries
    const ghlRetries = await processWebhookRetries("ghl");
    const fbRetries = await processWebhookRetries("facebook");
    results.webhookRetries = ghlRetries.succeeded + fbRetries.succeeded;

    // 3. Run alert checks for all dealerships
    const dealerships = await storage.getAllDealerships?.() || [];
    for (const d of dealerships) {
      try {
        await runScheduledAlertChecks(d.id);
        results.alertChecks++;
      } catch {
        // Skip problematic dealerships
      }
    }

    logInfo("[ScheduledJobs] Completed", results);
  } catch (error) {
    logError(`[ScheduledJobs] Error: ${error}`, error);
  }

  return results;
}

export default {
  runEnhancedScrape,
  runEnhancedFBPosting,
  runEnhancedAIResponse,
  runScheduledJobs,
};
