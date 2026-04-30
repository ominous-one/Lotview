import {
  hasVehicleVINWriteError,
  normalizeVehicleWriteVIN,
  vehicleVINWriteErrorResponse,
} from "../services/vehicle-vin-write-guard";

describe("vehicle VIN write guard", () => {
  it("normalizes valid VINs before a vehicle write reaches storage", () => {
    const result = normalizeVehicleWriteVIN({
      vin: " 1hgcm82633a004352 ",
      year: 2003,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        vin: "1HGCM82633A004352",
        year: 2003,
      },
    });
  });

  it("rejects invalid VIN check digits with structured error details", () => {
    const result = normalizeVehicleWriteVIN({
      vin: "1HGCM82643A004352",
      year: 2003,
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "INVALID_VIN_CHECK_DIGIT",
        message: "VIN check digit is invalid",
        vin: "1HGCM82643A004352",
        expectedCheckDigit: "3",
        actualCheckDigit: "4",
      },
    });

    if (hasVehicleVINWriteError(result)) {
      expect(vehicleVINWriteErrorResponse(result.error)).toEqual({
        error: "VIN check digit is invalid",
        errorCode: "INVALID_VIN_CHECK_DIGIT",
        vin: "1HGCM82643A004352",
        expectedCheckDigit: "3",
        actualCheckDigit: "4",
      });
    }
  });

  it("rejects disallowed VIN letters instead of normalizing them into inventory", () => {
    const result = normalizeVehicleWriteVIN({
      vin: "1HGCM826I3A004352",
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "INVALID_VIN_CHARACTERS",
        vin: "1HGCM826I3A004352",
      },
    });
  });

  it("normalizes blank optional VINs to null", () => {
    expect(normalizeVehicleWriteVIN({ vin: "  ", year: 2024 })).toEqual({
      ok: true,
      data: { vin: null, year: 2024 },
    });
  });

  it("does not add a VIN field when the write payload does not include one", () => {
    expect(normalizeVehicleWriteVIN({ price: 25000 })).toEqual({
      ok: true,
      data: { price: 25000 },
    });
  });
});
