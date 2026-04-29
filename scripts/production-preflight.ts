#!/usr/bin/env node
/**
 * Lotview Production Pre-Flight Check
 * Validates all critical requirements before deploying to production.
 *
 * Usage:
 *   node scripts/production-preflight.js
 *   npx tsx scripts/production-preflight.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const REQUIRED_ENV = [
  "NODE_ENV",
  "JWT_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
];

const WARN_ENV = [
  "GHL_CLIENT_ID",
  "GHL_CLIENT_SECRET",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "FACEBOOK_APP_ID",
  "FACEBOOK_APP_SECRET",
  "BROWSERLESS_TOKEN",
];

const CHECKS = [];

function check(name, test, critical = true) {
  const ok = typeof test === "function" ? test() : test;
  CHECKS.push({ name, ok, critical });
  const icon = ok ? "✅" : critical ? "❌" : "⚠️";
  console.log(`${icon} ${name}`);
  return ok;
}

console.log("═══════════════════════════════════════════");
console.log("  Lotview SaaS — Production Pre-Flight Check");
console.log("═══════════════════════════════════════════\n");

// ─── Environment Variables ───
console.log("📋 Environment Variables");
const envFile: Record<string, string> = {};
const envPath = path.join(ROOT, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach((line) => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) envFile[match[1].trim()] = match[2].trim();
  });
}

for (const key of REQUIRED_ENV) {
  const value = process.env[key] || envFile[key];
  check(`${key} is set`, !!value && value.length > 0);
}

for (const key of WARN_ENV) {
  const value = process.env[key] || envFile[key];
  check(`${key} is set (optional)`, !!value, false);
}

// ─── File Structure ───
console.log("\n📁 File Structure");
check("Dockerfile exists", () => fs.existsSync(path.join(ROOT, "Dockerfile")));
check("docker-compose.yml exists", () => fs.existsSync(path.join(ROOT, "docker-compose.yml")));
check(".env.template exists", () => fs.existsSync(path.join(ROOT, ".env.template")));
check("package.json exists", () => fs.existsSync(path.join(ROOT, "package.json")));
check("server/app.ts exists", () => fs.existsSync(path.join(ROOT, "server", "app.ts")));
check("server/routes.ts exists", () => fs.existsSync(path.join(ROOT, "server", "routes.ts")));
check("server/services/ exists", () => fs.existsSync(path.join(ROOT, "server", "services")));
check("shared/schema.ts exists", () => fs.existsSync(path.join(ROOT, "shared", "schema.ts")));
check("Health routes exist", () => fs.existsSync(path.join(ROOT, "server", "routes", "health.ts")));

// ─── Service Files ───
console.log("\n🔧 Service Files");
const services = [
  "redis.ts",
  "queue.ts",
  "rate-limit.ts",
  "ghl-notifications.ts",
  "scrape-validator.ts",
  "ai-cost-tracker.ts",
  "vehicle-dedup.ts",
  "webhook-verifier.ts",
  "external-api-guard.ts",
  "photo-guard.ts",
  "feature-flags.ts",
  "fb-ban-recovery.ts",
  "ai-posting-optimizer.ts",
  "calendar-sync.ts",
  "ab-testing.ts",
  "admin-dashboard.ts",
  "scrape-alerts.ts",
  "carfax-browserless.ts",
];
for (const svc of services) {
  check(`Service ${svc} exists`, () => fs.existsSync(path.join(ROOT, "server", "services", svc)));
}

// ─── Database Connectivity ───
console.log("\n🐘 Database Connectivity");
let dbConnected = false;
try {
  const { Pool } = await import("pg");
  const dbUrl = process.env.DATABASE_URL || envFile.DATABASE_URL;
  if (dbUrl) {
    const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
    const client = await pool.connect();
    const result = await client.query("SELECT version()");
    client.release();
    await pool.end();
    dbConnected = true;
    check(`PostgreSQL connected (${result.rows[0].version.split(" ")[0]} ${result.rows[0].version.split(" ")[1]})`, true);
  } else {
    check("PostgreSQL connected", false);
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  check(`PostgreSQL connected — ${message}`, false);
}

// ─── Redis Connectivity ───
console.log("\n🔴 Redis Connectivity");
let redisConnected = false;
try {
  const { default: Redis } = await import("ioredis");
  const redisUrl = process.env.REDIS_URL || envFile.REDIS_URL || "redis://localhost:6379";
  const client = new Redis(redisUrl, {
    connectTimeout: 5000,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  });
  await client.connect();
  const result = await client.ping();
  client.disconnect();
  redisConnected = result === "PONG";
  check("Redis connected", redisConnected);
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  check(`Redis connected — ${message}`, false);
}

// ─── Build Artifacts ───
console.log("\n📦 Build Artifacts");
check("dist/index.js exists (production bundle)", () => fs.existsSync(path.join(ROOT, "dist", "index.js")));
check("dist/index-worker.js exists (worker bundle)", () => fs.existsSync(path.join(ROOT, "dist", "index-worker.js")));
const publicDir = path.join(ROOT, "dist", "public");
check("dist/public/ exists (client build)", () => fs.existsSync(publicDir) && fs.statSync(publicDir).isDirectory());

// ─── Summary ───
console.log("\n═══════════════════════════════════════════");
const criticalChecks = CHECKS.filter((c) => c.critical);
const failedCritical = criticalChecks.filter((c) => !c.ok).length;
const passedCritical = criticalChecks.filter((c) => c.ok).length;
const total = CHECKS.length;
const passed = CHECKS.filter((c) => c.ok).length;

console.log(`  Results: ${passed}/${total} checks passed`);
console.log(`  Critical: ${passedCritical}/${criticalChecks.length} passed`);

if (failedCritical === 0) {
  console.log("  ✅ READY FOR PRODUCTION");
} else {
  console.log(`  ❌ ${failedCritical} CRITICAL CHECKS FAILED — Fix before deploying`);
  process.exit(1);
}
console.log("═══════════════════════════════════════════");
