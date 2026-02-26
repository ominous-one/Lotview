import { pool } from './server/db';
async function main() {
  // Stats
  const stats = await pool.query('SELECT COUNT(*) as total, SUM(length(data)) as bytes FROM vehicle_images');
  console.log(`Total cached images: ${stats.rows[0].total}`);
  console.log(`Total size: ${Math.round(stats.rows[0].bytes / 1024 / 1024)}MB`);
  
  // Per vehicle
  const perVehicle = await pool.query(`
    SELECT vi.vehicle_id, v.year, v.make, v.model, COUNT(*) as img_count 
    FROM vehicle_images vi JOIN vehicles v ON v.id = vi.vehicle_id 
    GROUP BY vi.vehicle_id, v.year, v.make, v.model ORDER BY vi.vehicle_id
  `);
  console.log(`\nVehicles with cached images: ${perVehicle.rows.length}`);
  for (const r of perVehicle.rows) {
    console.log(`  [${r.vehicle_id}] ${r.year} ${r.make} ${r.model}: ${r.img_count} images`);
  }
  
  // Check vehicles.images column format
  const sample = await pool.query(`SELECT id, year, make, model, images[1] as first_img FROM vehicles WHERE dealership_id=1 LIMIT 3`);
  console.log('\nSample vehicle image URLs (from vehicles.images column):');
  for (const r of sample.rows) {
    console.log(`  [${r.id}] ${r.year} ${r.make} ${r.model}: ${r.first_img}`);
  }
  
  // Vehicles WITHOUT cached images
  const missing = await pool.query(`
    SELECT v.id, v.year, v.make, v.model FROM vehicles v 
    WHERE v.dealership_id=1 AND NOT EXISTS (SELECT 1 FROM vehicle_images vi WHERE vi.vehicle_id = v.id)
  `);
  console.log(`\nVehicles WITHOUT cached images: ${missing.rows.length}`);
  for (const r of missing.rows) {
    console.log(`  [${r.id}] ${r.year} ${r.make} ${r.model}`);
  }
  
  await pool.end();
}
main();
