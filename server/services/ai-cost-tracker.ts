/**
 * AI Cost Tracker
 * Tracks every AI API call per dealership with token counting and cost calculation.
 * Enforces per-dealership budget limits to prevent runaway API bills.
 *
 * Primary: OpenAI GPT-4o / GPT-4o-mini | Legacy tracking: Anthropic, Ollama
 * Cost basis: Per-provider pricing tables updated monthly.
 */

import { getRedisClient } from "./redis";
import { logInfo, logWarn, logError } from "../error-utils";
import { sendAICostAlert } from "./scrape-alerts";

// ---- Provider Pricing (per 1K tokens, in USD) ----
// Updated: 2026-04-23. Check providers monthly for price changes.

const PRICING = {
  anthropic: {
    "claude-4-opus": { input: 0.015, output: 0.075 },
    "claude-4-sonnet": { input: 0.003, output: 0.015 },
    "claude-3.5-sonnet": { input: 0.003, output: 0.015 },
    "claude-3-haiku": { input: 0.00025, output: 0.00125 },
  },
  openai: {
    "gpt-4o": { input: 0.005, output: 0.015 },
    "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
    "gpt-3.5-turbo": { input: 0.0005, output: 0.0015 },
  },
  ollama: {
    default: { input: 0, output: 0 }, // Free — local inference
  },
};

// ---- Budget Configuration ----

const DEFAULT_DAILY_BUDGET = 50; // USD per dealership per day
const DEFAULT_MONTHLY_BUDGET = 500; // USD per dealership per month

// ---- Core Functions ----

export interface AICallRecord {
  dealershipId: number;
  provider: "anthropic" | "openai" | "ollama";
  model: string;
  endpoint: string; // e.g., 'chat', 'intent', 'sales_response', 'follow_up'
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  latencyMs: number;
  success: boolean;
  errorCode?: string;
}

/**
 * Record an AI API call with full cost tracking.
 * Call this after every AI API request.
 */
export async function recordAICall(record: AICallRecord): Promise<void> {
  const redis = getRedisClient();
  const date = new Date().toISOString().split("T")[0];
  const month = date.substring(0, 7); // YYYY-MM

  const cost = calculateCost(record.provider, record.model, record.tokensInput, record.tokensOutput);
  record.costUsd = cost;

  // Pipeline all Redis operations for performance
  const pipeline = redis.pipeline();

  // Daily counters
  const dayKey = `ai:usage:${record.dealershipId}:${date}`;
  pipeline.hincrby(dayKey, "calls", 1);
  pipeline.hincrby(dayKey, "tokens_input", record.tokensInput);
  pipeline.hincrby(dayKey, "tokens_output", record.tokensOutput);
  pipeline.hincrbyfloat(dayKey, "cost", cost);
  pipeline.hincrby(dayKey, record.endpoint, 1);
  pipeline.hincrby(dayKey, `${record.provider}_calls`, 1);
  pipeline.expire(dayKey, 86400 * 90); // Keep 90 days

  // Monthly counters
  const monthKey = `ai:usage:${record.dealershipId}:${month}`;
  pipeline.hincrby(monthKey, "calls", 1);
  pipeline.hincrby(monthKey, "tokens_input", record.tokensInput);
  pipeline.hincrby(monthKey, "tokens_output", record.tokensOutput);
  pipeline.hincrbyfloat(monthKey, "cost", cost);
  pipeline.expire(monthKey, 86400 * 365); // Keep 1 year

  // Provider-specific monthly
  pipeline.hincrby(`ai:provider:${record.provider}:${month}`, String(record.dealershipId), 1);

  await pipeline.exec();

  // Check budget threshold
  await checkBudget(record.dealershipId, date);
}

/**
 * Check if a dealership has exceeded its daily budget.
 * Returns true if under budget, false if over (should block further calls).
 */
export async function isUnderBudget(dealershipId: number): Promise<boolean> {
  const redis = getRedisClient();
  const date = new Date().toISOString().split("T")[0];
  const dayKey = `ai:usage:${dealershipId}:${date}`;

  const data = await redis.hgetall(dayKey);
  const dailyCost = parseFloat(data.cost || "0");
  const budget = await getDealershipBudget(dealershipId);

  return dailyCost < budget.daily;
}

/**
 * Get the cheapest viable model for a given task complexity.
 */
export function selectModel(
  complexity: "simple" | "standard" | "complex",
  budgetExceeded: boolean = false
): { provider: string; model: string; estimatedCostPer1k: number } {
  if (budgetExceeded) {
    // Use cheapest options
    return { provider: "openai", model: "gpt-4o-mini", estimatedCostPer1k: 0.00015 };
  }

  switch (complexity) {
    case "simple":
      return { provider: "anthropic", model: "claude-3-haiku", estimatedCostPer1k: 0.00025 };
    case "standard":
      return { provider: "anthropic", model: "claude-3.5-sonnet", estimatedCostPer1k: 0.003 };
    case "complex":
      return { provider: "anthropic", model: "claude-3.5-sonnet", estimatedCostPer1k: 0.003 };
  }
}

/**
 * Get daily usage summary for a dealership.
 */
export async function getDailyUsage(dealershipId: number, date?: string): Promise<{
  calls: number;
  tokensInput: number;
  tokensOutput: number;
  costUsd: number;
  byEndpoint: Record<string, number>;
}> {
  const redis = getRedisClient();
  const d = date || new Date().toISOString().split("T")[0];
  const dayKey = `ai:usage:${dealershipId}:${d}`;
  const data = await redis.hgetall(dayKey);

  const endpoints = ["chat", "intent", "sales_response", "follow_up", "vin_decode", "market"];
  const byEndpoint: Record<string, number> = {};
  for (const ep of endpoints) {
    byEndpoint[ep] = parseInt(data[ep] || "0", 10);
  }

  return {
    calls: parseInt(data.calls || "0", 10),
    tokensInput: parseInt(data.tokens_input || "0", 10),
    tokensOutput: parseInt(data.tokens_output || "0", 10),
    costUsd: parseFloat(data.cost || "0"),
    byEndpoint,
  };
}

/**
 * Get monthly usage rollup.
 */
export async function getMonthlyUsage(
  dealershipId: number,
  month?: string
): Promise<{ calls: number; tokensInput: number; tokensOutput: number; costUsd: number }> {
  const redis = getRedisClient();
  const m = month || new Date().toISOString().substring(0, 7);
  const monthKey = `ai:usage:${dealershipId}:${m}`;
  const data = await redis.hgetall(monthKey);

  return {
    calls: parseInt(data.calls || "0", 10),
    tokensInput: parseInt(data.tokens_input || "0", 10),
    tokensOutput: parseInt(data.tokens_output || "0", 10),
    costUsd: parseFloat(data.cost || "0"),
  };
}

/**
 * Get top dealerships by AI spend (for admin dashboard).
 */
export async function getTopSpenders(month?: string, limit: number = 20): Promise<
  Array<{ dealershipId: number; calls: number; costUsd: number }>
> {
  const redis = getRedisClient();
  const m = month || new Date().toISOString().substring(0, 7);

  // Scan all keys for this month
  const keys = await redis.keys(`ai:usage:*:${m}`);
  const results: Array<{ dealershipId: number; calls: number; costUsd: number }> = [];

  for (const key of keys) {
    const match = key.match(/ai:usage:(\d+):/);
    if (!match) continue;
    const dealershipId = parseInt(match[1], 10);
    const data = await redis.hgetall(key);
    results.push({
      dealershipId,
      calls: parseInt(data.calls || "0", 10),
      costUsd: parseFloat(data.cost || "0"),
    });
  }

  return results.sort((a, b) => b.costUsd - a.costUsd).slice(0, limit);
}

// ---- Internal ----

function calculateCost(
  provider: string,
  model: string,
  tokensInput: number,
  tokensOutput: number
): number {
  const providerPricing = PRICING[provider as keyof typeof PRICING];
  if (!providerPricing) return 0;

  const modelPricing = providerPricing[model as keyof typeof providerPricing] ||
    (providerPricing as Record<string, unknown>)["default" as keyof typeof providerPricing];
  if (!modelPricing) return 0;

  const pricing = modelPricing as { input: number; output: number };
  const inputCost = (tokensInput / 1000) * pricing.input;
  const outputCost = (tokensOutput / 1000) * pricing.output;
  return Math.round((inputCost + outputCost) * 1000000) / 1000000; // Round to 6 decimals
}

async function getDealershipBudget(dealershipId: number): Promise<{
  daily: number;
  monthly: number;
}> {
  // TODO: Load from dealership settings when available
  // For now, use defaults
  return {
    daily: DEFAULT_DAILY_BUDGET,
    monthly: DEFAULT_MONTHLY_BUDGET,
  };
}

async function checkBudget(dealershipId: number, date: string): Promise<void> {
  const redis = getRedisClient();
  const dayKey = `ai:usage:${dealershipId}:${date}`;
  const data = await redis.hgetall(dayKey);
  const dailyCost = parseFloat(data.cost || "0");
  const budget = await getDealershipBudget(dealershipId);

  // Alert at 80% of daily budget
  if (dailyCost >= budget.daily * 0.8 && dailyCost < budget.daily) {
    logWarn(`[AICost] Dealership ${dealershipId} at 80% of daily AI budget ($${dailyCost.toFixed(2)}/$${budget.daily})`);
  }

  // Alert when exceeded
  if (dailyCost >= budget.daily) {
    logWarn(`[AICost] Dealership ${dealershipId} exceeded daily AI budget: $${dailyCost.toFixed(2)}`);
    await sendAICostAlert(dealershipId, dailyCost);
  }
}
