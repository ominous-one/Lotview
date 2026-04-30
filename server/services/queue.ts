/**
 * Message Queue Service
 * BullMQ-based job queues for async processing of long-running operations:
 * - Inventory scraping
 * - AI sales agent responses
 * - Facebook Marketplace posting
 * - Email/SMS notifications
 *
 * Required for horizontal scaling — jobs are stored in Redis and processed
 * by worker instances independently of web request handlers.
 */

import { Queue, Worker, Job } from "bullmq";
import { getRedisClient } from "./redis";

const redisConnection = getRedisClient();

// ---- Queue Definitions ----

export const scrapeQueue = new Queue("inventory-scrape", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400, count: 100 },
    removeOnFail: { age: 604800, count: 200 },
  },
});

export const aiResponseQueue = new Queue("ai-response", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: { age: 86400, count: 500 },
    removeOnFail: { age: 604800, count: 200 },
  },
});

export const facebookPostQueue = new Queue("facebook-post", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
    removeOnComplete: { age: 86400, count: 200 },
    removeOnFail: { age: 604800, count: 200 },
  },
});

export const notificationQueue = new Queue("notification", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 86400, count: 500 },
    removeOnFail: { age: 604800, count: 500 },
  },
});

// ---- Job Enqueue Helpers ----

export interface ScrapeJobData {
  dealershipId: number;
  sourceId?: number;
  triggeredBy: "scheduler" | "manual" | "webhook";
  scrapeVdp?: boolean;
}

export async function enqueueScrapeJob(data: ScrapeJobData): Promise<Job> {
  return await scrapeQueue.add("scrape-inventory", data, {
    jobId: `scrape-${data.dealershipId}-${Date.now()}`,
  });
}

export interface AIResponseJobData {
  dealershipId: number;
  conversationId: number;
  customerMessage: string;
  customerName?: string;
  vehicleId?: number;
}

export async function enqueueAIResponseJob(data: AIResponseJobData): Promise<Job> {
  return await aiResponseQueue.add("generate-response", data, {
    jobId: `ai-${data.conversationId}-${Date.now()}`,
  });
}

export interface FacebookPostJobData {
  dealershipId: number;
  vehicleId: number;
  platform: "facebook_marketplace" | "craigslist";
  priority: number;
}

export async function enqueueFacebookPostJob(data: FacebookPostJobData): Promise<Job> {
  return await facebookPostQueue.add("create-posting", data, {
    priority: data.priority,
    jobId: `fb-post-${data.dealershipId}-${data.vehicleId}`,
  });
}

export interface NotificationJobData {
  type: "email" | "sms";
  dealershipId: number;
  recipient: string;
  subject?: string;
  body: string;
}

export async function enqueueNotification(data: NotificationJobData): Promise<Job> {
  return await notificationQueue.add("send-notification", data);
}

// ---- Queue Health ----

export async function getQueueHealth(): Promise<
  Record<string, { waiting: number; active: number; completed: number; failed: number }>
> {
  const normalize = (counts: Record<string, number>) => ({
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
  });

  const [scrape, ai, fb, notify] = await Promise.all([
    scrapeQueue.getJobCounts(),
    aiResponseQueue.getJobCounts(),
    facebookPostQueue.getJobCounts(),
    notificationQueue.getJobCounts(),
  ]);

  return {
    "inventory-scrape": normalize(scrape),
    "ai-response": normalize(ai),
    "facebook-post": normalize(fb),
    notification: normalize(notify),
  };
}

// ---- Worker Setup (called by worker process) ----

/**
 * Registers job processors for the worker process.
 * The worker process (index-worker.ts) calls this at startup.
 */
export function registerJobProcessors(handlers: {
  onScrapeJob: (job: Job<ScrapeJobData>) => Promise<void>;
  onAIResponseJob: (job: Job<AIResponseJobData>) => Promise<void>;
  onFacebookPostJob: (job: Job<FacebookPostJobData>) => Promise<void>;
  onNotificationJob: (job: Job<NotificationJobData>) => Promise<void>;
}): void {
  new Worker<ScrapeJobData>("inventory-scrape", handlers.onScrapeJob, {
    connection: redisConnection,
    concurrency: 3,
    limiter: { max: 10, duration: 60000 },
  });

  new Worker<AIResponseJobData>("ai-response", handlers.onAIResponseJob, {
    connection: redisConnection,
    concurrency: 10,
    limiter: { max: 60, duration: 60000 },
  });

  new Worker<FacebookPostJobData>("facebook-post", handlers.onFacebookPostJob, {
    connection: redisConnection,
    concurrency: 2,
    limiter: { max: 20, duration: 3600000 },
  });

  new Worker<NotificationJobData>("notification", handlers.onNotificationJob, {
    connection: redisConnection,
    concurrency: 5,
  });

  console.log("[Queue] Job processors registered");
}
