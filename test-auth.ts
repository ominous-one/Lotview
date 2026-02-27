import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const c = new Client('postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require');

async function main() {
  await c.connect();
  
  // Get user columns
  const cols = await c.query(`SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position`);
  console.log('User columns:', cols.rows.map((x: any) => x.column_name).join(', '));
  
  // Get password hash
  const user = await c.query(`SELECT * FROM users WHERE id=1`);
  const row = user.rows[0];
  console.log('User keys:', Object.keys(row).join(', '));
  
  // Find password field
  const pwField = Object.keys(row).find(k => k.toLowerCase().includes('pass'));
  if (pwField) {
    console.log('Password field:', pwField);
    const match = await bcrypt.compare('Olympic2024!', row[pwField]);
    console.log('Password match:', match);
  }
  
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
