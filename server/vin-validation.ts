export type VINValidationErrorCode =
  | "VIN_REQUIRED"
  | "INVALID_VIN_LENGTH"
  | "INVALID_VIN_CHARACTERS"
  | "INVALID_VIN_CHECK_DIGIT";

export interface VINValidationResult {
  vin: string;
  isValid: boolean;
  errorCode?: VINValidationErrorCode;
  errorMessage?: string;
  expectedCheckDigit?: string;
  actualCheckDigit?: string;
}

const ALLOWED_VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

const TRANSLITERATION: Record<string, number> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
  "0": 0,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
};

const CHECK_DIGIT_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeVIN(vin: string): string {
  return vin.trim().toUpperCase();
}

export function calculateVINCheckDigit(vin: string): string | null {
  const cleanVIN = normalizeVIN(vin);

  if (cleanVIN.length !== 17 || !ALLOWED_VIN_PATTERN.test(cleanVIN)) {
    return null;
  }

  let sum = 0;
  for (let index = 0; index < cleanVIN.length; index += 1) {
    const value = TRANSLITERATION[cleanVIN[index]];
    if (value === undefined) {
      return null;
    }

    sum += value * CHECK_DIGIT_WEIGHTS[index];
  }

  const remainder = sum % 11;
  return remainder === 10 ? "X" : String(remainder);
}

export function validateVIN(vin: string | null | undefined): VINValidationResult {
  const cleanVIN = normalizeVIN(vin ?? "");

  if (!cleanVIN) {
    return {
      vin: cleanVIN,
      isValid: false,
      errorCode: "VIN_REQUIRED",
      errorMessage: "VIN is required",
    };
  }

  if (cleanVIN.length !== 17) {
    return {
      vin: cleanVIN,
      isValid: false,
      errorCode: "INVALID_VIN_LENGTH",
      errorMessage: "VIN must be exactly 17 characters",
    };
  }

  if (!ALLOWED_VIN_PATTERN.test(cleanVIN)) {
    return {
      vin: cleanVIN,
      isValid: false,
      errorCode: "INVALID_VIN_CHARACTERS",
      errorMessage: "VIN must contain only digits and allowed letters, excluding I, O, and Q",
    };
  }

  const expectedCheckDigit = calculateVINCheckDigit(cleanVIN);
  const actualCheckDigit = cleanVIN[8];

  if (!expectedCheckDigit || actualCheckDigit !== expectedCheckDigit) {
    return {
      vin: cleanVIN,
      isValid: false,
      errorCode: "INVALID_VIN_CHECK_DIGIT",
      errorMessage: "VIN check digit is invalid",
      expectedCheckDigit: expectedCheckDigit ?? undefined,
      actualCheckDigit,
    };
  }

  return {
    vin: cleanVIN,
    isValid: true,
    expectedCheckDigit,
    actualCheckDigit,
  };
}
