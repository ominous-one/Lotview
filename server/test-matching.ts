import { scrapeAllDealerListings } from './dealer-listing-scraper';
import { scrapeAllCarGurusDealers } from './cargurus-scraper';
import { matchCarGurusToDealer } from './vehicle-matcher';

async function testMatching() {
  console.log('\n==========================================');
  console.log('TESTING DEALER VDP MATCHING SYSTEM');
  console.log('==========================================\n');
  
  try {
    // Step 1: Scrape dealer listings
    console.log('\n=== STEP 1: SCRAPING DEALER LISTINGS ===\n');
    const dealerListings = await scrapeAllDealerListings();
    
    if (dealerListings.length === 0) {
      console.error('❌ No dealer listings scraped!');
      return;
    }
    
    console.log(`\n✅ Scraped ${dealerListings.length} dealer listings`);
    console.log('\nSample dealer listing:');
    console.log(dealerListings[0]);
    
    // Step 2: Scrape CarGurus (limit to 3 vehicles for testing)
    console.log('\n\n=== STEP 2: SCRAPING CARGURUS (TEST MODE - 3 VEHICLES) ===\n');
    
    // We can't easily limit CarGurus, so we'll just match after getting all
    const cgVehicles = await scrapeAllCarGurusDealers();
    
    if (cgVehicles.length === 0) {
      console.error('❌ No CarGurus vehicles scraped!');
      return;
    }
    
    console.log(`\n✅ Scraped ${cgVehicles.length} CarGurus vehicles`);
    
    // Step 3: Test matching on first 5 vehicles
    console.log('\n\n=== STEP 3: TESTING MATCHING (FIRST 5 VEHICLES) ===\n');
    
    const testVehicles = cgVehicles.slice(0, 5);
    
    for (const vehicle of testVehicles) {
      console.log(`\n--- Testing: ${vehicle.year} ${vehicle.make} ${vehicle.model} ---`);
      console.log(`  VIN: ${vehicle.vin || 'N/A'}`);
      console.log(`  Price: $${vehicle.price}`);
      console.log(`  Odometer: ${vehicle.odometer} km`);
      
      const matchResult = matchCarGurusToDealer(vehicle, dealerListings);
      
      if (matchResult.matched) {
        console.log(`  ✅ MATCHED!`);
        console.log(`    Match Type: ${matchResult.matchType}`);
        console.log(`    Confidence: ${matchResult.confidence}`);
        console.log(`    VDP URL: ${matchResult.dealerVdpUrl}`);
        console.log(`    Details: ${matchResult.details}`);
      } else {
        console.log(`  ❌ NO MATCH`);
        console.log(`    Reason: ${matchResult.details}`);
      }
    }
    
    // Summary
    const matchedCount = testVehicles.filter(v => {
      const match = matchCarGurusToDealer(v, dealerListings);
      return match.matched;
    }).length;
    
    console.log('\n\n==========================================');
    console.log('TEST SUMMARY');
    console.log('==========================================');
    console.log(`Dealer Listings: ${dealerListings.length}`);
    console.log(`CarGurus Vehicles: ${cgVehicles.length}`);
    console.log(`Test Sample: ${testVehicles.length} vehicles`);
    console.log(`Matched: ${matchedCount}/${testVehicles.length} (${Math.round(matchedCount / testVehicles.length * 100)}%)`);
    console.log('==========================================\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    throw error;
  }
}

// Run test
testMatching().then(() => {
  console.log('\n✅ Test complete!');
  process.exit(0);
}).catch((error) => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});
