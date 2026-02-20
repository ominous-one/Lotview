import puppeteer from "puppeteer";

export interface CargurusColorResult {
  vin: string;
  interiorColor?: string;
  exteriorColor?: string;
  cargurusListingId?: string;
  cargurusUrl?: string;
  found: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function lookupCargurusColors(vin: string): Promise<CargurusColorResult> {
  const startTime = Date.now();
  let browser = null;
  
  try {
    console.log(`[CarGurus Color] Looking up colors for VIN: ${vin}`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const searchUrl = `https://www.cargurus.ca/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?zip=V6H&showNegotiable=true&sortDir=ASC&sourceContext=carGurusHomePageModel&distance=50000&sortType=DEAL_SCORE&vin=${vin}`;
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(2000);
    
    const listingLink = await page.$('a[href*="/Cars/link/"]');
    
    if (!listingLink) {
      console.log(`[CarGurus Color] No listing found for VIN ${vin}`);
      return { vin, found: false };
    }
    
    const href = await listingLink.evaluate((el: Element) => (el as HTMLAnchorElement).href);
    const listingIdMatch = href.match(/\/(\d+)$/);
    const listingId = listingIdMatch ? listingIdMatch[1] : undefined;
    
    await page.goto(href, { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(2000);
    
    const colors = await page.evaluate(() => {
      const result: { interiorColor?: string; exteriorColor?: string } = {};
      
      try {
        const nextDataScript = document.querySelector('script#__NEXT_DATA__');
        if (nextDataScript && nextDataScript.textContent) {
          const nextData = JSON.parse(nextDataScript.textContent);
          const listing = nextData?.props?.pageProps?.listing || 
                          nextData?.props?.pageProps?.listingDetail;
          
          if (listing) {
            result.interiorColor = listing.interiorColor || listing.interior_color || undefined;
            result.exteriorColor = listing.exteriorColor || listing.exterior_color || listing.color || undefined;
            
            if (result.interiorColor || result.exteriorColor) {
              return result;
            }
          }
        }
      } catch (e) {}
      
      const allText = document.body.innerText;
      
      const interiorMatch = allText.match(/Interior\s*(?:Color|Colour)?[:\s]+([A-Za-z\s]+?)(?:\n|Exterior|$)/i);
      if (interiorMatch) {
        result.interiorColor = interiorMatch[1].trim();
      }
      
      const exteriorMatch = allText.match(/Exterior\s*(?:Color|Colour)?[:\s]+([A-Za-z\s]+?)(?:\n|Interior|$)/i);
      if (exteriorMatch) {
        result.exteriorColor = exteriorMatch[1].trim();
      }
      
      const specRows = document.querySelectorAll('tr, [class*="spec"], [class*="detail"]');
      specRows.forEach((row) => {
        const text = row.textContent?.toLowerCase() || '';
        if (text.includes('interior') && text.includes('color')) {
          const colorMatch = row.textContent?.match(/(?:color|colour)[:\s]+(.+)/i);
          if (colorMatch && !result.interiorColor) {
            result.interiorColor = colorMatch[1].trim();
          }
        }
        if (text.includes('exterior') && text.includes('color')) {
          const colorMatch = row.textContent?.match(/(?:color|colour)[:\s]+(.+)/i);
          if (colorMatch && !result.exteriorColor) {
            result.exteriorColor = colorMatch[1].trim();
          }
        }
      });
      
      return result;
    });
    
    const responseTime = Date.now() - startTime;
    console.log(`[CarGurus Color] Completed in ${responseTime}ms - Interior: ${colors.interiorColor || 'N/A'}, Exterior: ${colors.exteriorColor || 'N/A'}`);
    
    return {
      vin,
      interiorColor: colors.interiorColor,
      exteriorColor: colors.exteriorColor,
      cargurusListingId: listingId,
      cargurusUrl: href,
      found: !!(colors.interiorColor || colors.exteriorColor)
    };
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`[CarGurus Color] Failed after ${responseTime}ms:`, error instanceof Error ? error.message : 'Unknown error');
    return { vin, found: false, error: error instanceof Error ? error.message : 'Unknown error' };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function lookupCargurusColorsByYearMakeModel(
  year: number,
  make: string,
  model: string,
  trim?: string
): Promise<CargurusColorResult[]> {
  const startTime = Date.now();
  let browser = null;
  const results: CargurusColorResult[] = [];
  
  try {
    console.log(`[CarGurus Color] Searching colors for ${year} ${make} ${model} ${trim || ''}`);
    
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ]
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    const searchUrl = `https://www.cargurus.ca/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?zip=V6H&showNegotiable=true&sortDir=ASC&sourceContext=carGurusHomePageModel&distance=500&sortType=DEAL_SCORE&stkTypId=28881&mdId=${encodeURIComponent(model)}&mkId=${encodeURIComponent(make)}&yrs=${year}`;
    
    await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 25000 });
    await sleep(2000);
    
    const listingData = await page.evaluate(() => {
      const listings: { vin?: string; interiorColor?: string; exteriorColor?: string; url: string; listingId?: string }[] = [];
      
      try {
        const nextDataScript = document.querySelector('script#__NEXT_DATA__');
        if (nextDataScript && nextDataScript.textContent) {
          const nextData = JSON.parse(nextDataScript.textContent);
          const searchResults = nextData?.props?.pageProps?.listings ||
                               nextData?.props?.pageProps?.searchResults?.listings ||
                               [];
          
          searchResults.slice(0, 10).forEach((listing: any) => {
            listings.push({
              vin: listing.vin,
              interiorColor: listing.interiorColor || listing.interior_color,
              exteriorColor: listing.exteriorColor || listing.exterior_color || listing.color,
              url: listing.url || listing.listingUrl || '',
              listingId: listing.id?.toString() || listing.listingId?.toString()
            });
          });
        }
      } catch (e) {}
      
      return listings;
    });
    
    for (const listing of listingData) {
      if (listing.vin && (listing.interiorColor || listing.exteriorColor)) {
        results.push({
          vin: listing.vin,
          interiorColor: listing.interiorColor,
          exteriorColor: listing.exteriorColor,
          cargurusListingId: listing.listingId,
          cargurusUrl: listing.url,
          found: true
        });
      }
    }
    
    const responseTime = Date.now() - startTime;
    console.log(`[CarGurus Color] Found ${results.length} vehicles with colors in ${responseTime}ms`);
    
    return results;
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`[CarGurus Color] Search failed after ${responseTime}ms:`, error instanceof Error ? error.message : 'Unknown error');
    return results;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
