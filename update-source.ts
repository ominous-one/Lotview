import { db } from "./server/db";
import { scrapeSources } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  await db.update(scrapeSources).set({
    sourceUrl: "https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid"
  }).where(eq(scrapeSources.id, 1));
  console.log("✅ Updated scrape source URL");
  process.exit(0);
}
main();
