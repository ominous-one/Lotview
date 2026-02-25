import { db } from "./server/db";
import { scrapeSources } from "@shared/schema";
import { eq, and } from "drizzle-orm";

async function addScrapeSource() {
  // Check if already exists
  const existing = await db.select().from(scrapeSources).where(
    and(eq(scrapeSources.dealershipId, 1), eq(scrapeSources.sourceUrl, "https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used"))
  );

  if (existing.length > 0) {
    console.log("✅ Scrape source already exists (id:", existing[0].id, ")");
  } else {
    const [source] = await db.insert(scrapeSources).values({
      dealershipId: 1,
      sourceName: "Olympic Hyundai Vancouver - Used Vehicles",
      sourceUrl: "https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used",
      sourceType: "dealer_website",
      isActive: true,
      scrapeFrequency: "daily",
    }).returning();
    console.log("✅ Created scrape source:", source.id, source.sourceName);
  }

  process.exit(0);
}

addScrapeSource().catch(e => { console.error(e); process.exit(1); });
