import fs from 'node:fs';
import path from 'node:path';
import { storage } from '../server/storage';
import {
  buildDealershipArtifactFileName,
  deriveDealershipOperatorLabel,
  resolveDealershipReference,
} from '../server/dealership-reference';
import { assessDealershipScrapeCertificationArtifact, writeDealershipScrapeCertificationArtifact } from '../server/scrape-certification';
import { buildSourceTruthCertificationArtifactFromLiveReconciliation, type LiveSourceTruthReconciliationArtifact } from '../server/source-truth-certification';

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
  const inputPathRaw = getArg('--input');
  if (!inputPathRaw) {
    throw new Error('Missing required --input <path-to-live-reconciliation-json>.');
  }

  const consecutiveDaysAbove95Raw = getArg('--consecutiveDaysAbove95');
  const consecutiveDaysAbove95 = consecutiveDaysAbove95Raw == null
    ? 0
    : Number(consecutiveDaysAbove95Raw);

  if (!Number.isFinite(consecutiveDaysAbove95) || consecutiveDaysAbove95 < 0) {
    throw new Error(`Invalid consecutiveDaysAbove95: ${consecutiveDaysAbove95Raw}`);
  }

  const dealership = await resolveDealership();
  const dealershipLabel = deriveDealershipOperatorLabel(dealership);
  const inputPath = path.resolve(inputPathRaw);

  const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as LiveSourceTruthReconciliationArtifact;
  const vehiclePage = await storage.getVehicles(dealership.id, 1, 0);
  const latestScrapeRun = await storage.getLatestScrapeRun(dealership.id);

  const artifact = buildSourceTruthCertificationArtifactFromLiveReconciliation({
    dealershipId: dealership.id,
    dealershipLabel,
    liveArtifact: parsed,
    storedInventoryTotal: vehiclePage.total,
    latestScrapeRunId: latestScrapeRun?.id ?? null,
    consecutiveDaysAbove95,
  });

  const outputPath = writeDealershipScrapeCertificationArtifact(artifact);
  const assessment = assessDealershipScrapeCertificationArtifact(artifact);

  const summary = {
    generatedAt: new Date().toISOString(),
    sourceArtifactPath: inputPath,
    certificationArtifactPath: outputPath,
    dealership: {
      id: dealership.id,
      label: dealershipLabel,
      name: dealership.name,
      slug: dealership.slug,
      subdomain: dealership.subdomain,
    },
    launchEligible: artifact.launchEligible,
    launchBlockers: artifact.launchBlockers,
    assessment,
    metrics: artifact.metrics,
  };

  const summaryPath = path.resolve(
    'tmp/swarm-launch10',
    buildDealershipArtifactFileName('source-truth-certification-summary', dealership),
  );

  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(summaryPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
