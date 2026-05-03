import { hasVehicleVINWriteError, normalizeVehicleWriteVIN, vehicleVINWriteErrorResponse } from "./vehicle-vin-write-guard";

type VehicleIdentity = {
  id: number;
  vin?: string | null;
};

type VehicleLookupResult = {
  id: number;
  year?: number | null;
  make?: string | null;
  model?: string | null;
};

type FindVehicleByVin = (vin: string, dealershipId: number) => Promise<VehicleLookupResult | undefined>;

export type ForceRescrapeVinDecision =
  | { ok: true; update: { vin?: string } }
  | { ok: false; status: 409 | 422; body: Record<string, unknown> };

export async function resolveForceRescrapeVINUpdate({
  scrapedVin,
  vehicle,
  dealershipId,
  findVehicleByVin,
}: {
  scrapedVin: unknown;
  vehicle: VehicleIdentity;
  dealershipId: number;
  findVehicleByVin: FindVehicleByVin;
}): Promise<ForceRescrapeVinDecision> {
  if (
    scrapedVin === undefined ||
    scrapedVin === null ||
    (typeof scrapedVin === "string" && scrapedVin.trim() === "")
  ) {
    return { ok: true, update: {} };
  }

  const vinGuard = normalizeVehicleWriteVIN({ vin: scrapedVin });
  if (hasVehicleVINWriteError(vinGuard)) {
    return {
      ok: false,
      status: 422,
      body: {
        error: "Scraped VIN is invalid; refusing to update vehicle from rescrape",
        details: vehicleVINWriteErrorResponse(vinGuard.error),
      },
    };
  }

  const normalizedScrapedVin = vinGuard.data.vin;
  if (typeof normalizedScrapedVin !== "string" || normalizedScrapedVin.trim() === "") {
    return { ok: true, update: {} };
  }

  const rawCurrentVin = typeof vehicle.vin === "string" ? vehicle.vin.trim() : "";
  const normalizedCurrentVin = rawCurrentVin ? rawCurrentVin.toUpperCase() : null;

  if (normalizedCurrentVin && normalizedCurrentVin !== normalizedScrapedVin) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "Scraped VIN does not match existing vehicle VIN",
        vehicleId: vehicle.id,
        currentVin: normalizedCurrentVin,
        scrapedVin: normalizedScrapedVin,
      },
    };
  }

  const vinConflict = await findVehicleByVin(normalizedScrapedVin, dealershipId);
  if (vinConflict && vinConflict.id !== vehicle.id) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "Scraped VIN already belongs to another vehicle",
        existingVehicleId: vinConflict.id,
        existingVehicle: `${vinConflict.year ?? ""} ${vinConflict.make ?? ""} ${vinConflict.model ?? ""}`.trim(),
        scrapedVin: normalizedScrapedVin,
      },
    };
  }

  return {
    ok: true,
    update: rawCurrentVin === normalizedScrapedVin ? {} : { vin: normalizedScrapedVin },
  };
}
