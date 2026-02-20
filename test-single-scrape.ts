import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

async function testSingleScrape() {
  const chromiumPath = execSync('which chromium').toString().trim() ||
                       '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';
  
  const browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    const testUrl = 'https://www.cargurus.ca/Cars/link/407437205'; // 2025 Nissan Kicks
    
    console.log(`\nTesting extraction for: ${testUrl}\n`);
    
    await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const result = await page.evaluate(() => {
      const data: any = { _extractionMethod: 'DOM' };
      
      try {
        const nextDataScript = document.querySelector('script#__NEXT_DATA__');
        if (nextDataScript && nextDataScript.textContent) {
          const nextData = JSON.parse(nextDataScript.textContent);
          const listing = nextData?.props?.pageProps?.listing || nextData?.props?.pageProps?.listingDetail;
          
          if (listing) {
            data._extractionMethod = 'JSON';
            data.year = listing.year || parseInt(listing.modelYear);
            data.make = listing.make || listing.makeName;
            data.model = listing.model || listing.modelName;
            data.trim = listing.trim || listing.trimName;
            data.price = listing.dealerPrice || listing.price || listing.askingPrice;
            data.odometer = listing.mileage || listing.odometer;
            data.vin = listing.vin;
            data.stockNumber = listing.stockNumber || listing.stock;
            data.dealRating = listing.dealRating || listing.dealBadge;
            
            // Extract first 3 image URLs
            const images: string[] = [];
            if (listing.photos || listing.pictureUrls || listing.images) {
              const photoArray = listing.photos || listing.pictureUrls || listing.images;
              photoArray.slice(0, 3).forEach((photo: any) => {
                let imgUrl = '';
                if (typeof photo === 'string') {
                  imgUrl = photo;
                } else if (photo.url) {
                  imgUrl = photo.url;
                } else if (photo.pictureUrl) {
                  imgUrl = photo.pictureUrl;
                }
                if (imgUrl) images.push(imgUrl);
              });
            }
            data.imageCount = images.length;
            data.sampleImages = images;
            
            // Debug: show listing object keys
            data._listingKeys = Object.keys(listing);
          } else {
            data._error = 'listing object not found in pageProps';
            data._pagePropsKeys = nextData?.props?.pageProps ? Object.keys(nextData.props.pageProps) : [];
          }
        } else {
          data._error = 'script#__NEXT_DATA__ not found';
        }
      } catch (e) {
        data._jsonError = String(e);
      }
      
      return data;
    });
    
    console.log(JSON.stringify(result, null, 2));
    
  } finally {
    await browser.close();
  }
}

testSingleScrape().catch(console.error);
