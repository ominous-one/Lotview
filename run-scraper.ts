import { scrapeAllDealerListings } from './server/dealer-listing-scraper';

async function main() {
  console.log('Starting Olympic Hyundai Vancouver inventory scrape...');
  console.log('Using ZenRows for Cloudflare bypass');
  console.log('');
  
  try {
    const vehicles = await scrapeAllDealerListings(1);
    console.log('');
    console.log(`Scrape completed! Found ${vehicles.length} vehicles.`);
    
    if (vehicles.length > 0) {
      console.log('\nSample vehicles:');
      vehicles.slice(0, 5).forEach((v, i) => {
        console.log(`  ${i + 1}. ${v.year} ${v.make} ${v.model} - $${v.price?.toLocaleString() || 'N/A'}`);
      });
    }
  } catch (error) {
    console.error('Scrape failed:', error);
    process.exit(1);
  }
}

main();
