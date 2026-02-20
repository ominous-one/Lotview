import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

async function testPriceExtraction() {
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
  
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const result = await page.evaluate(() => {
    function isPaymentContext(element) {
      const paymentKeywords = /payment|weekly|bi-?weekly|monthly|calculator|financing|finance|per\s+month|\/mo/i;
      const elementText = element.textContent || '';
      if (paymentKeywords.test(elementText)) return true;
      const elementClass = element.getAttribute('class') || '';
      const elementId = element.getAttribute('id') || '';
      if (paymentKeywords.test(elementClass) || paymentKeywords.test(elementId)) return true;
      const parent = element.parentElement;
      if (parent) {
        const parentClass = parent.getAttribute('class') || '';
        const parentId = parent.getAttribute('id') || '';
        if (paymentKeywords.test(parentClass) || paymentKeywords.test(parentId)) return true;
      }
      return false;
    }
    
    let price = null;
    
    // Try .vehicle-price first
    const vehiclePriceEls = document.querySelectorAll('.vehicle-price');
    console.log('Found', vehiclePriceEls.length, '.vehicle-price elements');
    
    for (const el of vehiclePriceEls) {
      console.log('Checking element:', el.textContent.trim().substring(0, 50));
      if (!isPaymentContext(el)) {
        const text = el.textContent || '';
        const match = text.match(/\$\s*([0-9,]+)/);
        if (match) {
          const parsed = parseInt(match[1].replace(/,/g, ''));
          if (parsed >= 1000) {
            console.log('SUCCESS: Extracted $' + parsed);
            price = parsed;
            break;
          }
        }
      } else {
        console.log('REJECTED: Payment context');
      }
    }
    
    return { price };
  });
  
  console.log('\nFinal result:', result.price ? '$' + result.price : 'No price found');
  
  await browser.close();
}

testPriceExtraction().catch(console.error);
