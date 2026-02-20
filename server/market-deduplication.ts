import type { InsertMarketListing, MarketListing } from "@shared/schema";
import { generateVehicleHash } from "./cargurus-scraper-service";

export interface DeduplicationResult {
  uniqueListings: InsertMarketListing[];
  duplicatesRemoved: number;
  mergedRecords: number;
  duplicateDetails: Array<{
    primaryUrl: string;
    duplicateUrl: string;
    matchType: 'vin' | 'hash' | 'fuzzy';
  }>;
}

export interface DuplicateMatch {
  existing: InsertMarketListing;
  duplicate: InsertMarketListing;
  matchType: 'vin' | 'hash' | 'fuzzy';
  confidence: number;
}

function normalizeString(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function getSourcePriority(source: string): number {
  const priorities: Record<string, number> = {
    'marketcheck': 1,
    'cargurus': 2,
    'apify': 3,
    'autotrader_scraper': 4,
    'kijiji': 5,
    'craigslist': 6
  };
  return priorities[source] || 99;
}

function calculateFuzzyMatchScore(a: InsertMarketListing, b: InsertMarketListing): number {
  let score = 0;
  
  if (a.make && b.make && normalizeString(a.make) === normalizeString(b.make)) score += 20;
  if (a.model && b.model && normalizeString(a.model) === normalizeString(b.model)) score += 20;
  if (a.year === b.year) score += 15;
  if (a.trim && b.trim && normalizeString(a.trim) === normalizeString(b.trim)) score += 10;
  
  if (a.price && b.price) {
    const priceDiff = Math.abs(a.price - b.price);
    const pricePercent = priceDiff / Math.max(a.price, b.price);
    if (pricePercent < 0.02) score += 15;
    else if (pricePercent < 0.05) score += 10;
    else if (pricePercent < 0.10) score += 5;
  }
  
  if (a.mileage && b.mileage) {
    const mileageDiff = Math.abs(a.mileage - b.mileage);
    if (mileageDiff < 500) score += 10;
    else if (mileageDiff < 2000) score += 5;
  }
  
  if (a.sellerName && b.sellerName) {
    const sellerA = normalizeString(a.sellerName);
    const sellerB = normalizeString(b.sellerName);
    if (sellerA === sellerB) score += 10;
    else if (sellerA.includes(sellerB) || sellerB.includes(sellerA)) score += 5;
  }
  
  return score;
}

export function mergeListings(primary: InsertMarketListing, secondary: InsertMarketListing): InsertMarketListing {
  const merged = { ...primary };
  
  if (!merged.vin && secondary.vin) merged.vin = secondary.vin;
  if (!merged.interiorColor && secondary.interiorColor) merged.interiorColor = secondary.interiorColor;
  if (!merged.exteriorColor && secondary.exteriorColor) merged.exteriorColor = secondary.exteriorColor;
  if (!merged.imageUrl && secondary.imageUrl) merged.imageUrl = secondary.imageUrl;
  if (!merged.trim && secondary.trim) merged.trim = secondary.trim;
  if (!merged.mileage && secondary.mileage) merged.mileage = secondary.mileage;
  if (!merged.sellerName && secondary.sellerName) merged.sellerName = secondary.sellerName;
  if (!merged.location && secondary.location) merged.location = secondary.location;
  if (!merged.postalCode && secondary.postalCode) merged.postalCode = secondary.postalCode;
  if (!merged.latitude && secondary.latitude) merged.latitude = secondary.latitude;
  if (!merged.longitude && secondary.longitude) merged.longitude = secondary.longitude;
  if (!merged.postedDate && secondary.postedDate) merged.postedDate = secondary.postedDate;
  
  if (!merged.specsJson && secondary.specsJson) merged.specsJson = secondary.specsJson;
  if (!merged.featuresJson && secondary.featuresJson) merged.featuresJson = secondary.featuresJson;
  if (!merged.historyBadges && secondary.historyBadges) merged.historyBadges = secondary.historyBadges;
  if (!merged.dealerRating && secondary.dealerRating) merged.dealerRating = secondary.dealerRating;
  if (!merged.marketAvailabilityCount && secondary.marketAvailabilityCount) {
    merged.marketAvailabilityCount = secondary.marketAvailabilityCount;
  }
  
  const primaryConfidence = merged.sourceConfidence || 0;
  const secondaryConfidence = secondary.sourceConfidence || 0;
  merged.sourceConfidence = Math.max(primaryConfidence, secondaryConfidence);
  
  return merged;
}

export function selectBestListing(a: InsertMarketListing, b: InsertMarketListing): InsertMarketListing {
  const aPriority = getSourcePriority(a.source);
  const bPriority = getSourcePriority(b.source);
  
  if (aPriority !== bPriority) {
    return aPriority < bPriority ? mergeListings(a, b) : mergeListings(b, a);
  }
  
  const aConfidence = a.sourceConfidence || 0;
  const bConfidence = b.sourceConfidence || 0;
  
  if (aConfidence !== bConfidence) {
    return aConfidence > bConfidence ? mergeListings(a, b) : mergeListings(b, a);
  }
  
  return mergeListings(a, b);
}

export function deduplicateListings(listings: InsertMarketListing[]): DeduplicationResult {
  const result: DeduplicationResult = {
    uniqueListings: [],
    duplicatesRemoved: 0,
    mergedRecords: 0,
    duplicateDetails: []
  };
  
  if (listings.length === 0) return result;
  
  const vinIndex = new Map<string, number>();
  const hashIndex = new Map<string, number>();
  const urlIndex = new Set<string>();
  const uniqueListings: InsertMarketListing[] = [];
  
  const sortedListings = [...listings].sort((a, b) => {
    const aPriority = getSourcePriority(a.source);
    const bPriority = getSourcePriority(b.source);
    if (aPriority !== bPriority) return aPriority - bPriority;
    
    const aConf = a.sourceConfidence || 0;
    const bConf = b.sourceConfidence || 0;
    return bConf - aConf;
  });
  
  for (const listing of sortedListings) {
    if (urlIndex.has(listing.listingUrl)) {
      result.duplicatesRemoved++;
      continue;
    }
    
    let existingIndex: number | undefined;
    let matchType: 'vin' | 'hash' | 'fuzzy' | undefined;
    
    if (listing.vin && vinIndex.has(listing.vin)) {
      existingIndex = vinIndex.get(listing.vin);
      matchType = 'vin';
    }
    
    if (existingIndex === undefined) {
      const hash = listing.vehicleHash || generateVehicleHash({
        make: listing.make,
        model: listing.model,
        year: listing.year,
        trim: listing.trim,
        sellerName: listing.sellerName,
        mileage: listing.mileage
      });
      listing.vehicleHash = hash;
      
      if (hashIndex.has(hash)) {
        existingIndex = hashIndex.get(hash);
        matchType = 'hash';
      }
    }
    
    if (existingIndex === undefined) {
      for (let i = 0; i < uniqueListings.length; i++) {
        const existing = uniqueListings[i];
        const fuzzyScore = calculateFuzzyMatchScore(listing, existing);
        
        if (fuzzyScore >= 70) {
          existingIndex = i;
          matchType = 'fuzzy';
          break;
        }
      }
    }
    
    if (existingIndex !== undefined && matchType) {
      const existing = uniqueListings[existingIndex];
      const merged = selectBestListing(existing, listing);
      uniqueListings[existingIndex] = merged;
      
      result.duplicatesRemoved++;
      result.mergedRecords++;
      result.duplicateDetails.push({
        primaryUrl: existing.listingUrl,
        duplicateUrl: listing.listingUrl,
        matchType
      });
    } else {
      const index = uniqueListings.length;
      uniqueListings.push(listing);
      
      urlIndex.add(listing.listingUrl);
      
      if (listing.vin) {
        vinIndex.set(listing.vin, index);
      }
      
      const hash = listing.vehicleHash || generateVehicleHash({
        make: listing.make,
        model: listing.model,
        year: listing.year,
        trim: listing.trim,
        sellerName: listing.sellerName,
        mileage: listing.mileage
      });
      hashIndex.set(hash, index);
    }
  }
  
  result.uniqueListings = uniqueListings;
  return result;
}

export function findDuplicatesInDatabase(
  newListings: InsertMarketListing[],
  existingListings: MarketListing[]
): Map<number, InsertMarketListing> {
  const updates = new Map<number, InsertMarketListing>();
  
  const vinToExisting = new Map<string, MarketListing>();
  const hashToExisting = new Map<string, MarketListing>();
  
  for (const existing of existingListings) {
    if (existing.vin) vinToExisting.set(existing.vin, existing);
    if (existing.vehicleHash) hashToExisting.set(existing.vehicleHash, existing);
  }
  
  for (const newListing of newListings) {
    let matchedExisting: MarketListing | undefined;
    
    if (newListing.vin && vinToExisting.has(newListing.vin)) {
      matchedExisting = vinToExisting.get(newListing.vin);
    }
    
    if (!matchedExisting && newListing.vehicleHash && hashToExisting.has(newListing.vehicleHash)) {
      matchedExisting = hashToExisting.get(newListing.vehicleHash);
    }
    
    if (matchedExisting) {
      const existingPriority = getSourcePriority(matchedExisting.source);
      const newPriority = getSourcePriority(newListing.source);
      
      if (newPriority < existingPriority || 
          (newPriority === existingPriority && 
           (newListing.sourceConfidence || 0) > (matchedExisting.sourceConfidence || 0))) {
        const merged = mergeListings(newListing, matchedExisting as InsertMarketListing);
        updates.set(matchedExisting.id, merged);
      } else {
        const merged = mergeListings(matchedExisting as InsertMarketListing, newListing);
        if (JSON.stringify(merged) !== JSON.stringify(matchedExisting)) {
          updates.set(matchedExisting.id, merged);
        }
      }
    }
  }
  
  return updates;
}
