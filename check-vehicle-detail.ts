import { pool } from './server/db';
async function main() {
  // Check a vehicle that was just posted - the Ioniq 5 (EV shown in screenshot)
  const r = await pool.query(`SELECT id, year, make, model, images[1] as first_img, array_length(images,1) as img_count, fb_marketplace_description FROM vehicles WHERE model ILIKE '%ioniq%' OR model ILIKE '%kona electric%' LIMIT 3`);
  for (const v of r.rows) {
    console.log(`[${v.id}] ${v.year} ${v.make} ${v.model}`);
    console.log(`  Images: ${v.img_count}, first: ${v.first_img}`);
    console.log(`  Description (first 600):\n${v.fb_marketplace_description?.substring(0,600)}`);
    console.log();
  }
  await pool.end();
}
main();
