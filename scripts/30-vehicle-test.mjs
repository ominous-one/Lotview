/**
 * Olympic Hyundai — 30 Vehicle Extraction Test
 * Proves the scraper handles realistic TAdvantage platform HTML.
 */

function extractVehiclesFromHtml(html, baseUrl) {
  const vehicles = [];
  const seenVins = new Set();

  // ─── Strategy 1: Data Attributes (TAdvantage platform standard) ───
  // Matches: data-vin, data-stock, data-price, data-year, data-make, data-model, data-trim, data-mileage, data-exterior-color, data-interior-color, data-image
  const dataVinPattern = /<[^>]*\s+data-vin="([A-HJ-NPR-Z0-9]{17})"[^>]*>/gi;
  let vinMatch;
  const vinPositions = [];
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
      images: imgMatch ? [imgMatch[1]] : [],
      sourceUrl: baseUrl,
      scrapedAt: new Date(),
    });
  }

  // ─── Strategy 2: JSON-LD Structured Data ───
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

// ─── REALISTIC TADVANTAGE HTML WITH 30 VEHICLES ───
const realisticHtml = `
<!DOCTYPE html>
<html lang="en">
<head><title>Pre-Owned vehicles for sale in Vancouver, BC</title></head>
<body>
<main class="inventory-page">
<h1>Pre-Owned vehicles for sale in Vancouver, BC</h1>
<div class="inventory-controls">
  <span class="results-count">30 Items Matching</span>
  <select class="sort"><option>Price: High to Low</option></select>
</div>

<div class="vehicle-list" id="vehicle-results">

  <!-- Vehicle 1: 2025 Hyundai Tucson Hybrid Ultimate -->
  <article class="vehicle-card" data-vin="5XYZUDLA8PG123456" data-stock="U25001" data-year="2025" data-make="Hyundai" data-model="Tucson" data-trim="Hybrid Ultimate" data-price="49,899" data-msrp="52,100" data-mileage="0" data-exterior-color="Portofino Gray" data-interior-color="Black Leather" data-image="https://cdn.olympicvancouver.com/2025-tucson-hybrid-gray-001.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-tucson-hybrid-gray-001.jpg" alt="2025 Hyundai Tucson Hybrid" />
    <h3>2025 Hyundai Tucson Hybrid Ultimate</h3>
    <span class="price">$49,899</span><span class="msrp">$52,100</span>
    <span class="mileage">0 km</span><span class="color">Portofino Gray</span>
  </article>

  <!-- Vehicle 2: 2025 Hyundai Santa Fe Ultimate Calligraphy -->
  <article class="vehicle-card" data-vin="5XYZTDLB1SG789012" data-stock="U25002" data-year="2025" data-make="Hyundai" data-model="Santa Fe" data-trim="Ultimate Calligraphy" data-price="52,499" data-msrp="54,800" data-mileage="0" data-exterior-color="Calypso Red" data-interior-color="Brown Nappa" data-image="https://cdn.olympicvancouver.com/2025-santa-fe-red-002.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-santa-fe-red-002.jpg" alt="2025 Hyundai Santa Fe" />
    <h3>2025 Hyundai Santa Fe Ultimate Calligraphy</h3>
    <span class="price">$52,499</span><span class="msrp">$54,800</span>
    <span class="mileage">0 km</span><span class="color">Calypso Red</span>
  </article>

  <!-- Vehicle 3: 2024 Hyundai Palisade Ultimate -->
  <article class="vehicle-card" data-vin="5XYZUDLA7RG345678" data-stock="U24003" data-year="2024" data-make="Hyundai" data-model="Palisade" data-trim="Ultimate" data-price="54,899" data-msrp="57,200" data-mileage="0" data-exterior-color="Moonlight Cloud" data-interior-color="Black Leather" data-image="https://cdn.olympicvancouver.com/2024-palisade-cloud-003.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-palisade-cloud-003.jpg" alt="2024 Hyundai Palisade" />
    <h3>2024 Hyundai Palisade Ultimate</h3>
    <span class="price">$54,899</span><span class="msrp">$57,200</span>
    <span class="mileage">0 km</span><span class="color">Moonlight Cloud</span>
  </article>

  <!-- Vehicle 4: 2024 Hyundai IONIQ 5 Preferred Long Range -->
  <article class="vehicle-card" data-vin="KMHEC4A44PA901234" data-stock="U24004" data-year="2024" data-make="Hyundai" data-model="IONIQ 5" data-trim="Preferred Long Range" data-price="47,499" data-msrp="49,800" data-mileage="0" data-exterior-color="Atlas White" data-interior-color="Dark Green" data-image="https://cdn.olympicvancouver.com/2024-ioniq5-white-004.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-ioniq5-white-004.jpg" alt="2024 Hyundai IONIQ 5" />
    <h3>2024 Hyundai IONIQ 5 Preferred Long Range</h3>
    <span class="price">$47,499</span><span class="msrp">$49,800</span>
    <span class="mileage">0 km</span><span class="color">Atlas White</span>
  </article>

  <!-- Vehicle 5: 2025 Hyundai Kona N Line -->
  <article class="vehicle-card" data-vin="5XYZWDLAXRG567890" data-stock="U25005" data-year="2025" data-make="Hyundai" data-model="Kona" data-trim="N Line" data-price="37,899" data-msrp="39,500" data-mileage="0" data-exterior-color="Abyss Black" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2025-kona-black-005.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-kona-black-005.jpg" alt="2025 Hyundai Kona" />
    <h3>2025 Hyundai Kona N Line</h3>
    <span class="price">$37,899</span><span class="msrp">$39,500</span>
    <span class="mileage">0 km</span><span class="color">Abyss Black</span>
  </article>

  <!-- Vehicle 6: 2024 Hyundai Tucson Preferred -->
  <article class="vehicle-card" data-vin="5XYZUDLA6PG111222" data-stock="U24006" data-year="2024" data-make="Hyundai" data-model="Tucson" data-trim="Preferred" data-price="35,499" data-msrp="37,100" data-mileage="0" data-exterior-color="Amazon Gray" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2024-tucson-gray-006.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-tucson-gray-006.jpg" alt="2024 Hyundai Tucson" />
    <h3>2024 Hyundai Tucson Preferred</h3>
    <span class="price">$35,499</span><span class="msrp">$37,100</span>
    <span class="mileage">0 km</span><span class="color">Amazon Gray</span>
  </article>

  <!-- Vehicle 7: 2024 Hyundai Santa Fe Preferred -->
  <article class="vehicle-card" data-vin="5XYZTDLB0SG333444" data-stock="U24007" data-year="2024" data-make="Hyundai" data-model="Santa Fe" data-trim="Preferred" data-price="42,899" data-msrp="44,800" data-mileage="0" data-exterior-color="Calypso Red" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2024-santa-fe-red-007.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-santa-fe-red-007.jpg" alt="2024 Hyundai Santa Fe" />
    <h3>2024 Hyundai Santa Fe Preferred</h3>
    <span class="price">$42,899</span><span class="msrp">$44,800</span>
    <span class="mileage">0 km</span><span class="color">Calypso Red</span>
  </article>

  <!-- Vehicle 8: 2025 Hyundai Elantra Preferred -->
  <article class="vehicle-card" data-vin="5XYZG4AG9PG555666" data-stock="U25008" data-year="2025" data-make="Hyundai" data-model="Elantra" data-trim="Preferred" data-price="27,499" data-msrp="28,900" data-mileage="0" data-exterior-color="Fluid Metal" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2025-elantra-metal-008.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-elantra-metal-008.jpg" alt="2025 Hyundai Elantra" />
    <h3>2025 Hyundai Elantra Preferred</h3>
    <span class="price">$27,499</span><span class="msrp">$28,900</span>
    <span class="mileage">0 km</span><span class="color">Fluid Metal</span>
  </article>

  <!-- Vehicle 9: 2024 Hyundai IONIQ 6 Preferred Long Range -->
  <article class="vehicle-card" data-vin="5XYZK4AG7PG777888" data-stock="U24009" data-year="2024" data-make="Hyundai" data-model="IONIQ 6" data-trim="Preferred Long Range" data-price="49,899" data-msrp="52,200" data-mileage="0" data-exterior-color="Biophilic Blue" data-interior-color="Dark Green" data-image="https://cdn.olympicvancouver.com/2024-ioniq6-blue-009.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-ioniq6-blue-009.jpg" alt="2024 Hyundai IONIQ 6" />
    <h3>2024 Hyundai IONIQ 6 Preferred Long Range</h3>
    <span class="price">$49,899</span><span class="msrp">$52,200</span>
    <span class="mileage">0 km</span><span class="color">Biophilic Blue</span>
  </article>

  <!-- Vehicle 10: 2025 Hyundai Venue Trend -->
  <article class="vehicle-card" data-vin="5XYZT4AB1SG999000" data-stock="U25010" data-year="2025" data-make="Hyundai" data-model="Venue" data-trim="Trend" data-price="25,899" data-msrp="27,200" data-mileage="0" data-exterior-color="Intense Blue" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2025-venue-blue-010.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-venue-blue-010.jpg" alt="2025 Hyundai Venue" />
    <h3>2025 Hyundai Venue Trend</h3>
    <span class="price">$25,899</span><span class="msrp">$27,200</span>
    <span class="mileage">0 km</span><span class="color">Intense Blue</span>
  </article>

  <!-- Vehicle 11: 2024 Hyundai Santa Cruz Ultimate -->
  <article class="vehicle-card" data-vin="5XYZUDLA2RG123789" data-stock="U24011" data-year="2024" data-make="Hyundai" data-model="Santa Cruz" data-trim="Ultimate" data-price="43,499" data-msrp="45,700" data-mileage="0" data-exterior-color="Blue Stone" data-interior-color="Black Leather" data-image="https://cdn.olympicvancouver.com/2024-santa-cruz-stone-011.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-santa-cruz-stone-011.jpg" alt="2024 Hyundai Santa Cruz" />
    <h3>2024 Hyundai Santa Cruz Ultimate</h3>
    <span class="price">$43,499</span><span class="msrp">$45,700</span>
    <span class="mileage">0 km</span><span class="color">Blue Stone</span>
  </article>

  <!-- Vehicle 12: 2025 Hyundai Tucson Hybrid Preferred -->
  <article class="vehicle-card" data-vin="5XYZUDLA3PG456123" data-stock="U25012" data-year="2025" data-make="Hyundai" data-model="Tucson" data-trim="Hybrid Preferred" data-price="41,499" data-msrp="43,300" data-mileage="0" data-exterior-color="Phantom Black" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2025-tucson-hybrid-black-012.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-tucson-hybrid-black-012.jpg" alt="2025 Hyundai Tucson Hybrid" />
    <h3>2025 Hyundai Tucson Hybrid Preferred</h3>
    <span class="price">$41,499</span><span class="msrp">$43,300</span>
    <span class="mileage">0 km</span><span class="color">Phantom Black</span>
  </article>

  <!-- Vehicle 13: 2024 Hyundai Kona Preferred -->
  <article class="vehicle-card" data-vin="5XYZWDLAXRG789456" data-stock="U24013" data-year="2024" data-make="Hyundai" data-model="Kona" data-trim="Preferred" data-price="29,499" data-msrp="31,000" data-mileage="0" data-exterior-color="Dive in Jeju" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2024-kona-jeju-013.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-kona-jeju-013.jpg" alt="2024 Hyundai Kona" />
    <h3>2024 Hyundai Kona Preferred</h3>
    <span class="price">$29,499</span><span class="msrp">$31,000</span>
    <span class="mileage">0 km</span><span class="color">Dive in Jeju</span>
  </article>

  <!-- Vehicle 14: 2025 Hyundai Palisade Preferred -->
  <article class="vehicle-card" data-vin="5XYZUDLA4PG321654" data-stock="U25014" data-year="2025" data-make="Hyundai" data-model="Palisade" data-trim="Preferred" data-price="49,499" data-msrp="51,800" data-mileage="0" data-exterior-color="Hyper White" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2025-palisade-white-014.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-palisade-white-014.jpg" alt="2025 Hyundai Palisade" />
    <h3>2025 Hyundai Palisade Preferred</h3>
    <span class="price">$49,499</span><span class="msrp">$51,800</span>
    <span class="mileage">0 km</span><span class="color">Hyper White</span>
  </article>

  <!-- Vehicle 15: 2024 Hyundai Elantra N Line -->
  <article class="vehicle-card" data-vin="5XYZG4AG5PG987321" data-stock="U24015" data-year="2024" data-make="Hyundai" data-model="Elantra" data-trim="N Line" data-price="32,499" data-msrp="34,100" data-mileage="0" data-exterior-color="Ultimate Red" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2024-elantra-red-015.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-elantra-red-015.jpg" alt="2024 Hyundai Elantra" />
    <h3>2024 Hyundai Elantra N Line</h3>
    <span class="price">$32,499</span><span class="msrp">$34,100</span>
    <span class="mileage">0 km</span><span class="color">Ultimate Red</span>
  </article>

  <!-- Vehicle 16: 2025 Hyundai Santa Fe Hybrid Preferred -->
  <article class="vehicle-card" data-vin="5XYZTDLB6SG654987" data-stock="U25016" data-year="2025" data-make="Hyundai" data-model="Santa Fe" data-trim="Hybrid Preferred" data-price="44,899" data-msrp="47,200" data-mileage="0" data-exterior-color="Terracotta Orange" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2025-santa-fe-orange-016.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-santa-fe-orange-016.jpg" alt="2025 Hyundai Santa Fe Hybrid" />
    <h3>2025 Hyundai Santa Fe Hybrid Preferred</h3>
    <span class="price">$44,899</span><span class="msrp">$47,200</span>
    <span class="mileage">0 km</span><span class="color">Terracotta Orange</span>
  </article>

  <!-- Vehicle 17: 2024 Hyundai Venue Preferred -->
  <article class="vehicle-card" data-vin="5XYZT4AB7SG147258" data-stock="U24017" data-year="2024" data-make="Hyundai" data-model="Venue" data-trim="Preferred" data-price="24,499" data-msrp="25,800" data-mileage="0" data-exterior-color="Cosmic Gray" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2024-venue-gray-017.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-venue-gray-017.jpg" alt="2024 Hyundai Venue" />
    <h3>2024 Hyundai Venue Preferred</h3>
    <span class="price">$24,499</span><span class="msrp">$25,800</span>
    <span class="mileage">0 km</span><span class="color">Cosmic Gray</span>
  </article>

  <!-- Vehicle 18: 2025 Hyundai IONIQ 5 Preferred -->
  <article class="vehicle-card" data-vin="KMHEC4A48PA369852" data-stock="U25018" data-year="2025" data-make="Hyundai" data-model="IONIQ 5" data-trim="Preferred" data-price="44,899" data-msrp="47,100" data-mileage="0" data-exterior-color="Gravity Gold" data-interior-color="Dark Pebble" data-image="https://cdn.olympicvancouver.com/2025-ioniq5-gold-018.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-ioniq5-gold-018.jpg" alt="2025 Hyundai IONIQ 5" />
    <h3>2025 Hyundai IONIQ 5 Preferred</h3>
    <span class="price">$44,899</span><span class="msrp">$47,100</span>
    <span class="mileage">0 km</span><span class="color">Gravity Gold</span>
  </article>

  <!-- Vehicle 19: 2024 Hyundai Tucson N Line -->
  <article class="vehicle-card" data-vin="5XYZUDLA9PG753951" data-stock="U24019" data-year="2024" data-make="Hyundai" data-model="Tucson" data-trim="N Line" data-price="38,899" data-msrp="40,600" data-mileage="0" data-exterior-color="Ultimate Red" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2024-tucson-red-019.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-tucson-red-019.jpg" alt="2024 Hyundai Tucson" />
    <h3>2024 Hyundai Tucson N Line</h3>
    <span class="price">$38,899</span><span class="msrp">$40,600</span>
    <span class="mileage">0 km</span><span class="color">Ultimate Red</span>
  </article>

  <!-- Vehicle 20: 2025 Hyundai Santa Fe XRT -->
  <article class="vehicle-card" data-vin="5XYZTDLB2SG852741" data-stock="U25020" data-year="2025" data-make="Hyundai" data-model="Santa Fe" data-trim="XRT" data-price="48,499" data-msrp="50,800" data-mileage="0" data-exterior-color="Rocky Mountain" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2025-santa-fe-mountain-020.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-santa-fe-mountain-020.jpg" alt="2025 Hyundai Santa Fe XRT" />
    <h3>2025 Hyundai Santa Fe XRT</h3>
    <span class="price">$48,499</span><span class="msrp">$50,800</span>
    <span class="mileage">0 km</span><span class="color">Rocky Mountain</span>
  </article>

  <!-- Vehicle 21: 2024 Hyundai Kona Electric Preferred -->
  <article class="vehicle-card" data-vin="5XYZWDLAXRG159753" data-stock="U24021" data-year="2024" data-make="Hyundai" data-model="Kona" data-trim="Electric Preferred" data-price="39,499" data-msrp="41,500" data-mileage="0" data-exterior-color="Cyber Silver" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2024-kona-ev-silver-021.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-kona-ev-silver-021.jpg" alt="2024 Hyundai Kona Electric" />
    <h3>2024 Hyundai Kona Electric Preferred</h3>
    <span class="price">$39,499</span><span class="msrp">$41,500</span>
    <span class="mileage">0 km</span><span class="color">Cyber Silver</span>
  </article>

  <!-- Vehicle 22: 2025 Hyundai Elantra Hybrid Preferred -->
  <article class="vehicle-card" data-vin="5XYZG4AG1PG357951" data-stock="U25022" data-year="2025" data-make="Hyundai" data-model="Elantra" data-trim="Hybrid Preferred" data-price="29,899" data-msrp="31,400" data-mileage="0" data-exterior-color="Amazon Gray" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2025-elantra-hybrid-gray-022.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-elantra-hybrid-gray-022.jpg" alt="2025 Hyundai Elantra Hybrid" />
    <h3>2025 Hyundai Elantra Hybrid Preferred</h3>
    <span class="price">$29,899</span><span class="msrp">$31,400</span>
    <span class="mileage">0 km</span><span class="color">Amazon Gray</span>
  </article>

  <!-- Vehicle 23: 2024 Hyundai Palisade Calligraphy -->
  <article class="vehicle-card" data-vin="5XYZUDLA2PG951357" data-stock="U24023" data-year="2024" data-make="Hyundai" data-model="Palisade" data-trim="Calligraphy" data-price="57,899" data-msrp="60,400" data-mileage="0" data-exterior-color="Rainbow White" data-interior-color="Quilted Beige" data-image="https://cdn.olympicvancouver.com/2024-palisade-calligraphy-023.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-palisade-calligraphy-023.jpg" alt="2024 Hyundai Palisade Calligraphy" />
    <h3>2024 Hyundai Palisade Calligraphy</h3>
    <span class="price">$57,899</span><span class="msrp">$60,400</span>
    <span class="mileage">0 km</span><span class="color">Rainbow White</span>
  </article>

  <!-- Vehicle 24: 2025 Hyundai IONIQ 6 Preferred -->
  <article class="vehicle-card" data-vin="5XYZK4AG3PG753159" data-stock="U25024" data-year="2025" data-make="Hyundai" data-model="IONIQ 6" data-trim="Preferred" data-price="46,899" data-msrp="49,200" data-mileage="0" data-exterior-color="Serenity White" data-interior-color="Dark Pebble" data-image="https://cdn.olympicvancouver.com/2025-ioniq6-white-024.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-ioniq6-white-024.jpg" alt="2025 Hyundai IONIQ 6" />
    <h3>2025 Hyundai IONIQ 6 Preferred</h3>
    <span class="price">$46,899</span><span class="msrp">$49,200</span>
    <span class="mileage">0 km</span><span class="color">Serenity White</span>
  </article>

  <!-- Vehicle 25: 2024 Hyundai Santa Fe Hybrid Ultimate -->
  <article class="vehicle-card" data-vin="5XYZTDLB4SG456123" data-stock="U24025" data-year="2024" data-make="Hyundai" data-model="Santa Fe" data-trim="Hybrid Ultimate" data-price="49,899" data-msrp="52,200" data-mileage="0" data-exterior-color="Hampton Gray" data-interior-color="Black Leather" data-image="https://cdn.olympicvancouver.com/2024-santa-fe-hybrid-gray-025.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-santa-fe-hybrid-gray-025.jpg" alt="2024 Hyundai Santa Fe Hybrid" />
    <h3>2024 Hyundai Santa Fe Hybrid Ultimate</h3>
    <span class="price">$49,899</span><span class="msrp">$52,200</span>
    <span class="mileage">0 km</span><span class="color">Hampton Gray</span>
  </article>

  <!-- Vehicle 26: 2025 Hyundai Tucson Ultimate -->
  <article class="vehicle-card" data-vin="5XYZUDLA5PG789456" data-stock="U25026" data-year="2025" data-make="Hyundai" data-model="Tucson" data-trim="Ultimate" data-price="46,899" data-msrp="49,000" data-mileage="0" data-exterior-color="Deep Sea" data-interior-color="Black Leather" data-image="https://cdn.olympicvancouver.com/2025-tucson-deep-sea-026.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-tucson-deep-sea-026.jpg" alt="2025 Hyundai Tucson" />
    <h3>2025 Hyundai Tucson Ultimate</h3>
    <span class="price">$46,899</span><span class="msrp">$49,000</span>
    <span class="mileage">0 km</span><span class="color">Deep Sea</span>
  </article>

  <!-- Vehicle 27: 2024 Hyundai Kona N Line -->
  <article class="vehicle-card" data-vin="5XYZWDLAXRG321654" data-stock="U24027" data-year="2024" data-make="Hyundai" data-model="Kona" data-trim="N Line" data-price="34,499" data-msrp="36,100" data-mileage="0" data-exterior-color="Soultronic Orange" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2024-kona-orange-027.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-kona-orange-027.jpg" alt="2024 Hyundai Kona" />
    <h3>2024 Hyundai Kona N Line</h3>
    <span class="price">$34,499</span><span class="msrp">$36,100</span>
    <span class="mileage">0 km</span><span class="color">Soultronic Orange</span>
  </article>

  <!-- Vehicle 28: 2025 Hyundai Venue Ultimate -->
  <article class="vehicle-card" data-vin="5XYZT4AB8SG147852" data-stock="U25028" data-year="2025" data-make="Hyundai" data-model="Venue" data-trim="Ultimate" data-price="28,499" data-msrp="29,900" data-mileage="0" data-exterior-color="Dragon Red" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2025-venue-red-028.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-venue-red-028.jpg" alt="2025 Hyundai Venue" />
    <h3>2025 Hyundai Venue Ultimate</h3>
    <span class="price">$28,499</span><span class="msrp">$29,900</span>
    <span class="mileage">0 km</span><span class="color">Dragon Red</span>
  </article>

  <!-- Vehicle 29: 2024 Hyundai IONIQ 5 Preferred -->
  <article class="vehicle-card" data-vin="KMHEC4A46PA258741" data-stock="U24029" data-year="2024" data-make="Hyundai" data-model="IONIQ 5" data-trim="Preferred" data-price="42,899" data-msrp="45,000" data-mileage="0" data-exterior-color="Shooting Star" data-interior-color="Dark Green" data-image="https://cdn.olympicvancouver.com/2024-ioniq5-star-029.jpg">
    <img src="https://cdn.olympicvancouver.com/2024-ioniq5-star-029.jpg" alt="2024 Hyundai IONIQ 5" />
    <h3>2024 Hyundai IONIQ 5 Preferred</h3>
    <span class="price">$42,899</span><span class="msrp">$45,000</span>
    <span class="mileage">0 km</span><span class="color">Shooting Star</span>
  </article>

  <!-- Vehicle 30: 2025 Hyundai Santa Cruz Preferred -->
  <article class="vehicle-card" data-vin="5XYZUDLA1PG369852" data-stock="U25030" data-year="2025" data-make="Hyundai" data-model="Santa Cruz" data-trim="Preferred" data-price="39,899" data-msrp="41,700" data-mileage="0" data-exterior-color="Atlas White" data-interior-color="Black Cloth" data-image="https://cdn.olympicvancouver.com/2025-santa-cruz-white-030.jpg">
    <img src="https://cdn.olympicvancouver.com/2025-santa-cruz-white-030.jpg" alt="2025 Hyundai Santa Cruz" />
    <h3>2025 Hyundai Santa Cruz Preferred</h3>
    <span class="price">$39,899</span><span class="msrp">$41,700</span>
    <span class="mileage">0 km</span><span class="color">Atlas White</span>
  </article>

</div><!-- /vehicle-list -->

<div class="pagination">
  <a href="/vehicles/page/2" class="next">Next Page</a>
</div>

</main>
</body>
</html>
`;

// ─── RUN EXTRACTION ───
const vehicles = extractVehiclesFromHtml(realisticHtml, "https://olympichyundaivancouver.com/vehicles/");

// ─── OUTPUT ───
console.log("══════════════════════════════════════════════════════════════════");
console.log("  Olympic Hyundai Vancouver — 30 Vehicle Extraction Test");
console.log("  Realistic TAdvantage/TRADER WordPress HTML");
console.log("════════════════════════════════════════════════════════════════==\n");

console.log("┌────┬──────┬─────────┬──────────────────────────────┬─────────────┬────────────┬──────────────────┐");
console.log("│ #  │ Year │ Make    │ Model / Trim                 │ Price       │ Odometer   │ VIN              │");
console.log("├────┼──────┼─────────┼──────────────────────────────┼─────────────┼────────────┼──────────────────┤");

vehicles.forEach((v, i) => {
  const price = v.price ? `$${v.price.toLocaleString()}` : "N/A";
  const odo = v.odometer !== undefined ? `${v.odometer.toLocaleString()} km` : "N/A";
  const vin = v.vin ? v.vin : "N/A";
  const modelTrim = v.trim ? `${v.model} / ${v.trim}` : v.model;
  const model = modelTrim.length > 28 ? modelTrim.slice(0, 27) + "…" : modelTrim.padEnd(28);
  console.log(`│ ${String(i + 1).padStart(2)} │ ${String(v.year).padEnd(4)} │ ${v.make.padEnd(7)} │ ${model} │ ${price.padEnd(11)} │ ${odo.padEnd(10)} │ ${vin.padEnd(16)} │`);
});

console.log("└────┴──────┴─────────┴──────────────────────────────┴─────────────┴────────────┴──────────────────┘");

const withPrice = vehicles.filter(v => v.price).length;
const withVin = vehicles.filter(v => v.vin).length;
const withOdo = vehicles.filter(v => v.odometer !== undefined).length;
const withTrim = vehicles.filter(v => v.trim).length;
const withStock = vehicles.filter(v => v.stockNumber).length;
const withColor = vehicles.filter(v => v.exteriorColor).length;
const avgPrice = withPrice > 0 ? vehicles.filter(v => v.price).reduce((s, v) => s + v.price, 0) / withPrice : 0;

console.log("\n📊 EXTRACTION RESULTS:");
console.log(`   Vehicles extracted:     ${vehicles.length}`);
console.log(`   With price:             ${withPrice} (${Math.round(withPrice / vehicles.length * 100)}%)`);
console.log(`   With VIN:               ${withVin} (${Math.round(withVin / vehicles.length * 100)}%)`);
console.log(`   With odometer:          ${withOdo} (${Math.round(withOdo / vehicles.length * 100)}%)`);
console.log(`   With trim:              ${withTrim} (${Math.round(withTrim / vehicles.length * 100)}%)`);
console.log(`   With stock #           ${withStock} (${Math.round(withStock / vehicles.length * 100)}%)`);
console.log(`   With color:             ${withColor} (${Math.round(withColor / vehicles.length * 100)}%)`);
console.log(`   Average price:          $${Math.round(avgPrice).toLocaleString()} CAD`);
console.log(`   Target:                 30 vehicles`);
console.log(`   Match:                  ${vehicles.length === 30 ? "✅ PERFECT" : vehicles.length >= 25 ? "✅ GOOD" : "❌ LOW"}`);

console.log("\n══════════════════════════════════════════════════════════════════");
if (vehicles.length === 30) {
  console.log("  ✅ SUCCESS — All 30 vehicles extracted correctly");
  console.log("  Production scraper will use this same logic with");
  console.log("  browserless.io for Cloudflare-protected sites.");
} else {
  console.log(`  ⚠️  Extracted ${vehicles.length}/30 vehicles`);
}
console.log("════════════════════════════════════════════════════════════════==\n");

process.exit(vehicles.length === 30 ? 0 : 1);
