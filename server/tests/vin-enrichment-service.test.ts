import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const decodeVINMock = jest.fn() as any;
const VALID_VIN = "1HGCM82633A004352";

let vinEnrichmentService: typeof import("../vin-enrichment-service");

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../vin-decoder", () => ({
    decodeVIN: decodeVINMock,
  }));

  vinEnrichmentService = await import("../vin-enrichment-service");
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe("VIN enrichment service", () => {
  it("wires manager VIN enrichment to the production VIN decoder", async () => {
    decodeVINMock.mockResolvedValue({
      vin: VALID_VIN,
      year: "2003",
      make: "HONDA",
      model: "Accord",
      source: "nhtsa",
      confidence: "high",
    });

    const result = await vinEnrichmentService.enrichVIN(VALID_VIN, 7);

    expect(decodeVINMock).toHaveBeenCalledWith(VALID_VIN, 7);
    expect(result).toMatchObject({
      vin: VALID_VIN,
      year: "2003",
      make: "HONDA",
      model: "Accord",
      source: "nhtsa",
      confidence: "high",
    });
    expect(result.errorCode).not.toBe("VIN_ENRICHMENT_NOT_CONFIGURED");
  });

  it("wires generic vehicle data enrichment through the same decoder path", async () => {
    decodeVINMock.mockResolvedValue({
      vin: VALID_VIN,
      source: "nhtsa",
      confidence: "high",
    });

    const result = await vinEnrichmentService.enrichVehicleData(VALID_VIN, 7);

    expect(decodeVINMock).toHaveBeenCalledWith(VALID_VIN, 7);
    expect(result).toMatchObject({
      vin: VALID_VIN,
      source: "nhtsa",
      confidence: "high",
    });
  });

  it("keeps route decode result conversion lossless", () => {
    const decoderResult = {
      vin: VALID_VIN,
      errorCode: "INVALID_VIN_CHECK_DIGIT",
      errorMessage: "VIN check digit is invalid",
      confidence: "invalid" as const,
    };

    expect(vinEnrichmentService.toVINDecodeResult(decoderResult)).toBe(decoderResult);
  });
});
