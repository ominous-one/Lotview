import { DealerVehicleListing } from './dealer-listing-scraper';

interface CarGurusVehicle {
  vin?: string;
  year: number;
  make: string;
  model: string;
  odometer: number;
  price: number;
  dealershipId: number;
  stockNumber?: string;
}

interface MatchResult {
  matched: boolean;
  dealerVdpUrl: string | null;
  matchType: 'vin' | 'vehicle_details' | 'no_match';
  confidence: 'high' | 'medium' | 'low' | 'none';
  details: string;
}

function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
}

function normalizeMake(make: string): string {
  const normalized = normalizeString(make);
  
  // Handle common variations
  const makeMap: Record<string, string> = {
    'mercedesbenz': 'mercedes',
    'mercedes': 'mercedes',
    'landrover': 'rover',
    'range': 'rover',
    'gmc': 'gmc',
    'chevrolet': 'chevy',
    'chevy': 'chevy',
  };
  
  return makeMap[normalized] || normalized;
}

function normalizeModel(model: string): string {
  const normalized = normalizeString(model);
  
  // Remove common suffixes that might differ
  return normalized
    .replace(/hybrid/g, '')
    .replace(/electric/g, '')
    .replace(/awd/g, '')
    .replace(/fwd/g, '')
    .replace(/4wd/g, '')
    .replace(/premium/g, '')
    .trim();
}

export function matchCarGurusToDealer(
  cgVehicle: CarGurusVehicle,
  dealerListings: DealerVehicleListing[]
): MatchResult {
  
  // Filter dealer listings to same dealership
  const sameDealershipListings = dealerListings.filter(
    d => d.dealershipId === cgVehicle.dealershipId
  );
  
  if (sameDealershipListings.length === 0) {
    return {
      matched: false,
      dealerVdpUrl: null,
      matchType: 'no_match',
      confidence: 'none',
      details: 'No dealer listings found for this dealership',
    };
  }
  
  // STRATEGY 1: VIN Matching (100% confidence)
  if (cgVehicle.vin) {
    const vinNormalized = normalizeString(cgVehicle.vin);
    
    for (const listing of sameDealershipListings) {
      if (listing.vin) {
        const listingVinNormalized = normalizeString(listing.vin);
        
        if (vinNormalized === listingVinNormalized) {
          // Validate price proximity (should be within $1000)
          const priceDiff = listing.price && cgVehicle.price 
            ? Math.abs(listing.price - cgVehicle.price)
            : 0;
          
          if (listing.price && priceDiff > 1000) {
            console.log(`  ⚠ VIN match but price mismatch: CG=$${cgVehicle.price} Dealer=$${listing.price} (diff=$${priceDiff})`);
          }
          
          return {
            matched: true,
            dealerVdpUrl: listing.vdpUrl,
            matchType: 'vin',
            confidence: 'high',
            details: `VIN matched: ${cgVehicle.vin}`,
          };
        }
      }
    }
  }
  
  // STRATEGY 2: Year + Make + Model + Odometer Matching
  const cgMakeNorm = normalizeMake(cgVehicle.make);
  const cgModelNorm = normalizeModel(cgVehicle.model);
  
  const candidates: Array<{ listing: DealerVehicleListing; score: number }> = [];
  
  for (const listing of sameDealershipListings) {
    if (!listing.year || !listing.make || !listing.model) continue;
    
    let score = 0;
    
    // Year match (required)
    if (listing.year !== cgVehicle.year) continue;
    score += 25;
    
    // Make match (required)
    const listingMakeNorm = normalizeMake(listing.make);
    if (listingMakeNorm !== cgMakeNorm) continue;
    score += 25;
    
    // Model match (required)
    const listingModelNorm = normalizeModel(listing.model);
    if (!listingModelNorm.includes(cgModelNorm) && !cgModelNorm.includes(listingModelNorm)) {
      continue;
    }
    score += 25;
    
    // Odometer proximity (within 5000km = bonus points)
    if (listing.odometer && cgVehicle.odometer) {
      const kmDiff = Math.abs(listing.odometer - cgVehicle.odometer);
      if (kmDiff <= 1000) score += 15;
      else if (kmDiff <= 5000) score += 10;
      else if (kmDiff <= 10000) score += 5;
      else continue; // Too far apart
    }
    
    // Price proximity (within $1000 = bonus, within $3000 = acceptable)
    if (listing.price && cgVehicle.price) {
      const priceDiff = Math.abs(listing.price - cgVehicle.price);
      if (priceDiff <= 1000) score += 10;
      else if (priceDiff <= 3000) score += 5;
      else continue; // Prices too different
    }
    
    candidates.push({ listing, score });
  }
  
  // Sort by highest score
  candidates.sort((a, b) => b.score - a.score);
  
  if (candidates.length > 0) {
    const best = candidates[0];
    
    // Require minimum score of 75 for high confidence, 60 for medium
    const confidence = best.score >= 75 ? 'high' : best.score >= 60 ? 'medium' : 'low';
    
    if (best.score >= 60) {
      return {
        matched: true,
        dealerVdpUrl: best.listing.vdpUrl,
        matchType: 'vehicle_details',
        confidence,
        details: `Matched by year/make/model/odometer (score: ${best.score})`,
      };
    }
  }
  
  // No match found
  return {
    matched: false,
    dealerVdpUrl: null,
    matchType: 'no_match',
    confidence: 'none',
    details: `No match found for ${cgVehicle.year} ${cgVehicle.make} ${cgVehicle.model}`,
  };
}

export function matchMultipleVehicles(
  cgVehicles: CarGurusVehicle[],
  dealerListings: DealerVehicleListing[]
): Map<string, MatchResult> {
  const results = new Map<string, MatchResult>();
  
  let matchedCount = 0;
  let highConfidence = 0;
  let mediumConfidence = 0;
  let lowConfidence = 0;
  
  for (const vehicle of cgVehicles) {
    const key = `${vehicle.dealershipId}-${vehicle.vin || vehicle.stockNumber}`;
    const match = matchCarGurusToDealer(vehicle, dealerListings);
    
    results.set(key, match);
    
    if (match.matched) {
      matchedCount++;
      if (match.confidence === 'high') highConfidence++;
      else if (match.confidence === 'medium') mediumConfidence++;
      else if (match.confidence === 'low') lowConfidence++;
    }
  }
  
  console.log(`\n=== MATCHING SUMMARY ===`);
  console.log(`Total CarGurus vehicles: ${cgVehicles.length}`);
  console.log(`Total dealer listings: ${dealerListings.length}`);
  console.log(`Matched: ${matchedCount} (${Math.round(matchedCount / cgVehicles.length * 100)}%)`);
  console.log(`  - High confidence: ${highConfidence}`);
  console.log(`  - Medium confidence: ${mediumConfidence}`);
  console.log(`  - Low confidence: ${lowConfidence}`);
  console.log(`Unmatched: ${cgVehicles.length - matchedCount}\n`);
  
  return results;
}
