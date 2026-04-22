/**
 * Redis Service
 * Centralized Redis client for session storage, rate limiting, caching,
 * and message queue backing. Required for horizontal scaling across
 * multiple server instances.
 */

import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || process.env.REDIS_TLS_URL;
const isProduction = process.env.NODE_ENV === "production";

// Parse Redis URL or use default localhost configuration
function createRedisClient(): Redis {
  if (REDIS_URL) {
    return new Redis(REDIS_URL, {
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });
  }

  // Default: connect to localhost (Docker Compose setup)
  return new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379", 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || "0", 10),
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
  });
}

// Lazy singleton — only creates connection when first accessed
let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();

    redisClient.on("error", (err: Error) => {
      console.error("[Redis] Connection error:", err.message);
    });

    redisClient.on("connect", () => {
      if (!isProduction) {
        console.log("[Redis] Connected successfully");
      }
    });

    redisClient.on("reconnecting", () => {
      console.warn("[Redis] Reconnecting...");
    });
  }

  return redisClient;
}

/**
 * Distributed nonce store for HMAC validation.
 * Replaces the in-memory Map to work across multiple server instances.
 */
export async function isNonceUsed(nonce: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = `hmac:nonce:${nonce}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

export async function markNonceUsed(nonce: string, ttlMs: number = 300000): Promise<void> {
  const redis = getRedisClient();
  const key = `hmac:nonce:${nonce}`;
  await redis.setex(key, Math.ceil(ttlMs / 1000), "1");
}

/**
 * OAuth state store for Facebook OAuth flows.
 * Stores state parameters with TTL to prevent replay attacks.
 */
export async function storeOAuthState(
  state: string,
  data: { userId: number; accountId: number; dealershipId: number; expiresAt: number }
): Promise<void> {
  const redis = getRedisClient();
  const key = `oauth:state:${state}`;
  const ttl = Math.ceil((data.expiresAt - Date.now()) / 1000);
  await redis.setex(key, Math.max(ttl, 60), JSON.stringify(data));
}

export async function getOAuthState(
  state: string
): Promise<{ userId: number; accountId: number; dealershipId: number; expiresAt: number } | null> {
  const redis = getRedisClient();
  const key = `oauth:state:${state}`;
  const data = await redis.get(key);
  if (!data) return null;
  await redis.del(key); // One-time use
  return JSON.parse(data);
}

/**
 * OAuth session store for post-OAuth page selection flow.
 */
export async function storeOAuthSession(
  sessionId: string,
  data: Record<string, unknown>,
  ttlMs: number = 3600000
): Promise<void> {
  const redis = getRedisClient();
  const key = `oauth:session:${sessionId}`;
  await redis.setex(key, Math.ceil(ttlMs / 1000), JSON.stringify(data));
}

export async function getOAuthSession(sessionId: string): Promise<Record<string, unknown> | null> {
  const redis = getRedisClient();
  const key = `oauth:session:${sessionId}`;
  const data = await redis.get(key);
  if (!data) return null;
  await redis.del(key); // One-time use
  return JSON.parse(data);
}

/**
 * Posting token store for one-time use tokens.
 */
export async function isPostingTokenUsed(token: string): Promise<boolean> {
  const redis = getRedisClient();
  const key = `posting:token:${token}`;
  const exists = await redis.exists(key);
  return exists === 1;
}

export async function markPostingTokenUsed(token: string, ttlMs: number = 600000): Promise<void> {
  const redis = getRedisClient();
  const key = `posting:token:${token}`;
  await redis.setex(key, Math.ceil(ttlMs / 1000), "1");
}

/**
 * General-purpose cache with TTL.
 */
export async function cacheSet(key: string, value: string, ttlMs: number): Promise<void> {
  const redis = getRedisClient();
  await redis.setex(`cache:${key}`, Math.ceil(ttlMs / 1000), value);
}

export async function cacheGet(key: string): Promise<string | null> {
  const redis = getRedisClient();
  return await redis.get(`cache:${key}`);
}

export async function cacheDelete(key: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`cache:${key}`);
}

/**
 * Health check for Redis connectivity.
 */
export async function checkRedisHealth(): Promise<{ healthy: boolean; latencyMs: number; error?: string }> {
  const redis = getRedisClient();
  const start = Date.now();
  try {
    await redis.ping();
    return { healthy: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      healthy: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
