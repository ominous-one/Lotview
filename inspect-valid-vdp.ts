import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

async function inspectVDP() {
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
  const url = 'https://www.olympichyundaivancouver.com/vehicles/2024/rivian/r1s/vancouver/bc/68578448/?sale_class=used';
  
  console.log('Loading VDP:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  const data = await page.evaluate(() => {
    const title = document.title;
    
    // Search for price selectors
    const priceSelectors = [
      '[data-field="price"]',
      '.field-item.price',
      '.vehicle-price',
      '*[class*="price"]:not(script):not(style)',
      '*[id*="price"]:not(script):not(style)'
    ];
    
    const found = [];
    for (const selector of priceSelectors) {
      const els = document.querySelectorAll(selector);
      if (els.length > 0) {
        found.push({
          selector,
          count: els.length,
          samples: Array.from(els).slice(0, 2).map(el => ({
            tag: el.tagName,
            text: (el.textContent || '').trim().substring(0, 100),
            class: el.getAttribute('class') || '',
            id: el.getAttribute('id') || ''
          }))
        });
      }
    }
    
    return { title, found };
  });
  
  console.log('\nPage title:', data.title);
  console.log('\nPrice elements found:');
  data.found.forEach(item => {
    console.log(`\n${item.selector} (${item.count} elements):`);
    item.samples.forEach(sample => {
      console.log(`  ${sample.tag}: "${sample.text}"`);
      console.log(`    class="${sample.class}" id="${sample.id}"`);
    });
  });
  
  await browser.close();
}

inspectVDP().catch(console.error);
