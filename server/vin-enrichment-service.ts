export async function enrichVehicleData(vin: string): Promise<any> {
  return { vin };
}

export async function enrichVIN(vin: string, _dealershipId?: number): Promise<any> {
  return {
    vin: String(vin || "").trim().toUpperCase(),
    source: "local",
    confidence: 0,
    errorCode: "VIN_ENRICHMENT_NOT_CONFIGURED",
    errorMessage: "VIN enrichment is not configured",
  };
}

export function toVINDecodeResult(result: any): any {
  return result;
}
