import type { DedupResult, ScrapedVehicleData } from "./vehicle-dedup";

export const EXTERNAL_IMPORT_DEDUP_DISABLED = "vehicle_deduplication_disabled";
export const EXTERNAL_IMPORT_DEDUP_FAILED = "vehicle_deduplication_failed";

type StoreExternalVehicleImportInput = {
  dealershipId: number;
  index: number;
  normalizedVin: string;
  vehiclePayload: Record<string, unknown>;
  isDedupEnabled: (dealershipId: number) => Promise<boolean>;
  deduplicate: (dealershipId: number, vehicle: ScrapedVehicleData) => Promise<DedupResult>;
  now?: () => number;
};

type StoreExternalVehicleImportResult =
  | {
      ok: true;
      id?: number;
      vin: string;
      action?: DedupResult["action"];
      confidence?: number;
    }
  | {
      ok: false;
      vin: string;
      error: string;
      errorCode: typeof EXTERNAL_IMPORT_DEDUP_DISABLED | typeof EXTERNAL_IMPORT_DEDUP_FAILED;
    };

export async function storeExternalVehicleImport({
  dealershipId,
  index,
  normalizedVin,
  vehiclePayload,
  isDedupEnabled,
  deduplicate,
  now = Date.now,
}: StoreExternalVehicleImportInput): Promise<StoreExternalVehicleImportResult> {
  if (!(await isDedupEnabled(dealershipId))) {
    return {
      ok: false,
      vin: normalizedVin,
      error: "Vehicle deduplication is required for external vehicle imports.",
      errorCode: EXTERNAL_IMPORT_DEDUP_DISABLED,
    };
  }

  const timestamp = now();

  try {
    const dedupResult = await deduplicate(dealershipId, {
      vin: normalizedVin,
      sourceId: `import_${timestamp}_${index}`,
      sourceType: "external_import",
      scrapedAt: new Date(timestamp),
      data: vehiclePayload,
    });

    return {
      ok: true,
      id: dedupResult.vehicleId,
      vin: normalizedVin,
      action: dedupResult.action,
      confidence: dedupResult.confidence,
    };
  } catch (error) {
    return {
      ok: false,
      vin: normalizedVin,
      error: error instanceof Error ? error.message : "Vehicle deduplication failed for external import.",
      errorCode: EXTERNAL_IMPORT_DEDUP_FAILED,
    };
  }
}
