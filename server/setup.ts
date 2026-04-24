/**
 * First-Run Auto-Setup — Bulletproof Version
 * 
 * Runs once after server starts (with delay to ensure DB is ready).
 * Never crashes the server regardless of errors.
 */

import { logInfo, logWarn } from "./error-utils";

let setupRan = false;

export async function runFirstRunSetup(): Promise<void> {
  if (setupRan) return;

  // Delay 5 seconds to ensure DB connection pool is ready
  setTimeout(async () => {
    try {
      await executeSetup();
      setupRan = true;
    } catch (error) {
      logWarn("[Setup] First-run setup failed (non-blocking)", {
        service: "setup",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, 5000);
}

async function executeSetup(): Promise<void> {
  logInfo("[Setup] Running first-run auto-setup...", { service: "setup" });

  // Dynamic imports prevent circular dependency crashes at module load time
  const [{ db }, { users, dealerships, scrapeSources }, { hashPassword }] = await Promise.all([
    import("./db"),
    import("@shared/schema"),
    import("./utils/crypto"),
  ]);

  const { eq } = await import("drizzle-orm");

  // 1. Ensure super_admin exists
  await ensureSuperAdmin(db, users, hashPassword, eq);

  // 2. Ensure Olympic Hyundai dealership exists
  const dealership = await ensureOlympicHyundaiDealership(db, dealerships, eq);

  // 3. Ensure scrape source exists
  if (dealership) {
    await ensureScrapeSource(db, scrapeSources, dealership.id, eq);
  }

  logInfo("[Setup] First-run auto-setup complete", { service: "setup" });
}

async function ensureSuperAdmin(db: any, users: any, hashPassword: (p: string) => Promise<string>, eq: any): Promise<void> {
  try {
    const existingAdmins = await db.select().from(users).where(eq(users.role, "super_admin")).limit(1);

    if (existingAdmins.length > 0) {
      logInfo("[Setup] Super admin already exists", { service: "setup", email: existingAdmins[0].email });
      return;
    }

    const email = (process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
    const password = process.env.SUPER_ADMIN_PASSWORD || "";
    const name = process.env.SUPER_ADMIN_NAME || (email ? email.split("@")[0] : "Super Admin");

    if (!email || !password) {
      logWarn("[Setup] SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars not set. Skipping admin creation.", { service: "setup" });
      return;
    }

    if (password.length < 8) {
      logWarn("[Setup] SUPER_ADMIN_PASSWORD must be at least 8 characters", { service: "setup" });
      return;
    }

    const passwordHash = await hashPassword(password);
    const [admin] = await db.insert(users).values({
      email,
      name,
      passwordHash,
      role: "super_admin",
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    logInfo("[Setup] Created super_admin user", { service: "setup", email: admin.email, id: admin.id });
  } catch (err) {
    logWarn("[Setup] ensureSuperAdmin failed", { service: "setup", error: err instanceof Error ? err.message : String(err) });
  }
}

async function ensureOlympicHyundaiDealership(db: any, dealerships: any, eq: any): Promise<{ id: number } | null> {
  try {
    const existing = await db.select().from(dealerships).where(eq(dealerships.slug, "olympic-hyundai")).limit(1);

    if (existing.length > 0) {
      logInfo("[Setup] Dealership exists", { service: "setup", id: existing[0].id });
      return existing[0];
    }

    const [dealership] = await db.insert(dealerships).values({
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
    }).returning();

    logInfo("[Setup] Created dealership", { service: "setup", id: dealership.id });
    return dealership;
  } catch (err) {
    logWarn("[Setup] ensureDealership failed", { service: "setup", error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

async function ensureScrapeSource(db: any, scrapeSources: any, dealershipId: number, eq: any): Promise<void> {
  try {
    const existing = await db.select().from(scrapeSources).where(eq(scrapeSources.dealershipId, dealershipId)).limit(1);

    if (existing.length > 0) {
      logInfo("[Setup] Scrape source exists", { service: "setup", url: existing[0].sourceUrl });
      return;
    }

    const inventoryUrl = process.env.DEALERSHIP_INVENTORY_URL || "https://www.olympichyundaivancouver.com/inventory";

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

    logInfo("[Setup] Created scrape source", { service: "setup", dealershipId, url: inventoryUrl });
  } catch (err) {
    logWarn("[Setup] ensureScrapeSource failed", { service: "setup", error: err instanceof Error ? err.message : String(err) });
  }
}
