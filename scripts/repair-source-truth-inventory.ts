import fs from 'node:fs';
import path from 'node:path';
import { inArray } from 'drizzle-orm';
import { vehicles } from '@shared/schema';
import { getBrowserlessUnifiedServiceForDealership, type VehicleListing } from '../server/browserless-unified';
import { buildDealershipArtifactFileName, deriveDealershipOperatorLabel, resolveDealershipReference } from '../server/dealership-reference';
import { normalizeDealerVdpUrl } from '../server/live-source-reconciliation';
import { assessSourceTruthStaleRemoval } from '../server/source-truth-stale-removal';
import { upsertVehicleByVin, type ScrapedVehicle } from '../server/scraper';
import { db } from '../server/db';
import { storage } from '../server/storage';

interface LiveSourceSnapshot {
  vin?: string | null;
  stockNumber?: string | null;
  trim?: string | null;
  price?: number | null;
  odometer?: number | null;
  transmission?: string | null;
  drivetrain?: string | null;
  fuelType?: string | null;
  exteriorColor?: string | null;
  interiorColor?: string | null;
  carfaxUrl?: string | null;
  vdpUrl?: string | null;
}

interface LiveReconciliationArtifact {
  dealership: {
    id: number;
    label?: string | null;
    name?: string | null;
    slug?: string | null;
    subdomain?: string | null;
    listingPageSignals?: {
      visibleVehicleUrls?: string[];
      missingStoredVehicleUrlsTop10?: string[];
    };
  };
  sampledVehicles?: Array<{
    source?: LiveSourceSnapshot;
    reconciliationSummary?: {
      status?: string | null;
      blockingMismatches?: string[];
    };
  }>;
}

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function resolveDealership() {
  const dealershipIdRaw = getArg('--dealershipId');
  const dealershipReference = getArg('--dealership');

  if (!dealershipIdRaw && !dealershipReference) {
    throw new Error('Missing dealership selector. Use --dealership <subdomain-or-slug> or --dealershipId <number>.');
  }

  if (dealershipIdRaw) {
    const dealershipId = Number(dealershipIdRaw);
    if (!Number.isFinite(dealershipId) || dealershipId <= 0) {
      throw new Error(`Invalid dealershipId: ${dealershipIdRaw}`);
    }

    const dealership = await storage.getDealership(dealershipId);
    if (!dealership) {
      throw new Error(`Dealership ${dealershipIdRaw} not found.`);
    }
    return dealership;
  }

  const dealership = await resolveDealershipReference(storage, dealershipReference!);
  if (!dealership) {
    throw new Error(`Dealership ${dealershipReference} not found. Use a valid subdomain, slug, or dealership ID.`);
  }

  return dealership;
}

function toScrapedVehicle(listing: VehicleListing, dealershipId: number): ScrapedVehicle {
  if (!listing) {
    throw new Error('Cannot convert null listing to scraped vehicle.');
  }

  const vehicle = listing;
  return {
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    trim: vehicle.trim || 'Base',
    type: vehicle.type || 'SUV',
    price: vehicle.price,
    odometer: vehicle.odometer,
    images: vehicle.images || [],
    badges: vehicle.badges || [],
    location: vehicle.location,
    dealership: vehicle.dealership,
    dealershipId,
    description: vehicle.description || `${vehicle.year} ${vehicle.make} ${vehicle.model}`.trim(),
    vin: vehicle.vin,
    stockNumber: vehicle.stockNumber,
    carfaxUrl: vehicle.carfaxUrl,
    carfaxBadges: vehicle.badges,
    dealerVdpUrl: vehicle.dealerVdpUrl,
    dealRating: vehicle.dealRating,
    cargurusPrice: vehicle.cargurusPrice,
    cargurusUrl: vehicle.cargurusUrl,
    exteriorColor: vehicle.exteriorColor,
    interiorColor: vehicle.interiorColor,
    transmission: vehicle.transmission,
    drivetrain: vehicle.drivetrain,
    fuelType: vehicle.fuelType,
    engine: vehicle.engine,
  };
}

function collectRepairUrls(artifact: LiveReconciliationArtifact): string[] {
  const urls = new Set<string>();

  for (const sampledVehicle of artifact.sampledVehicles ?? []) {
    const vdpUrl = sampledVehicle.source?.vdpUrl?.trim();
    if (!vdpUrl) continue;
    urls.add(vdpUrl);
  }

  for (const missingUrl of artifact.dealership.listingPageSignals?.missingStoredVehicleUrlsTop10 ?? []) {
    const trimmed = missingUrl.trim();
    if (trimmed) urls.add(trimmed);
  }

  return Array.from(urls);
}

function buildSourceSnapshotLookup(artifact: LiveReconciliationArtifact): Map<string, LiveSourceSnapshot> {
  const lookup = new Map<string, LiveSourceSnapshot>();
  for (const sampledVehicle of artifact.sampledVehicles ?? []) {
    const vdpUrl = normalizeDealerVdpUrl(sampledVehicle.source?.vdpUrl);
    if (!vdpUrl || !sampledVehicle.source) continue;
    lookup.set(vdpUrl, sampledVehicle.source);
  }
  return lookup;
}

function preferText(primary: string | null | undefined, fallback: string | null | undefined): string | undefined {
  const primaryTrimmed = primary?.trim();
  if (primaryTrimmed) return primaryTrimmed;
  const fallbackTrimmed = fallback?.trim();
  return fallbackTrimmed || undefined;
}

function mergeSourceFallback(listing: VehicleListing, sourceSnapshot?: LiveSourceSnapshot): VehicleListing {
  if (!sourceSnapshot) return listing;

  return {
    ...listing,
    vin: preferText(listing.vin, sourceSnapshot.vin),
    stockNumber: preferText(listing.stockNumber, sourceSnapshot.stockNumber),
    trim: preferText(listing.trim, sourceSnapshot.trim),
    price: listing.price ?? sourceSnapshot.price ?? null,
    odometer: listing.odometer ?? sourceSnapshot.odometer ?? null,
    transmission: preferText(listing.transmission, sourceSnapshot.transmission),
    drivetrain: preferText(listing.drivetrain, sourceSnapshot.drivetrain),
    fuelType: preferText(listing.fuelType, sourceSnapshot.fuelType),
    exteriorColor: preferText(listing.exteriorColor, sourceSnapshot.exteriorColor),
    interiorColor: preferText(listing.interiorColor, sourceSnapshot.interiorColor),
    carfaxUrl: preferText(listing.carfaxUrl, sourceSnapshot.carfaxUrl),
    dealerVdpUrl: preferText(listing.dealerVdpUrl, sourceSnapshot.vdpUrl),
  };
}

async function main() {
  const dealership = await resolveDealership();
  const dealershipLabel = deriveDealershipOperatorLabel(dealership);
  const inputPath = path.resolve(
    getArg('--input') ??
      path.join('tmp', 'swarm-launch10', buildDealershipArtifactFileName('scrape-reconciliation-live', dealership)),
  );

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Reconciliation artifact not found: ${inputPath}`);
  }

  const artifact = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as LiveReconciliationArtifact;
  const repairUrls = collectRepairUrls(artifact);
  const sourceSnapshotLookup = buildSourceSnapshotLookup(artifact);
  if (repairUrls.length === 0) {
    throw new Error(`No repair URLs found in ${inputPath}`);
  }

  const browserless = await getBrowserlessUnifiedServiceForDealership(dealership.id);
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const vdpUrl of repairUrls) {
      try {
        const listing = await browserless.scrapeVehicleDetail(vdpUrl, {
          dealershipId: dealership.id,
          dealershipName: dealership.name,
          location: dealership.city || dealership.province || 'BC',
        });

        if (!listing) {
          results.push({
            vdpUrl,
            status: 'failed',
            reason: 'listing_not_extracted',
          });
          continue;
        }

        const mergedListing = mergeSourceFallback(listing, sourceSnapshotLookup.get(normalizeDealerVdpUrl(vdpUrl)));
        const writeResult = await upsertVehicleByVin(toScrapedVehicle(mergedListing, dealership.id));
        results.push({
          vdpUrl,
          status: 'repaired',
          action: writeResult.action,
          vehicleId: writeResult.id,
          vin: mergedListing.vin ?? null,
          stockNumber: mergedListing.stockNumber ?? null,
          price: mergedListing.price,
          imageCount: mergedListing.images.length,
          carfaxUrl: mergedListing.carfaxUrl ?? null,
        });
      } catch (error) {
        results.push({
          vdpUrl,
          status: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  } finally {
    await browserless.close().catch(() => undefined);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    dealership: {
      id: dealership.id,
      label: dealershipLabel,
      name: dealership.name,
      slug: dealership.slug,
      subdomain: dealership.subdomain,
    },
    sourceArtifactPath: inputPath,
    attemptedRepairCount: repairUrls.length,
    repairedCount: results.filter((result) => result.status === 'repaired').length,
    failedCount: results.filter((result) => result.status === 'failed').length,
    staleRemoval: {
      status: 'skipped' as 'skipped' | 'applied',
      blockedReason: null as string | null,
      deletedCount: 0,
      deletedVehicleIds: [] as number[],
    },
    results,
  };

  const observedPage = await storage.getVehicles(dealership.id, 1000, 0);
  const staleRemovalDecision = assessSourceTruthStaleRemoval({
    visibleSourceVehicleUrls: artifact.dealership.listingPageSignals?.visibleVehicleUrls ?? [],
    observedVehicles: observedPage.vehicles.map((vehicle) => ({
      id: vehicle.id,
      dealerVdpUrl: vehicle.dealerVdpUrl,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
    })),
  });

  if (!staleRemovalDecision.safeToApply) {
    summary.staleRemoval.blockedReason = staleRemovalDecision.blockedReason;
  } else if (staleRemovalDecision.staleVehicles.length > 0) {
    const staleVehicleIds = staleRemovalDecision.staleVehicles.map((vehicle) => vehicle.id);
    await db
      .update(vehicles)
      .set({
        deletedAt: new Date(),
        deletedReason: 'REMOVED_BY_SYNC',
        lifecycleStatus: 'REMOVED_BY_SYNC',
      })
      .where(inArray(vehicles.id, staleVehicleIds));

    summary.staleRemoval = {
      status: 'applied',
      blockedReason: null,
      deletedCount: staleVehicleIds.length,
      deletedVehicleIds: staleVehicleIds,
    };
  }

  const outputPath = path.resolve(
    'tmp/swarm-launch10',
    buildDealershipArtifactFileName('source-truth-repair', dealership),
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
