import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

async function findVDP() {
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
  console.log('Loading listing page...');
  await page.goto('https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used', { waitUntil: 'domcontentloaded', timeout: 30000 });
  
  // Wait for vehicle links
  await page.waitForSelector('a[href*="/vehicles/2"]', { timeout: 15000 });
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const vdpUrls = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/vehicles/2"]'));
    return links.slice(0, 5).map(link => link.getAttribute('href'));
  });
  
  console.log('Found VDP URLs:');
  vdpUrls.forEach(url => console.log('  ', url));
  
  await browser.close();
  return vdpUrls[0];
}

findVDP().catch(console.error);
