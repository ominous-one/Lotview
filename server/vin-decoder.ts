import { storage } from './storage';

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
}

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

async function decodeVINWithNHTSA(vin: string, attempt: number = 1): Promise<VINDecodeResult> {
  const maxAttempts = 3;
  const baseTimeout = 30000;
  const startTime = Date.now();
  
  try {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`;
    
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
    
    if (result.ErrorCode && result.ErrorCode !== "0") {
      return {
        vin,
        errorCode: result.ErrorCode,
        errorMessage: result.ErrorText || 'Unable to decode VIN',
        source: 'nhtsa',
        responseTimeMs: responseTime
      };
    }
    
    return {
      vin,
      year: result.ModelYear || undefined,
      make: result.Make || undefined,
      model: result.Model || undefined,
      trim: result.Trim || undefined,
      bodyClass: result.BodyClass || undefined,
      engineCylinders: result.EngineCylinders || undefined,
      engineHP: result.EngineHP || undefined,
      fuelType: result.FuelTypePrimary || undefined,
      driveType: result.DriveType || undefined,
      transmission: result.TransmissionStyle || undefined,
      doors: result.Doors || undefined,
      manufacturer: result.Manufacturer || undefined,
      plantCountry: result.PlantCountry || undefined,
      vehicleType: result.VehicleType || undefined,
      source: 'nhtsa',
      responseTimeMs: responseTime
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    
    console.log(`[VIN Decoder] NHTSA attempt ${attempt} failed: ${isTimeout ? 'TIMEOUT' : (error instanceof Error ? error.message : 'Unknown error')}`);
    
    if (attempt < maxAttempts) {
      const backoffMs = Math.pow(2, attempt) * 1000;
      console.log(`[VIN Decoder] Retrying in ${backoffMs}ms...`);
      await sleep(backoffMs);
      return decodeVINWithNHTSA(vin, attempt + 1);
    }
    
    return {
      vin,
      errorCode: isTimeout ? 'TIMEOUT' : 'DECODE_ERROR',
      errorMessage: isTimeout 
        ? `NHTSA timed out after ${maxAttempts} attempts. The service may be slow.`
        : (error instanceof Error ? error.message : 'Failed to decode VIN'),
      source: 'nhtsa',
      responseTimeMs: responseTime
    };
  }
}

export async function decodeVIN(vin: string, dealershipId?: number): Promise<VINDecodeResult> {
  const cleanVIN = vin.trim().toUpperCase();
  const startTime = Date.now();
  
  if (cleanVIN.length !== 17) {
    return {
      vin: cleanVIN,
      errorCode: 'INVALID_VIN_LENGTH',
      errorMessage: 'VIN must be exactly 17 characters'
    };
  }
  
  console.log(`[VIN Decoder] Starting decode for ${cleanVIN}`);
  
  const effectiveDealershipId = dealershipId || 1;
  let marketCheckApiKey: string | null = null;
  
  try {
    const apiKeys = await storage.getDealershipApiKeys(effectiveDealershipId);
    marketCheckApiKey = apiKeys?.marketcheckKey || null;
  } catch (error) {
    console.log('[VIN Decoder] Error fetching API keys:', error);
  }
  
  const apiNinjasKey = process.env.API_NINJAS_KEY || null;
  
  let decodeResult: VINDecodeResult | null = null;
  
  // Priority 1: MarketCheck (fastest, most reliable when available)
  if (marketCheckApiKey) {
    const marketCheckResult = await decodeVINWithMarketCheck(cleanVIN, marketCheckApiKey);
    
    if (marketCheckResult && !marketCheckResult.errorCode) {
      console.log(`[VIN Decoder] Success with MarketCheck in ${marketCheckResult.responseTimeMs}ms`);
      decodeResult = marketCheckResult;
    } else {
      console.log('[VIN Decoder] MarketCheck failed, trying next fallback');
    }
  } else {
    console.log('[VIN Decoder] No MarketCheck API key configured');
  }
  
  // Priority 2: NHTSA (free government service, comprehensive data)
  if (!decodeResult) {
    console.log('[VIN Decoder] Trying NHTSA');
    const nhtsaResult = await decodeVINWithNHTSA(cleanVIN);
    
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
  
  // Always add CARFAX URL for valid VINs
  decodeResult.carfaxUrl = generateCarfaxUrl(cleanVIN);
  
  return decodeResult;
}
