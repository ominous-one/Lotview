import { insertVehicleSchema, type InsertVehicle } from "@shared/schema";
import type { z } from "zod";

export const vehicleCreateRequestSchema = insertVehicleSchema.omit({
  dealershipId: true,
  normalizedStockNumber: true,
  manualHeadline: true,
  manualSubheadline: true,
  manualDescription: true,
  isManuallyEdited: true,
  lastEditedBy: true,
  lastEditedAt: true,
  lastScrapedAt: true,
  verificationStatus: true,
  verificationCheckedAt: true,
  missedScrapeCount: true,
  deletedAt: true,
  deletedByUserId: true,
  deletedReason: true,
  lifecycleStatus: true,
  photoEnrichFailCount: true,
  photoEnrichLastAttemptAt: true,
  photoEnrichLastError: true,
  photoFingerprint: true,
  lastPriceRefreshAt: true,
});

export const vehicleUpdateRequestSchema = vehicleCreateRequestSchema.partial();

export type VehicleCreateRequestInput = z.infer<typeof vehicleCreateRequestSchema>;
export type VehicleUpdateRequestInput = z.infer<typeof vehicleUpdateRequestSchema>;

export function withResolvedVehicleDealership(
  payload: VehicleCreateRequestInput,
  dealershipId: number,
): InsertVehicle {
  return {
    ...payload,
    dealershipId,
  } as InsertVehicle;
}
