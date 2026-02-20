import { BrowserlessUnifiedService } from './server/browserless-unified';
import { storage } from './server/storage';

async function main() {
  console.log('Starting Olympic Hyundai Vancouver inventory scrape using ZenRows...');
  
  const service = new BrowserlessUnifiedService();
  const url = 'https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used';
  
  console.log('Scraping:', url);
  console.log('Using ZenRows with scrollToBottom for lazy-loaded content...\n');
  
  try {
    const result = await service.zenRowsScrape(url, {
      jsRender: true,
      premiumProxy: true,
      waitMs: 5000,
      proxyCountry: 'ca',
      scrollToBottom: true
    });
    
    if (!result.success) {
      console.error('ZenRows scrape failed:', result.error);
      process.exit(1);
    }
    
    console.log('HTML received, length:', result.html?.length || 0);
    
    // Parse the HTML to find vehicles
    const html = result.html || '';
    const vehicleMatches = html.match(/class="[^"]*vehicle-card[^"]*"/g);
    console.log('Vehicle cards found:', vehicleMatches?.length || 0);
    
    // Extract VDP URLs
    const vdpUrls = [...html.matchAll(/href="(\/vehicles\/[^"]+)"/g)]
      .map(m => m[1])
      .filter((url, index, self) => self.indexOf(url) === index);
    
    console.log('VDP URLs found:', vdpUrls.length);
    if (vdpUrls.length > 0) {
      console.log('\nSample VDPs:');
      vdpUrls.slice(0, 5).forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
    }
    
    console.log('\nScrape completed successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
