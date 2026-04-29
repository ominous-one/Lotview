/**
 * A/B Testing Service for Follow-Up Sequences
 * Enables split testing of message templates, subject lines, and send times
 * to optimize follow-up engagement rates.
 */

import { logInfo, logWarn } from "../error-utils";
import { storage } from "../storage";
import { getRedisClient } from "./redis";

// ---- Types ----

export interface ABExperiment {
  id: string;
  dealershipId: number;
  name: string;
  sequenceId: number;
  status: "draft" | "running" | "paused" | "concluded";
  variantA: ABVariant;
  variantB: ABVariant;
  splitRatio: number; // 0-1, percentage going to variant A
  metrics: ABMetrics;
  minSampleSize: number;
  conclusionCriteria: "opens" | "replies" | "clicks";
  winner?: "a" | "b" | "tie";
  startedAt?: Date;
  concludedAt?: Date;
}

export interface ABVariant {
  name: string;
  subjectTemplate: string;
  bodyTemplate: string;
  sendTimeOffsetHours?: number;
}

export interface ABMetrics {
  aSent: number;
  aOpened: number;
  aReplied: number;
  aClicked: number;
  bSent: number;
  bOpened: number;
  bReplied: number;
  bClicked: number;
}

// ---- Core Functions ----

/**
 * Create a new A/B experiment.
 */
export async function createExperiment(
  experiment: Omit<ABExperiment, "id" | "metrics" | "status">
): Promise<ABExperiment> {
  const id = `exp_${Date.now()}_${experiment.dealershipId}`;

  const fullExperiment: ABExperiment = {
    ...experiment,
    id,
    status: "draft",
    metrics: {
      aSent: 0, aOpened: 0, aReplied: 0, aClicked: 0,
      bSent: 0, bOpened: 0, bReplied: 0, bClicked: 0,
    },
  };

  const redis = getRedisClient();
  await redis.setex(
    `abtest:${experiment.dealershipId}:${id}`,
    86400 * 90, // 90 days
    JSON.stringify(fullExperiment)
  );

  logInfo(`[ABTest] Created experiment ${id}: ${experiment.name}`);
  return fullExperiment;
}

/**
 * Start a draft experiment.
 */
export async function startExperiment(
  dealershipId: number,
  experimentId: string
): Promise<ABExperiment | null> {
  const redis = getRedisClient();
  const data = await redis.get(`abtest:${dealershipId}:${experimentId}`);
  if (!data) return null;

  const exp: ABExperiment = JSON.parse(data);
  if (exp.status !== "draft") {
    logWarn(`[ABTest] Cannot start experiment ${experimentId}: status is ${exp.status}`);
    return exp;
  }

  exp.status = "running";
  exp.startedAt = new Date();

  await redis.setex(`abtest:${dealershipId}:${experimentId}`, 86400 * 90, JSON.stringify(exp));
  logInfo(`[ABTest] Started experiment ${experimentId}`);

  return exp;
}

/**
 * Assign a contact to a variant (A or B) using consistent hashing.
 * Same contact always gets the same variant.
 */
export async function assignVariant(
  dealershipId: number,
  experimentId: string,
  contactId: string
): Promise<"a" | "b"> {
  const redis = getRedisClient();

  // Check cache first
  const cached = await redis.get(`abtest:assign:${experimentId}:${contactId}`);
  if (cached) return cached as "a" | "b";

  // Get experiment
  const data = await redis.get(`abtest:${dealershipId}:${experimentId}`);
  if (!data) return "a"; // Default

  const exp: ABExperiment = JSON.parse(data);
  if (exp.status !== "running") return "a";

  // Deterministic assignment using contact ID hash
  const hash = hashString(`${experimentId}:${contactId}`);
  const variant: "a" | "b" = (hash % 100) < (exp.splitRatio * 100) ? "a" : "b";

  // Cache assignment
  await redis.setex(`abtest:assign:${experimentId}:${contactId}`, 86400 * 30, variant);

  return variant;
}

/**
 * Record a metric event for an experiment.
 */
export async function recordMetric(
  dealershipId: number,
  experimentId: string,
  variant: "a" | "b",
  event: "sent" | "opened" | "replied" | "clicked" | string,
  value: number = 1
): Promise<void> {
  const redis = getRedisClient();
  const key = `abtest:${dealershipId}:${experimentId}`;

  const data = await redis.get(key);
  if (!data) return;

  const exp: ABExperiment = JSON.parse(data);
  if (exp.status !== "running") return;

  // Update metric
  const prefix = variant === "a" ? "a" : "b";
  const field = `${prefix}${event.charAt(0).toUpperCase()}${event.slice(1)}` as keyof ABMetrics;
  (exp.metrics as unknown as Record<string, number>)[field] = ((exp.metrics as unknown as Record<string, number>)[field] || 0) + value;

  await redis.setex(key, 86400 * 90, JSON.stringify(exp));

  // Check if we should auto-conclude
  await checkAutoConclusion(dealershipId, experimentId, exp);
}

/**
 * Get experiment results with statistical significance.
 */
export async function getResults(
  dealershipId: number,
  experimentId: string
): Promise<{
  experiment: ABExperiment | null;
  significance: { isSignificant: boolean; pValue: number };
  recommendation: string;
}> {
  const redis = getRedisClient();
  const data = await redis.get(`abtest:${dealershipId}:${experimentId}`);
  if (!data) return { experiment: null, significance: { isSignificant: false, pValue: 1 }, recommendation: "" };

  const exp: ABExperiment = JSON.parse(data);

  // Calculate rates
  const aReplyRate = exp.metrics.aSent > 0 ? exp.metrics.aReplied / exp.metrics.aSent : 0;
  const bReplyRate = exp.metrics.bSent > 0 ? exp.metrics.bReplied / exp.metrics.bSent : 0;
  const aOpenRate = exp.metrics.aSent > 0 ? exp.metrics.aOpened / exp.metrics.aSent : 0;
  const bOpenRate = exp.metrics.bSent > 0 ? exp.metrics.bOpened / exp.metrics.bSent : 0;

  // Simple significance check (z-test approximation)
  const totalA = exp.metrics.aSent;
  const totalB = exp.metrics.bSent;
  const criterion = exp.conclusionCriteria;
  const rateA = criterion === "opens" ? aOpenRate : aReplyRate;
  const rateB = criterion === "opens" ? bOpenRate : bReplyRate;
  const successesA = criterion === "opens" ? exp.metrics.aOpened : exp.metrics.aReplied;
  const successesB = criterion === "opens" ? exp.metrics.bOpened : exp.metrics.bReplied;

  const pValue = calculateTwoProportionZTest(
    successesA, totalA,
    successesB, totalB
  );

  const isSignificant = pValue < 0.05 && totalA >= exp.minSampleSize && totalB >= exp.minSampleSize;

  let recommendation = "";
  if (isSignificant) {
    if (rateA > rateB) {
      recommendation = `Variant A wins with ${(rateA * 100).toFixed(1)}% ${criterion} rate vs ${(rateB * 100).toFixed(1)}% (p=${pValue.toFixed(4)}). Apply Variant A to all future sends.`;
    } else {
      recommendation = `Variant B wins with ${(rateB * 100).toFixed(1)}% ${criterion} rate vs ${(rateA * 100).toFixed(1)}% (p=${pValue.toFixed(4)}). Apply Variant B to all future sends.`;
    }
  } else if (totalA < exp.minSampleSize || totalB < exp.minSampleSize) {
    recommendation = `Need more data: ${Math.max(totalA, totalB)}/${exp.minSampleSize} samples collected per variant.`;
  } else {
    recommendation = `No statistically significant difference (p=${pValue.toFixed(4)}). Either variant is acceptable.`;
  }

  return { experiment: exp, significance: { isSignificant, pValue }, recommendation };
}

/**
 * Conclude an experiment and apply the winner.
 */
export async function concludeExperiment(
  dealershipId: number,
  experimentId: string
): Promise<{ success: boolean; winner?: "a" | "b" | "tie"; error?: string }> {
  const redis = getRedisClient();
  const data = await redis.get(`abtest:${dealershipId}:${experimentId}`);
  if (!data) return { success: false, error: "Experiment not found" };

  const exp: ABExperiment = JSON.parse(data);

  const { significance } = await getResults(dealershipId, experimentId);

  // Determine winner
  const aReplyRate = exp.metrics.aSent > 0 ? exp.metrics.aReplied / exp.metrics.aSent : 0;
  const bReplyRate = exp.metrics.bSent > 0 ? exp.metrics.bReplied / exp.metrics.bSent : 0;

  let winner: "a" | "b" | "tie";
  if (significance.isSignificant) {
    winner = aReplyRate > bReplyRate ? "a" : "b";
  } else {
    winner = "tie";
  }

  exp.status = "concluded";
  exp.winner = winner;
  exp.concludedAt = new Date();

  await redis.setex(`abtest:${dealershipId}:${experimentId}`, 86400 * 365, JSON.stringify(exp));

  logInfo(`[ABTest] Concluded ${experimentId}: Winner = ${winner}`);
  return { success: true, winner };
}

/**
 * List all experiments for a dealership.
 */
export async function listExperiments(dealershipId: number): Promise<ABExperiment[]> {
  const redis = getRedisClient();
  const keys = await redis.keys(`abtest:${dealershipId}:*`);

  const experiments: ABExperiment[] = [];
  for (const key of keys) {
    const data = await redis.get(key);
    if (data) {
      experiments.push(JSON.parse(data));
    }
  }

  return experiments.sort((a, b) => {
    const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    return bTime - aTime;
  });
}

// ---- Internal ----

async function checkAutoConclusion(
  dealershipId: number,
  experimentId: string,
  exp: ABExperiment
): Promise<void> {
  // Auto-conclude if we have enough samples and a clear winner
  if (exp.metrics.aSent >= exp.minSampleSize && exp.metrics.bSent >= exp.minSampleSize) {
    const { significance } = await getResults(dealershipId, experimentId);
    if (significance.isSignificant && significance.pValue < 0.01) {
      // Strong significance, auto-conclude
      await concludeExperiment(dealershipId, experimentId);
    }
  }
}

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function calculateTwoProportionZTest(
  successes1: number, n1: number,
  successes2: number, n2: number
): number {
  if (n1 === 0 || n2 === 0) return 1;

  const p1 = successes1 / n1;
  const p2 = successes2 / n2;
  const p = (successes1 + successes2) / (n1 + n2);

  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 1;

  const z = (p1 - p2) / se;

  // Approximate p-value from z-score (two-tailed)
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));
  return Math.max(0, Math.min(1, pValue));
}

function normalCDF(x: number): number {
  // Approximation of the standard normal CDF
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);

  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}
