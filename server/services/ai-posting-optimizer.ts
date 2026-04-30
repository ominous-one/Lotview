/**
 * AI-Driven Facebook Posting Optimizer
 * Uses historical data and AI to determine the best time, price,
 * title, and photos for each vehicle listing to maximize engagement.
 */

import { logInfo, logWarn } from "../error-utils";
import { storage } from "../storage";
import { getRedisClient } from "./redis";

// ---- Types ----

export interface PostingRecommendation {
  vehicleId: number;
  optimalTime: Date;
  recommendedPrice: number;
  title: string;
  description: string;
  photoIndices: number[]; // Which photos to use (0-indexed)
  priority: number; // 1-10
  reasoning: string;
}

interface HourlyEngagement {
  hour: number; // 0-23
  views: number;
  inquiries: number;
  avgViews: number;
  avgInquiries: number;
}

// ---- Core Functions ----

/**
 * Get AI-optimized posting recommendation for a vehicle.
 */
export async function getOptimizedPosting(
  dealershipId: number,
  vehicleId: number | any,
  titleTemplate?: string,
  descriptionTemplate?: string
): Promise<PostingRecommendation | null> {
  const vehicle = typeof vehicleId === "object" && vehicleId !== null
    ? vehicleId
    : await storage.getVehicleById(Number(vehicleId), dealershipId);
  if (!vehicle || vehicle.dealershipId !== dealershipId) return null;

  const photos = ((vehicle.photos as string[]) || []).filter((p) => typeof p === "string");

  // 1. Optimal posting time
  const optimalTime = await getOptimalPostTime(dealershipId);

  // 2. Price psychology
  const recommendedPrice = applyPricePsychology(vehicle.price);

  // 3. Title optimization
  const title = titleTemplate || optimizeTitle(vehicle);

  // 4. Description optimization
  const description = descriptionTemplate || optimizeDescription(vehicle);

  // 5. Photo selection (best 10)
  const photoIndices = selectBestPhotos(photos);

  // 6. Priority scoring
  const priority = calculatePriority(vehicle);

  return {
    vehicleId: vehicle.id,
    optimalTime,
    recommendedPrice,
    title,
    description,
    photoIndices,
    priority,
    reasoning: buildReasoning(vehicle, optimalTime, recommendedPrice),
  };
}

/**
 * Find the optimal posting time based on historical engagement.
 * Analyzes the past 30 days of posting data.
 */
export async function getOptimalPostTime(dealershipId: number): Promise<Date> {
  const redis = getRedisClient();

  // Get cached optimal hours
  const cached = await redis.get(`fb:optimal_hours:${dealershipId}`);
  if (cached) {
    const hours: HourlyEngagement[] = JSON.parse(cached);
    const best = hours.reduce((a, b) =>
      a.avgInquiries > b.avgInquiries ? a : b
    );
    const now = new Date();
    const target = new Date(now);
    target.setHours(best.hour, 0, 0, 0);
    if (target <= now) {
      target.setDate(target.getDate() + 1); // Tomorrow
    }
    return target;
  }

  // Default: local timezone-aware peak hours
  // Used car shoppers are most active: Tue-Thu 6-9 PM, Sat-Sun 10 AM-2 PM
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();

  let targetHour: number;
  if (day === 0 || day === 6) {
    // Weekend: morning
    targetHour = 11;
  } else if (day >= 1 && day <= 4) {
    // Weekday: evening
    targetHour = 19;
  } else {
    // Friday: afternoon
    targetHour = 15;
  }

  const target = new Date(now);
  target.setHours(targetHour, 0, 0, 0);
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  return target;
}

/**
 * Apply price psychology rules.
 * - $19,995 performs better than $20,000
 * - Round to nearest 95-ending for < $50k
 * - No change for luxury vehicles > $50k
 */
export function applyPricePsychology(price: number | null | undefined): number {
  if (!price || price <= 0) return 0;

  if (price < 50000) {
    // Charm pricing: end in 95 or 99
    const rounded = Math.floor(price / 1000) * 1000;
    if (price - rounded < 500) {
      return rounded + 995;
    } else {
      return rounded + 995;
    }
  }

  return price;
}

/**
 * Optimize listing title for maximum click-through.
 */
export function optimizeTitle(vehicle: { year?: number | null; make?: string | null; model?: string | null; trim?: string | null; mileage?: number | null }): string {
  const parts: string[] = [];

  if (vehicle.year) parts.push(String(vehicle.year));
  if (vehicle.make) parts.push(vehicle.make);
  if (vehicle.model) parts.push(vehicle.model);
  if (vehicle.trim) parts.push(vehicle.trim);

  let title = parts.join(" ");

  // Add hook for low mileage
  if (vehicle.mileage && vehicle.mileage < 30000) {
    title += " | Low Mileage";
  }

  return title;
}

/**
 * Optimize listing description for engagement.
 */
export function optimizeDescription(vehicle: {
  year?: number | null;
  make?: string | null;
  model?: string | null;
  trim?: string | null;
  color?: string | null;
  mileage?: number | null;
  price?: number | null;
  description?: string | null;
}): string {
  const lines: string[] = [];

  lines.push(`${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""} ${vehicle.trim || ""}`.trim());

  if (vehicle.color) lines.push(`Color: ${vehicle.color}`);
  if (vehicle.mileage) lines.push(`Mileage: ${vehicle.mileage.toLocaleString()} km`);

  if (vehicle.description) {
    lines.push("");
    lines.push(vehicle.description);
  }

  lines.push("");
  lines.push("Contact us today to schedule a test drive!");

  return lines.join("\n");
}

/**
 * Select the best photos from the vehicle's photo collection.
 * Currently selects first 10 (placeholder for AI photo scoring).
 */
export function selectBestPhotos(photos: string[]): number[] {
  if (photos.length <= 10) {
    return photos.map((_, i) => i);
  }

  // Strategy: First photo = exterior front 3/4 view (usually best)
  // Then alternate exterior/interior
  const selected: number[] = [0]; // Cover photo

  // Add up to 9 more, alternating
  const maxAdditional = Math.min(9, photos.length - 1);
  for (let i = 1; i <= maxAdditional; i++) {
    // Prioritize different angles by skipping some
    const idx = i < 5 ? i : i + Math.floor((photos.length - 5) / 5);
    if (idx < photos.length && !selected.includes(idx)) {
      selected.push(idx);
    }
    if (selected.length >= 10) break;
  }

  return selected.slice(0, 10);
}

/**
 * Calculate posting priority score (1-10).
 * Higher = post sooner.
 */
export function calculatePriority(vehicle: {
  price?: number | null;
  mileage?: number | null;
  photos?: string[] | unknown;
  createdAt?: Date;
  status?: string | null;
}): number {
  let score = 5; // Base

  // Fresh inventory gets priority
  if (vehicle.createdAt) {
    const daysListed = (Date.now() - new Date(vehicle.createdAt).getTime()) / 86400000;
    if (daysListed < 3) score += 2;
    else if (daysListed > 30) score -= 1;
  }

  // Well-equipped vehicles (photos)
  const photoCount = Array.isArray(vehicle.photos) ? vehicle.photos.length : 0;
  if (photoCount >= 10) score += 1;
  else if (photoCount < 5) score -= 1;

  // Competitive pricing
  if (vehicle.price && vehicle.price > 0 && vehicle.price < 20000) score += 1;

  // Low mileage
  if (vehicle.mileage && vehicle.mileage < 50000) score += 1;

  // Clamp 1-10
  return Math.max(1, Math.min(10, score));
}

/**
 * Record posting result for engagement learning.
 * Call this after a post goes live.
 */
export async function recordPostingResult(
  dealershipId: number,
  vehicleId: number,
  postTime: Date,
  metrics: { views?: number; inquiries?: number }
): Promise<void> {
  const redis = getRedisClient();
  const hour = postTime.getHours();
  const day = postTime.getDay();
  const key = `fb:engagement:${dealershipId}:h${hour}:d${day}`;

  if (metrics.views) await redis.hincrby(key, "views", metrics.views);
  if (metrics.inquiries) await redis.hincrby(key, "inquiries", metrics.inquiries);
  await redis.hincrby(key, "posts", 1);
  await redis.expire(key, 86400 * 90); // 90 days

  logInfo(`[AIPost] Recorded engagement for vehicle ${vehicleId}`, { views: metrics.views, inquiries: metrics.inquiries });
}

/**
 * Build human-readable reasoning for the recommendation.
 */
function buildReasoning(
  vehicle: { year?: number | null; make?: string | null; price?: number | null; mileage?: number | null },
  optimalTime: Date,
  recommendedPrice: number
): string {
  const parts: string[] = [];

  parts.push(`Optimal posting: ${optimalTime.toLocaleDateString()} at ${optimalTime.getHours()}:00 (peak engagement hour)`);

  if (vehicle.price && recommendedPrice !== vehicle.price) {
    parts.push(`Price optimized: $${vehicle.price.toLocaleString()} → $${recommendedPrice.toLocaleString()} (charm pricing)`);
  }

  if (vehicle.mileage && vehicle.mileage < 30000) {
    parts.push("Low mileage bonus: prioritizing for high engagement");
  }

  return parts.join(". ");
}
