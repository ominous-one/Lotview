import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

async function test() {
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
  
  page.on('console', (msg) => {
    console.log(`[Browser] ${msg.text()}`);
  });
  
  await page.goto('https://www.olympichyundaivancouver.com/used-2024-rivian-r1s-c19685', { waitUntil: 'domcontentloaded', timeout: 15000 });
  
  const result = await page.evaluate(() => {
    console.log('Step 1');
    const priceEl = document.querySelector('[data-field="price"]');
    console.log('Step 2:', priceEl ? priceEl.textContent : 'null');
    return { price: priceEl ? priceEl.textContent : null };
  });
  
  console.log('Result:', result);
  await browser.close();
}

test().catch(console.error);
