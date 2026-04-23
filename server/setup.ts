/**
 * First-Run Auto-Setup
 * 
 * This module runs once when the server starts. It ensures:
 * 1. A super_admin user exists (created from env vars on first deploy)
 * 2. The Olympic Hyundai dealership exists
 * 3. A scrape source exists for the dealership
 * 
 * To configure the initial super_admin, set these environment variables in Render:
 *   SUPER_ADMIN_EMAIL=rileyabreo@gmail.com
 *   SUPER_ADMIN_PASSWORD=YourSecurePassword123!
 *   SUPER_ADMIN_NAME="Riley Abreo"
 * 
 * If these are not set, the setup logs a warning and skips.
 * You can always create a super_admin via the onboarding endpoint later.
 */

import { db } from "./db";
import { users, dealerships, scrapeSources } from "@shared/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";
import { logInfo, logWarn } from "./error-utils";

let setupComplete = false;

export async function runFirstRunSetup(): Promise<void> {
  if (setupComplete) return;

  try {
    logInfo("[Setup] Running first-run auto-setup...", { service: "setup" });

    // 1. Ensure super_admin exists
    await ensureSuperAdmin();

    // 2. Ensure Olympic Hyundai dealership exists
    const dealership = await ensureOlympicHyundaiDealership();

    // 3. Ensure scrape source exists
    if (dealership) {
      await ensureScrapeSource(dealership.id);
    }

    setupComplete = true;
    logInfo("[Setup] First-run auto-setup complete", { service: "setup" });
  } catch (error) {
    logWarn("[Setup] First-run setup error (non-blocking)", { 
      service: "setup", 
      error: error instanceof Error ? error.message : String(error) 
    });
    // Don't throw - setup should never crash the server
  }
}

async function ensureSuperAdmin(): Promise<void> {
  // Check if any super_admin already exists
  const existingAdmins = await db
    .select()
    .from(users)
    .where(eq(users.role, "super_admin"))
    .limit(1);

  if (existingAdmins.length > 0) {
    logInfo("[Setup] Super admin already exists", { 
      service: "setup", 
      email: existingAdmins[0].email 
    });
    return;
  }

  // Get credentials from environment
  const email = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD || "";
  const name = process.env.SUPER_ADMIN_NAME || (email ? email.split("@")[0] : "Super Admin");

  if (!email || !password) {
    logWarn("[Setup] No super_admin credentials in environment. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD.", {
      service: "setup",
    });
    return;
  }

  if (password.length < 8) {
    logWarn("[Setup] SUPER_ADMIN_PASSWORD must be at least 8 characters", { service: "setup" });
    return;
  }

  // Create the super_admin
  const passwordHash = await hashPassword(password);
  const [admin] = await db
    .insert(users)
    .values({
      email,
      name,
      passwordHash,
      role: "super_admin",
      dealershipId: null, // super_admin has no dealership
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  logInfo("[Setup] Created super_admin user", { 
    service: "setup", 
    email: admin.email,
    name: admin.name,
    id: admin.id,
  });
}

async function ensureOlympicHyundaiDealership(): Promise<{ id: number } | null> {
  // Check if Olympic Hyundai already exists
  const existing = await db
    .select()
    .from(dealerships)
    .where(eq(dealerships.slug, "olympic-hyundai"))
    .limit(1);

  if (existing.length > 0) {
    logInfo("[Setup] Olympic Hyundai dealership already exists", { 
      service: "setup", 
      id: existing[0].id 
    });
    return existing[0];
  }

  // Create Olympic Hyundai
  const [dealership] = await db
    .insert(dealerships)
    .values({
      name: "Olympic Hyundai Vancouver",
      slug: "olympic-hyundai",
      subdomain: "olympic-hyundai",
      city: "Vancouver",
      province: "BC",
      timezone: "America/Vancouver",
      defaultCurrency: "CAD",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();

  logInfo("[Setup] Created Olympic Hyundai dealership", { 
    service: "setup", 
    id: dealership.id,
    slug: dealership.slug,
  });

  return dealership;
}

async function ensureScrapeSource(dealershipId: number): Promise<void> {
  // Check if scrape source already exists for this dealership
  const existing = await db
    .select()
    .from(scrapeSources)
    .where(eq(scrapeSources.dealershipId, dealershipId))
    .limit(1);

  if (existing.length > 0) {
    logInfo("[Setup] Scrape source already exists", { 
      service: "setup", 
      sourceUrl: existing[0].sourceUrl 
    });
    return;
  }

  // Get inventory URL from env or use default
  const inventoryUrl = process.env.DEALERSHIP_INVENTORY_URL || 
    "https://www.olympichyundaivancouver.com/inventory";

  // Create scrape source
  await db.insert(scrapeSources).values({
    dealershipId,
    sourceName: "Olympic Hyundai Vancouver",
    sourceUrl: inventoryUrl,
    sourceType: "dealer_website",
    isActive: true,
    scrapeFrequency: "daily",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  logInfo("[Setup] Created scrape source", { 
    service: "setup", 
    dealershipId,
    sourceUrl: inventoryUrl,
  });
}
