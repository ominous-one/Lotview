import { insertVehicleSchema, type InsertVehicle } from "@shared/schema";
import type { z } from "zod";

export const vehicleCreateRequestSchema = insertVehicleSchema.omit({
  dealershipId: true,
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
