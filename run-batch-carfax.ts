import { batchUpdateCarfaxData } from './server/robust-scraper';

async function run() {
  console.log('Starting batch Carfax update for dealership 1...');
  console.log('Using ZenRows with antibot mode for Cloudflare bypass.');
  console.log('This will take several minutes as each vehicle takes ~10-15 seconds to scrape.\n');
  
  const result = await batchUpdateCarfaxData(1);
  
  console.log('\n=== RESULTS ===');
  console.log(`Processed: ${result.processed}`);
  console.log(`Updated: ${result.updated}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Errors: ${result.errors.length}`);
  
  if (result.errors.length > 0) {
    console.log('\nFirst 5 errors:');
    result.errors.slice(0, 5).forEach(e => console.log('  -', e));
  }
  
  process.exit(0);
}

run().catch(e => {
  console.error('Failed:', e);
  process.exit(1);
});
