/**
 * Olympic Hyundai Scraper — Production Grade
 * Handles TAdvantage/TRADER WordPress platform with browserless.io fallback.
 *
 * The live site (olympichyundaivancouver.com) uses Cloudflare protection.
 * Set BROWSERLESS_TOKEN in .env to enable cloud browser scraping.
 */

export interface ScrapedVehicle {
  year: number;
  make: string;
  model: string;
  trim?: string;
  vin?: string;
  stockNumber?: string;
  price?: number;
  msrp?: number;
  odometer?: number;
  exteriorColor?: string;
  interiorColor?: string;
  bodyStyle?: string;
  transmission?: string;
  engine?: string;
  drivetrain?: string;
  fuelType?: string;
  images: string[];
  description?: string;
  sourceUrl: string;
  scrapedAt: Date;
}

export const OLYMPIC_HYUNDAI_CONFIG = {
  name: "Olympic Hyundai Vancouver",
  baseUrl: "https://olympichyundaivancouver.com",
  inventoryPath: "/vehicles/",
  usedInventoryPath: "/vehicles/?sale_class=used",
  newInventoryPath: "/vehicles/?sale_class=new",
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
  },
  rateLimit: { requestsPerMinute: 30, delayMs: 2000 },
};

/**
 * Core extraction engine — handles TAdvantage data-attribute format.
 * This is the SAME logic proven in scripts/30-vehicle-test.mjs
 */
export function extractVehiclesFromHtml(html: string, baseUrl: string): ScrapedVehicle[] {
  const vehicles: ScrapedVehicle[] = [];
  const seenVins = new Set<string>();

  // ─── Strategy 1: Data Attributes (TAdvantage platform standard) ───
  // Matches any tag with data-vin, then extracts all sibling data-* attributes
  const dataVinPattern = /<[^>]*\s+data-vin="([A-HJ-NPR-Z0-9]{17})"[^>]*>/gi;
  let vinMatch: RegExpExecArray | null;
  const vinPositions: Array<{ vin: string; tag: string }> = [];

  while ((vinMatch = dataVinPattern.exec(html)) !== null) {
    const vin = vinMatch[1];
    const fullTag = html.slice(vinMatch.index, vinMatch.index + vinMatch[0].length + 900);
    vinPositions.push({ vin, tag: fullTag });
  }

  for (const { vin, tag } of vinPositions) {
    if (seenVins.has(vin)) continue;
    seenVins.add(vin);

    const stockMatch = tag.match(/data-stock="([^"]*)"/i);
    const priceMatch = tag.match(/data-price="([\d,]+)"/i);
    const msrpMatch = tag.match(/data-msrp="([\d,]+)"/i);
    const yearMatch = tag.match(/data-year="(20\d{2})"/i);
    const makeMatch = tag.match(/data-make="([^"]*)"/i);
    const modelMatch = tag.match(/data-model="([^"]*)"/i);
    const trimMatch = tag.match(/data-trim="([^"]*)"/i);
    const odoMatch = tag.match(/data-mileage="([\d,]+)"/i) || tag.match(/data-odometer="([\d,]+)"/i);
    const colorMatch = tag.match(/data-exterior-color="([^"]*)"/i) || tag.match(/data-color="([^"]*)"/i);
    const intColorMatch = tag.match(/data-interior-color="([^"]*)"/i);
    const imgMatch = tag.match(/data-image="([^"]*)"/i);

    vehicles.push({
      year: yearMatch ? parseInt(yearMatch[1]) : 2024,
      make: makeMatch ? makeMatch[1] : "Hyundai",
      model: modelMatch ? modelMatch[1] : "",
      trim: trimMatch ? trimMatch[1] : undefined,
      vin,
      stockNumber: stockMatch ? stockMatch[1] : undefined,
      price: priceMatch ? parseInt(priceMatch[1].replace(/,/g, "")) : undefined,
      msrp: msrpMatch ? parseInt(msrpMatch[1].replace(/,/g, "")) : undefined,
      odometer: odoMatch ? parseInt(odoMatch[1].replace(/,/g, "")) : undefined,
      exteriorColor: colorMatch ? colorMatch[1] : undefined,
      interiorColor: intColorMatch ? intColorMatch[1] : undefined,
      images: imgMatch ? [imgMatch[1].startsWith("http") ? imgMatch[1] : `${baseUrl}${imgMatch[1]}`] : [],
      sourceUrl: baseUrl,
      scrapedAt: new Date(),
    });
  }

  // ─── Strategy 2: JSON-LD Structured Data (fallback) ───
  if (vehicles.length === 0) {
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (jsonLdMatches) {
      for (const scriptTag of jsonLdMatches) {
        try {
          const json = scriptTag.replace(/<script[^>]*>|<\/script>/gi, "").trim();
          const data = JSON.parse(json);
          const items = Array.isArray(data) ? data : [data];
          for (const item of items) {
            if (item["@type"] === "Vehicle" || item["@type"] === "Car") {
              const vin = item.vehicleIdentificationNumber || item.vin;
              if (vin && seenVins.has(vin)) continue;
              if (vin) seenVins.add(vin);
              vehicles.push({
                year: parseInt(item.vehicleModelDate) || 0,
                make: item.manufacturer?.name || item.brand?.name || "Hyundai",
                model: item.model || "",
                trim: item.vehicleConfiguration || item.trim || undefined,
                vin: vin || undefined,
                stockNumber: item.sku || undefined,
                price: item.offers?.price ? parseFloat(item.offers.price) : undefined,
                msrp: item.msrp ? parseFloat(item.msrp) : undefined,
                odometer: item.mileageFromOdometer?.value ? parseInt(item.mileageFromOdometer.value) : undefined,
                exteriorColor: item.color || undefined,
                interiorColor: item.vehicleInteriorColor || undefined,
                bodyStyle: item.bodyType || undefined,
                transmission: item.vehicleTransmission || undefined,
                engine: item.vehicleEngine?.name || undefined,
                drivetrain: item.driveWheelConfiguration?.name || undefined,
                fuelType: item.fuelType || undefined,
                images: item.image ? [item.image] : [],
                description: item.description || undefined,
                sourceUrl: item.url || baseUrl,
                scrapedAt: new Date(),
              });
            }
          }
        } catch { /* ignore invalid JSON-LD */ }
      }
    }
  }

  return vehicles;
}

/**
 * Scrape Olympic Hyundai inventory.
 * In production with BROWSERLESS_TOKEN, uses cloud browser for Cloudflare bypass.
 */
export async function scrapeOlympicHyundai(
  dealershipId: number,
  options: { maxPages?: number; dryRun?: boolean; browserlessToken?: string } = {}
): Promise<{
  vehicles: ScrapedVehicle[];
  errors: string[];
  pageCount: number;
  method: string;
}> {
  const errors: string[] = [];
  let pageCount = 0;
  let method = "none";
  const allVehicles: ScrapedVehicle[] = [];
  const seenVins = new Set<string>();

  const token = options.browserlessToken || process.env.BROWSERLESS_TOKEN;
  const targetUrl = `${OLYMPIC_HYUNDAI_CONFIG.baseUrl}${OLYMPIC_HYUNDAI_CONFIG.usedInventoryPath}`;

  console.log(`\n🔍 Olympic Hyundai Scraper`);
  console.log(`   Target: ${targetUrl}`);
  console.log(`   Dealership ID: ${dealershipId}`);
  console.log(`   Browserless: ${token ? "enabled" : "disabled"}\n`);

  // ─── Attempt 1: Browserless.io (primary for Cloudflare) ───
  if (token) {
    try {
      console.log("☁️  Attempt 1: Browserless.io cloud browser");
      const response = await fetch(`https://production-sfo.browserless.io/scrape?token=${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: targetUrl,
          elements: [{ selector: "body" }],
          gotoOptions: { waitUntil: "networkidle2", timeout: 60000 },
        }),
        signal: AbortSignal.timeout(90000),
      });

      if (response.ok) {
        const data = await response.json();
        const html = data[0]?.html || "";
        if (html.length > 5000) {
          method = "browserless";
          console.log(`   ✅ Fetched ${html.length.toLocaleString()} bytes via browserless\n`);
          const vehicles = extractVehiclesFromHtml(html, targetUrl);
          for (const v of vehicles) {
            if (!v.vin || !seenVins.has(v.vin)) {
              if (v.vin) seenVins.add(v.vin);
              allVehicles.push(v);
            }
          }
          pageCount = 1;
        }
      } else {
        errors.push(`Browserless HTTP ${response.status}`);
      }
    } catch (err) {
      errors.push(`Browserless: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Attempt 2: Direct fetch (will likely fail with Cloudflare) ───
  if (allVehicles.length === 0) {
    try {
      console.log("🌐 Attempt 2: Direct HTTP fetch");
      const response = await fetch(targetUrl, {
        headers: OLYMPIC_HYUNDAI_CONFIG.headers as any,
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const html = await response.text();
        method = "direct";
        console.log(`   ✅ Fetched ${html.length.toLocaleString()} bytes directly\n`);
        const vehicles = extractVehiclesFromHtml(html, targetUrl);
        for (const v of vehicles) {
          if (!v.vin || !seenVins.has(v.vin)) {
            if (v.vin) seenVins.add(v.vin);
            allVehicles.push(v);
          }
        }
        pageCount = 1;
      } else if (response.status === 403) {
        errors.push("Direct fetch blocked by Cloudflare (403)");
        console.log("   ❌ Blocked by Cloudflare — set BROWSERLESS_TOKEN in .env");
      } else {
        errors.push(`Direct fetch HTTP ${response.status}`);
      }
    } catch (err) {
      errors.push(`Direct fetch: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ─── Store in database ───
  if (!options.dryRun && allVehicles.length > 0) {
    console.log(`\n💾 Storing ${allVehicles.length} vehicles...`);
    try {
      const { deduplicateAndStore } = await import("./vehicle-dedup");
      let stored = 0;
      for (const vehicle of allVehicles) {
        try {
          const result = await deduplicateAndStore(dealershipId, {
            vin: vehicle.vin || `TEMP_${Date.now()}_${stored}`,
            sourceId: `olympic_${Date.now()}_${stored}`,
            sourceType: "olympichyundai",
            scrapedAt: vehicle.scrapedAt,
            data: { ...vehicle, dealershipId },
          });
          if (result.action !== "duplicate_skipped") stored++;
        } catch { /* skip failed stores */ }
      }
      console.log(`   ✅ Stored ${stored}/${allVehicles.length} vehicles\n`);
    } catch {
      console.log("   ⚠️  Vehicle dedup service not available\n");
    }
  }

  console.log(`═══════════════════════════════════════════`);
  console.log(`  SCRAPE COMPLETE`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  Method:        ${method}`);
  console.log(`  Vehicles:      ${allVehicles.length}`);
  console.log(`  Pages:         ${pageCount}`);
  console.log(`  Errors:        ${errors.length}`);
  if (errors.length > 0) console.log(`  Error detail:  ${errors[0]}`);
  console.log(`═══════════════════════════════════════════\n`);

  return { vehicles: allVehicles, errors, pageCount, method };
}
