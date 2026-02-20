import puppeteer from "puppeteer";
import { execSync } from "child_process";
import { storage } from "./storage";

// Fallback dealer pages if no database sources are configured
const DEFAULT_DEALER_PAGES = [
  {
    name: "Olympic Hyundai Vancouver",
    url: "https://www.cargurus.ca/Cars/m-Olympic-Hyundai-Vancouver-sp459833",
    dealershipId: 1,
    location: "Vancouver",
  },
  {
    name: "Boundary Hyundai",
    url: "https://www.cargurus.ca/Cars/m-Boundary-Hyundai-sp393663",
    dealershipId: 2,
    location: "Burnaby",
  },
  {
    name: "Kia Vancouver",
    url: "https://www.cargurus.ca/Cars/m-Kia-Vancouver-sp357122",
    dealershipId: 3,
    location: "Vancouver",
  },
];

// Helper to get scrape sources from database
async function getScrapeSourcesFromDb(): Promise<{ name: string; url: string; dealershipId: number; location: string }[]> {
  try {
    const sources = await storage.getAllActiveScrapeSources();
    
    if (sources.length === 0) {
      console.log("  ℹ No active scrape sources in database, using defaults");
      return DEFAULT_DEALER_PAGES;
    }
    
    // Map database sources to scraper format
    return sources.map(source => ({
      name: source.sourceName,
      url: source.sourceUrl,
      dealershipId: source.dealershipId,
      location: source.sourceName.includes("Vancouver") ? "Vancouver" : 
                source.sourceName.includes("Burnaby") ? "Burnaby" : "BC",
    }));
  } catch (error) {
    console.error("  ⚠ Error loading scrape sources from database:", error);
    console.log("  ℹ Falling back to default dealer pages");
    return DEFAULT_DEALER_PAGES;
  }
}

interface CarGurusVehicle {
  year: number;
  make: string;
  model: string;
  trim: string;
  type: string; // Body type
  price: number;
  odometer: number;
  images: string[];
  badges: string[];
  location: string;
  dealership: string;
  dealershipId: number;
  description: string;
  vin?: string;
  stockNumber?: string;
  carfaxUrl?: string;
  dealRating?: string; // "Great Deal", "Good Deal", etc.
  cargurusPrice?: number;
  cargurusUrl?: string;
  dealerVdpUrl?: string; // Link to dealer's vehicle detail page
  exteriorColor?: string;
  interiorColor?: string;
}

// Determine body type from description or model name
function determineBodyType(description: string, model: string): string {
  const text = (description + " " + model).toLowerCase();

  if (text.includes("sedan")) return "Sedan";
  if (text.includes("suv") || text.includes("sport utility")) return "SUV";
  if (
    text.includes("truck") ||
    text.includes("crew cab") ||
    text.includes("pickup")
  )
    return "Truck";
  if (text.includes("hatchback")) return "Hatchback";
  if (text.includes("coupe") || text.includes("convertible")) return "Coupe";
  if (text.includes("wagon")) return "Wagon";
  if (text.includes("minivan") || text.includes("van")) return "Minivan";

  return "SUV"; // Default
}

// Check if vehicle has low km based on 12,000 km per year threshold
function isLowKilometers(year: number, odometer: number): boolean {
  const currentYear = new Date().getFullYear();
  const vehicleAge = Math.max(1, currentYear - year); // At least 1 year old
  const expectedMaxKm = vehicleAge * 12000; // 12,000 km per year average
  return odometer > 0 && odometer <= expectedMaxKm;
}

// Extract badges from description text
function detectBadges(text: string, year?: number, odometer?: number): string[] {
  const badges: string[] = [];
  const lowerText = text.toLowerCase();

  if (/\b(one owner|1 owner|single owner)\b/.test(lowerText)) {
    badges.push("One Owner");
  }
  if (
    /\b(no accidents?|accident free|clean history|accident-free)\b/.test(
      lowerText,
    )
  ) {
    badges.push("No Accidents");
  }
  if (/\b(clean title|clear title)\b/.test(lowerText)) {
    badges.push("Clean Title");
  }
  if (/\b(certified|cpo|certified pre-owned)\b/.test(lowerText)) {
    badges.push("Certified Pre-Owned");
  }
  // Low Kilometers: Calculate based on 12,000 km/year if year and odometer provided
  if (year && odometer && isLowKilometers(year, odometer)) {
    badges.push("Low Kilometers");
  } else if (/\b(low km|low kilometers|low mileage|low km's)\b/.test(lowerText)) {
    // Only use keyword detection if we don't have year/odometer data
    if (!year || !odometer) {
      badges.push("Low Kilometers");
    }
  }

  return badges;
}

async function scrapeCarGurusVehicleDetail(
  page: any,
  listingUrl: string,
  dealershipName: string,
  dealershipId: number,
  location: string,
): Promise<CarGurusVehicle | null> {
  try {
    // Extract listing ID from URL for validation
    const listingIdMatch = listingUrl.match(/\/(\d+)$/);
    const listingId = listingIdMatch ? listingIdMatch[1] : null;

    // Inject XHR/fetch hook to capture JSON responses
    await page.evaluateOnNewDocument(() => {
      (window as any).__cargurusData = null;
      const originalFetch = window.fetch;
      window.fetch = async (...args) => {
        const response = await originalFetch(...args);
        const url = typeof args[0] === "string" ? args[0] : (args[0] instanceof URL ? args[0].toString() : (args[0] as Request).url);

        if (
          url.includes("listing") ||
          url.includes("vehicle") ||
          url.includes("detail") ||
          url.includes("inventory")
        ) {
          try {
            const clone = response.clone();
            const json = await clone.json();
            if (
              json &&
              (json.listing || json.listingDetail || json.data || json.vin)
            ) {
              (window as any).__cargurusData = json;
            }
          } catch (e) {
            // Not JSON
          }
        }
        return response;
      };
    });

    await page.goto(listingUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 3000)); // Extra time for XHR to complete

    // Try to retrieve intercepted data from injected hook
    let listingApiData = await page.evaluate(
      () => (window as any).__cargurusData,
    );

    // If no intercepted data, try deep __NEXT_DATA__ search
    if (!listingApiData) {
      listingApiData = await page.evaluate(() => {
        try {
          const nextDataScript = document.querySelector("script#__NEXT_DATA__");
          if (nextDataScript && nextDataScript.textContent) {
            const nextData = JSON.parse(nextDataScript.textContent);

            // Deep search for listing data in various possible locations
            const possiblePaths = [
              nextData?.props?.pageProps?.listing,
              nextData?.props?.pageProps?.listingDetail,
              nextData?.props?.pageProps?.initialState?.listing,
              nextData?.props?.pageProps?.data?.listing,
            ];

            // Also search apolloState if present
            if (nextData?.props?.pageProps?.apolloState) {
              const apolloState = nextData.props.pageProps.apolloState;
              for (const key in apolloState) {
                if (
                  apolloState[key] &&
                  (apolloState[key].vin ||
                    apolloState[key].dealerPrice ||
                    apolloState[key].photos)
                ) {
                  possiblePaths.push(apolloState[key]);
                }
              }
            }

            // Find first valid listing object
            for (const listing of possiblePaths) {
              if (listing && (listing.vin || listing.year || listing.make)) {
                return listing;
              }
            }
          }
        } catch (e) {
          // JSON parse failed
        }
        return null;
      });
    }

    // PRIMARY STRATEGY: Use intercepted/extracted API data
    if (listingApiData) {
      const listing =
        listingApiData.listing ||
        listingApiData.listingDetail ||
        listingApiData.data ||
        listingApiData;

      const vehicleData: any = {
        _extractionMethod: "API",
        year: listing.year || parseInt(listing.modelYear),
        make: listing.make || listing.makeName,
        model: listing.model || listing.modelName,
        trim: listing.trim || listing.trimName || "Base",
        price: listing.dealerPrice || listing.price || listing.askingPrice || 0,
        odometer: listing.mileage || listing.odometer || 0,
        vin: listing.vin || null,
        stockNumber: listing.stockNumber || listing.stock || null,
        dealRating: listing.dealRating || listing.dealBadge || null,
        description: listing.description || listing.sellerComments || "",
        exteriorColor: listing.exteriorColor || listing.exteriorColorName || listing.color || null,
        interiorColor: listing.interiorColor || listing.interiorColorName || null,
        images: [],
      };

      // Extract images from various possible nested structures
      const images: string[] = [];
      const photoSources = [
        listing.media?.photoGallery?.photos,
        listing.photos,
        listing.pictureUrls,
        listing.images,
      ];

      for (const source of photoSources) {
        if (Array.isArray(source) && source.length > 0) {
          source.forEach((photo: any) => {
            let imgUrl = "";
            if (typeof photo === "string") {
              imgUrl = photo;
            } else if (photo.url) {
              imgUrl = photo.url;
            } else if (photo.pictureUrl) {
              imgUrl = photo.pictureUrl;
            }

            if (imgUrl && imgUrl.includes("cargurus.com/images/forsale/")) {
              const cleanUrl = imgUrl.split("?")[0];
              const fullUrl =
                cleanUrl +
                "?io=true&width=1024&height=768&fit=bounds&format=jpg&auto=webp";
              if (!images.includes(fullUrl)) {
                images.push(fullUrl);
              }
            }
          });

          if (images.length > 0) break; // Found images, stop looking
        }
      }

      vehicleData.images = images;

      // ASSERTIONS: Validate data quality before saving
      const priceValid =
        vehicleData.price >= 1000 && vehicleData.price <= 200000;
      const hasMinimumImages = images.length >= 8; // Relaxed from 15-20 to 8 for initial testing
      const hasBasicData =
        vehicleData.year && vehicleData.make && vehicleData.model;

      if (!hasBasicData) {
        console.log(`    ✗ Missing basic data (year/make/model) - skipping`);
        return null;
      }

      if (!priceValid) {
        console.log(
          `    ✗ Price $${vehicleData.price} out of range [1k-200k] - skipping`,
        );
        return null;
      }

      if (!hasMinimumImages) {
        console.log(
          `    ⚠ Only ${images.length} images (target: 8+) - saving anyway`,
        );
      }

      // If stock number missing, generate from listing ID
      if (!vehicleData.stockNumber && listingId) {
        vehicleData.stockNumber = `CG-${listingId}`;
      }

      console.log(
        `    ✓ JSON extraction: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model} - $${vehicleData.price} - ${images.length} images - ${vehicleData.stockNumber || "NO_STOCK"}`,
      );

      const vehicle: CarGurusVehicle = {
        year: vehicleData.year,
        make: vehicleData.make,
        model: vehicleData.model,
        trim: vehicleData.trim,
        type: determineBodyType(vehicleData.description, vehicleData.model),
        price: vehicleData.price,
        odometer: vehicleData.odometer,
        images: vehicleData.images,
        badges: detectBadges(vehicleData.description),
        location,
        dealership: dealershipName,
        dealershipId,
        description:
          vehicleData.description ||
          `${vehicleData.year} ${vehicleData.make} ${vehicleData.model} ${vehicleData.trim}`,
        vin: vehicleData.vin,
        stockNumber: vehicleData.stockNumber,
        carfaxUrl: undefined, // Not available in CarGurus API data
        dealRating: vehicleData.dealRating,
        cargurusPrice: vehicleData.price,
        cargurusUrl: listingUrl,
        exteriorColor: vehicleData.exteriorColor,
        interiorColor: vehicleData.interiorColor,
      };

      return vehicle;
    }

    // FALLBACK: Extract from page DOM/JSON
    console.log(
      `    ⚠ No API data, falling back to page extraction for ${listingUrl}`,
    );
    const vehicleData = await page.evaluate((url: string) => {
      const data: any = { _extractionMethod: "DOM" };

      // PRIMARY STRATEGY: Parse Next.js JSON payload (most reliable)
      try {
        const nextDataScript = document.querySelector("script#__NEXT_DATA__");
        if (nextDataScript && nextDataScript.textContent) {
          const nextData = JSON.parse(nextDataScript.textContent);
          const listing =
            nextData?.props?.pageProps?.listing ||
            nextData?.props?.pageProps?.listingDetail;

          if (listing) {
            data._extractionMethod = "JSON";

            // Extract year, make, model, trim from structured data
            data.year = listing.year || parseInt(listing.modelYear);
            data.make = listing.make || listing.makeName;
            data.model = listing.model || listing.modelName;
            data.trim = listing.trim || listing.trimName || "Base";

            // Extract price - dealerPrice is the actual cash price
            data.price =
              listing.dealerPrice || listing.price || listing.askingPrice || 0;

            // Extract mileage
            data.odometer = listing.mileage || listing.odometer || 0;

            // Extract VIN
            data.vin = listing.vin || null;

            // Extract stock number
            data.stockNumber = listing.stockNumber || listing.stock || null;

            // Extract deal rating
            data.dealRating = listing.dealRating || listing.dealBadge || null;

            // Extract colors
            data.exteriorColor = listing.exteriorColor || listing.exteriorColorName || listing.color || null;
            data.interiorColor = listing.interiorColor || listing.interiorColorName || null;

            // Extract images from gallery (most reliable source)
            const images: string[] = [];
            if (listing.photos || listing.pictureUrls || listing.images) {
              const photoArray =
                listing.photos || listing.pictureUrls || listing.images;
              photoArray.forEach((photo: any) => {
                let imgUrl = "";
                if (typeof photo === "string") {
                  imgUrl = photo;
                } else if (photo.url) {
                  imgUrl = photo.url;
                } else if (photo.pictureUrl) {
                  imgUrl = photo.pictureUrl;
                }

                if (imgUrl && imgUrl.includes("cargurus.com/images/forsale/")) {
                  // Add full resolution version
                  const cleanUrl = imgUrl.split("?")[0];
                  const fullUrl =
                    cleanUrl +
                    "?io=true&width=1024&height=768&fit=bounds&format=jpg&auto=webp";
                  if (!images.includes(fullUrl)) {
                    images.push(fullUrl);
                  }
                }
              });
            }
            data.images = images;

            // Extract description
            data.description =
              listing.description || listing.sellerComments || "";

            return data;
          }
        }
      } catch (e) {
        data._jsonError = String(e);
      }

      // FALLBACK: DOM extraction (less reliable, kept for backwards compatibility)
      const titleEl = document.querySelector('h1, [class*="heading"]');
      let title = titleEl?.textContent?.trim() || "";

      // Clean up title
      title = title.replace(/Learn\s+more.*$/i, "").trim();
      title = title.replace(/\s+about\s+this.*$/i, "").trim();
      title = title.replace(/\s+details.*$/i, "").trim();

      // Parse year, make, model, trim from title
      // Match patterns like: "2022 Toyota Corolla LE FWD" or "2022 Toyota Corolla"
      const titleMatch = title.match(
        /^(\d{4})\s+([A-Za-z-]+)\s+([A-Za-z0-9\s-]+?)(?:\s+([A-Z]{2,}(?:\s+[A-Z]{2,})*))?$/,
      );
      if (titleMatch) {
        data.year = parseInt(titleMatch[1]);
        data.make = titleMatch[2];
        // Split model and trim - first word is model, rest is trim
        const rest = titleMatch[3].trim();
        const parts = rest.split(/\s+/);
        data.model = parts[0];
        data.trim = parts.slice(1).join(" ") || "Base";
        // Append drivetrain/additional trim info if present (e.g., "FWD", "AWD")
        if (titleMatch[4]) {
          data.trim = (data.trim + " " + titleMatch[4]).trim();
        }
      } else {
        // Fallback: simpler parsing for "2022 Toyota Corolla" format
        const simpleMatch = title.match(
          /^(\d{4})\s+([A-Za-z-]+)\s+([A-Za-z0-9-]+)/,
        );
        if (simpleMatch) {
          data.year = parseInt(simpleMatch[1]);
          data.make = simpleMatch[2];
          data.model = simpleMatch[3];
          data.trim = "Base";
        }
      }

      // Extract price - CRITICAL: avoid monthly payments, target cash/dealer price only
      let price = 0;

      // Strategy 1: Look for specific price container elements (CarGurus uses specific classes for dealer price)
      const priceSelectors = [
        '[class*="dealerPrice"]',
        '[class*="DealerPrice"]',
        '[class*="price-value"]',
        '[class*="PriceValue"]',
        '[data-testid*="price"]',
      ];

      for (const selector of priceSelectors) {
        const priceEl = document.querySelector(selector);
        if (priceEl) {
          const priceText = priceEl.textContent || "";
          const priceMatch = priceText.match(/\$([0-9,]+)/);
          if (priceMatch) {
            const foundPrice = parseInt(priceMatch[1].replace(/,/g, ""));
            if (foundPrice > 5000 && foundPrice < 200000) {
              // Reasonable vehicle price range
              price = foundPrice;
              break;
            }
          }
        }
      }

      // Strategy 2: Look for text near "Dealer" or "List" (but exclude "per month" / "mo")
      if (price === 0) {
        const allElements = Array.from(document.querySelectorAll("*"));
        for (const el of allElements) {
          const text = el.textContent?.toLowerCase() || "";
          // Look for dealer/list price but exclude monthly payment indicators
          if (
            (text.includes("dealer") || text.includes("list")) &&
            !text.includes("per month") &&
            !text.includes("/mo") &&
            !text.includes("payment")
          ) {
            const priceMatch = text.match(/\$([0-9,]+)/);
            if (priceMatch) {
              const foundPrice = parseInt(priceMatch[1].replace(/,/g, ""));
              if (foundPrice > 10000 && foundPrice < 200000) {
                // Must be at least $10k for used car
                price = foundPrice;
                break;
              }
            }
          }
        }
      }

      // Strategy 3: Find the SECOND-largest dollar amount (first is often monthly, second is often cash price)
      if (price === 0) {
        const allText = document.body.textContent || "";
        const allPrices = allText.match(/\$([0-9,]+)/g) || [];
        const numericPrices = allPrices
          .map((p) => parseInt(p.replace(/[$,]/g, "")))
          .filter((p) => p > 10000 && p < 200000) // Realistic used car prices
          .sort((a, b) => b - a); // Sort descending

        // Take second-largest if exists, otherwise first (largest)
        if (numericPrices.length >= 2) {
          price = numericPrices[1]; // Second-largest (likely cash price)
        } else if (numericPrices.length === 1) {
          price = numericPrices[0];
        }
      }

      data.price = price;

      // Extract mileage/odometer
      const mileageEl = document.querySelector(
        '[class*="mileage"], [class*="Mileage"]',
      );
      const mileageText = mileageEl?.textContent || "";
      const mileageMatch = mileageText.match(/([0-9,]+)/);
      if (mileageMatch) {
        data.odometer = parseInt(mileageMatch[1].replace(/,/g, ""));
      }

      // Extract VIN
      const vinEl = Array.from(document.querySelectorAll("*")).find((el) =>
        el.textContent?.includes("VIN"),
      );
      if (vinEl) {
        const vinMatch = vinEl.textContent?.match(
          /VIN[:\s]+([A-HJ-NPR-Z0-9]{17})/i,
        );
        if (vinMatch) {
          data.vin = vinMatch[1];
        }
      }

      // Extract stock number
      const stockEl = Array.from(document.querySelectorAll("*")).find((el) =>
        el.textContent?.includes("Stock"),
      );
      if (stockEl) {
        const stockMatch = stockEl.textContent?.match(
          /Stock[#:\s]+([A-Z0-9-]+)/i,
        );
        if (
          stockMatch &&
          stockMatch[1] &&
          stockMatch[1].toLowerCase() !== "number"
        ) {
          data.stockNumber = stockMatch[1];
        }
      }

      // Fallback: Generate stock number from listing URL if not found
      if (!data.stockNumber) {
        const listingIdMatch = window.location.href.match(/link\/(\d+)/);
        if (listingIdMatch) {
          data.stockNumber = "CG-" + listingIdMatch[1];
        }
      }

      // Extract deal rating
      const dealEl = document.querySelector('[class*="Deal"], [class*="deal"]');
      if (dealEl) {
        const dealText = dealEl.textContent || "";
        if (dealText.includes("Great")) data.dealRating = "Great Deal";
        else if (dealText.includes("Good")) data.dealRating = "Good Deal";
        else if (dealText.includes("Fair")) data.dealRating = "Fair Deal";
        else if (dealText.includes("High")) data.dealRating = "High Price";
        else if (dealText.includes("Overpriced"))
          data.dealRating = "Overpriced";
      }

      // Extract ALL images from gallery - comprehensive extraction with strict filtering
      const images: string[] = [];
      const imageBaseUrls = new Set<string>(); // Track base URLs to avoid duplicates

      // Strategy 1: Look for all img elements with CarGurus image URLs
      const allImages = document.querySelectorAll("img");
      allImages.forEach((img) => {
        let src = img.getAttribute("src") || img.getAttribute("data-src") || "";

        // Only process CarGurus vehicle image URLs
        if (src && src.includes("cargurus.com/images/forsale/")) {
          // Extract base URL (before resolution params)
          const baseUrl = src
            .split("?")[0]
            .replace(/_thumb|_small|_medium|_\d+x\d+/g, "");

          // Skip if we already have this image (different resolution of same photo)
          if (imageBaseUrls.has(baseUrl)) {
            return;
          }

          // Get image dimensions to filter out logos/watermarks (typically smaller)
          const width = img.naturalWidth || img.width || 0;
          const height = img.naturalHeight || img.height || 0;

          // Exclude small images (logos/watermarks are usually < 300px wide)
          // Exclude images with "logo", "icon", "badge", "watermark" in URL
          const isValidVehicleImage =
            width >= 300 && // Minimum width for vehicle photos
            !src.includes("logo") &&
            !src.includes("icon") &&
            !src.includes("badge") &&
            !src.includes("watermark") &&
            !src.includes("dealer") &&
            !baseUrl.includes("logo") &&
            !baseUrl.includes("icon");

          if (isValidVehicleImage) {
            // Add full-resolution version
            const fullSrc =
              baseUrl +
              "?io=true&width=1024&height=768&fit=bounds&format=jpg&auto=webp";
            images.push(fullSrc);
            imageBaseUrls.add(baseUrl);
          }
        }
      });

      // Strategy 2: Look for data attributes that might contain image URLs
      const elementsWithData = document.querySelectorAll(
        "[data-image], [data-photo], [data-src]",
      );
      elementsWithData.forEach((el) => {
        const src =
          el.getAttribute("data-image") ||
          el.getAttribute("data-photo") ||
          el.getAttribute("data-src") ||
          "";
        if (src && src.includes("cargurus.com/images/forsale/")) {
          const baseUrl = src
            .split("?")[0]
            .replace(/_thumb|_small|_medium|_\d+x\d+/g, "");

          if (
            !imageBaseUrls.has(baseUrl) &&
            !src.includes("logo") &&
            !src.includes("icon") &&
            !src.includes("watermark") &&
            !src.includes("dealer")
          ) {
            const fullSrc =
              baseUrl +
              "?io=true&width=1024&height=768&fit=bounds&format=jpg&auto=webp";
            images.push(fullSrc);
            imageBaseUrls.add(baseUrl);
          }
        }
      });

      data.images = images;

      // Extract Carfax URL using multiple strategies
      let carfaxUrl = null;

      // Strategy 1: Direct link with href containing 'carfax'
      const carfaxLink = document.querySelector('a[href*="carfax"]');
      if (carfaxLink) {
        carfaxUrl = carfaxLink.getAttribute("href");
      }

      // Strategy 2: Button with carfax in data attributes
      if (!carfaxUrl) {
        const carfaxButton = document.querySelector(
          '[data-carfax], [data-carfax-url], [data-report*="carfax"]',
        );
        if (carfaxButton) {
          carfaxUrl =
            carfaxButton.getAttribute("data-carfax-url") ||
            carfaxButton.getAttribute("data-carfax") ||
            carfaxButton.getAttribute("data-report");
        }
      }

      // Strategy 3: Look for iframe with carfax source
      if (!carfaxUrl) {
        const carfaxIframe = document.querySelector('iframe[src*="carfax"]');
        if (carfaxIframe) {
          carfaxUrl = carfaxIframe.getAttribute("src");
        }
      }

      // Strategy 4: Search all links for carfax in text content
      if (!carfaxUrl) {
        const allLinks = Array.from(document.querySelectorAll("a"));
        for (const link of allLinks) {
          if (link.textContent?.toLowerCase().includes("carfax")) {
            carfaxUrl = link.getAttribute("href");
            break;
          }
        }
      }

      data.carfaxUrl = carfaxUrl;

      // Extract description
      const descEl = document.querySelector(
        '[class*="description"], [class*="Description"]',
      );
      data.description = descEl?.textContent?.trim() || "";

      // Extract features for description
      const features: string[] = [];
      const featureEls = document.querySelectorAll(
        '[class*="feature"], [class*="Feature"]',
      );
      featureEls.forEach((el) => {
        const text = el.textContent?.trim();
        if (text && text.length < 100) features.push(text);
      });
      if (features.length > 0) {
        data.description += "\n\nFeatures: " + features.join(", ");
      }

      return data;
    }, listingUrl);

    // Log extraction method used
    if (vehicleData._extractionMethod === "JSON") {
      console.log(
        `    ✓ Extracted from JSON payload: ${vehicleData.year} ${vehicleData.make} ${vehicleData.model} - $${vehicleData.price} - ${vehicleData.images?.length || 0} images`,
      );
    } else {
      console.log(
        `    ⚠ Used DOM extraction (JSON failed): ${vehicleData.year} ${vehicleData.make} ${vehicleData.model}`,
      );
      if (vehicleData._jsonError) {
        console.log(`      Error: ${vehicleData._jsonError}`);
      }
    }

    // Validate required fields
    if (
      !vehicleData.year ||
      !vehicleData.make ||
      !vehicleData.model ||
      !vehicleData.price
    ) {
      console.log(`  ⚠ Skipping incomplete listing: ${listingUrl}`);
      return null;
    }

    // Validate extracted data (price sanity check)
    if (vehicleData.price > 200000) {
      console.log(
        `  ⚠ Warning: Unusually high price $${vehicleData.price} for ${vehicleData.year} ${vehicleData.make} ${vehicleData.model}`,
      );
    }
    if (vehicleData.price < 1000) {
      console.log(
        `  ⚠ Warning: Unusually low price $${vehicleData.price} for ${vehicleData.year} ${vehicleData.make} ${vehicleData.model}`,
      );
    }

    // Build complete vehicle object
    const vehicle: CarGurusVehicle = {
      year: vehicleData.year,
      make: vehicleData.make,
      model: vehicleData.model,
      trim: vehicleData.trim || "Base",
      type: determineBodyType(vehicleData.description, vehicleData.model),
      price: vehicleData.price,
      odometer: vehicleData.odometer || 0,
      images: vehicleData.images || [],
      badges: detectBadges(vehicleData.description),
      location,
      dealership: dealershipName,
      dealershipId,
      description:
        vehicleData.description ||
        `${vehicleData.year} ${vehicleData.make} ${vehicleData.model} ${vehicleData.trim}`,
      vin: vehicleData.vin,
      stockNumber: vehicleData.stockNumber,
      carfaxUrl: vehicleData.carfaxUrl || null,
      dealRating: vehicleData.dealRating,
      cargurusPrice: vehicleData.price,
      cargurusUrl: listingUrl,
      exteriorColor: vehicleData.exteriorColor,
      interiorColor: vehicleData.interiorColor,
    };

    return vehicle;
  } catch (error) {
    console.error(`  ✗ Error scraping detail page ${listingUrl}:`, error);
    return null;
  }
}

async function scrapeCarGurusDealerPage(
  dealerUrl: string,
  dealerName: string,
  dealershipId: number,
  location: string,
): Promise<CarGurusVehicle[]> {
  const chromiumPath =
    execSync("which chromium").toString().trim() ||
    "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium";

  console.log(`Scraping CarGurus for ${dealerName}...`);

  const browser = await puppeteer.launch({
    executablePath: chromiumPath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const vehicles: CarGurusVehicle[] = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    await page.goto(dealerUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for React app to render the listings
    // CarGurus uses React to dynamically load content - we need to wait for it
    console.log("  Waiting for React to render listings...");
    try {
      // Wait for specific text that only appears when listings are loaded
      await page.waitForFunction(
        () => {
          const bodyText = document.body.textContent || "";
          // Check if the page has loaded listing content (price, km, year patterns)
          return (
            bodyText.includes("$") &&
            bodyText.includes("km") &&
            /\d{4}\s+(Toyota|Honda|Hyundai|Kia|Mazda|Nissan|Ford|Chevrolet|Dodge|GMC|RAM|Jeep|Chrysler|Buick|Cadillac|Lincoln|Volkswagen|Audi|BMW|Mercedes|Lexus|Tesla|Subaru|Mitsubishi|Acura|Infiniti)/i.test(
              bodyText,
            )
          );
        },
        { timeout: 20000 },
      );
      console.log("  ✓ React content loaded");
    } catch (e) {
      console.log(
        `  ⚠ Timeout waiting for listings to load for ${dealerName}`,
      );
      await browser.close();
      return vehicles;
    }

    // Scroll to load all listings
    console.log("  Scrolling to load all listings...");
    let previousHeight = 0;
    for (let i = 0; i < 10; i++) {
      const currentHeight = await page.evaluate(
        () => document.body.scrollHeight,
      );
      if (currentHeight === previousHeight) break;

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise((resolve) => setTimeout(resolve, 1500));
      previousHeight = currentHeight;
    }

    // Collect vehicle detail page URLs from listing cards
    console.log("  Collecting vehicle detail page URLs...");
    const vehicleUrls = await page.evaluate(() => {
      const urls: string[] = [];

      // Find all listing cards
      const listings = document.querySelectorAll(
        '[class*="listing"], article, [data-testid*="listing"]',
      );

      listings.forEach((listing) => {
        try {
          const text = listing.textContent || "";

          // Skip new vehicles - only scrape USED
          if (text.match(/\bnew\b/i) && !text.match(/\bused\b/i)) {
            if (
              text.toLowerCase().includes("new vehicle") ||
              text.toLowerCase().includes("brand new")
            ) {
              return;
            }
          }

          // Extract listing ID from href
          // CarGurus uses hash-based routing: #listing=123456789/make/model
          const linkEl = listing.querySelector('a[href*="listing="]');
          if (linkEl) {
            const href = linkEl.getAttribute("href") || "";
            const listingMatch = href.match(/listing=(\d+)/);
            if (listingMatch) {
              const listingId = listingMatch[1];
              // Construct proper CarGurus detail page URL
              const fullUrl = `https://www.cargurus.ca/Cars/link/${listingId}`;
              if (!urls.includes(fullUrl)) {
                urls.push(fullUrl);
              }
            }
          }
        } catch (e) {
          // Skip this listing
        }
      });

      return urls;
    });

    console.log(`  Found ${vehicleUrls.length} USED vehicle listings`);

    // Visit each detail page to extract complete data
    console.log(`  Visiting detail pages to extract complete data...`);
    let successCount = 0;

    for (let i = 0; i < vehicleUrls.length; i++) {
      const url = vehicleUrls[i];
      console.log(
        `  [${i + 1}/${vehicleUrls.length}] Scraping ${url.split("/").pop()?.substring(0, 30)}...`,
      );

      try {
        // Create a new page for each detail scrape to avoid detached frame errors
        const detailPage = await browser.newPage();
        await detailPage.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        );

        const vehicle = await scrapeCarGurusVehicleDetail(
          detailPage,
          url,
          dealerName,
          dealershipId,
          location,
        );

        // Close the detail page to free resources
        await detailPage.close();

        if (vehicle) {
          vehicles.push(vehicle);
          successCount++;
        }

        // Small delay between requests to be polite
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`  ✗ Failed to scrape ${url}:`, error);
      }
    }

    console.log(
      `  ✓ Successfully scraped ${successCount}/${vehicleUrls.length} vehicles for ${dealerName}`,
    );
  } finally {
    await browser.close();
  }

  return vehicles;
}

export async function scrapeAllCarGurusDealers(): Promise<CarGurusVehicle[]> {
  console.log("\n========================================");
  console.log("CARGURUS SCRAPER (PRIMARY DATA SOURCE)");
  console.log("========================================\n");

  const allVehicles: CarGurusVehicle[] = [];

  // Get scrape sources from database (falls back to defaults if none configured)
  const dealerPages = await getScrapeSourcesFromDb();
  console.log(`  ℹ Found ${dealerPages.length} scrape sources`);

  for (const dealer of dealerPages) {
    try {
      console.log(`\nProcessing dealership: ${dealer.name}`);
      const dealerVehicles = await scrapeCarGurusDealerPage(
        dealer.url,
        dealer.name,
        dealer.dealershipId,
        dealer.location,
      );

      allVehicles.push(...dealerVehicles);

      // Update vehicle count for this source in database
      try {
        const sources = await storage.getAllActiveScrapeSources();
        const source = sources.find(s => s.sourceUrl === dealer.url);
        if (source) {
          await storage.updateScrapeSourceStats(source.id, dealerVehicles.length);
        }
      } catch (e) {
        // Ignore errors updating stats
      }

      // Delay between dealer pages
      await new Promise((resolve) => setTimeout(resolve, 3000));
    } catch (error) {
      console.error(`✗ Error scraping ${dealer.name}:`, error);
    }
  }

  console.log(
    `\n✓ Total vehicles scraped from CarGurus: ${allVehicles.length}`,
  );
  
  // Log per-dealership counts
  const dealershipCounts: Record<number, number> = {};
  for (const vehicle of allVehicles) {
    dealershipCounts[vehicle.dealershipId] = (dealershipCounts[vehicle.dealershipId] || 0) + 1;
  }
  for (const dealershipId of Object.keys(dealershipCounts)) {
    const id = parseInt(dealershipId);
    const count = dealershipCounts[id];
    const dealer = dealerPages.find(d => d.dealershipId === id);
    console.log(`  - ${dealer?.name || `Dealership ${id}`}: ${count} vehicles`);
  }

  return allVehicles;
}
