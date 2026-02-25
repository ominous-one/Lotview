import { db } from "./server/db";
import { vehicles } from "@shared/schema";

function decode(text: string): string {
  if (!text) return text;
  return text
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

async function main() {
  const all = await db.select().from(vehicles);
  let fixed = 0;
  for (const v of all) {
    const updates: any = {};
    if (v.highlights && v.highlights.includes('&#')) {
      updates.highlights = decode(v.highlights);
    }
    if (v.description && v.description.includes('&#')) {
      updates.description = decode(v.description);
    }
    if (v.trim && v.trim.includes('&#')) {
      updates.trim = decode(v.trim);
    }
    if (Object.keys(updates).length > 0) {
      const { eq } = await import("drizzle-orm");
      await db.update(vehicles).set(updates).where(eq(vehicles.id, v.id));
      console.log(`Fixed vehicle ${v.id}: ${v.year} ${v.make} ${v.model} - ${JSON.stringify(updates)}`);
      fixed++;
    }
  }
  console.log(`\nFixed ${fixed} vehicles`);
  process.exit(0);
}
main();
