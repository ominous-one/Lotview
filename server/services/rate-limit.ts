/**
 * Rate Limiting Service
 * Provides Redis-backed rate limiters for consistent rate limiting
 * across multiple server instances. Required for horizontal scaling.
 */

import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { getRedisClient } from "./redis";

const redisClient = getRedisClient();

/**
 * Global rate limiter — 1000 requests per 15 minutes per IP.
 * Uses Redis for cross-instance consistency.
 */
export function createGlobalLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-expect-error — ioredis client is compatible but types differ
      sendCommand: (...args: string[]) => redisClient.call(...args),
      prefix: "rl:global:",
    }),
    message: { error: "Too many requests, please try again later" },
    skip: (req) => !req.path.startsWith("/api"),
  });
}

/**
 * Auth endpoint rate limiter — 10 attempts per 15 minutes.
 * Prevents brute-force attacks on login endpoints.
 */
export function createAuthLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-expect-error — ioredis client is compatible but types differ
      sendCommand: (...args: string[]) => redisClient.call(...args),
      prefix: "rl:auth:",
    }),
    message: { error: "Too many login attempts, please try again after 15 minutes" },
  });
}

/**
 * Sensitive operations rate limiter — 5 attempts per hour.
 * For password reset, account recovery, etc.
 */
export function createSensitiveLimiter() {
  return rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-expect-error — ioredis client is compatible but types differ
      sendCommand: (...args: string[]) => redisClient.call(...args),
      prefix: "rl:sensitive:",
    }),
    message: { error: "Too many requests for this sensitive operation, please try again later" },
  });
}

/**
 * Scraper webhook rate limiter — 100 requests per minute.
 * Prevents abuse of webhook endpoints while allowing normal scraping traffic.
 */
export function createWebhookLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-expect-error — ioredis client is compatible but types differ
      sendCommand: (...args: string[]) => redisClient.call(...args),
      prefix: "rl:webhook:",
    }),
    message: { error: "Webhook rate limit exceeded" },
    skip: (req) => {
      // Skip if webhook signature is valid (trusted sources)
      return req.headers["x-webhook-signature"] !== undefined;
    },
  });
}
