import { BrowserlessUnifiedService } from './browserless-unified';
import * as cheerio from 'cheerio';

const browserlessService = new BrowserlessUnifiedService();

async function checkCarfax() {
  const url = 'https://www.olympichyundaivancouver.com/vehicles/2023/toyota/rav4/vancouver/bc/69117759/?sale_class=used';
  const result = await browserlessService.zenRowsScrape(url);
  if (!result.success || !result.html) return;
  
  const $ = cheerio.load(result.html);
  const html = result.html.toLowerCase();
  
  // Search for accident-related text
  const accidentPatterns = ['accident', 'owner', 'carfax', 'history'];
  for (const pattern of accidentPatterns) {
    const idx = html.indexOf(pattern);
    if (idx > -1) {
      // Show context around the match
      const start = Math.max(0, idx - 50);
      const end = Math.min(html.length, idx + 100);
      console.log(`Found "${pattern}" at ${idx}:`);
      console.log(`  Context: ...${html.substring(start, end)}...`);
    }
  }
}

checkCarfax().catch(console.error);
