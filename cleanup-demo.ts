import { db } from "./server/db";
import { vehicles } from "@shared/schema";
import { eq, and, isNull, or, like } from "drizzle-orm";

async function main() {
  // Delete demo vehicles (ones with unsplash images or no VIN)
  const all = await db.select().from(vehicles).where(eq(vehicles.dealershipId, 1));
  const demo = all.filter(v => 
    !v.vin || 
    v.vin.startsWith('PENDING') || 
    (v.images && v.images.some(img => img.includes('unsplash.com')))
  );
  
  console.log(`Total vehicles: ${all.length}`);
  console.log(`Demo/fake vehicles to delete: ${demo.length}`);
  
  for (const v of demo) {
    console.log(`  Deleting: ${v.year} ${v.make} ${v.model} (ID: ${v.id}, VIN: ${v.vin || 'none'})`);
    await db.delete(vehicles).where(eq(vehicles.id, v.id));
  }
  
  const remaining = await db.select().from(vehicles).where(eq(vehicles.dealershipId, 1));
  console.log(`\n✅ Remaining real vehicles: ${remaining.length}`);
  process.exit(0);
}
main();
