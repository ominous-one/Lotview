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
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const result = await page.evaluate(() => {
    // Find all elements containing "$" and a number
    const allElements = document.querySelectorAll('*');
    const priceElements = [];
    
    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      // Look for dollar amounts
      if (/\$\s*\d{2,}/.test(text) && el.children.length === 0) {
        const classes = el.getAttribute('class') || '';
        const id = el.getAttribute('id') || '';
        const dataFields = Array.from(el.attributes)
          .filter(attr => attr.name.startsWith('data-'))
          .map(attr => `${attr.name}="${attr.value}"`)
          .join(' ');
        
        priceElements.push({
          text: text.substring(0, 100),
          tagName: el.tagName,
          class: classes.substring(0, 100),
          id: id,
          dataFields: dataFields,
          parentClass: el.parentElement?.getAttribute('class')?.substring(0, 100) || ''
        });
      }
    }
    
    return priceElements;
  });
  
  console.log('Found price elements:');
  result.forEach((el, i) => {
    console.log(`\n[${i + 1}] ${el.tagName}`);
    console.log(`  Text: "${el.text}"`);
    console.log(`  Class: "${el.class}"`);
    console.log(`  ID: "${el.id}"`);
    console.log(`  Data: ${el.dataFields}`);
    console.log(`  Parent Class: "${el.parentClass}"`);
  });
  
  await browser.close();
}

inspectDOM().catch(console.error);
