import {
  calculateVINCheckDigit,
  normalizeVIN,
  validateVIN,
} from "../vin-validation";

describe("VIN validation", () => {
  it("normalizes VIN input before validation", () => {
    expect(normalizeVIN(" 1hgcm82633a004352 ")).toBe("1HGCM82633A004352");
  });

  it("accepts a known valid VIN with a matching check digit", () => {
    const result = validateVIN("1HGCM82633A004352");

    expect(result).toMatchObject({
      vin: "1HGCM82633A004352",
      isValid: true,
      expectedCheckDigit: "3",
      actualCheckDigit: "3",
    });
  });

  it("calculates X when the check digit remainder is 10", () => {
    expect(calculateVINCheckDigit("1M8GDM9AXKP042788")).toBe("X");
    expect(validateVIN("1M8GDM9AXKP042788")).toMatchObject({
      isValid: true,
      expectedCheckDigit: "X",
      actualCheckDigit: "X",
    });
  });

  it("rejects missing VINs", () => {
    expect(validateVIN("")).toMatchObject({
      isValid: false,
      errorCode: "VIN_REQUIRED",
    });
  });

  it("rejects VINs that are not exactly 17 characters", () => {
    expect(validateVIN("1HGCM82633A00435")).toMatchObject({
      isValid: false,
      errorCode: "INVALID_VIN_LENGTH",
    });
  });

  it("rejects characters that are not allowed in VINs", () => {
    expect(validateVIN("1HGCM826I3A004352")).toMatchObject({
      isValid: false,
      errorCode: "INVALID_VIN_CHARACTERS",
    });
    expect(validateVIN("1HGCM826O3A004352")).toMatchObject({
      isValid: false,
      errorCode: "INVALID_VIN_CHARACTERS",
    });
    expect(validateVIN("1HGCM826Q3A004352")).toMatchObject({
      isValid: false,
      errorCode: "INVALID_VIN_CHARACTERS",
    });
  });

  it("rejects VINs with invalid position-10 model year codes", () => {
    expect(validateVIN("1HGCM82630A004352")).toMatchObject({
      vin: "1HGCM82630A004352",
      isValid: false,
      errorCode: "INVALID_VIN_MODEL_YEAR",
    });
    expect(validateVIN("1HGCM8263UA004352")).toMatchObject({
      vin: "1HGCM8263UA004352",
      isValid: false,
      errorCode: "INVALID_VIN_MODEL_YEAR",
    });
    expect(validateVIN("1HGCM8263ZA004352")).toMatchObject({
      vin: "1HGCM8263ZA004352",
      isValid: false,
      errorCode: "INVALID_VIN_MODEL_YEAR",
    });
  });

  it("rejects VINs with an invalid check digit", () => {
    expect(validateVIN("1HGCM82643A004352")).toMatchObject({
      isValid: false,
      errorCode: "INVALID_VIN_CHECK_DIGIT",
      expectedCheckDigit: "3",
      actualCheckDigit: "4",
    });
  });
});
