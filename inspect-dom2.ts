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
  await page.goto('https://www.olympichyundaivancouver.com/used-2024-rivian-r1s-c19685', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const result = await page.evaluate(() => {
    // Search for elements with price-related attributes or classes
    const candidates = [];
    
    // Try common price selectors
    const selectors = [
      '[data-field="price"]',
      '[data-price]',
      '.price',
      '.vehicle-price',
      '.field-item.price',
      '[itemprop="price"]',
      '.selling-price',
      '.dealer-price',
      '*[class*="price"]',
      '*[id*="price"]'
    ];
    
    for (const selector of selectors) {
      const els = document.querySelectorAll(selector);
      if (els.length > 0) {
        candidates.push({
          selector: selector,
          count: els.length,
          samples: Array.from(els).slice(0, 3).map(el => ({
            text: el.textContent?.trim().substring(0, 100),
            class: el.getAttribute('class') || '',
            id: el.getAttribute('id') || ''
          }))
        });
      }
    }
    
    return candidates;
  });
  
  console.log('Price selector candidates:');
  result.forEach(item => {
    console.log(`\n${item.selector} (${item.count} elements)`);
    item.samples.forEach((sample, i) => {
      console.log(`  [${i + 1}] "${sample.text}"`);
      console.log(`      class="${sample.class}" id="${sample.id}"`);
    });
  });
  
  await browser.close();
}

inspectDOM().catch(console.error);
