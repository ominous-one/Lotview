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
  await page.goto('https://www.olympichyundaivancouver.com/vehicles/2024/rivian/r1s/vancouver/bc/68578448/?sale_class=used', { waitUntil: 'networkidle0', timeout: 30000 });
  
  const result = await page.evaluate(() => {
    return {
      title: document.title,
      vehiclePriceCount: document.querySelectorAll('.vehicle-price').length,
      mainPriceCount: document.querySelectorAll('.main-price').length,
      bodyLength: document.body.textContent?.length || 0,
      hasSalePrice: (document.body.textContent || '').includes('Sale Price')
    };
  });
  
  console.log('Page info:', result);
  await browser.close();
}

test().catch(console.error);
