import { storage } from './storage';
import { validateVIN } from './vin-validation';

export interface VINDecodeResult {
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
  // Enhanced OEM build data
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
  // External links
  carfaxUrl?: string;
  windowStickerUrl?: string;
  // Error handling
  errorCode?: string;
  errorMessage?: string;
  source?: 'marketcheck' | 'api_ninjas' | 'nhtsa';
  responseTimeMs?: number;
  confidence?: 'high' | 'medium' | 'low' | 'invalid';
  warnings?: string[];
  cacheStatus?: 'hit' | 'miss' | 'stored' | 'bypassed';
  carfaxUrlStatus?: 'generated_link_only';
  providerDisagreements?: VINProviderDisagreement[];
}

export interface VINProviderDisagreement {
  field: string;
  primarySource: string;
  primaryValue?: string;
  comparisonSource: string;
  comparisonValue?: string;
}

export interface VINDecodeOptions {
  modelYear?: number | string;
  bypassCache?: boolean;
}

export interface VINBatchDecodeInput {
  vin: string;
  modelYear?: number | string;
}

const NHTSA_BATCH_SIZE = 50;
const NHTSA_BATCH_THROTTLE_MS = 250;
const VIN_DECODE_CACHE_TTL_DAYS = 30;
const RECONCILIATION_FIELDS = [
  'year',
  'make',
  'model',
  'trim',
  'bodyClass',
  'vehicleType',
] as const;

// Generate CARFAX report URL for a VIN
export function generateCarfaxUrl(vin: string): string {
  return `https://www.carfax.com/VehicleHistory/p/Report.cfx?vin=${vin}`;
}

// Generate AutoCheck report URL for a VIN (alternative to CARFAX)
export function generateAutoCheckUrl(vin: string): string {
  return `https://www.autocheck.com/vehiclehistory/autocheck/en/search-results?vin=${vin}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function parseModelYear(modelYear: number | string | undefined): string | undefined {
  if (modelYear === undefined || modelYear === null || modelYear === '') return undefined;
  const year = Number(modelYear);
  if (!Number.isInteger(year) || year < 1886 || year > 2100) return undefined;
  return String(year);
}

function buildNHTSADecodeUrl(vin: string, modelYear?: number | string): string {
  const url = new URL(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}`);
  url.searchParams.set('format', 'json');

  const parsedModelYear = parseModelYear(modelYear);
  if (parsedModelYear) {
    url.searchParams.set('modelyear', parsedModelYear);
  }

  return url.toString();
}

function mapNHTSAResult(vin: string, result: Record<string, unknown>, responseTimeMs: number): VINDecodeResult {
  const errorCode = normalizeOptionalText(result.ErrorCode);
  if (errorCode && errorCode !== '0') {
    return {
      vin,
      errorCode,
      errorMessage: normalizeOptionalText(result.ErrorText) || 'Unable to decode VIN',
      source: 'nhtsa',
      responseTimeMs,
      confidence: 'invalid',
    };
  }

  return {
    vin,
    year: normalizeOptionalText(result.ModelYear),
    make: normalizeOptionalText(result.Make),
    model: normalizeOptionalText(result.Model),
    trim: normalizeOptionalText(result.Trim),
    bodyClass: normalizeOptionalText(result.BodyClass),
    engineCylinders: normalizeOptionalText(result.EngineCylinders),
    engineHP: normalizeOptionalText(result.EngineHP),
    fuelType: normalizeOptionalText(result.FuelTypePrimary),
    driveType: normalizeOptionalText(result.DriveType),
    transmission: normalizeOptionalText(result.TransmissionStyle),
    doors: normalizeOptionalText(result.Doors),
    manufacturer: normalizeOptionalText(result.Manufacturer),
    plantCountry: normalizeOptionalText(result.PlantCountry),
    vehicleType: normalizeOptionalText(result.VehicleType),
    source: 'nhtsa',
    responseTimeMs,
    confidence: 'high',
  };
}

function normalizeFactForComparison(value: unknown): string | undefined {
  const text = normalizeOptionalText(value);
  return text ? text.toUpperCase() : undefined;
}

export function reconcileVINDecodeResults(
  primary: VINDecodeResult,
  comparison: VINDecodeResult
): VINProviderDisagreement[] {
  const disagreements: VINProviderDisagreement[] = [];

  for (const field of RECONCILIATION_FIELDS) {
    const primaryValue = normalizeFactForComparison(primary[field]);
    const comparisonValue = normalizeFactForComparison(comparison[field]);

    if (primaryValue && comparisonValue && primaryValue !== comparisonValue) {
      disagreements.push({
        field,
        primarySource: primary.source || 'unknown',
        primaryValue: String(primary[field]),
        comparisonSource: comparison.source || 'unknown',
        comparisonValue: String(comparison[field]),
      });
    }
  }

  return disagreements;
}

function applyReconciliation(primary: VINDecodeResult, comparison: VINDecodeResult): VINDecodeResult {
  if (primary.errorCode || comparison.errorCode) return primary;

  const providerDisagreements = reconcileVINDecodeResults(primary, comparison);
  const warnings = [...(primary.warnings || [])];

  if (providerDisagreements.length > 0) {
    warnings.push('VIN provider facts disagree; treat decoded facts as unverified until reviewed.');
  }

  return {
    ...primary,
    providerDisagreements,
    warnings: warnings.length > 0 ? warnings : undefined,
    confidence:
      providerDisagreements.length === 0
        ? 'high'
        : providerDisagreements.length === 1
          ? 'medium'
          : 'low',
  };
}

function cacheExpiresAt(): Date {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + VIN_DECODE_CACHE_TTL_DAYS);
  return expiresAt;
}

function decodeResultFromCache(cache: { baselinePayload: unknown }): VINDecodeResult | null {
  if (!cache.baselinePayload || typeof cache.baselinePayload !== 'object') return null;
  const cached = cache.baselinePayload as VINDecodeResult;
  if (!cached.vin) return null;

  return {
    ...cached,
    cacheStatus: 'hit',
    responseTimeMs: 0,
  };
}

async function getCachedVINDecode(
  dealershipId: number | undefined,
  cleanVIN: string,
  bypassCache: boolean | undefined
): Promise<VINDecodeResult | null> {
  if (bypassCache || typeof dealershipId !== 'number' || !Number.isFinite(dealershipId)) {
    return null;
  }

  try {
    const cached = await storage.getVinDecodeCache(dealershipId, cleanVIN);
    return cached ? decodeResultFromCache(cached) : null;
  } catch (error) {
    console.log('[VIN Decoder] Cache lookup failed:', error);
    return null;
  }
}

async function cacheVINDecode(
  dealershipId: number | undefined,
  cleanVIN: string,
  decodeResult: VINDecodeResult
): Promise<void> {
  if (typeof dealershipId !== 'number' || !Number.isFinite(dealershipId) || decodeResult.errorCode) {
    return;
  }

  try {
    await storage.upsertVinDecodeCache(dealershipId, cleanVIN, {
      baselineSource: decodeResult.source || 'unknown',
      baselinePayload: decodeResult,
      trimConfidence: decodeResult.trim ? 'high' : 'unknown',
      optionsConfidence: decodeResult.installedOptions?.length ? 'high' : 'unknown',
      expiresAt: cacheExpiresAt(),
    });
  } catch (error) {
    console.log('[VIN Decoder] Cache write failed:', error);
  }
}

async function decodeVINWithMarketCheck(vin: string, apiKey: string): Promise<VINDecodeResult | null> {
  const startTime = Date.now();
  
  try {
    const url = `https://api.marketcheck.com/v2/decode/car/${vin}/specs?api_key=${apiKey}`;
    
    console.log(`[VIN Decoder] Trying MarketCheck for ${vin}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json'
      }
    });
    clearTimeout(timeoutId);
    
    const responseTime = Date.now() - startTime;
    console.log(`[VIN Decoder] MarketCheck responded in ${responseTime}ms with status ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.log(`[VIN Decoder] MarketCheck error: ${response.status} - ${errorText}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || data.error) {
      console.log('[VIN Decoder] MarketCheck returned error:', data?.error);
      return null;
    }
    
    // Helper to extract string from MarketCheck item (may be string or object)
    const extractString = (item: unknown): string | null => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        // Try common field names for display value
        return String(obj.name || obj.description || obj.label || obj.value || obj.option || '');
      }
      return null;
    };
    
    // Extract equipment and options from MarketCheck response
    const installedOptions: string[] = [];
    const standardEquipment: string[] = [];
    const safetyFeatures: string[] = [];
    
    // MarketCheck may return options/equipment as strings or objects
    if (data.options && Array.isArray(data.options)) {
      data.options.forEach((opt: unknown) => {
        const str = extractString(opt);
        if (str && str.trim()) installedOptions.push(str.trim());
      });
    }
    if (data.standard_equipment && Array.isArray(data.standard_equipment)) {
      data.standard_equipment.forEach((eq: unknown) => {
        const str = extractString(eq);
        if (str && str.trim()) standardEquipment.push(str.trim());
      });
    }
    if (data.safety_features && Array.isArray(data.safety_features)) {
      data.safety_features.forEach((feat: unknown) => {
        const str = extractString(feat);
        if (str && str.trim()) safetyFeatures.push(str.trim());
      });
    }
    
    // Extract packages if available
    const packages: string[] = [];
    if (data.packages && Array.isArray(data.packages)) {
      data.packages.forEach((pkg: unknown) => {
        const str = extractString(pkg);
        if (str && str.trim()) packages.push(str.trim());
      });
    }
    
    return {
      vin,
      year: data.year?.toString() || undefined,
      make: data.make || undefined,
      model: data.model || undefined,
      trim: data.trim || undefined,
      bodyClass: data.body_type || data.body_style || undefined,
      engineCylinders: data.cylinders?.toString() || undefined,
      engineHP: data.horsepower?.toString() || undefined,
      engineDisplacement: data.engine_displacement || data.displacement || undefined,
      fuelType: data.fuel_type || undefined,
      driveType: data.drivetrain || undefined,
      transmission: data.transmission || undefined,
      doors: data.doors?.toString() || undefined,
      manufacturer: data.manufacturer || undefined,
      vehicleType: data.vehicle_type || undefined,
      interiorColor: data.interior_color || undefined,
      exteriorColor: data.exterior_color || data.color || undefined,
      // OEM build data
      msrp: data.msrp || data.base_msrp || undefined,
      invoicePrice: data.invoice || data.base_invoice || undefined,
      installedOptions: installedOptions.length > 0 ? installedOptions : undefined,
      standardEquipment: standardEquipment.length > 0 ? standardEquipment : undefined,
      packages: packages.length > 0 ? packages : undefined,
      safetyFeatures: safetyFeatures.length > 0 ? safetyFeatures : undefined,
      source: 'marketcheck',
      responseTimeMs: responseTime
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    console.log(`[VIN Decoder] MarketCheck error (${responseTime}ms):`, isTimeout ? 'TIMEOUT' : (error instanceof Error ? error.message : 'Unknown error'));
    return null;
  }
}

async function decodeVINWithApiNinjas(vin: string, apiKey: string): Promise<VINDecodeResult | null> {
  const startTime = Date.now();
  
  try {
    const url = `https://api.api-ninjas.com/v1/vinlookup?vin=${vin}`;
    
    console.log(`[VIN Decoder] Trying API Ninjas for ${vin}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'X-Api-Key': apiKey,
        'Accept': 'application/json'
      }
    });
    clearTimeout(timeoutId);
    
    const responseTime = Date.now() - startTime;
    console.log(`[VIN Decoder] API Ninjas responded in ${responseTime}ms with status ${response.status}`);
    
    if (!response.ok) {
      console.log(`[VIN Decoder] API Ninjas returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data || data.error) {
      console.log('[VIN Decoder] API Ninjas returned error:', data?.error);
      return null;
    }
    
    return {
      vin,
      year: data.model_year?.toString() || undefined,
      make: data.make || undefined,
      model: data.model || undefined,
      trim: data.trim || undefined,
      bodyClass: data.body_class || undefined,
      manufacturer: data.manufacturer || undefined,
      plantCountry: data.plant_country || undefined,
      vehicleType: data.vehicle_type || undefined,
      source: 'api_ninjas',
      responseTimeMs: responseTime
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.log(`[VIN Decoder] API Ninjas error (${responseTime}ms):`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

async function decodeVINWithNHTSA(
  vin: string,
  attempt: number = 1,
  modelYear?: number | string
): Promise<VINDecodeResult> {
  const maxAttempts = 3;
  const baseTimeout = 30000;
  const startTime = Date.now();
  
  try {
    const url = buildNHTSADecodeUrl(vin, modelYear);
    
    console.log(`[VIN Decoder] NHTSA attempt ${attempt}/${maxAttempts} for ${vin}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), baseTimeout);
    
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    const responseTime = Date.now() - startTime;
    console.log(`[VIN Decoder] NHTSA responded in ${responseTime}ms`);
    
    if (!response.ok) {
      throw new Error(`NHTSA API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const result = data.Results?.[0];
    
    if (!result) {
      throw new Error('NHTSA returned empty results');
    }
    
    return mapNHTSAResult(vin, result, responseTime);
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    
    console.log(`[VIN Decoder] NHTSA attempt ${attempt} failed: ${isTimeout ? 'TIMEOUT' : (error instanceof Error ? error.message : 'Unknown error')}`);
    
    if (attempt < maxAttempts) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.log(`[VIN Decoder] Retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
      return decodeVINWithNHTSA(vin, attempt + 1, modelYear);
    }
    
    return {
      vin,
      errorCode: isTimeout ? 'TIMEOUT' : 'DECODE_ERROR',
      errorMessage: isTimeout 
        ? `NHTSA timed out after ${maxAttempts} attempts. The service may be slow.`
        : (error instanceof Error ? error.message : 'Failed to decode VIN'),
      source: 'nhtsa',
      responseTimeMs: responseTime,
      confidence: 'invalid',
    };
  }
}

async function decodeVINBatchWithNHTSA(inputs: Array<{ vin: string; modelYear?: number | string }>): Promise<VINDecodeResult[]> {
  if (inputs.length === 0) return [];

  const startTime = Date.now();
  const batchData = inputs
    .map((input) => {
      const parsedModelYear = parseModelYear(input.modelYear);
      return parsedModelYear ? `${input.vin},${parsedModelYear}` : input.vin;
    })
    .join('; ');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const response = await fetch('https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVINValuesBatch/', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        format: 'json',
        data: batchData,
      }),
    });
    clearTimeout(timeoutId);

    const responseTime = Date.now() - startTime;
    if (!response.ok) {
      throw new Error(`NHTSA batch API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const results = Array.isArray(data.Results) ? data.Results : [];

    return inputs.map((input, index) => {
      const result = results[index] as Record<string, unknown> | undefined;
      if (!result) {
        return {
          vin: input.vin,
          errorCode: 'EMPTY_BATCH_RESULT',
          errorMessage: 'NHTSA returned no batch decode result for this VIN',
          source: 'nhtsa',
          responseTimeMs: responseTime,
          confidence: 'invalid',
        };
      }

      return mapNHTSAResult(input.vin, result, responseTime);
    });
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return inputs.map((input) => ({
      vin: input.vin,
      errorCode: error instanceof Error && error.name === 'AbortError' ? 'TIMEOUT' : 'DECODE_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Failed to batch decode VIN',
      source: 'nhtsa',
      responseTimeMs: responseTime,
      confidence: 'invalid',
    }));
  }
}

export async function decodeVINBatch(
  inputs: VINBatchDecodeInput[],
  dealershipId?: number
): Promise<VINDecodeResult[]> {
  const results: VINDecodeResult[] = new Array(inputs.length);
  const remaining: Array<{ index: number; vin: string; modelYear?: number | string }> = [];

  for (let index = 0; index < inputs.length; index += 1) {
    const input = inputs[index];
    const validation = validateVIN(input.vin);

    if (!validation.isValid) {
      results[index] = {
        vin: validation.vin,
        errorCode: validation.errorCode,
        errorMessage: validation.errorMessage,
        confidence: 'invalid',
      };
      continue;
    }

    const cached = await getCachedVINDecode(dealershipId, validation.vin, false);
    if (cached) {
      results[index] = cached;
      continue;
    }

    remaining.push({
      index,
      vin: validation.vin,
      modelYear: input.modelYear,
    });
  }

  for (let offset = 0; offset < remaining.length; offset += NHTSA_BATCH_SIZE) {
    const chunk = remaining.slice(offset, offset + NHTSA_BATCH_SIZE);
    const decodedChunk = await decodeVINBatchWithNHTSA(chunk);

    for (let chunkIndex = 0; chunkIndex < chunk.length; chunkIndex += 1) {
      const chunkInput = chunk[chunkIndex];
      const decoded = decodedChunk[chunkIndex];
      decoded.carfaxUrl = decoded.errorCode ? undefined : generateCarfaxUrl(chunkInput.vin);
      decoded.carfaxUrlStatus = decoded.carfaxUrl ? 'generated_link_only' : undefined;
      decoded.cacheStatus = !decoded.errorCode && typeof dealershipId === 'number' ? 'stored' : undefined;
      results[chunkInput.index] = decoded;
      await cacheVINDecode(dealershipId, chunkInput.vin, decoded);
    }

    if (offset + NHTSA_BATCH_SIZE < remaining.length) {
      await sleep(NHTSA_BATCH_THROTTLE_MS);
    }
  }

  return results;
}

export async function decodeVIN(
  vin: string,
  dealershipId?: number,
  options: VINDecodeOptions = {}
): Promise<VINDecodeResult> {
  const validation = validateVIN(vin);
  const cleanVIN = validation.vin;
  const startTime = Date.now();
  
  if (!validation.isValid) {
    return {
      vin: cleanVIN,
      errorCode: validation.errorCode,
      errorMessage: validation.errorMessage,
      confidence: 'invalid',
    };
  }

  const cached = await getCachedVINDecode(dealershipId, cleanVIN, options.bypassCache);
  if (cached) {
    return cached;
  }
  
  console.log(`[VIN Decoder] Starting decode for ${cleanVIN}`);
  
  let marketCheckApiKey: string | null = null;
  
  if (typeof dealershipId === 'number' && Number.isFinite(dealershipId)) {
    try {
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      marketCheckApiKey = apiKeys?.marketcheckKey || null;
    } catch (error) {
      console.log('[VIN Decoder] Error fetching API keys:', error);
    }
  }
  
  const apiNinjasKey = process.env.API_NINJAS_KEY || null;
  
  let decodeResult: VINDecodeResult | null = null;
  
  // Priority 1: MarketCheck (fastest, most reliable when available)
  if (marketCheckApiKey) {
    const marketCheckResult = await decodeVINWithMarketCheck(cleanVIN, marketCheckApiKey);
    
    if (marketCheckResult && !marketCheckResult.errorCode) {
      console.log(`[VIN Decoder] Success with MarketCheck in ${marketCheckResult.responseTimeMs}ms`);
      const nhtsaBaseline = await decodeVINWithNHTSA(cleanVIN, 1, options.modelYear);
      decodeResult = nhtsaBaseline.errorCode
        ? {
            ...marketCheckResult,
            confidence: 'medium',
            warnings: [
              ...(marketCheckResult.warnings || []),
              `NHTSA baseline decode failed: ${nhtsaBaseline.errorMessage || nhtsaBaseline.errorCode}`,
            ],
          }
        : applyReconciliation(marketCheckResult, nhtsaBaseline);
    } else {
      console.log('[VIN Decoder] MarketCheck failed, trying next fallback');
    }
  } else {
    console.log('[VIN Decoder] No MarketCheck API key configured');
  }
  
  // Priority 2: NHTSA (free government service, comprehensive data)
  if (!decodeResult) {
    console.log('[VIN Decoder] Trying NHTSA');
    const nhtsaResult = await decodeVINWithNHTSA(cleanVIN, 1, options.modelYear);
    
    if (!nhtsaResult.errorCode) {
      console.log(`[VIN Decoder] Success with NHTSA in ${nhtsaResult.responseTimeMs}ms`);
      decodeResult = nhtsaResult;
    } else {
      console.log('[VIN Decoder] NHTSA failed, trying next fallback');
      
      // Priority 3: API Ninjas (last resort - free tier has limited data)
      if (apiNinjasKey) {
        const apiNinjasResult = await decodeVINWithApiNinjas(cleanVIN, apiNinjasKey);
        
        if (apiNinjasResult && !apiNinjasResult.errorCode) {
          // Check if API Ninjas returned actual data (not "premium subscribers" message)
          if (apiNinjasResult.model && !apiNinjasResult.model.toLowerCase().includes('premium')) {
            console.log(`[VIN Decoder] Success with API Ninjas in ${apiNinjasResult.responseTimeMs}ms`);
            decodeResult = apiNinjasResult;
          } else {
            console.log('[VIN Decoder] API Ninjas returned premium-only data, skipping');
          }
        } else {
          console.log('[VIN Decoder] API Ninjas failed');
        }
      } else {
        console.log('[VIN Decoder] No API Ninjas key configured (set API_NINJAS_KEY env var)');
      }
      
      // All decoders failed
      if (!decodeResult) {
        const totalTime = Date.now() - startTime;
        console.log(`[VIN Decoder] All decoders failed after ${totalTime}ms`);
        
        return {
          ...nhtsaResult,
          errorMessage: `VIN decode failed after trying all available services. ${nhtsaResult.errorMessage}`,
          responseTimeMs: totalTime
        };
      }
    }
  }
  
  const totalTime = Date.now() - startTime;
  decodeResult.responseTimeMs = totalTime;
  
  // This is only a generated report link, not proof that a CARFAX report was fetched or verified.
  decodeResult.carfaxUrl = generateCarfaxUrl(cleanVIN);
  decodeResult.carfaxUrlStatus = 'generated_link_only';
  decodeResult.cacheStatus = typeof dealershipId === 'number' ? 'stored' : undefined;
  await cacheVINDecode(dealershipId, cleanVIN, decodeResult);
  
  return decodeResult;
}
