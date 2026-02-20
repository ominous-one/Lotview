import { BrowserlessUnifiedService } from './server/browserless-unified';

async function main() {
  console.log('Starting Olympic Hyundai Vancouver inventory scrape using ScrapingBee...');
  
  const service = new BrowserlessUnifiedService();
  const url = 'https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used';
  
  console.log('Scraping:', url);
  console.log('Using ScrapingBee with scroll support for lazy-loaded content...\n');
  
  try {
    const result = await service.scrapingBeeScrape(url, {
      jsRender: true,
      premiumProxy: true,
      countryCode: 'ca',
      scrollToBottom: true
    });
    
    if (!result.success) {
      console.error('ScrapingBee scrape failed:', result.error);
      process.exit(1);
    }
    
    console.log('HTML received, length:', result.html?.length || 0);
    
    // Parse the HTML to find vehicles
    const html = result.html || '';
    
    // Extract VDP URLs
    const vdpUrls = [...html.matchAll(/href="(\/vehicles\/[^"]+)"/g)]
      .map(m => m[1])
      .filter((url, index, self) => self.indexOf(url) === index)
      .filter(url => url.includes('/vehicles/') && !url.includes('?'));
    
    console.log('VDP URLs found:', vdpUrls.length);
    if (vdpUrls.length > 0) {
      console.log('\nSample VDPs:');
      vdpUrls.slice(0, 10).forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
    }
    
    console.log('\nScrape completed successfully!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
