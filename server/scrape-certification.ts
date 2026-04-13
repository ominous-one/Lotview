import fs from 'node:fs';
import path from 'node:path';
import type { DealershipScrapeGateResult, VehicleReconciliationResult } from './scrape-truth-foundation';

export const SCRAPE_CERTIFICATION_ARTIFACT_VERSION = 2;
export const SCRAPE_CERTIFICATION_MAX_AGE_HOURS = 36;
export const SCRAPE_SUSTAINED_GREEN_STREAK_BLOCKER = 'insufficient_consecutive_green_days';
export const SCRAPE_CERTIFICATION_MIN_SOURCE_SAMPLE_SIZE = 10;

export type ScrapeCertificationTruthBoundary =
  | 'source_truth_reconciliation'
  | 'stored_inventory_internal_consistency';

export interface DealershipScrapeCertificationMetrics {
  sampledVehicleCount: number;
  sampledVehiclePassCount: number;
  scrapeSuccessRate: number;
  staleRemovalWithinSla: boolean;
  consecutiveDaysAbove95: number;
  imageContaminationRate: number;
  hasCarfaxUnknownsOnlyWhenAbsent: boolean;
  inventoryTotal?: number | null;
  latestScrapeRunId?: number | null;
}

export interface DealershipScrapeCertificationArtifact {
  artifactVersion: number;
  artifactType: 'dealership_scrape_certification';
  dealershipId: number;
  dealershipLabel?: string;
  generatedAt: string;
  truthBoundary: ScrapeCertificationTruthBoundary;
  gate: DealershipScrapeGateResult;
  metrics: DealershipScrapeCertificationMetrics;
  sampledVehicles: VehicleReconciliationResult[];
  launchEligible: boolean;
  launchBlockers: string[];
  notes: string[];
}

export interface ScrapeCertificationArtifactAssessment {
  usable: boolean;
  blockers: string[];
  ageHours: number | null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)));
}

function formatGeneratedAt(value?: Date | string): string {
  if (!value) return new Date().toISOString();
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function deriveLaunchGateBlockers(
  truthBoundary: ScrapeCertificationTruthBoundary,
  gateBlockers: string[],
): string[] {
  const normalized = uniqueStrings(gateBlockers);

  if (truthBoundary !== 'source_truth_reconciliation') {
    return normalized;
  }

  return normalized.filter((blocker) => blocker !== SCRAPE_SUSTAINED_GREEN_STREAK_BLOCKER);
}

export function deriveDealershipScrapeCertificationLaunchBlockers(
  artifact: Pick<DealershipScrapeCertificationArtifact, 'truthBoundary' | 'gate' | 'metrics'>,
): string[] {
  const truthBoundaryBlocker =
    artifact.truthBoundary === 'source_truth_reconciliation'
      ? null
      : 'truth_boundary_not_source_reconciled';
  const sourceTruthSampleSizeBlocker =
    artifact.truthBoundary === 'source_truth_reconciliation' &&
    (artifact.metrics?.sampledVehicleCount ?? 0) < SCRAPE_CERTIFICATION_MIN_SOURCE_SAMPLE_SIZE
      ? 'source_truth_sample_size_below_threshold'
      : null;

  return uniqueStrings([
    truthBoundaryBlocker,
    sourceTruthSampleSizeBlocker,
    ...deriveLaunchGateBlockers(artifact.truthBoundary, artifact.gate?.blockers ?? []),
  ]);
}

function deriveDealershipScrapeCertificationLifecycleBlockers(
  artifact: Pick<DealershipScrapeCertificationArtifact, 'generatedAt'>,
  now: Date,
): { blockers: string[]; ageHours: number | null } {
  const blockers: string[] = [];
  const generatedAtMs = new Date(artifact.generatedAt).getTime();
  let ageHours: number | null = null;

  if (Number.isNaN(generatedAtMs)) {
    blockers.push('certification_generated_at_invalid');
  } else {
    ageHours = (now.getTime() - generatedAtMs) / (1000 * 60 * 60);
    if (ageHours > SCRAPE_CERTIFICATION_MAX_AGE_HOURS) {
      blockers.push('certification_artifact_stale');
    }
  }

  return { blockers, ageHours };
}

export function deriveDealershipScrapePostingGate(
  artifact: DealershipScrapeCertificationArtifact,
  now = new Date(),
): DealershipScrapeGateResult {
  const launchBlockers = deriveDealershipScrapeCertificationLaunchBlockers(artifact);
  const lifecycle = deriveDealershipScrapeCertificationLifecycleBlockers(artifact, now);
  const blockers = uniqueStrings([...launchBlockers, ...lifecycle.blockers]);

  return {
    ...artifact.gate,
    passed: blockers.length === 0,
    blockers,
  };
}

export function mergeDealershipScrapeGateBlockers(
  gate: DealershipScrapeGateResult,
  additionalBlockers: string[],
): DealershipScrapeGateResult {
  const blockers = uniqueStrings([...(additionalBlockers ?? []), ...(gate.blockers ?? [])]);
  return {
    ...gate,
    passed: blockers.length === 0,
    blockers,
  };
}

export function buildDealershipScrapeCertificationArtifact(params: {
  dealershipId: number;
  dealershipLabel?: string;
  generatedAt?: Date | string;
  truthBoundary: ScrapeCertificationTruthBoundary;
  gate: DealershipScrapeGateResult;
  metrics: DealershipScrapeCertificationMetrics;
  sampledVehicles: VehicleReconciliationResult[];
  notes?: string[];
}): DealershipScrapeCertificationArtifact {
  const launchBlockers = deriveDealershipScrapeCertificationLaunchBlockers({
    truthBoundary: params.truthBoundary,
    gate: params.gate,
    metrics: params.metrics,
  });

  const defaultNotes =
    params.truthBoundary === 'source_truth_reconciliation'
      ? [
          'Launch certification requires fresh source-of-truth reconciliation evidence.',
        ]
      : [
          'Diagnostic only: stored inventory internal consistency does not certify launch readiness.',
        ];

  const sustainedCertificationNotes =
    params.truthBoundary === 'source_truth_reconciliation' &&
    (params.gate.blockers ?? []).includes(SCRAPE_SUSTAINED_GREEN_STREAK_BLOCKER)
      ? [
          'Bootstrap launch may proceed before a 7-day green streak when source-truth reconciliation is fresh and launch blockers are otherwise clear.',
          'Continue daily certification monitoring until the sustained green streak clears.',
        ]
      : [];

  return {
    artifactVersion: SCRAPE_CERTIFICATION_ARTIFACT_VERSION,
    artifactType: 'dealership_scrape_certification',
    dealershipId: params.dealershipId,
    dealershipLabel: params.dealershipLabel,
    generatedAt: formatGeneratedAt(params.generatedAt),
    truthBoundary: params.truthBoundary,
    gate: params.gate,
    metrics: params.metrics,
    sampledVehicles: params.sampledVehicles,
    launchEligible: launchBlockers.length === 0,
    launchBlockers,
    notes: uniqueStrings([...(params.notes ?? []), ...defaultNotes, ...sustainedCertificationNotes]),
  };
}

export function getDealershipScrapeCertificationArtifactPath(
  dealershipId: number,
  rootDir = process.cwd(),
): string {
  return path.resolve(rootDir, 'artifacts', 'scrape-certification', `dealership-${dealershipId}.json`);
}

export function writeDealershipScrapeCertificationArtifact(
  artifact: DealershipScrapeCertificationArtifact,
  options?: { rootDir?: string },
): string {
  const outputPath = getDealershipScrapeCertificationArtifactPath(
    artifact.dealershipId,
    options?.rootDir,
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return outputPath;
}

export function readDealershipScrapeCertificationArtifact(
  dealershipId: number,
  options?: { rootDir?: string },
): DealershipScrapeCertificationArtifact | null {
  const artifactPath = getDealershipScrapeCertificationArtifactPath(dealershipId, options?.rootDir);
  if (!fs.existsSync(artifactPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as unknown;
    if (!isPlainObject(parsed)) {
      return null;
    }

    if (parsed.artifactType !== 'dealership_scrape_certification') {
      return null;
    }

    if (Number(parsed.dealershipId) !== dealershipId) {
      return null;
    }

    if (!isPlainObject(parsed.gate) || !Array.isArray(parsed.sampledVehicles) || !isPlainObject(parsed.metrics)) {
      return null;
    }

    return parsed as unknown as DealershipScrapeCertificationArtifact;
  } catch {
    return null;
  }
}

export function assessDealershipScrapeCertificationArtifact(
  artifact: DealershipScrapeCertificationArtifact,
  now = new Date(),
): ScrapeCertificationArtifactAssessment {
  const lifecycle = deriveDealershipScrapeCertificationLifecycleBlockers(artifact, now);
  const blockers = uniqueStrings([
    ...deriveDealershipScrapeCertificationLaunchBlockers(artifact),
    ...lifecycle.blockers,
  ]);

  return {
    usable: blockers.length === 0,
    blockers,
    ageHours: lifecycle.ageHours,
  };
}
