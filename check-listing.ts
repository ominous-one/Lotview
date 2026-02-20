import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

async function checkListing() {
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
  await page.goto('https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const data = await page.evaluate(() => {
    const title = document.title;
    const hasListings = document.querySelectorAll('.listing-item, .vehicle-card, .inventory-item').length;
    const allLinks = Array.from(document.querySelectorAll('a'));
    const vdpLinks = allLinks.filter(link => {
      const href = link.getAttribute('href') || '';
      return href.includes('/used-') || href.includes('/vehicle/');
    }).map(link => link.getAttribute('href')).slice(0, 5);
    
    return { title, hasListings, totalLinks: allLinks.length, vdpLinks };
  });
  
  console.log('Title:', data.title);
  console.log('Listing items found:', data.hasListings);
  console.log('Total links:', data.totalLinks);
  console.log('VDP links:', data.vdpLinks);
  
  await browser.close();
}

checkListing().catch(console.error);
