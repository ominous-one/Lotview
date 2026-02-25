/**
 * Quick test scrape of Olympic Hyundai Vancouver
 * Uses direct HTTP first, falls back to local Puppeteer
 */
import * as cheerio from 'cheerio';

const LISTING_URL = 'https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used';

async function testScrape() {
  console.log('[Test Scrape] Fetching listing page...');
  console.log('[Test Scrape] URL:', LISTING_URL);
  
  try {
    // Try direct HTTP first
    const response = await fetch(LISTING_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    
    console.log(`[Test Scrape] HTTP ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      console.log('[Test Scrape] Direct HTTP failed, site likely Cloudflare-protected');
      console.log('[Test Scrape] Need API key for ZenRows, Zyte, or ScrapingBee');
      process.exit(1);
    }
    
    const html = await response.text();
    console.log(`[Test Scrape] Got ${html.length} bytes of HTML`);
    
    // Check for Cloudflare block
    if (html.includes('attention required') || html.includes('cf-wrapper') || html.includes('checking your browser')) {
      console.log('[Test Scrape] ❌ Cloudflare block detected! Need scraping API key.');
      process.exit(1);
    }
    
    // Parse with Cheerio
    const $ = cheerio.load(html);
    
    // Find vehicle links
    const vehicleLinks: string[] = [];
    $('a[href*="/vehicles/20"]').each((_, el) => {
      const href = $(el).attr('href');
      if (href && !vehicleLinks.includes(href)) {
        vehicleLinks.push(href);
      }
    });
    
    console.log(`\n[Test Scrape] Found ${vehicleLinks.length} vehicle URLs`);
    
    if (vehicleLinks.length === 0) {
      // Try alternate selectors
      console.log('[Test Scrape] Trying alternate selectors...');
      $('a').each((_, el) => {
        const href = $(el).attr('href') || '';
        if (href.includes('/vehicles/') && href.match(/\/20[0-9]{2}/)) {
          if (!vehicleLinks.includes(href)) vehicleLinks.push(href);
        }
      });
      console.log(`[Test Scrape] Alternate: Found ${vehicleLinks.length} vehicle URLs`);
    }
    
    // Check for items count
    const itemsMatch = html.match(/(\d+)\s*Items?\s*Matching/i);
    if (itemsMatch) {
      console.log(`[Test Scrape] Page says: ${itemsMatch[1]} Items Matching`);
    }
    
    // Show first 10 URLs
    console.log('\n[Test Scrape] Vehicle URLs (first 10):');
    vehicleLinks.slice(0, 10).forEach((url, i) => {
      console.log(`  ${i + 1}. ${url}`);
    });
    
    if (vehicleLinks.length > 0) {
      // Try scraping first VDP
      console.log(`\n[Test Scrape] Scraping first VDP...`);
      const vdpUrl = vehicleLinks[0].startsWith('http') 
        ? vehicleLinks[0] 
        : `https://www.olympichyundaivancouver.com${vehicleLinks[0]}`;
      
      const vdpResponse = await fetch(vdpUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      
      if (vdpResponse.ok) {
        const vdpHtml = await vdpResponse.text();
        const v$ = cheerio.load(vdpHtml);
        
        // Extract basic info
        const title = v$('h1').first().text().trim();
        const price = vdpHtml.match(/name="vdp-price"[^>]*value="([^"]+)"/)?.[1] 
          || vdpHtml.match(/data-price="([^"]+)"/)?.[1]
          || vdpHtml.match(/\$\s*([\d,]+)/)?.[1];
        const odometer = vdpHtml.match(/name="vdp-odometer"[^>]*value="([^"]+)"/)?.[1]
          || vdpHtml.match(/([\d,]+)\s*km/i)?.[1];
        const vin = vdpHtml.match(/[A-HJ-NPR-Z0-9]{17}/)?.[0];
        const trim = vdpHtml.match(/name="vdp-trim"[^>]*value="([^"]+)"/)?.[1];
        
        // Count images
        const images: string[] = [];
        v$('img').each((_, el) => {
          const src = v$(el).attr('src') || '';
          if (src.includes('autotradercdn') || src.includes('photomanager')) {
            images.push(src);
          }
        });
        
        console.log(`\n[Test Scrape] First VDP Details:`);
        console.log(`  Title: ${title}`);
        console.log(`  Price: ${price || 'not found'}`);
        console.log(`  Odometer: ${odometer || 'not found'} km`);
        console.log(`  VIN: ${vin || 'not found'}`);
        console.log(`  Trim: ${trim || 'not found'}`);
        console.log(`  Images: ${images.length} found`);
      }
    }
    
    console.log('\n✅ Test scrape complete!');
    
  } catch (error: any) {
    console.error('[Test Scrape] Error:', error.message);
  }
  
  process.exit(0);
}

testScrape();
