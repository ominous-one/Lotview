import fs from 'node:fs';
import path from 'node:path';
import { BrowserlessUnifiedService } from '../server/browserless-unified';
import {
  buildDealershipArtifactFileName,
  deriveDealershipOperatorLabel,
  resolveDealershipReference,
} from '../server/dealership-reference';
import { buildLiveSourceReconciliationArtifact } from '../server/live-source-reconciliation';
import { storage } from '../server/storage';

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

async function main() {
  const sampleSizeRaw = getArg('--sampleSize');
  const sampleSize = sampleSizeRaw == null ? 10 : Number(sampleSizeRaw);
  if (!Number.isFinite(sampleSize) || sampleSize <= 0) {
    throw new Error(`Invalid sampleSize: ${sampleSizeRaw}`);
  }

  const dealership = await resolveDealership();
  const dealershipLabel = deriveDealershipOperatorLabel(dealership);
  const scrapeSources = await storage.getActiveScrapeSources(dealership.id);
  const source = scrapeSources[0];

  if (!source) {
    throw new Error(`No active scrape source configured for ${dealershipLabel}`);
  }

  const observedPage = await storage.getVehicles(dealership.id, 500, 0);
  const scraper = new BrowserlessUnifiedService();
  const result = await scraper.scrapeDealerInventory(source.sourceUrl, {
    dealershipId: dealership.id,
    dealershipName: source.sourceName,
    location: source.sourceName.includes('Vancouver') ? 'Vancouver' : 'BC',
    scrapeVdp: true,
    maxVehicles: sampleSize,
  });

  if (!result.success) {
    throw new Error(`Live source reconciliation scrape failed: ${result.error ?? 'unknown_error'}`);
  }

  const artifact = buildLiveSourceReconciliationArtifact({
    dealership: {
      id: dealership.id,
      label: dealershipLabel,
      name: dealership.name,
      slug: dealership.slug,
      subdomain: dealership.subdomain,
    },
    listingUrl: source.sourceUrl,
    visibleSourceVehicleCount: result.sourceVehicleCount ?? result.sourceVehicleUrls?.length ?? result.vehicles.length,
    sourceVehicleUrls: result.sourceVehicleUrls ?? result.vehicles.map(vehicle => vehicle.dealerVdpUrl).filter((value): value is string => Boolean(value)),
    sourceVehicles: result.vehicles,
    observedVehicles: observedPage.vehicles,
  });

  const outputPath = path.resolve(
    'tmp/swarm-launch10',
    buildDealershipArtifactFileName('scrape-reconciliation-live', dealership),
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
