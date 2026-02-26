import { pool } from './server/db';

async function main() {
  const sample = await pool.query(`SELECT id, year, make, model, images FROM vehicles LIMIT 1`);
  const row = sample.rows[0];
  console.log('ID:', row.id, 'Vehicle:', row.year, row.make, row.model);
  const imgs = typeof row.images === 'string' ? JSON.parse(row.images) : row.images;
  console.log('images count:', imgs.length);
  console.log('First 3:', imgs.slice(0, 3));
  await pool.end();
}
main();
