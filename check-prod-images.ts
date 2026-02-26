import { neon } from '@neondatabase/serverless';
const sql = neon('postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require');
(async () => {
  const r = await sql('SELECT vehicle_id, COUNT(*) as cnt FROM vehicle_images WHERE vehicle_id = 33 GROUP BY vehicle_id');
  console.log('Vehicle 33 images:', r);
  const v = await sql('SELECT id, title FROM vehicles WHERE id = 33');
  console.log('Vehicle 33:', v);
})();
