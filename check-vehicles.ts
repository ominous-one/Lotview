import { db } from "./server/db";
import { vehicles } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  const v = await db.select().from(vehicles).where(eq(vehicles.dealershipId, 1)).orderBy(desc(vehicles.id)).limit(5);
  console.log(`\n=== ${v.length} most recent vehicles ===\n`);
  v.forEach(x => {
    console.log(`--- ${x.year} ${x.make} ${x.model} ${x.trim || ''} (ID: ${x.id}) ---`);
    console.log(`  Price: $${x.price}`);
    console.log(`  Odometer: ${x.odometer} km`);
    console.log(`  VIN: ${x.vin || 'MISSING'}`);
    console.log(`  Stock #: ${x.stockNumber || 'MISSING'}`);
    console.log(`  Ext Color: ${x.exteriorColor || 'MISSING'}`);
    console.log(`  Int Color: ${x.interiorColor || 'MISSING'}`);
    console.log(`  Engine: ${(x as any).engine || 'MISSING'}`);
    console.log(`  Transmission: ${x.transmission || 'MISSING'}`);
    console.log(`  Drivetrain: ${x.drivetrain || 'MISSING'}`);
    console.log(`  Fuel Type: ${x.fuelType || 'MISSING'}`);
    console.log(`  Body Type: ${x.type || 'MISSING'}`);
    console.log(`  Carfax URL: ${x.carfaxUrl || 'MISSING'}`);
    console.log(`  Carfax Badges: ${JSON.stringify(x.carfaxBadges) || 'MISSING'}`);
    console.log(`  Badges: ${JSON.stringify(x.badges)}`);
    console.log(`  Features: ${JSON.stringify((x as any).features?.slice(0, 5)) || 'NONE'}`);
    console.log(`  Images: ${x.images?.length || 0} photos`);
    console.log(`  Description: ${x.description?.substring(0, 100) || 'MISSING'}...`);
    console.log(`  Highlights: ${JSON.stringify((x as any).highlights) || 'NONE'}`);
    console.log('');
  });
  
  // Count totals
  const all = await db.select().from(vehicles).where(eq(vehicles.dealershipId, 1));
  console.log(`Total vehicles for dealership 1: ${all.length}`);
  const withVin = all.filter(v => v.vin && !v.vin.startsWith('PENDING'));
  const withColor = all.filter(v => v.exteriorColor);
  const withCarfax = all.filter(v => v.carfaxUrl);
  const withImages = all.filter(v => v.images && v.images.length > 0);
  console.log(`  With VIN: ${withVin.length}`);
  console.log(`  With Color: ${withColor.length}`);
  console.log(`  With Carfax: ${withCarfax.length}`);
  console.log(`  With Images: ${withImages.length}`);
  
  process.exit(0);
}
main();
