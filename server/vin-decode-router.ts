import { storage } from './storage';

export type TrimMode = 'exact' | 'near';

export interface VinDecodeRouterOptions {
  dealershipId: number;
  /** Paid enrichment is disabled by default to avoid side effects. */
  allowPaidApis?: boolean;
  /** If true, never call any external network (used in tests). */
  disableExternalFetches?: boolean;
  /** Cache TTL (ms) */
  cacheTtlMs?: number;
}

export interface NormalizedVehicleSpec {
  vin: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  exteriorColor?: string;
  interiorColor?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  fuelType?: string;
  installedOptions?: string[];
  packages?: string[];
  trimConfidence: 'high' | 'medium' | 'low' | 'unknown';
  optionsConfidence: 'high' | 'medium' | 'low' | 'unknown';
  sources: string[];
}

type VinDecodeCacheRow = Awaited<ReturnType<typeof storage.getVinDecodeCache>>;

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function normalizeTrimConfidence(trim?: string): NormalizedVehicleSpec['trimConfidence'] {
  if (!trim) return 'unknown';
  const t = trim.trim();
  if (!t) return 'unknown';
  const normalized = t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const ambiguous = new Set(['base', 'sedan', 'coupe', 'wagon', 'sport', 'premium', 'limited', 'special']);
  const meaningfulTokens = tokens.filter(token => token.length > 1 && !ambiguous.has(token));
  if (meaningfulTokens.length >= 2 || /\b(xle|xse|sel|se|ex|lx|touring|platinum|denali|sx|gt|rs|lt|ltz|sportage|limited awd)\b/i.test(normalized)) {
    return 'high';
  }
  if (meaningfulTokens.length >= 1 || t.length >= 3) return 'medium';
  return 'low';
}

function normalizeOptionsConfidence(options?: unknown, packages?: unknown): NormalizedVehicleSpec['optionsConfidence'] {
  const optionCount = Array.isArray(options) ? options.length : 0;
  const packageCount = Array.isArray(packages) ? packages.length : 0;
  if (optionCount === 0 && packageCount === 0) return 'unknown';
  if (optionCount >= 10 || optionCount + packageCount >= 12) return 'high';
  return 'medium';
}

function shouldEnrichForOptions(spec: NormalizedVehicleSpec): boolean {
  // Enrichment triggers:
  // - trim missing/low confidence
  // - options missing (to match exact options)
  if (!spec.trim || spec.trimConfidence === 'low' || spec.trimConfidence === 'unknown') return true;
  if (!spec.installedOptions || spec.installedOptions.length === 0) return true;
  return false;
}

async function decodeBaselineNhtsa(vin: string): Promise<Partial<NormalizedVehicleSpec>> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`NHTSA vPIC error: ${resp.status}`);
  }
  const data = await resp.json();
  const r = data.Results?.[0];
  if (!r) return {};

  return {
    year: asNumber(r.ModelYear),
    make: r.Make || undefined,
    model: r.Model || undefined,
    trim: r.Trim || undefined,
    engine: r.DisplacementL || r.EngineModel || undefined,
    transmission: r.TransmissionStyle || undefined,
    drivetrain: r.DriveType || undefined,
    fuelType: r.FuelTypePrimary || undefined,
  };
}

async function decodeEnrichedMarketCheck(vin: string, apiKey: string): Promise<Partial<NormalizedVehicleSpec>> {
  const url = `https://api.marketcheck.com/v2/decode/car/${vin}/specs?api_key=${apiKey}`;
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) {
    throw new Error(`MarketCheck decode error: ${resp.status}`);
  }
  const data = await resp.json();

  // MarketCheck schema varies; keep defensive.
  const options = Array.isArray(data?.options) ? data.options.map((o: any) => {
    if (typeof o === 'string') return o;
    if (o && typeof o === 'object') return String(o.name || o.description || o.label || o.value || '').trim();
    return '';
  }).filter(Boolean) : undefined;

  const packages = Array.isArray(data?.packages) ? data.packages.map((p: any) => {
    if (typeof p === 'string') return p;
    if (p && typeof p === 'object') return String(p.name || p.description || p.label || p.value || '').trim();
    return '';
  }).filter(Boolean) : undefined;

  return {
    year: asNumber(data?.year),
    make: data?.make || undefined,
    model: data?.model || undefined,
    trim: data?.trim || undefined,
    exteriorColor: data?.exterior_color || data?.color || undefined,
    interiorColor: data?.interior_color || undefined,
    engine: data?.engine_displacement || data?.displacement || undefined,
    transmission: data?.transmission || undefined,
    drivetrain: data?.drivetrain || undefined,
    fuelType: data?.fuel_type || undefined,
    installedOptions: options && options.length > 0 ? options : undefined,
    packages: packages && packages.length > 0 ? packages : undefined,
  };
}

/**
 * Cheap-hybrid VIN decode:
 * - Always does baseline decode first (NHTSA vPIC).
 * - Paid enrichment only when needed AND explicitly enabled.
 * - Cached per dealership+VIN.
 */
export async function decodeVinCheapHybrid(vin: string, opts: VinDecodeRouterOptions): Promise<NormalizedVehicleSpec> {
  const cleanVIN = vin.trim().toUpperCase();
  const cacheTtlMs = opts.cacheTtlMs ?? 1000 * 60 * 60 * 24 * 180; // 180d

  const cached = await storage.getVinDecodeCache(opts.dealershipId, cleanVIN);
  const cacheExpired = (row: VinDecodeCacheRow): boolean => {
    if (!row?.expiresAt) return false;
    return row.expiresAt.getTime() < Date.now();
  };

  if (cached && !cacheExpired(cached)) {
    const baseline = cached.baselinePayload as any;
    const enriched = cached.enrichedPayload as any | null;
    const sources = Array.from(new Set([cached.baselineSource, cached.enrichedSource].filter(Boolean) as string[]));

    return {
      vin: cleanVIN,
      year: asNumber(enriched?.year ?? baseline?.year),
      make: enriched?.make ?? baseline?.make,
      model: enriched?.model ?? baseline?.model,
      trim: enriched?.trim ?? baseline?.trim,
      exteriorColor: enriched?.exteriorColor ?? baseline?.exteriorColor,
      interiorColor: enriched?.interiorColor ?? baseline?.interiorColor,
      engine: enriched?.engine ?? baseline?.engine,
      transmission: enriched?.transmission ?? baseline?.transmission,
      drivetrain: enriched?.drivetrain ?? baseline?.drivetrain,
      fuelType: enriched?.fuelType ?? baseline?.fuelType,
      installedOptions: enriched?.installedOptions ?? baseline?.installedOptions,
      packages: enriched?.packages ?? baseline?.packages,
      trimConfidence: (cached.trimConfidence as any) ?? 'unknown',
      optionsConfidence: (cached.optionsConfidence as any) ?? 'unknown',
      sources,
    };
  }

  if (opts.disableExternalFetches) {
    return {
      vin: cleanVIN,
      trimConfidence: 'unknown',
      optionsConfidence: 'unknown',
      sources: [],
    };
  }

  const baselinePartial = await decodeBaselineNhtsa(cleanVIN);
  const baselineSpec: NormalizedVehicleSpec = {
    vin: cleanVIN,
    ...baselinePartial,
    trimConfidence: normalizeTrimConfidence(baselinePartial.trim),
    optionsConfidence: 'unknown',
    sources: ['nhtsa'],
  };

  const allowPaidApis = opts.allowPaidApis ?? (process.env.LOTVIEW_ALLOW_PAID_APIS === 'true');
  const needsEnrich = shouldEnrichForOptions(baselineSpec);

  let enriched: Partial<NormalizedVehicleSpec> | null = null;
  let enrichedSource: string | null = null;

  if (allowPaidApis && needsEnrich) {
    const apiKeys = await storage.getDealershipApiKeys(opts.dealershipId);
    const key = apiKeys?.marketcheckKey;
    if (key) {
      enriched = await decodeEnrichedMarketCheck(cleanVIN, key);
      enrichedSource = 'marketcheck';
      baselineSpec.sources.push('marketcheck');
    }
  }

  const finalSpec: NormalizedVehicleSpec = {
    ...baselineSpec,
    ...enriched,
    trimConfidence: (() => {
      const finalTrim = (enriched?.trim ?? baselineSpec.trim) as string | undefined;
      const baseConfidence = normalizeTrimConfidence(finalTrim);
      if (baselineSpec.trim && enriched?.trim && baselineSpec.trim.trim().toLowerCase() === enriched.trim.trim().toLowerCase()) {
        return baseConfidence === 'medium' ? 'high' : baseConfidence;
      }
      return baseConfidence;
    })(),
    optionsConfidence: normalizeOptionsConfidence(
      enriched?.installedOptions ?? baselineSpec.installedOptions,
      enriched?.packages ?? baselineSpec.packages,
    ),
  };

  await storage.upsertVinDecodeCache(opts.dealershipId, cleanVIN, {
    baselineSource: 'nhtsa',
    baselinePayload: baselineSpec,
    enrichedSource,
    enrichedPayload: enriched,
    trimConfidence: finalSpec.trimConfidence,
    optionsConfidence: finalSpec.optionsConfidence,
    expiresAt: new Date(Date.now() + cacheTtlMs),
  });

  return finalSpec;
}
