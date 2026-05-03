import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const VALID_VIN = "1HGCM82633A004352";
const OTHER_VALID_VIN = "1M8GDM9AXKP042788";

const storageMock = {
  getDealershipApiKeys: jest.fn() as any,
  getVinDecodeCache: jest.fn() as any,
  upsertVinDecodeCache: jest.fn() as any,
};

let vinDecoder: typeof import("../vin-decoder");

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function nhtsaResult(vin = VALID_VIN, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    VIN: vin,
    ErrorCode: "0",
    ErrorText: "0 - VIN decoded clean. Check Digit (9th position) is correct",
    ModelYear: "2003",
    Make: "HONDA",
    Model: "Accord",
    Trim: "EX-V6",
    BodyClass: "Coupe",
    VehicleType: "PASSENGER CAR",
    ...overrides,
  };
}

function getPostedBatchData(fetchCall: any): string {
  const init = fetchCall[1] as { body?: unknown };
  const params = new URLSearchParams(String(init.body));
  return params.get("data") || "";
}

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../storage", () => ({
    storage: storageMock,
  }));

  vinDecoder = await import("../vin-decoder");
});

beforeEach(() => {
  jest.clearAllMocks();
  storageMock.getDealershipApiKeys.mockResolvedValue(null);
  storageMock.getVinDecodeCache.mockResolvedValue(undefined);
  storageMock.upsertVinDecodeCache.mockResolvedValue({});
  (globalThis as any).fetch = jest.fn();
});

describe("VIN decoder provider proof", () => {
  it("uses model-year-aware NHTSA decoding and stores successful results in the tenant cache", async () => {
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockResolvedValue(jsonResponse({ Results: [nhtsaResult()] }));

    const result = await vinDecoder.decodeVIN(VALID_VIN, 7, { modelYear: 2003 });

    expect(result).toMatchObject({
      vin: VALID_VIN,
      year: "2003",
      make: "HONDA",
      model: "Accord",
      source: "nhtsa",
      confidence: "high",
      cacheStatus: "stored",
      carfaxUrlStatus: "generated_link_only",
    });

    const nhtsaUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(nhtsaUrl.pathname).toContain(`/DecodeVinValues/${VALID_VIN}`);
    expect(nhtsaUrl.searchParams.get("format")).toBe("json");
    expect(nhtsaUrl.searchParams.get("modelyear")).toBe("2003");

    expect(storageMock.upsertVinDecodeCache).toHaveBeenCalledWith(
      7,
      VALID_VIN,
      expect.objectContaining({
        baselineSource: "nhtsa",
        baselinePayload: expect.objectContaining({ vin: VALID_VIN, source: "nhtsa" }),
        expiresAt: expect.any(Date),
      })
    );
  });

  it("returns cached tenant VIN decode results without calling external providers", async () => {
    storageMock.getVinDecodeCache.mockResolvedValue({
      baselinePayload: {
        vin: VALID_VIN,
        year: "2003",
        make: "HONDA",
        model: "Accord",
        source: "nhtsa",
        confidence: "high",
      },
    });

    const result = await vinDecoder.decodeVIN(VALID_VIN, 7);

    expect(result).toMatchObject({
      vin: VALID_VIN,
      source: "nhtsa",
      cacheStatus: "hit",
      responseTimeMs: 0,
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(storageMock.getDealershipApiKeys).not.toHaveBeenCalled();
  });

  it("ignores cached VIN decode payloads that do not match the requested VIN", async () => {
    storageMock.getVinDecodeCache.mockResolvedValue({
      baselinePayload: {
        vin: OTHER_VALID_VIN,
        year: "2019",
        make: "MCI",
        model: "Bus",
        source: "nhtsa",
        confidence: "high",
      },
    });
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockResolvedValue(jsonResponse({ Results: [nhtsaResult()] }));

    const result = await vinDecoder.decodeVIN(VALID_VIN, 7, { modelYear: 2003 });

    expect(result).toMatchObject({
      vin: VALID_VIN,
      year: "2003",
      make: "HONDA",
      model: "Accord",
      source: "nhtsa",
      cacheStatus: "stored",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(storageMock.upsertVinDecodeCache).toHaveBeenCalledWith(
      7,
      VALID_VIN,
      expect.objectContaining({
        baselinePayload: expect.objectContaining({ vin: VALID_VIN }),
      })
    );
  });

  it("rejects NHTSA decode payloads that echo a different VIN", async () => {
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockResolvedValue(jsonResponse({ Results: [nhtsaResult(OTHER_VALID_VIN)] }));

    const result = await vinDecoder.decodeVIN(VALID_VIN, 7, { modelYear: 2003 });

    expect(result).toMatchObject({
      vin: VALID_VIN,
      errorCode: "VIN_PROVIDER_MISMATCH",
      source: "nhtsa",
      confidence: "invalid",
    });
    expect(result.errorMessage).toContain(OTHER_VALID_VIN);
    expect(result.warnings).toContain(
      "VIN provider response identity did not match request; decoded facts were not trusted."
    );
    expect(storageMock.upsertVinDecodeCache).not.toHaveBeenCalled();
  });

  it("marks provider disagreements instead of treating conflicting facts as verified", async () => {
    storageMock.getDealershipApiKeys.mockResolvedValue({ marketcheckKey: "marketcheck-test-key" });
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockImplementation(async (url: unknown) => {
      const requestUrl = String(url);
      if (requestUrl.includes("api.marketcheck.com")) {
        return jsonResponse({
          year: 2003,
          make: "Toyota",
          model: "Camry",
          trim: "LE",
        });
      }

      return jsonResponse({
        Results: [nhtsaResult(VALID_VIN, { Make: "HONDA", Model: "Accord", Trim: "EX-V6" })],
      });
    });

    const result = await vinDecoder.decodeVIN(VALID_VIN, 7, { modelYear: 2003 });

    expect(result.source).toBe("marketcheck");
    expect(result.confidence).toBe("low");
    expect(result.warnings).toContain(
      "VIN provider facts disagree; treat decoded facts as unverified until reviewed."
    );
    expect(result.providerDisagreements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: "make",
          primaryValue: "Toyota",
          comparisonValue: "HONDA",
        }),
        expect.objectContaining({
          field: "model",
          primaryValue: "Camry",
          comparisonValue: "Accord",
        }),
      ])
    );
  });

  it("does not trust MarketCheck facts when the provider echoes a different VIN", async () => {
    storageMock.getDealershipApiKeys.mockResolvedValue({ marketcheckKey: "marketcheck-test-key" });
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockImplementation(async (url: unknown) => {
      const requestUrl = String(url);
      if (requestUrl.includes("api.marketcheck.com")) {
        return jsonResponse({
          vin: OTHER_VALID_VIN,
          year: 2019,
          make: "Toyota",
          model: "Camry",
        });
      }

      return jsonResponse({
        Results: [nhtsaResult(VALID_VIN, { Make: "HONDA", Model: "Accord" })],
      });
    });

    const result = await vinDecoder.decodeVIN(VALID_VIN, 7, { modelYear: 2003 });

    expect(result).toMatchObject({
      vin: VALID_VIN,
      source: "nhtsa",
      make: "HONDA",
      model: "Accord",
      confidence: "high",
    });
    expect(result.make).not.toBe("Toyota");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not trust API Ninjas facts when the provider echoes a different VIN", async () => {
    const previousApiNinjasKey = process.env.API_NINJAS_KEY;
    process.env.API_NINJAS_KEY = "api-ninjas-test-key";

    try {
      const fetchMock = globalThis.fetch as any;
      fetchMock.mockImplementation(async (url: unknown) => {
        const requestUrl = String(url);
        if (requestUrl.includes("vpic.nhtsa.dot.gov")) {
          return jsonResponse({
            Results: [nhtsaResult(VALID_VIN, { ErrorCode: "1", ErrorText: "NHTSA decode failed" })],
          });
        }

        return jsonResponse({
          vin: OTHER_VALID_VIN,
          model_year: 2019,
          make: "Toyota",
          model: "Camry",
        });
      });

      const result = await vinDecoder.decodeVIN(VALID_VIN, 7, { modelYear: 2003 });

      expect(result).toMatchObject({
        vin: VALID_VIN,
        source: "nhtsa",
        errorCode: "1",
        confidence: "invalid",
      });
      expect(result.errorMessage).toContain("VIN decode failed");
      expect(result.make).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      if (previousApiNinjasKey === undefined) {
        delete process.env.API_NINJAS_KEY;
      } else {
        process.env.API_NINJAS_KEY = previousApiNinjasKey;
      }
    }
  });

  it("decodes VINs through NHTSA batches of at most 50 records", async () => {
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockImplementation(async (_url: unknown, init: unknown) => {
      const batchData = getPostedBatchData([_url, init]);
      const vins = batchData
        .split(";")
        .map((part) => part.trim().split(",")[0])
        .filter(Boolean);

      return jsonResponse({
        Results: vins.map((vin) => nhtsaResult(vin)),
      });
    });

    const inputs = Array.from({ length: 51 }, () => ({ vin: VALID_VIN, modelYear: 2003 }));
    const results = await vinDecoder.decodeVINBatch(inputs);

    expect(results).toHaveLength(51);
    expect(results.every((result) => result.source === "nhtsa" && result.confidence === "high")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    expect(getPostedBatchData(fetchMock.mock.calls[0]).split(";")).toHaveLength(50);
    expect(getPostedBatchData(fetchMock.mock.calls[1]).split(";")).toHaveLength(1);
  });

  it("rejects NHTSA batch results that echo a different VIN", async () => {
    const fetchMock = globalThis.fetch as any;
    fetchMock.mockResolvedValue(jsonResponse({ Results: [nhtsaResult(OTHER_VALID_VIN)] }));

    const results = await vinDecoder.decodeVINBatch([{ vin: VALID_VIN, modelYear: 2003 }], 7);

    expect(results).toEqual([
      expect.objectContaining({
        vin: VALID_VIN,
        errorCode: "VIN_PROVIDER_MISMATCH",
        source: "nhtsa",
        confidence: "invalid",
      }),
    ]);
    expect(results[0].errorMessage).toContain(OTHER_VALID_VIN);
    expect(results[0].warnings).toContain(
      "VIN provider response identity did not match request; decoded facts were not trusted."
    );
    expect(storageMock.upsertVinDecodeCache).not.toHaveBeenCalled();
  });

  it("does not call external batch providers for invalid VINs", async () => {
    const results = await vinDecoder.decodeVINBatch([{ vin: "1HGCM82643A004352" }]);

    expect(results).toEqual([
      expect.objectContaining({
        vin: "1HGCM82643A004352",
        errorCode: "INVALID_VIN_CHECK_DIGIT",
        confidence: "invalid",
      }),
    ]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
