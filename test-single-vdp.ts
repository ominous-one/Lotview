import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

async function testSingleVDP() {
  const vdpUrl = 'https://www.olympichyundaivancouver.com/used-2024-rivian-r1s-c19685';
  
  console.log(`Testing VDP scraping for: ${vdpUrl}`);
  
  // Find Chromium executable
  let chromiumPath = '';
  try {
    chromiumPath = execSync('which chromium').toString().trim();
  } catch {
    chromiumPath = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  }
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromiumPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
  });
  
  try {
    const page = await browser.newPage();
    
    // Relay browser console to Node.js
    page.on('console', (msg: any) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'warning' || type === 'warn') {
        console.warn(`[Browser Warning] ${text}`);
      } else if (type === 'error') {
        console.error(`[Browser Error] ${text}`);
      } else if (type === 'log') {
        console.log(`[Browser Log] ${text}`);
      }
    });
    
    await page.goto(vdpUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
    // Extract price using the same logic as the scraper
    const result = await page.evaluate(() => {
      console.log('=== STARTING PRICE EXTRACTION ===');
      
      try {
        // HELPER: Check if element is in a payment context
        console.log('Defining isPaymentContext helper...');
        function isPaymentContext(element) {
          console.log('Inside isPaymentContext...');
          const paymentKeywords = /payment|weekly|bi-?weekly|monthly|calculator|financing|finance|per\s+month|\/mo/i;
          
          // Check element's own text content
          console.log('Checking element text...');
          const elementText = element.textContent || '';
          if (paymentKeywords.test(elementText)) {
            console.log(`[REJECT] Element text contains payment keyword: "${elementText}"`);
            return true;
          }
          
          // Check element's class and ID attributes (use getAttribute to avoid SVG className issues)
          const elementClass = element.getAttribute('class') || '';
          const elementId = element.getAttribute('id') || '';
          if (paymentKeywords.test(elementClass) || paymentKeywords.test(elementId)) {
            console.log(`[REJECT] Element class/ID contains payment keyword: class="${elementClass}", id="${elementId}"`);
            return true;
          }
          
          // Check parent's class and ID
          const parent = element.parentElement;
          if (parent) {
            const parentClass = parent.getAttribute('class') || '';
            const parentId = parent.getAttribute('id') || '';
            if (paymentKeywords.test(parentClass) || paymentKeywords.test(parentId)) {
              console.log(`[REJECT] Parent class/ID contains payment keyword: class="${parentClass}", id="${parentId}"`);
              return true;
            }
          }
          
          return false;
        };
        
        let price: number | null = null;
        
        // Try data-field attribute
        console.log('Trying [data-field="price"] selector...');
        const priceDataField = document.querySelector('[data-field="price"]');
        if (priceDataField) {
          console.log(`Found element with data-field="price": ${priceDataField.textContent}`);
          if (!isPaymentContext(priceDataField)) {
            const priceText = priceDataField.textContent || '';
            const match = priceText.match(/\$?\s*([0-9,]+)/);
            if (match) {
              const parsed = parseInt(match[1].replace(/,/g, ''));
              if (parsed >= 1000) {
                console.log(`[SUCCESS] Extracted price from data-field: $${parsed}`);
                price = parsed;
              } else {
                console.log(`[REJECT] Price too low (likely payment): $${parsed}`);
              }
            }
          }
        } else {
          console.log('No element with [data-field="price"] found');
        }
        
        // Try .field-item.price selector
        if (!price) {
          console.log('Trying .field-item.price selector...');
          const priceFieldItem = document.querySelector('.field-item.price');
          if (priceFieldItem) {
            console.log(`Found element with .field-item.price: ${priceFieldItem.textContent}`);
            if (!isPaymentContext(priceFieldItem)) {
              const priceText = priceFieldItem.textContent || '';
              const match = priceText.match(/\$?\s*([0-9,]+)/);
              if (match) {
                const parsed = parseInt(match[1].replace(/,/g, ''));
                if (parsed >= 1000) {
                  console.log(`[SUCCESS] Extracted price from .field-item.price: $${parsed}`);
                  price = parsed;
                } else {
                  console.log(`[REJECT] Price too low (likely payment): $${parsed}`);
                }
              }
            }
          } else {
            console.log('No element with .field-item.price found');
          }
        }
        
        console.log(`=== FINAL RESULT: ${price ? '$' + price : 'null'} ===`);
        
        return { price };
      } catch (error: any) {
        console.error(`[ERROR] page.evaluate() failed: ${error.message}`);
        return { price: null };
      }
    });
    
    console.log(`\nRESULT: ${result.price ? '$' + result.price : 'No price extracted'}`);
    
  } finally {
    await browser.close();
  }
}

testSingleVDP().catch(console.error);
