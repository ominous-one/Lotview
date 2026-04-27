import fs from "node:fs";
import path from "node:path";

import type {
  DealershipScrapeGateResult,
  VehicleReconciliationResult,
} from "./scrape-truth-foundation";

export interface DealershipScrapeCertificationArtifact {
  dealershipId: number;
  dealershipLabel?: string;
  generatedAt: string;
  truthBoundary: "source_truth_reconciliation" | "stored_inventory_internal_consistency" | string;
  gate: DealershipScrapeGateResult;
  metrics: Record<string, unknown>;
  sampledVehicles: VehicleReconciliationResult[];
  notes: string[];
}

export function buildDealershipScrapeCertificationArtifact(input: {
  dealershipId: number;
  dealershipLabel?: string;
  truthBoundary: string;
  gate: DealershipScrapeGateResult;
  metrics: Record<string, unknown>;
  sampledVehicles: VehicleReconciliationResult[];
  notes?: string[];
}): DealershipScrapeCertificationArtifact {
  return {
    dealershipId: input.dealershipId,
    dealershipLabel: input.dealershipLabel,
    generatedAt: new Date().toISOString(),
    truthBoundary: input.truthBoundary,
    gate: input.gate,
    metrics: input.metrics,
    sampledVehicles: input.sampledVehicles,
    notes: input.notes ?? [],
  };
}

export function assessDealershipScrapeCertificationArtifact(
  artifact: DealershipScrapeCertificationArtifact,
): { usable: boolean; blockers: string[] } {
  const blockers = new Set<string>();

  if (artifact.truthBoundary !== "source_truth_reconciliation") {
    blockers.add("truth_boundary_not_source_reconciled");
  }

  if (!artifact.gate.passed) {
    for (const blocker of artifact.gate.blockers) blockers.add(blocker);
  }

  if (!Array.isArray(artifact.sampledVehicles) || artifact.sampledVehicles.length === 0) {
    blockers.add("no_inventory_sample_available");
  }

  return {
    usable: blockers.size === 0,
    blockers: Array.from(blockers),
  };
}

export function deriveDealershipScrapePostingGate(
  artifact: DealershipScrapeCertificationArtifact,
): DealershipScrapeGateResult {
  return artifact.gate;
}

export function mergeDealershipScrapeGateBlockers(
  gate: DealershipScrapeGateResult,
  blockers: string[],
): DealershipScrapeGateResult {
  const mergedBlockers = Array.from(new Set([...(gate.blockers ?? []), ...blockers]));

  return {
    ...gate,
    passed: gate.passed && mergedBlockers.length === 0,
    blockers: mergedBlockers,
  };
}

export function readDealershipScrapeCertificationArtifact(
  dealershipId: number,
): DealershipScrapeCertificationArtifact | null {
  const artifactPath = path.join(
    process.cwd(),
    "certifications",
    "scrape",
    `${dealershipId}.json`,
  );

  if (!fs.existsSync(artifactPath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(artifactPath, "utf8")) as DealershipScrapeCertificationArtifact;
  } catch (error) {
    console.error(`[ScrapeCertification] Failed to read artifact for dealership ${dealershipId}:`, error);
    return null;
  }
}
