import { decodeVIN, type VINDecodeResult } from "./vin-decoder";

export async function enrichVehicleData(vin: string, dealershipId?: number): Promise<VINDecodeResult> {
  return decodeVIN(vin, dealershipId);
}

export async function enrichVIN(vin: string, dealershipId?: number): Promise<VINDecodeResult> {
  return decodeVIN(vin, dealershipId);
}

export function toVINDecodeResult(result: VINDecodeResult): VINDecodeResult {
  return result;
}
