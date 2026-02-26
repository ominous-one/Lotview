/**
 * Fetch fresh image URLs from a single VDP using ZenRows with full JS rendering
 */
const ZENROWS_API_KEY = '21d69e232a816cc1ba00d492273289141fbc1d8f';
const url = 'https://www.olympichyundaivancouver.com/vehicles/2025/hyundai/kona/vancouver/bc/65993963/?sale_class=used';

async function main() {
  const params = new URLSearchParams({
    url,
    apikey: ZENROWS_API_KEY,
    js_render: 'true',
    premium_proxy: 'true',
    proxy_country: 'ca',
    wait: '5000',
    // Try waiting for images to load
    wait_for: '.photo-gallery img, .gallery img, [data-src*="autotradercdn"], img[src*="autotradercdn"]',
  });
  
  console.log('Fetching VDP via ZenRows...');
  const resp = await fetch(`https://api.zenrows.com/v1/?${params}`, {
    signal: AbortSignal.timeout(45000),
  });
  
  console.log(`Status: ${resp.status}`);
  const html = await resp.text();
  console.log(`HTML length: ${html.length}`);
  
  // Find ALL image-related URLs
  const allUrls = new Set<string>();
  
  // Check for autotradercdn
  const autotraderMatches = html.match(/https?:\/\/[^"'\s>]+autotradercdn[^"'\s>]+/g) || [];
  console.log(`\nautotradercdn URLs: ${autotraderMatches.length}`);
  autotraderMatches.slice(0, 3).forEach(u => console.log('  ', u.substring(0, 120)));
  
  // Check for photomanager
  const photoMatches = html.match(/https?:\/\/[^"'\s>]+photomanager[^"'\s>]+/g) || [];
  console.log(`photomanager URLs: ${photoMatches.length}`);
  photoMatches.slice(0, 3).forEach(u => console.log('  ', u.substring(0, 120)));
  
  // Check data-src attributes
  const dataSrcMatches = html.match(/data-src="([^"]+)"/g) || [];
  console.log(`data-src attributes: ${dataSrcMatches.length}`);
  dataSrcMatches.slice(0, 3).forEach(u => console.log('  ', u.substring(0, 120)));
  
  // Check for any img tags
  const imgTags = html.match(/<img[^>]+>/g) || [];
  console.log(`\nTotal <img> tags: ${imgTags.length}`);
  imgTags.slice(0, 5).forEach(t => console.log('  ', t.substring(0, 150)));
  
  // Check for JSON-LD or embedded data
  const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (jsonLdMatch) {
    try {
      const data = JSON.parse(jsonLdMatch[1]);
      console.log('\nJSON-LD found:', JSON.stringify(data).substring(0, 300));
    } catch {}
  }
  
  // Check for Alpine.js x-data with image arrays
  const alpineMatches = html.match(/x-data="[^"]*image[^"]*"/gi) || [];
  console.log(`\nAlpine.js image data: ${alpineMatches.length}`);
  
  // Look for any CDN pattern
  const cdnPatterns = html.match(/https?:\/\/[^"'\s>]+\.(jpg|jpeg|png|webp)[^"'\s>]*/gi) || [];
  const uniqueCdns = [...new Set(cdnPatterns)];
  console.log(`\nAll image URLs: ${uniqueCdns.length}`);
  uniqueCdns.slice(0, 10).forEach(u => console.log('  ', u.substring(0, 120)));
}

main().catch(console.error);
