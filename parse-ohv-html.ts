import { BrowserlessUnifiedService } from './server/browserless-unified';

async function main() {
  console.log('Fetching Olympic Hyundai Vancouver inventory with BrowserQL...\n');
  
  const service = new BrowserlessUnifiedService();
  const url = 'https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used';
  
  const result = await service.browserQLScrape(url, {
    waitForSelector: '.vehicle-card',
    solveCaptcha: true
  });
  
  if (!result.success) {
    console.error('Scrape failed:', result.error);
    process.exit(1);
  }
  
  const html = result.html || '';
  console.log('HTML length:', html.length);
  
  // Find all links that look like vehicle detail pages
  const allLinks = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  const vehicleLinks = allLinks.filter(url => 
    url.includes('/vehicles/') && 
    (url.includes('/used/') || url.includes('/new/')) &&
    url.match(/\/\d+\/$/) // ends with /ID/
  );
  
  const uniqueVehicleLinks = [...new Set(vehicleLinks)];
  console.log('\nVehicle detail page URLs found:', uniqueVehicleLinks.length);
  
  if (uniqueVehicleLinks.length > 0) {
    console.log('\nVehicle URLs:');
    uniqueVehicleLinks.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
  } else {
    // Try alternative patterns
    console.log('\nLooking for alternative URL patterns...');
    const altLinks = allLinks.filter(url => 
      url.includes('/vehicle/') || 
      (url.includes('vehicles') && url.match(/\d{4,}/))
    );
    const uniqueAlt = [...new Set(altLinks)];
    console.log('Alternative patterns found:', uniqueAlt.length);
    uniqueAlt.slice(0, 20).forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
    
    // Show sample of all links to debug
    console.log('\n\nAll unique link patterns (sample):');
    const patterns = [...new Set(allLinks.map(url => {
      try {
        const u = new URL(url, 'https://olympichyundaivancouver.com');
        return u.pathname.split('/').slice(0, 3).join('/');
      } catch {
        return url.substring(0, 50);
      }
    }))];
    patterns.slice(0, 30).forEach(p => console.log(`  ${p}`));
  }
}

main();
