/**
 * Cache images on PRODUCTION database
 * Same logic as cache-images.ts but targeting production DB
 */
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { vehicles, vehicleImages } from './shared/schema';
import * as cheerio from 'cheerio';

const { Pool } = pg;
const PROD_DB = 'postgresql://lotview:5KdItEyPBMM2jdiwXPkMrXSsFld9kEha@dpg-d6etlto8tnhs73emduk0-a.oregon-postgres.render.com/lotview?sslmode=require';
const ZENROWS_API_KEY = '21d69e232a816cc1ba00d492273289141fbc1d8f';
const DEALERSHIP_ID = 1;
const MAX_IMAGES = 20;

const pool = new Pool({ connectionString: PROD_DB });
const db = drizzle(pool);

async function fetchVdpHtml(url: string): Promise<string> {
  const params = new URLSearchParams({
    url, apikey: ZENROWS_API_KEY, js_render: 'true',
    premium_proxy: 'true', proxy_country: 'ca', wait: '3000',
  });
  const resp = await fetch(`https://api.zenrows.com/v1/?${params}`, { signal: AbortSignal.timeout(45000) });
  if (!resp.ok) throw new Error(`ZenRows ${resp.status}`);
  return resp.text();
}

function extractImageUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const urls: string[] = [];
  $('img, [data-src]').each((_, el) => {
    for (const attr of ['src', 'data-src']) {
      const val = $(el).attr(attr) || '';
      if (val.includes('autotradercdn.ca/photos')) {
        const largeUrl = val.split('?')[0].replace(/-\d+x\d+$/, '-1024x786');
        if (!seen.has(largeUrl)) { seen.add(largeUrl); urls.push(largeUrl); }
      }
    }
  });
  return urls;
}

async function main() {
  const result = await pool.query(
    `SELECT id, year, make, model, dealer_vdp_url FROM vehicles WHERE dealership_id = $1 ORDER BY id`, [DEALERSHIP_ID]
  );
  console.log(`Production: ${result.rows.length} vehicles\n`);
  let totalCached = 0;

  for (const v of result.rows) {
    const existing = await pool.query('SELECT COUNT(*) FROM vehicle_images WHERE vehicle_id = $1', [v.id]);
    if (parseInt(existing.rows[0].count) > 0) {
      console.log(`[${v.id}] ${v.year} ${v.make} ${v.model}: Already cached`);
      continue;
    }
    if (!v.dealer_vdp_url) { console.log(`[${v.id}] No VDP URL`); continue; }

    console.log(`[${v.id}] ${v.year} ${v.make} ${v.model}:`);
    let imageUrls: string[] = [];
    try {
      console.log(`  Fetching VDP...`);
      imageUrls = extractImageUrls(await fetchVdpHtml(v.dealer_vdp_url));
      console.log(`  Found ${imageUrls.length} images`);
    } catch (e: any) { console.log(`  Failed: ${e.message}`); continue; }

    if (imageUrls.length === 0) { console.log(`  No images`); continue; }

    const toCache = imageUrls.slice(0, MAX_IMAGES);
    let cached = 0;
    const localUrls: string[] = [];

    for (let i = 0; i < toCache.length; i++) {
      try {
        const resp = await fetch(toCache[i], {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.olympichyundaivancouver.com/' },
          signal: AbortSignal.timeout(15000),
        });
        if (!resp.ok) { process.stdout.write('x'); continue; }
        const ct = resp.headers.get('content-type') || 'image/jpeg';
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length < 1024) { process.stdout.write('x'); continue; }

        await db.insert(vehicleImages).values({
          vehicleId: v.id, dealershipId: DEALERSHIP_ID, imageIndex: cached,
          data: buf, contentType: ct, originalUrl: toCache[i],
        });
        localUrls.push(`/api/public/vehicle-image/${v.id}/${cached}`);
        cached++;
        process.stdout.write('.');
      } catch { process.stdout.write('x'); }
    }
    console.log();

    if (localUrls.length > 0) {
      await db.update(vehicles).set({ images: localUrls }).where(eq(vehicles.id, v.id));
      console.log(`  Cached ${cached}/${toCache.length}\n`);
      totalCached += cached;
    }
    await new Promise(r => setTimeout(r, 2000));
  }

  const stats = await pool.query('SELECT COUNT(*) as c, COALESCE(SUM(length(data)),0) as b FROM vehicle_images');
  console.log(`\nDone! ${stats.rows[0].c} images, ${Math.round(stats.rows[0].b / 1024 / 1024)}MB`);
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
