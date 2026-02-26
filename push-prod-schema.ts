import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require',
});

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vehicle_images (
      id SERIAL PRIMARY KEY,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      dealership_id INTEGER NOT NULL REFERENCES dealerships(id) ON DELETE CASCADE,
      image_index INTEGER NOT NULL,
      data BYTEA NOT NULL,
      content_type TEXT DEFAULT 'image/jpeg',
      original_url TEXT,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      UNIQUE(vehicle_id, image_index)
    )
  `);
  console.log('vehicle_images table created on production');
  
  // Verify
  const r = await pool.query("SELECT COUNT(*) FROM vehicle_images");
  console.log('Rows:', r.rows[0].count);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
