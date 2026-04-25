/**
 * Hourly Carfax Refresh — Render Cron Job
 * Refreshes Carfax reports for vehicles with expired cache.
 */

import { db } from "../db";
import { vehicles, carfaxReports } from "../../shared/schema";
import { eq, isNotNull } from "drizzle-orm";

async function runCarfaxRefresh() {
  console.log("═══════════════════════════════════════════");
  console.log("  Lotview — Carfax Refresh");
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log("═══════════════════════════════════════════\n");

  try {
    // Find vehicles with VINs that need Carfax refresh
    // (no carfax_last_updated OR carfax_last_updated > 7 days ago)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const vehiclesNeedingRefresh = await db
      .select()
      .from(vehicles)
      .where(isNotNull(vehicles.vin))
      .limit(50); // Process max 50 per run

    // Filter to only those with expired or missing Carfax
    const toRefresh = vehiclesNeedingRefresh.filter(v =>
      !v.carfaxLastUpdated || new Date(v.carfaxLastUpdated) < sevenDaysAgo
    );

    console.log(`Found ${toRefresh.length} vehicles needing Carfax refresh\n`);

    const { scrapeCarfaxByVin } = await import("../services/carfax-scraper");
    let success = 0;
    let failed = 0;

    for (const vehicle of toRefresh) {
      try {
        if (!vehicle.vin) continue;

        console.log(`🔍 Refreshing Carfax for ${vehicle.year} ${vehicle.make} ${vehicle.model} (${vehicle.vin})`);

        const report = await scrapeCarfaxByVin(vehicle.vin, {
          browserlessToken: process.env.BROWSERLESS_TOKEN,
        });

        if (report) {
          // Update vehicles table with Carfax summary
          await db.update(vehicles).set({
            carfaxUrl: report.url,
            carfaxBadges: report.badges,
            carfaxLastUpdated: new Date(),
          }).where(eq(vehicles.id, vehicle.id));

          // Upsert full Carfax report data
          const existingReport = await db.select()
            .from(carfaxReports)
            .where(eq(carfaxReports.vin, vehicle.vin))
            .limit(1);

          if (existingReport.length > 0) {
            await db.update(carfaxReports).set({
              reportUrl: report.url,
              accidentCount: report.accidentCount,
              ownerCount: report.ownerCount,
              serviceRecordCount: report.serviceRecordCount,
              damageReported: report.damageReported,
              lienReported: report.lienReported,
              lastReportedOdometer: report.odometerLastReported,
              lastReportedDate: report.lastReportedDate,
              fullReportData: report,
              badges: report.badges,
              updatedAt: new Date(),
            }).where(eq(carfaxReports.id, existingReport[0].id));
          } else {
            await db.insert(carfaxReports).values({
              vehicleId: vehicle.id,
              dealershipId: vehicle.dealershipId,
              vin: vehicle.vin,
              reportUrl: report.url,
              accidentCount: report.accidentCount,
              ownerCount: report.ownerCount,
              serviceRecordCount: report.serviceRecordCount,
              damageReported: report.damageReported,
              lienReported: report.lienReported,
              lastReportedOdometer: report.odometerLastReported,
              lastReportedDate: report.lastReportedDate,
              fullReportData: report,
              badges: report.badges,
            });
          }

          success++;
          console.log(`   ✅ Badges: ${report.badges.slice(0, 3).join(", ")}${report.badges.length > 3 ? "..." : ""}`);
        } else {
          failed++;
          console.log(`   ⚠️  Could not retrieve report`);
        }
      } catch (err) {
        failed++;
        console.error(`   ❌ Error:`, err instanceof Error ? err.message.slice(0, 80) : String(err).slice(0, 80));
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 3000));
    }

    console.log(`\n✅ Carfax refresh: ${success} success, ${failed} failed\n`);
  } catch (error) {
    console.error("❌ Carfax refresh failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await (db as any).$client?.end?.().catch(() => {});
  }
}

runCarfaxRefresh();
