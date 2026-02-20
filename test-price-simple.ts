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
  await page.goto('https://www.olympichyundaivancouver.com/vehicles/2024/rivian/r1s/vancouver/bc/68578448/?sale_class=used', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const result = await page.evaluate(() => {
    const priceEl = document.querySelector('.vehicle-price');
    if (!priceEl) return { price: null };
    const text = priceEl.textContent || '';
    const match = text.match(/\$\s*([0-9,]+)/);
    if (!match) return { price: null };
    const price = parseInt(match[1].replace(/,/g, ''));
    return { price, text: text.trim() };
  });
  
  console.log('Extracted:', result);
  await browser.close();
}

test().catch(console.error);
