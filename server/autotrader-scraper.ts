import puppeteer, { Browser, Page } from 'puppeteer';
import { storage } from './storage';
import type { InsertMarketListing } from '@shared/schema';

export interface AutoTraderSearchParams {
  make: string;
  model: string;
  yearMin?: number;
  yearMax?: number;
  postalCode?: string;
  radiusKm?: number;
  maxResults?: number;
}

export interface AutoTraderListing {
  externalId: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  mileage?: number;
  location: string;
  sellerName: string;
  listingType: 'dealer' | 'private';
  imageUrl?: string;
  listingUrl: string;
  postedDate?: Date;
}

export class AutoTraderScraper {
  private browser: Browser | null = null;

  async initialize() {
    if (!this.browser) {
      // Dynamically find Chromium executable
      const { execSync } = await import('child_process');
      let executablePath: string | undefined;
      
      try {
        // Try to find chromium in PATH
        executablePath = execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null', { encoding: 'utf8' }).trim();
      } catch {
        // Fallback: search in common Nix store locations
        try {
          executablePath = execSync('find /nix/store -name chromium -type f -path "*/bin/chromium" 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
        } catch {
          throw new Error('Chromium executable not found. Please install chromium.');
        }
      }
      
      if (!executablePath) {
        throw new Error('Chromium executable not found in PATH or Nix store');
      }
      
      console.log(`[AutoTrader] Using Chromium: ${executablePath}`);
      
      this.browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer'
        ]
      });
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Build AutoTrader.ca search URL with parameters
   */
  private buildSearchUrl(params: AutoTraderSearchParams): string {
    const { make, model, yearMin, yearMax, postalCode, radiusKm } = params;
    
    // Normalize make and model for URL (lowercase, replace spaces with hyphens)
    const normalizedMake = make.toLowerCase().replace(/\s+/g, '-');
    const normalizedModel = model.toLowerCase().replace(/\s+/g, '-');
    
    // Base URL structure: https://www.autotrader.ca/cars/{make}/{model}/
    const baseUrl = `https://www.autotrader.ca/cars/${normalizedMake}/${normalizedModel}/`;
    
    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('rcp', '100'); // Results per page (max)
    queryParams.append('rcs', '0'); // Start index
    queryParams.append('srt', '35'); // Sort order (35 = relevance)
    
    if (postalCode) {
      // Remove all spaces from postal code
      queryParams.append('loc', postalCode.replace(/\s/g, '').toUpperCase());
    }
    
    if (radiusKm) {
      queryParams.append('prx', radiusKm.toString());
    }
    
    // Year range parameter format: min,max
    if (yearMin && yearMax) {
      queryParams.append('yRng', `${yearMin},${yearMax}`);
    } else if (yearMin) {
      queryParams.append('yRng', `${yearMin},`);
    } else if (yearMax) {
      queryParams.append('yRng', `,${yearMax}`);
    }
    
    return `${baseUrl}?${queryParams.toString()}`;
  }

  /**
   * Scrape AutoTrader.ca for vehicle listings
   */
  async scrapeListings(params: AutoTraderSearchParams): Promise<AutoTraderListing[]> {
    await this.initialize();
    
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const page: Page = await this.browser.newPage();
    const searchUrl = this.buildSearchUrl(params);
    const listings: AutoTraderListing[] = [];
    
    try {
      console.log(`[AutoTrader] Scraping: ${searchUrl}`);
      
      // Set user agent to avoid bot detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Navigate to search results
      await page.goto(searchUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      
      // Wait for page to load and check for listings
      await new Promise(resolve => setTimeout(resolve, 5000)); // Give the page time to fully render
      
      // Debug: Save HTML and screenshot for analysis
      const htmlContent = await page.content();
      console.log('[AutoTrader] Page loaded, HTML length:', htmlContent.length);
      
      // Extract listing data with multiple selector strategies for robustness
      const scrapedData = await page.evaluate(() => {
        const results: any[] = [];
        
        // Try multiple selector strategies for AutoTrader's structure
        const possibleSelectors = [
          '.result-item',
          '[class*="listing"]',
          '[class*="Result"]',
          '[data-testid*="listing"]',
          'article',
          '.search-result'
        ];
        
        let cards: NodeListOf<Element> | null = null;
        for (const selector of possibleSelectors) {
          cards = document.querySelectorAll(selector);
          if (cards.length > 0) {
            console.log(`Found ${cards.length} listings with selector: ${selector}`);
            break;
          }
        }
        
        if (!cards || cards.length === 0) {
          console.log('No listings found with any selector');
          return results;
        }
        
        cards.forEach((card, index) => {
          try {
            // Extract all text content for parsing
            const allText = card.textContent || '';
            
            // Try multiple strategies to find the link
            const linkElement = card.querySelector('a[href*="/a/"]') || 
                              card.querySelector('a[href*="autotrader.ca"]') ||
                              card.querySelector('a');
            const link = linkElement?.getAttribute('href') || '';
            
            if (!link) {
              console.log(`Card ${index}: No link found`);
              return;
            }
            
            const fullUrl = link.startsWith('http') ? link : `https://www.autotrader.ca${link}`;
            
            // Extract listing ID from URL (various patterns)
            const idMatch = link.match(/\/(\d+)(?:\/|$)/) || link.match(/id=(\d+)/);
            const externalId = idMatch ? idMatch[1] : `generated-${Date.now()}-${index}`;
            
            // Find price (look for $ followed by numbers)
            const priceMatches = allText.match(/\$\s*([0-9,]+)/g);
            let price = 0;
            if (priceMatches && priceMatches.length > 0) {
              const priceText = priceMatches[0].replace(/[^0-9]/g, '');
              price = parseInt(priceText);
            }
            
            // Find mileage/kilometers
            const mileageMatches = allText.match(/([0-9,]+)\s*km/i);
            let mileage: number | undefined = undefined;
            if (mileageMatches) {
              const mileageText = mileageMatches[1].replace(/[^0-9]/g, '');
              mileage = parseInt(mileageText);
            }
            
            // Find year (4-digit number that looks like a year)
            const yearMatch = allText.match(/(20\d{2})/);
            const year = yearMatch ? parseInt(yearMatch[1]) : 0;
            
            // Extract title from multiple possible locations
            const titleElement = card.querySelector('[class*="title"]') ||
                               card.querySelector('h2') ||
                               card.querySelector('h3') ||
                               linkElement;
            const title = titleElement?.textContent?.trim() || allText.substring(0, 100);
            
            // Extract location - look for patterns like "City, Province" or "City, AB/BC/ON"
            // AutoTrader shows location in format: "City, Province" or nearby listings
            let location = '';
            const locationElement = card.querySelector('[data-cy="listingCardLocation"]') ||
                                  card.querySelector('[class*="location"]') ||
                                  card.querySelector('[class*="proximity"]');
            
            if (locationElement) {
              location = locationElement.textContent?.trim() || '';
            } else {
              // Fallback: search for "City, Province" pattern in text
              const cityProvinceMatch = allText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*(BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|YT|NT|NU)/);
              if (cityProvinceMatch) {
                location = `${cityProvinceMatch[1]}, ${cityProvinceMatch[2]}`;
              } else {
                // Last resort: look for just province abbreviation
                const provinceMatch = allText.match(/\b(BC|AB|SK|MB|ON|QC|NB|NS|PE|NL|YT|NT|NU)\b/);
                location = provinceMatch ? provinceMatch[1] : '';
              }
            }
            
            // Determine if private or dealer (look for keywords)
            const isPrivate = allText.toLowerCase().includes('private') || 
                            allText.toLowerCase().includes('owner');
            const listingType = isPrivate ? 'private' : 'dealer';
            
            // Extract seller name (look for dealer name patterns)
            let sellerName = 'Unknown Seller';
            if (listingType === 'dealer') {
              // Look for common dealer name patterns
              const dealerMatch = allText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Motors|Auto|Car|Dealer|Sales|Group))/);
              sellerName = dealerMatch ? dealerMatch[0] : 'Dealer';
            } else {
              sellerName = 'Private Seller';
            }
            
            // Extract image
            const imageElement = card.querySelector('img');
            const imageUrl = imageElement?.getAttribute('src') || 
                           imageElement?.getAttribute('data-src') ||
                           imageElement?.getAttribute('data-lazy') || '';
            
            // Only add if we have minimum viable data
            if (price > 0 && year > 0) {
              results.push({
                externalId,
                title,
                year,
                price,
                mileage,
                location,
                sellerName,
                listingType,
                imageUrl,
                listingUrl: fullUrl
              });
            }
          } catch (err) {
            console.error(`Error parsing listing card ${index}:`, err);
          }
        });
        
        return results;
      });
      
      // Process and clean the scraped data
      for (const data of scrapedData) {
        const { title, year, price, mileage, location, sellerName, listingType, imageUrl, listingUrl, externalId } = data;
        
        // Skip listings with invalid prices (likely parsing errors)
        if (price < 1000) {
          console.log(`[AutoTrader] Skipping listing with invalid price: $${price}`);
          continue;
        }
        
        // Parse make/model/trim from title
        const titleParts = title.split(' ');
        const parsedYear = year;
        
        // Normalize make and model to uppercase for consistency
        const parsedMake = (titleParts[1] || params.make).toUpperCase();
        const parsedModel = (titleParts[2] || params.model).toUpperCase();
        
        // Clean trim - keep it concise, remove common marketing phrases
        let parsedTrim = titleParts.slice(3).join(' ').trim();
        if (parsedTrim.length > 100) {
          // Trim is too long - likely full description, truncate
          parsedTrim = parsedTrim.substring(0, 100);
        }
        
        listings.push({
          externalId,
          year: parsedYear,
          make: parsedMake,
          model: parsedModel,
          trim: parsedTrim || undefined,
          price,
          mileage,
          location,
          sellerName,
          listingType: listingType as 'dealer' | 'private',
          imageUrl,
          listingUrl,
          postedDate: new Date() // AutoTrader doesn't show exact post date, use current date as approximation
        });
      }
      
      console.log(`[AutoTrader] Found ${listings.length} listings`);
      
    } catch (error) {
      console.error('[AutoTrader] Scraping error:', error);
      throw error;
    } finally {
      await page.close();
    }
    
    // Limit results
    const maxResults = params.maxResults || 50;
    return listings.slice(0, maxResults);
  }

  /**
   * Save scraped listings to database
   */
  async saveListings(listings: AutoTraderListing[], dealershipId: number = 1): Promise<number> {
    let savedCount = 0;
    
    for (const listing of listings) {
      try {
        const marketListing: InsertMarketListing = {
          dealershipId,
          externalId: listing.externalId,
          source: 'autotrader',
          listingType: listing.listingType,
          year: listing.year,
          make: listing.make,
          model: listing.model,
          trim: listing.trim || null,
          price: listing.price,
          mileage: listing.mileage || null,
          location: listing.location,
          postalCode: null,
          latitude: null,
          longitude: null,
          sellerName: listing.sellerName,
          imageUrl: listing.imageUrl || null,
          listingUrl: listing.listingUrl,
          postedDate: listing.postedDate || null,
          isActive: true
        };
        
        // Check if listing already exists
        const existing = await storage.getMarketListings(dealershipId, {
          make: listing.make,
          model: listing.model
        });
        
        const alreadyExists = existing.listings.some(e => e.externalId === listing.externalId);
        
        if (!alreadyExists) {
          await storage.createMarketListing(marketListing);
          savedCount++;
        }
      } catch (error) {
        console.error(`[AutoTrader] Error saving listing ${listing.externalId}:`, error);
      }
    }
    
    console.log(`[AutoTrader] Saved ${savedCount} new listings to database`);
    return savedCount;
  }

  /**
   * Search and save listings in one operation
   */
  async searchAndSave(params: AutoTraderSearchParams): Promise<number> {
    const listings = await this.scrapeListings(params);
    const savedCount = await this.saveListings(listings);
    return savedCount;
  }
}

// Export singleton instance
export const autoTraderScraper = new AutoTraderScraper();
