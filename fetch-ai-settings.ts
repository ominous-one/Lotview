import { Client } from 'pg';

const c = new Client('postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require');

async function main() {
  await c.connect();
  const res = await c.query('SELECT * FROM ai_settings WHERE dealership_id = 1');
  if (res.rows.length === 0) {
    console.log('No ai_settings found for dealership 1');
  } else {
    const row = res.rows[0];
    for (const [key, value] of Object.entries(row)) {
      console.log(`\n=== ${key} ===`);
      if (typeof value === 'object' && value !== null) {
        console.log(JSON.stringify(value, null, 2));
      } else {
        console.log(value);
      }
    }
  }
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
