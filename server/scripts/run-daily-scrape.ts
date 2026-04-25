/**
 * Daily Inventory Scrape — Render Cron Job
 * Runs every morning at 6 AM UTC to scrape all dealership inventories.
 */

import { db } from "../db";
import { dealerships } from "../../shared/schema";
import { eq } from "drizzle-orm";

async function runDailyScrape() {
  console.log("═══════════════════════════════════════════");
  console.log("  Lotview — Daily Inventory Scrape");
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════\n");

  try {
    // Get all active dealerships with scrape sources
    const activeDealerships = await db
      .select()
      .from(dealerships)
      .where(eq(dealerships.isActive, true));

    console.log(`Found ${activeDealerships.length} active dealerships\n`);

    for (const dealership of activeDealerships) {
      try {
        console.log(`🔍 Scraping: ${dealership.name} (ID: ${dealership.id})`);

        // Import scraper dynamically
        const { scrapeOlympicHyundai } = await import("../services/scraper-olympic-hyundai");

        const result = await scrapeOlympicHyundai(dealership.id, {
          browserlessToken: process.env.BROWSERLESS_TOKEN,
          dryRun: false,
        });

        console.log(`   ✅ ${result.vehicles.length} vehicles scraped (method: ${result.method})`);
        if (result.errors.length > 0) {
          console.log(`   ⚠️  ${result.errors.length} errors: ${result.errors[0]}`);
        }
      } catch (err) {
        console.error(`   ❌ Failed to scrape ${dealership.name}:`,
          err instanceof Error ? err.message : String(err));
      }

      // Rate limit between dealerships
      await new Promise(r => setTimeout(r, 5000));
    }

    console.log("\n✅ Daily scrape complete\n");
  } catch (error) {
    console.error("❌ Daily scrape failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await (db as any).$client?.end?.().catch(() => {});
  }
}

runDailyScrape();
