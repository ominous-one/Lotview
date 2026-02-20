import { storage } from './storage';
import { generateCarfaxUrl } from './vin-decoder';

/**
 * Confidence scoring for data fields
 * Higher score = more reliable source
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'none';

export interface FieldConfidence {
  value: string | number | null;
  confidence: ConfidenceLevel;
  source: string;
}

export interface EnrichedVINResult {
  vin: string;
  
  // Core vehicle identification with confidence
  year: FieldConfidence;
  make: FieldConfidence;
  model: FieldConfidence;
  trim: FieldConfidence;
  
  // Body and drivetrain
  bodyClass: FieldConfidence;
  driveType: FieldConfidence;
  doors: FieldConfidence;
  
  // Engine specs
  engineCylinders: FieldConfidence;
  engineHP: FieldConfidence;
  engineDisplacement: FieldConfidence;
  fuelType: FieldConfidence;
  transmission: FieldConfidence;
  
  // Colors (when available)
  interiorColor: FieldConfidence;
  exteriorColor: FieldConfidence;
  
  // OEM data (premium sources)
  msrp: FieldConfidence;
  invoicePrice: FieldConfidence;
  installedOptions: string[];
  standardEquipment: string[];
  packages: string[];
  safetyFeatures: string[];
  
  // Warranties
  warranties?: {
    basic?: string;
    powertrain?: string;
    corrosion?: string;
    roadside?: string;
  };
  
  // Links
  carfaxUrl: string;
  windowStickerUrl?: string;
  
  // Metadata
  overallConfidence: ConfidenceLevel;
  dataSources: string[];
  responseTimeMs: number;
  enrichmentDetails: {
    primarySource: string;
    fieldsEnriched: number;
    totalFields: number;
  };
  
  // Error handling
  errorCode?: string;
  errorMessage?: string;
}

interface RawDecodeResult {
  vin: string;
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  bodyClass?: string;
  engineCylinders?: string;
  engineHP?: string;
  engineDisplacement?: string;
  fuelType?: string;
  driveType?: string;
  transmission?: string;
  doors?: string;
  manufacturer?: string;
  plantCountry?: string;
  vehicleType?: string;
  interiorColor?: string;
  exteriorColor?: string;
  msrp?: number;
  invoicePrice?: number;
  installedOptions?: string[];
  standardEquipment?: string[];
  packages?: string[];
  safetyFeatures?: string[];
  warranties?: {
    basic?: string;
    powertrain?: string;
    corrosion?: string;
    roadside?: string;
  };
  source: string;
  responseTimeMs?: number;
  errorCode?: string;
  errorMessage?: string;
}

// Source reliability rankings (higher = more reliable)
const SOURCE_RELIABILITY: Record<string, number> = {
  'marketcheck': 95,
  'cargurus': 85,
  'api_ninjas': 70,
  'nhtsa': 75,
  'autotrader': 80,
  'unknown': 30
};

function getConfidenceLevel(sourceReliability: number, hasValue: boolean): ConfidenceLevel {
  if (!hasValue) return 'none';
  if (sourceReliability >= 90) return 'high';
  if (sourceReliability >= 70) return 'medium';
  return 'low';
}

function createFieldConfidence(value: string | number | null | undefined, source: string): FieldConfidence {
  const reliability = SOURCE_RELIABILITY[source] || SOURCE_RELIABILITY['unknown'];
  const hasValue = value !== null && value !== undefined && value !== '';
  
  return {
    value: hasValue ? value : null,
    confidence: getConfidenceLevel(reliability, hasValue),
    source: hasValue ? source : 'none'
  };
}

// Helper to select best value from multiple sources
function selectBestValue(
  values: Array<{ value: string | number | null | undefined; source: string }>
): FieldConfidence {
  // Sort by source reliability (highest first)
  const sorted = values
    .filter(v => v.value !== null && v.value !== undefined && v.value !== '')
    .sort((a, b) => (SOURCE_RELIABILITY[b.source] || 0) - (SOURCE_RELIABILITY[a.source] || 0));
  
  if (sorted.length === 0) {
    return { value: null, confidence: 'none', source: 'none' };
  }
  
  const best = sorted[0];
  return createFieldConfidence(best.value, best.source);
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Decode VIN using MarketCheck API (premium, most complete data)
 */
async function decodeWithMarketCheck(vin: string, apiKey: string): Promise<RawDecodeResult | null> {
  const startTime = Date.now();
  
  try {
    const url = `https://api.marketcheck.com/v2/decode/car/${vin}/specs?api_key=${apiKey}`;
    
    console.log(`[VIN Enrichment] Querying MarketCheck for ${vin}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`[VIN Enrichment] MarketCheck returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || data.error) {
      console.log('[VIN Enrichment] MarketCheck returned error:', data?.error);
      return null;
    }
    
    // Extract arrays from MarketCheck
    const extractStrings = (arr: unknown[]): string[] => {
      if (!Array.isArray(arr)) return [];
      return arr.map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          return String(obj.name || obj.description || obj.label || obj.value || '');
        }
        return '';
      }).filter(s => s.trim());
    };
    
    return {
      vin,
      year: data.year?.toString(),
      make: data.make,
      model: data.model,
      trim: data.trim,
      bodyClass: data.body_type || data.body_style,
      engineCylinders: data.cylinders?.toString(),
      engineHP: data.horsepower?.toString(),
      engineDisplacement: data.engine_displacement || data.displacement,
      fuelType: data.fuel_type,
      driveType: data.drivetrain,
      transmission: data.transmission,
      doors: data.doors?.toString(),
      manufacturer: data.manufacturer,
      vehicleType: data.vehicle_type,
      interiorColor: data.interior_color,
      exteriorColor: data.exterior_color || data.color,
      msrp: data.msrp || data.base_msrp,
      invoicePrice: data.invoice || data.base_invoice,
      installedOptions: extractStrings(data.options || []),
      standardEquipment: extractStrings(data.standard_equipment || []),
      packages: extractStrings(data.packages || []),
      safetyFeatures: extractStrings(data.safety_features || []),
      source: 'marketcheck',
      responseTimeMs: Date.now() - startTime
    };
  } catch (error) {
    console.log(`[VIN Enrichment] MarketCheck error:`, error instanceof Error ? error.message : 'Unknown');
    return null;
  }
}

/**
 * Decode VIN using NHTSA (free government API - good for basic data)
 */
async function decodeWithNHTSA(vin: string, retries = 3): Promise<RawDecodeResult | null> {
  const startTime = Date.now();
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`;
      
      console.log(`[VIN Enrichment] Querying NHTSA (attempt ${attempt}/${retries})`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`NHTSA returned ${response.status}`);
      }
      
      const data = await response.json();
      const result = data.Results?.[0];
      
      if (!result) {
        throw new Error('NHTSA returned empty results');
      }
      
      if (result.ErrorCode && result.ErrorCode !== "0") {
        console.log(`[VIN Enrichment] NHTSA decode error: ${result.ErrorText}`);
        return {
          vin,
          errorCode: result.ErrorCode,
          errorMessage: result.ErrorText || 'Unable to decode VIN',
          source: 'nhtsa',
          responseTimeMs: Date.now() - startTime
        };
      }
      
      return {
        vin,
        year: result.ModelYear,
        make: result.Make,
        model: result.Model,
        trim: result.Trim,
        bodyClass: result.BodyClass,
        engineCylinders: result.EngineCylinders,
        engineHP: result.EngineHP,
        fuelType: result.FuelTypePrimary,
        driveType: result.DriveType,
        transmission: result.TransmissionStyle,
        doors: result.Doors,
        manufacturer: result.Manufacturer,
        plantCountry: result.PlantCountry,
        vehicleType: result.VehicleType,
        source: 'nhtsa',
        responseTimeMs: Date.now() - startTime
      };
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      console.log(`[VIN Enrichment] NHTSA attempt ${attempt} failed:`, isTimeout ? 'TIMEOUT' : (error instanceof Error ? error.message : 'Unknown'));
      
      if (attempt < retries) {
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
  }
  
  return null;
}

/**
 * Decode VIN using CarGurus scraping (for color and trim enrichment)
 */
async function decodeWithCarGurus(vin: string): Promise<RawDecodeResult | null> {
  const startTime = Date.now();
  
  try {
    // CarGurus VIN search
    const searchUrl = `https://www.cargurus.ca/Cars/searchResultsPage.action?inventorySearchWidgetType=AUTO&vin=${vin}`;
    
    console.log(`[VIN Enrichment] Querying CarGurus for ${vin}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5'
      }
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return null;
    }
    
    const html = await response.text();
    
    // Look for __NEXT_DATA__ JSON
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!nextDataMatch) {
      console.log('[VIN Enrichment] CarGurus: No __NEXT_DATA__ found');
      return null;
    }
    
    try {
      const nextData = JSON.parse(nextDataMatch[1]);
      const listing = nextData?.props?.pageProps?.listing || 
                      nextData?.props?.pageProps?.searchResults?.listings?.[0];
      
      if (!listing) {
        console.log('[VIN Enrichment] CarGurus: No listing data found');
        return null;
      }
      
      return {
        vin,
        year: listing.year?.toString(),
        make: listing.makeName || listing.make,
        model: listing.modelName || listing.model,
        trim: listing.trimName || listing.trim,
        bodyClass: listing.bodyType,
        driveType: listing.drivetrain,
        transmission: listing.transmission,
        fuelType: listing.fuelType,
        engineCylinders: listing.engineCylinders?.toString(),
        engineHP: listing.horsepower?.toString(),
        exteriorColor: listing.exteriorColorName || listing.exteriorColor,
        interiorColor: listing.interiorColorName || listing.interiorColor,
        doors: listing.doors?.toString(),
        source: 'cargurus',
        responseTimeMs: Date.now() - startTime
      };
    } catch (parseError) {
      console.log('[VIN Enrichment] CarGurus: JSON parse error');
      return null;
    }
  } catch (error) {
    console.log(`[VIN Enrichment] CarGurus error:`, error instanceof Error ? error.message : 'Unknown');
    return null;
  }
}

/**
 * Main enrichment function - layers multiple sources for comprehensive VIN data
 */
export async function enrichVIN(vin: string, dealershipId?: number): Promise<EnrichedVINResult> {
  const startTime = Date.now();
  const cleanVIN = vin.trim().toUpperCase();
  
  if (cleanVIN.length !== 17) {
    return createErrorResult(cleanVIN, 'INVALID_VIN_LENGTH', 'VIN must be exactly 17 characters');
  }
  
  console.log(`[VIN Enrichment] Starting comprehensive decode for ${cleanVIN}`);
  
  // Get API keys
  const effectiveDealershipId = dealershipId || 1;
  let marketCheckApiKey: string | null = null;
  
  try {
    const apiKeys = await storage.getDealershipApiKeys(effectiveDealershipId);
    marketCheckApiKey = apiKeys?.marketcheckKey || null;
  } catch (error) {
    console.log('[VIN Enrichment] Error fetching API keys:', error);
  }
  
  // Collect results from multiple sources in parallel
  const promises: Promise<RawDecodeResult | null>[] = [];
  const sourceOrder: string[] = [];
  
  // Always try NHTSA (free, reliable for basics)
  promises.push(decodeWithNHTSA(cleanVIN));
  sourceOrder.push('nhtsa');
  
  // Try MarketCheck if configured (premium, most complete)
  if (marketCheckApiKey) {
    promises.push(decodeWithMarketCheck(cleanVIN, marketCheckApiKey));
    sourceOrder.push('marketcheck');
  }
  
  // Try CarGurus for color enrichment
  promises.push(decodeWithCarGurus(cleanVIN));
  sourceOrder.push('cargurus');
  
  const results = await Promise.all(promises);
  
  // Build a map of source -> result
  const sourceResults = new Map<string, RawDecodeResult>();
  for (let i = 0; i < results.length; i++) {
    if (results[i] && !results[i]!.errorCode) {
      sourceResults.set(sourceOrder[i], results[i]!);
    }
  }
  
  const dataSources = Array.from(sourceResults.keys());
  console.log(`[VIN Enrichment] Received data from: ${dataSources.join(', ') || 'none'}`);
  
  if (dataSources.length === 0) {
    const nhtsaResult = results[0];
    if (nhtsaResult?.errorCode) {
      return createErrorResult(cleanVIN, nhtsaResult.errorCode, nhtsaResult.errorMessage || 'VIN decode failed');
    }
    return createErrorResult(cleanVIN, 'NO_DATA', 'Unable to decode VIN from any source');
  }
  
  // Merge results - prioritize higher reliability sources
  const enriched = mergeResults(cleanVIN, sourceResults);
  enriched.responseTimeMs = Date.now() - startTime;
  enriched.dataSources = dataSources;
  enriched.carfaxUrl = generateCarfaxUrl(cleanVIN);
  
  // Calculate overall confidence
  const fields = [
    enriched.year, enriched.make, enriched.model, enriched.trim,
    enriched.bodyClass, enriched.driveType, enriched.engineCylinders,
    enriched.fuelType, enriched.transmission
  ];
  
  const highConfCount = fields.filter(f => f.confidence === 'high').length;
  const mediumConfCount = fields.filter(f => f.confidence === 'medium').length;
  const fieldsWithValue = fields.filter(f => f.value !== null).length;
  
  enriched.enrichmentDetails = {
    primarySource: dataSources.includes('marketcheck') ? 'marketcheck' : dataSources[0],
    fieldsEnriched: fieldsWithValue,
    totalFields: fields.length
  };
  
  if (highConfCount >= 6) {
    enriched.overallConfidence = 'high';
  } else if (highConfCount + mediumConfCount >= 5) {
    enriched.overallConfidence = 'medium';
  } else {
    enriched.overallConfidence = 'low';
  }
  
  console.log(`[VIN Enrichment] Complete: ${fieldsWithValue}/${fields.length} fields, ${enriched.overallConfidence} confidence`);
  
  return enriched;
}

function mergeResults(vin: string, sources: Map<string, RawDecodeResult>): EnrichedVINResult {
  // Build arrays of values for each field from all sources
  const getValues = (field: keyof RawDecodeResult) => {
    return Array.from(sources.entries())
      .filter(([_, r]) => r[field] !== undefined && r[field] !== null && r[field] !== '')
      .map(([source, r]) => ({ value: r[field] as string | number | null, source }));
  };
  
  // Select best value for each field
  const year = selectBestValue(getValues('year'));
  const make = selectBestValue(getValues('make'));
  const model = selectBestValue(getValues('model'));
  const trim = selectBestValue(getValues('trim'));
  const bodyClass = selectBestValue(getValues('bodyClass'));
  const driveType = selectBestValue(getValues('driveType'));
  const doors = selectBestValue(getValues('doors'));
  const engineCylinders = selectBestValue(getValues('engineCylinders'));
  const engineHP = selectBestValue(getValues('engineHP'));
  const engineDisplacement = selectBestValue(getValues('engineDisplacement'));
  const fuelType = selectBestValue(getValues('fuelType'));
  const transmission = selectBestValue(getValues('transmission'));
  const interiorColor = selectBestValue(getValues('interiorColor'));
  const exteriorColor = selectBestValue(getValues('exteriorColor'));
  const msrp = selectBestValue(getValues('msrp'));
  const invoicePrice = selectBestValue(getValues('invoicePrice'));
  
  // Merge arrays (options, equipment, etc.) from all sources
  const installedOptions: string[] = [];
  const standardEquipment: string[] = [];
  const packages: string[] = [];
  const safetyFeatures: string[] = [];
  
  for (const [_, result] of sources) {
    if (result.installedOptions) installedOptions.push(...result.installedOptions);
    if (result.standardEquipment) standardEquipment.push(...result.standardEquipment);
    if (result.packages) packages.push(...result.packages);
    if (result.safetyFeatures) safetyFeatures.push(...result.safetyFeatures);
  }
  
  // Get warranties from MarketCheck if available
  let warranties: EnrichedVINResult['warranties'];
  const marketCheckResult = sources.get('marketcheck');
  if (marketCheckResult?.warranties) {
    warranties = marketCheckResult.warranties;
  }
  
  return {
    vin,
    year,
    make,
    model,
    trim,
    bodyClass,
    driveType,
    doors,
    engineCylinders,
    engineHP,
    engineDisplacement,
    fuelType,
    transmission,
    interiorColor,
    exteriorColor,
    msrp,
    invoicePrice,
    installedOptions: [...new Set(installedOptions)],
    standardEquipment: [...new Set(standardEquipment)],
    packages: [...new Set(packages)],
    safetyFeatures: [...new Set(safetyFeatures)],
    warranties,
    carfaxUrl: '',
    overallConfidence: 'low',
    dataSources: [],
    responseTimeMs: 0,
    enrichmentDetails: {
      primarySource: '',
      fieldsEnriched: 0,
      totalFields: 0
    }
  };
}

function createErrorResult(vin: string, errorCode: string, errorMessage: string): EnrichedVINResult {
  const emptyField: FieldConfidence = { value: null, confidence: 'none', source: 'none' };
  
  return {
    vin,
    year: emptyField,
    make: emptyField,
    model: emptyField,
    trim: emptyField,
    bodyClass: emptyField,
    driveType: emptyField,
    doors: emptyField,
    engineCylinders: emptyField,
    engineHP: emptyField,
    engineDisplacement: emptyField,
    fuelType: emptyField,
    transmission: emptyField,
    interiorColor: emptyField,
    exteriorColor: emptyField,
    msrp: emptyField,
    invoicePrice: emptyField,
    installedOptions: [],
    standardEquipment: [],
    packages: [],
    safetyFeatures: [],
    carfaxUrl: generateCarfaxUrl(vin),
    overallConfidence: 'none',
    dataSources: [],
    responseTimeMs: 0,
    enrichmentDetails: {
      primarySource: '',
      fieldsEnriched: 0,
      totalFields: 0
    },
    errorCode,
    errorMessage
  };
}

/**
 * Convert enriched result to legacy VINDecodeResult format for backwards compatibility
 */
export function toVINDecodeResult(enriched: EnrichedVINResult): {
  vin: string;
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  bodyClass?: string;
  engineCylinders?: string;
  engineHP?: string;
  engineDisplacement?: string;
  fuelType?: string;
  driveType?: string;
  transmission?: string;
  doors?: string;
  interiorColor?: string;
  exteriorColor?: string;
  msrp?: number;
  invoicePrice?: number;
  installedOptions?: string[];
  standardEquipment?: string[];
  packages?: string[];
  safetyFeatures?: string[];
  warranties?: object;
  carfaxUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  source?: string;
  responseTimeMs?: number;
  // NEW: Confidence metadata
  confidence: {
    overall: ConfidenceLevel;
    sources: string[];
    fields: Record<string, { value: any; confidence: ConfidenceLevel; source: string }>;
  };
} {
  return {
    vin: enriched.vin,
    year: enriched.year.value?.toString(),
    make: enriched.make.value?.toString(),
    model: enriched.model.value?.toString(),
    trim: enriched.trim.value?.toString(),
    bodyClass: enriched.bodyClass.value?.toString(),
    engineCylinders: enriched.engineCylinders.value?.toString(),
    engineHP: enriched.engineHP.value?.toString(),
    engineDisplacement: enriched.engineDisplacement.value?.toString(),
    fuelType: enriched.fuelType.value?.toString(),
    driveType: enriched.driveType.value?.toString(),
    transmission: enriched.transmission.value?.toString(),
    doors: enriched.doors.value?.toString(),
    interiorColor: enriched.interiorColor.value?.toString(),
    exteriorColor: enriched.exteriorColor.value?.toString(),
    msrp: typeof enriched.msrp.value === 'number' ? enriched.msrp.value : undefined,
    invoicePrice: typeof enriched.invoicePrice.value === 'number' ? enriched.invoicePrice.value : undefined,
    installedOptions: enriched.installedOptions.length > 0 ? enriched.installedOptions : undefined,
    standardEquipment: enriched.standardEquipment.length > 0 ? enriched.standardEquipment : undefined,
    packages: enriched.packages.length > 0 ? enriched.packages : undefined,
    safetyFeatures: enriched.safetyFeatures.length > 0 ? enriched.safetyFeatures : undefined,
    warranties: enriched.warranties,
    carfaxUrl: enriched.carfaxUrl,
    errorCode: enriched.errorCode,
    errorMessage: enriched.errorMessage,
    source: enriched.enrichmentDetails.primarySource,
    responseTimeMs: enriched.responseTimeMs,
    confidence: {
      overall: enriched.overallConfidence,
      sources: enriched.dataSources,
      fields: {
        year: enriched.year,
        make: enriched.make,
        model: enriched.model,
        trim: enriched.trim,
        bodyClass: enriched.bodyClass,
        driveType: enriched.driveType,
        fuelType: enriched.fuelType,
        transmission: enriched.transmission,
        exteriorColor: enriched.exteriorColor,
        interiorColor: enriched.interiorColor
      }
    }
  };
}
