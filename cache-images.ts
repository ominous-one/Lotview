/**
 * Download and cache vehicle images from dealer VDP pages via ZenRows
 * Extracts fresh image URLs and stores binary data in vehicle_images table
 */
import { pool } from './server/db';
import { db } from './server/db';
import { vehicles, vehicleImages } from './shared/schema';
import { eq } from 'drizzle-orm';
import * as cheerio from 'cheerio';

const ZENROWS_API_KEY = process.env.ZENROWS_API_KEY || '21d69e232a816cc1ba00d492273289141fbc1d8f';
const DEALERSHIP_ID = 1;
const MAX_IMAGES = 20;

async function fetchVdpHtml(url: string): Promise<string> {
  const params = new URLSearchParams({
    url,
    apikey: ZENROWS_API_KEY,
    js_render: 'true',
    premium_proxy: 'true',
    proxy_country: 'ca',
    wait: '3000',
  });
  
  const resp = await fetch(`https://api.zenrows.com/v1/?${params}`, {
    signal: AbortSignal.timeout(45000),
  });
  
  if (!resp.ok) throw new Error(`ZenRows ${resp.status}`);
  return resp.text();
}

function extractImageUrls(html: string): string[] {
  const $ = cheerio.load(html);
  const urls: string[] = [];
  const seen = new Set<string>();
  
  // Get all img src and data-src containing autotradercdn
  $('img').each((_, el) => {
    for (const attr of ['src', 'data-src']) {
      const val = $(el).attr(attr) || '';
      if (val.includes('autotradercdn.ca/photos') && !seen.has(val)) {
        // Use base URL without query params (the sized version like -1024x786)
        const baseUrl = val.split('?')[0];
        // Prefer the larger size - replace -133x100 with -1024x786
        const largeUrl = baseUrl.replace(/-\d+x\d+$/, '-1024x786');
        if (!seen.has(largeUrl)) {
          seen.add(largeUrl);
          urls.push(largeUrl);
        }
      }
    }
  });
  
  // Also check data-src for lazy-loaded gallery images
  $('[data-src]').each((_, el) => {
    const val = $(el).attr('data-src') || '';
    if (val.includes('autotradercdn.ca/photos') && !seen.has(val)) {
      const baseUrl = val.split('?')[0];
      const largeUrl = baseUrl.replace(/-\d+x\d+$/, '-1024x786');
      if (!seen.has(largeUrl)) {
        seen.add(largeUrl);
        urls.push(largeUrl);
      }
    }
  });
  
  return urls;
}

async function downloadImage(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/*,*/*',
        'Referer': 'https://www.olympichyundaivancouver.com/',
      },
      signal: AbortSignal.timeout(15000),
    });
    
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const buffer = Buffer.from(await resp.arrayBuffer());
    if (buffer.length < 1024) return null;
    return { data: buffer, contentType };
  } catch {
    return null;
  }
}

async function main() {
  const result = await pool.query(
    `SELECT id, year, make, model, dealer_vdp_url FROM vehicles WHERE dealership_id = $1 ORDER BY id`,
    [DEALERSHIP_ID]
  );
  
  console.log(`Found ${result.rows.length} vehicles\n`);
  let totalCached = 0;
  let totalBytes = 0;
  
  for (const vehicle of result.rows) {
    const { id, year, make, model, dealer_vdp_url } = vehicle;
    
    // Check if already cached
    const existing = await pool.query('SELECT COUNT(*) FROM vehicle_images WHERE vehicle_id = $1', [id]);
    if (parseInt(existing.rows[0].count) > 0) {
      console.log(`[${id}] ${year} ${make} ${model}: Already cached, skipping`);
      continue;
    }
    
    if (!dealer_vdp_url) {
      console.log(`[${id}] ${year} ${make} ${model}: No VDP URL, skipping`);
      continue;
    }
    
    console.log(`[${id}] ${year} ${make} ${model}:`);
    
    // Fetch VDP and extract fresh image URLs
    let imageUrls: string[] = [];
    try {
      console.log(`  Fetching VDP...`);
      const html = await fetchVdpHtml(dealer_vdp_url);
      imageUrls = extractImageUrls(html);
      console.log(`  Found ${imageUrls.length} images`);
    } catch (e: any) {
      console.log(`  VDP fetch failed: ${e.message}, skipping`);
      continue;
    }
    
    if (imageUrls.length === 0) {
      console.log(`  No images found, skipping`);
      continue;
    }
    
    // Download and cache (max 20)
    const toCache = imageUrls.slice(0, MAX_IMAGES);
    let cached = 0;
    const localUrls: string[] = [];
    
    for (let i = 0; i < toCache.length; i++) {
      const img = await downloadImage(toCache[i]);
      if (img) {
        await db.insert(vehicleImages).values({
          vehicleId: id,
          dealershipId: DEALERSHIP_ID,
          imageIndex: cached,
          data: img.data,
          contentType: img.contentType,
          originalUrl: toCache[i],
        });
        localUrls.push(`/api/public/vehicle-image/${id}/${cached}`);
        cached++;
        totalBytes += img.data.length;
        process.stdout.write('.');
      } else {
        process.stdout.write('x');
      }
    }
    console.log();
    
    if (localUrls.length > 0) {
      await db.update(vehicles)
        .set({ images: localUrls })
        .where(eq(vehicles.id, id));
      console.log(`  Cached ${cached}/${toCache.length} images\n`);
      totalCached += cached;
    }
    
    // Rate limit ZenRows (1 req per 2s)
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\nDone! ${totalCached} images cached, ${Math.round(totalBytes / 1024 / 1024)}MB total`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
