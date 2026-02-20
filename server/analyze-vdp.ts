import { BrowserlessUnifiedService } from './browserless-unified';
import * as cheerio from 'cheerio';

const browserlessService = new BrowserlessUnifiedService();

async function analyzeVDP() {
  const url = 'https://www.olympichyundaivancouver.com/vehicles/2023/toyota/rav4/vancouver/bc/69117759/?sale_class=used';
  console.log('Fetching:', url);
  
  const result = await browserlessService.zenRowsScrape(url);
  if (!result.success || !result.html) {
    console.log('Failed:', result.error);
    return;
  }
  
  const $ = cheerio.load(result.html);
  
  // Look for Overview section
  console.log('\n=== OVERVIEW SECTION ===');
  $('h2, h3, h4').each((i, el) => {
    const text = $(el).text().trim();
    if (text.toLowerCase().includes('overview')) {
      console.log('Found heading:', text);
      // Get parent section and its text
      const parent = $(el).parent();
      console.log('Parent content:', parent.text().trim().substring(0, 800));
    }
  });
  
  // Look for description in common places
  console.log('\n=== DESCRIPTION CONTENT ===');
  $('[class*="description"], [class*="overview"], [class*="details"]').each((i, el) => {
    const text = $(el).text().trim();
    if (text.length > 100 && text.length < 2000) {
      console.log('Class:', $(el).attr('class'));
      console.log('Content:', text.substring(0, 400));
      console.log('---');
    }
  });
  
  // Look for Carfax
  console.log('\n=== CARFAX SECTION ===');
  $('img[src*="carfax"], img[alt*="carfax"], img[alt*="Carfax"], a[href*="carfax"], [class*="carfax"]').each((i, el) => {
    console.log('Tag:', el.name);
    console.log('Src:', $(el).attr('src'));
    console.log('Alt:', $(el).attr('alt'));
    console.log('Href:', $(el).attr('href'));
    console.log('---');
  });
  
  // Look for "accidents" or "owner" text
  console.log('\n=== ACCIDENT/OWNER TEXT ===');
  const html = result.html.toLowerCase();
  if (html.includes('no reported accidents')) console.log('Found: No Reported Accidents');
  if (html.includes('one owner')) console.log('Found: One Owner');
  if (html.includes('accident')) console.log('Contains word: accident');
  
  // Look for Tech Specs
  console.log('\n=== TECH SPECS SECTION ===');
  $('h2, h3, h4, h5').each((i, el) => {
    const text = $(el).text().trim().toLowerCase();
    if (text.includes('tech') || text.includes('spec') || text === 'mechanical' || text === 'interior' || text === 'exterior' || text === 'entertainment') {
      console.log('Found heading:', $(el).text().trim());
    }
  });
  
  // Look for feature/option lists
  console.log('\n=== FEATURE LISTS ===');
  $('[class*="feature"], [class*="option"], [class*="equipment"], .accordion, [class*="specs"]').each((i, el) => {
    const className = $(el).attr('class') || '';
    const text = $(el).text().trim();
    if (text.length > 50 && text.length < 2000) {
      console.log('Class:', className);
      console.log('Preview:', text.substring(0, 300));
      console.log('---');
    }
  });
}

analyzeVDP().catch(console.error);
