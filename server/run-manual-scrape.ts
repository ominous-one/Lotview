import { runRobustScrape } from './robust-scraper';
import { logInfo, logError } from './error-utils';

async function main() {
  console.log('[Manual Scrape] Starting robust scrape for dealership 1...');
  
  try {
    const result = await runRobustScrape('manual', 1);
    
    console.log('[Manual Scrape] Result:', {
      success: result.success,
      method: result.method,
      vehiclesFound: result.vehiclesFound,
      vehiclesInserted: result.vehiclesInserted,
      vehiclesUpdated: result.vehiclesUpdated,
      vehiclesDeleted: result.vehiclesDeleted,
      vehiclesRejected: result.vehiclesRejected,
      retryCount: result.retryCount,
      error: result.error || 'none'
    });
    
    if (result.success) {
      console.log(`[Manual Scrape] SUCCESS: Found ${result.vehiclesFound} vehicles, inserted ${result.vehiclesInserted}, updated ${result.vehiclesUpdated}`);
    } else {
      console.error(`[Manual Scrape] FAILED: ${result.error}`);
    }
    
  } catch (error) {
    console.error('[Manual Scrape] Error:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

main();
