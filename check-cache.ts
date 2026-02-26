import { pool } from './server/db';

async function main() {
  try {
    const r = await pool.query('SELECT COUNT(*) FROM vehicle_images');
    console.log('vehicle_images rows:', r.rows[0].count);
    
    const sample = await pool.query('SELECT vehicle_id, image_index, content_type, length(data) as size_bytes, original_url FROM vehicle_images LIMIT 3');
    console.log('Sample:', sample.rows);
    
    // Check if vehicles.images has been updated to local URLs
    const v = await pool.query("SELECT id, year, make, model, substring(images, 1, 200) as img FROM vehicles LIMIT 2");
    for (const row of v.rows) {
      console.log(`Vehicle ${row.id} (${row.year} ${row.make} ${row.model}): ${row.img}`);
    }
  } catch (e: any) {
    console.log('Error:', e.message);
  }
  await pool.end();
}
main();
