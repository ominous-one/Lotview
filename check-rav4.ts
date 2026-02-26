import { db } from "./server/db";
import { vehicles } from "@shared/schema";
import { ilike } from "drizzle-orm";

async function main() {
  const all = await db.select().from(vehicles).where(ilike(vehicles.model, '%rav4%'));
  all.forEach(v => {
    console.log(`ID: ${v.id} | ${v.year} ${v.make} ${v.model} ${v.trim}`);
    console.log(`  Price: ${v.price} | Odometer: ${v.odometer}`);
    console.log(`  Fuel: ${v.fuelType} | Color: ${v.exteriorColor} | Trans: ${v.transmission}`);
    console.log(`  Images: ${v.images?.length || 0}`);
    console.log(`  Highlights: ${v.highlights}`);
  });
  process.exit(0);
}
main();
