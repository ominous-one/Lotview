import fs from 'node:fs';
import path from 'node:path';
import { storage } from '../server/storage';
import { computeStoredInventoryScrapeGate } from '../server/scrape-gate-service';
import { evaluateAndEnqueueAutopostQueue, listAutopostQueue } from '../server/autopost-queue-service';

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const dealershipIdRaw = getArg('--dealershipId');
  if (!dealershipIdRaw) {
    throw new Error('Missing required --dealershipId <number>');
  }

  const dealershipId = Number(dealershipIdRaw);
  if (!Number.isFinite(dealershipId) || dealershipId <= 0) {
    throw new Error(`Invalid dealershipId: ${dealershipIdRaw}`);
  }

  const dealership = await storage.getDealership(dealershipId);
  if (!dealership) {
    throw new Error(`Dealership ${dealershipId} not found`);
  }

  const gateComputation = await computeStoredInventoryScrapeGate(dealershipId);
  if (!gateComputation) {
    throw new Error(`No stored inventory found for dealership ${dealershipId}`);
  }

  const latestScrapeRun = await storage.getLatestScrapeRun(dealershipId);
  const scrapeSources = await storage.getActiveScrapeSources(dealershipId);
  const vehiclePage = await storage.getVehicles(dealershipId, 25, 0);

  const queueEval = await evaluateAndEnqueueAutopostQueue({
    dealershipId,
    actorUserId: null,
    scrapeGate: gateComputation.gate,
  });

  const queue = await listAutopostQueue({ dealershipId, platform: 'all' });

  const artifact = {
    generatedAt: new Date().toISOString(),
    artifactType: 'db-backed-dealership-certification-and-queue-eval',
    dealership: {
      id: dealership.id,
      name: dealership.name,
      slug: dealership.slug,
      subdomain: dealership.subdomain,
    },
    truthBoundary: gateComputation.truthBoundary,
    latestScrapeRun,
    scrapeSources: scrapeSources.map(source => ({
      id: source.id,
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      sourceUrl: source.sourceUrl,
      lastScrapedAt: source.lastScrapedAt,
      vehicleCount: source.vehicleCount,
    })),
    storedInventorySampleCount: vehiclePage.vehicles.length,
    storedInventoryTotal: vehiclePage.total,
    scrapeGate: gateComputation.gate,
    sampledVehicles: gateComputation.sampledVehicles,
    queueEvaluation: queueEval,
    queueTop10: queue.slice(0, 10),
  };

  const outputDir = path.resolve('tmp/swarm-launch10');
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `db-certification-dealership-${dealershipId}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
  console.log(outputPath);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
