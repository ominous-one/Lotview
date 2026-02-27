import { Client } from 'pg';
import bcrypt from 'bcryptjs';

const c = new Client('postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require');

async function main() {
  await c.connect();
  const hash = await bcrypt.hash('Olympic2024!', 12);
  await c.query(`UPDATE users SET password_hash=$1 WHERE id=1`, [hash]);
  console.log('Password reset for user 1');
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
