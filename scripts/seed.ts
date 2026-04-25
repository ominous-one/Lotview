#!/usr/bin/env tsx
/**
 * Lotview SaaS — Database Seed Script
 * Bootstraps the first super-admin, dealership, and demo data.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *   DATABASE_URL=postgres://... npx tsx scripts/seed.ts
 */

import { db, pool } from "../server/db";
import { hashPassword } from "../server/utils/crypto";
import { dealerships, users, globalSettings } from "../shared/schema";

async function seed() {
  console.log("🌱 Lotview SaaS — Database Seed\n");

  // Check if super admin already exists
  const existingUsers = await db.select().from(users).limit(1);
  if (existingUsers.length > 0) {
    console.log("⚠️  Database already seeded. Found existing users.");
    console.log("   To re-seed, truncate tables first.");
    await pool.end();
    process.exit(0);
  }

  // ─── Create Demo Dealership ───
  console.log("🏢 Creating demo dealership...");
  const [dealership] = await db.insert(dealerships).values({
    name: "Olympic Hyundai",
    slug: "olympic-hyundai",
    subdomain: "olympic",
    address: "123 Auto Row",
    city: "Vancouver",
    province: "BC",
    postalCode: "V6B 1A1",
    phone: "604-555-0100",
    timezone: "America/Vancouver",
    defaultCurrency: "CAD",
    isActive: true,
  }).returning();
  console.log(`   ✅ Dealership: ${dealership.name} (ID: ${dealership.id})`);

  // ─── Create Super Admin ───
  console.log("👤 Creating super admin...");
  const superAdminPassword = await hashPassword("SuperAdmin2026!");
  const [superAdmin] = await db.insert(users).values({
    email: "admin@lotview.ai",
    name: "Super Admin",
    passwordHash: superAdminPassword,
    role: "super_admin",
    dealershipId: null, // Global access
    isActive: true,
  }).returning();
  console.log(`   ✅ Super Admin: ${superAdmin.email} / SuperAdmin2026!`);

  // ─── Create Master User for Dealership ───
  console.log("👤 Creating dealership master user...");
  const masterPassword = await hashPassword("Master2026!");
  const [masterUser] = await db.insert(users).values({
    email: "master@olympichyundai.com",
    name: "Dealership Manager",
    passwordHash: masterPassword,
    role: "master",
    dealershipId: dealership.id,
    isActive: true,
  }).returning();
  console.log(`   ✅ Master User: ${masterUser.email} / Master2026!`);

  // ─── Create Salesperson ───
  console.log("👤 Creating salesperson...");
  const salesPassword = await hashPassword("Sales2026!");
  const [salesUser] = await db.insert(users).values({
    email: "sales@olympichyundai.com",
    name: "Sales Rep",
    passwordHash: salesPassword,
    role: "salesperson",
    dealershipId: dealership.id,
    isActive: true,
  }).returning();
  console.log(`   ✅ Salesperson: ${salesUser.email} / Sales2026!`);

  // ─── Default Global Settings ───
  console.log("⚙️  Setting global defaults...");
  await db.insert(globalSettings).values([
    { key: "system_name", value: "Lotview" },
    { key: "max_dealerships", value: "100" },
    { key: "default_plan", value: "starter" },
    { key: "trial_days", value: "14" },
    { key: "support_email", value: "support@lotview.ai" },
  ]);
  console.log("   ✅ Global settings configured");

  console.log("\n═══════════════════════════════════════════");
  console.log("  🎉 SEED COMPLETE");
  console.log("═══════════════════════════════════════════");
  console.log("");
  console.log("  LOGIN CREDENTIALS:");
  console.log("  ───────────────────────────────────────────");
  console.log("  Super Admin:  admin@lotview.ai / SuperAdmin2026!");
  console.log("  Master User:  master@olympichyundai.com / Master2026!");
  console.log("  Salesperson:  sales@olympichyundai.com / Sales2026!");
  console.log("");
  console.log("  DEALERSHIP:");
  console.log("  ───────────────────────────────────────────");
  console.log(`  Name:    ${dealership.name}`);
  console.log(`  Slug:    ${dealership.slug}`);
  console.log(`  ID:      ${dealership.id}`);
  console.log("");
  console.log("  NEXT STEPS:");
  console.log("  ───────────────────────────────────────────");
  console.log("  1. Start the app: docker-compose up -d");
  console.log("  2. Login at: http://localhost:3000");
  console.log("  3. Configure GHL API key in Settings");
  console.log("  4. Add scrape source for your inventory website");
  console.log("  5. Connect Facebook account for Marketplace posting");
  console.log("═══════════════════════════════════════════\n");

  await pool.end();
}

seed().catch(async (err) => {
  console.error("❌ Seed failed:", err);
  await pool.end();
  process.exit(1);
});
