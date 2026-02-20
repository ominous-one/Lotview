import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

async function inspectDOM() {
  let chromiumPath = '';
  try {
    chromiumPath = execSync('which chromium').toString().trim();
  } catch {
    chromiumPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  }
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromiumPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const page = await browser.newPage();
  console.log('Loading page...');
  await page.goto('https://www.olympichyundaivancouver.com/used-2024-rivian-r1s-c19685', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const result = await page.evaluate(() => {
    const bodyText = document.body.textContent || '';
    
    // Check if page has content
    const hasContent = bodyText.length > 100;
    
    // Find all text containing dollar signs
    const dollarMatches = bodyText.match(/\$[\s,0-9]+/g) || [];
    
    // Get page title
    const title = document.title;
    
    // Check for specific field items
    const fieldItems = Array.from(document.querySelectorAll('.field-item')).map(el => ({
      class: el.getAttribute('class'),
      text: el.textContent?.trim().substring(0, 100)
    }));
    
    return {
      hasContent,
      title,
      dollarMatches: dollarMatches.slice(0, 10),
      fieldItemCount: fieldItems.length,
      fieldItems: fieldItems.slice(0, 5)
    };
  });
  
  console.log('Page title:', result.title);
  console.log('Has content:', result.hasContent);
  console.log('\nDollar amounts found:', result.dollarMatches);
  console.log('\nField items found:', result.fieldItemCount);
  result.fieldItems.forEach((item, i) => {
    console.log(`  [${i + 1}] class="${item.class}"`);
    console.log(`      "${item.text}"`);
  });
  
  await browser.close();
}

inspectDOM().catch(console.error);
