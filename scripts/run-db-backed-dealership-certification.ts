import fs from 'node:fs';
import path from 'node:path';
import { storage } from '../server/storage';
import {
  buildDealershipArtifactFileName,
  deriveDealershipOperatorLabel,
  resolveDealershipReference,
} from '../server/dealership-reference';
import { computeStoredInventoryScrapeGate, resolveDealershipScrapeGateForPosting } from '../server/scrape-gate-service';
import { evaluateAndEnqueueAutopostQueue, listAutopostQueue } from '../server/autopost-queue-service';

function getArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const dealershipIdRaw = getArg('--dealershipId');
  const dealershipReference = getArg('--dealership');
  if (!dealershipIdRaw && !dealershipReference) {
    throw new Error('Missing dealership selector. Use --dealership <subdomain-or-slug> or --dealershipId <number>.');
  }

  let dealership = null;
  if (dealershipIdRaw) {
    const dealershipId = Number(dealershipIdRaw);
    if (!Number.isFinite(dealershipId) || dealershipId <= 0) {
      throw new Error(`Invalid dealershipId: ${dealershipIdRaw}`);
    }

    dealership = await storage.getDealership(dealershipId);
  } else if (dealershipReference) {
    dealership = await resolveDealershipReference(storage, dealershipReference);
  }

  if (!dealership) {
    const requested = dealershipReference ?? dealershipIdRaw;
    throw new Error(`Dealership ${requested} not found. Use a valid subdomain, slug, or dealership ID.`);
  }
  const dealershipId = dealership.id;
  const dealershipLabel = deriveDealershipOperatorLabel(dealership);

  const gateComputation = await computeStoredInventoryScrapeGate(dealershipId);
  if (!gateComputation) {
    throw new Error(`No stored inventory found for dealership ${dealershipLabel}`);
  }

  const latestScrapeRun = await storage.getLatestScrapeRun(dealershipId);
  const scrapeSources = await storage.getActiveScrapeSources(dealershipId);
  const vehiclePage = await storage.getVehicles(dealershipId, 25, 0);
  const outputDir = path.resolve('tmp/swarm-launch10');
  fs.mkdirSync(outputDir, { recursive: true });
  const certificationArtifactPath = path.join(
    outputDir,
    buildDealershipArtifactFileName('stored-inventory-certification-diagnostic', dealership),
  );
  fs.writeFileSync(
    certificationArtifactPath,
    `${JSON.stringify(gateComputation.certificationArtifact, null, 2)}\n`,
  );

  const scrapeGateResolution = await resolveDealershipScrapeGateForPosting(dealershipId);

  const queueEval = await evaluateAndEnqueueAutopostQueue({
    dealershipId,
    actorUserId: null,
    scrapeGate: scrapeGateResolution.gate,
  });

  const queue = await listAutopostQueue({ dealershipId, platform: 'all' });

  const artifact = {
    generatedAt: new Date().toISOString(),
    artifactType: 'db-backed-dealership-certification-and-queue-eval',
    dealership: {
      id: dealership.id,
      label: dealershipLabel,
      name: dealership.name,
      slug: dealership.slug,
      subdomain: dealership.subdomain,
    },
    truthBoundary: gateComputation.truthBoundary,
    storedInventoryCertificationDiagnosticPath: certificationArtifactPath,
    storedInventoryCertificationDiagnostic: gateComputation.certificationArtifact,
    scrapeGateResolution,
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
    scrapeGate: scrapeGateResolution.gate,
    sampledVehicles: gateComputation.sampledVehicles,
    queueEvaluation: queueEval,
    queueTop10: queue.slice(0, 10),
  };

  const outputPath = path.join(outputDir, buildDealershipArtifactFileName('db-certification', dealership));
  fs.writeFileSync(outputPath, JSON.stringify(artifact, null, 2));
  console.log(outputPath);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
