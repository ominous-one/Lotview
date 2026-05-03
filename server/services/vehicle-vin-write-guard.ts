import { validateVIN, type VINValidationErrorCode } from "../vin-validation";

type VehicleWritePayload = Record<string, any>;

export interface VehicleVINWriteGuardError {
  code: VINValidationErrorCode;
  message: string;
  vin: string;
  expectedCheckDigit?: string;
  actualCheckDigit?: string;
}

export type VehicleVINWriteGuardResult<T extends VehicleWritePayload> =
  | { ok: true; data: T }
  | { ok: false; error: VehicleVINWriteGuardError };

export function hasVehicleVINWriteError<T extends VehicleWritePayload>(
  result: VehicleVINWriteGuardResult<T>,
): result is { ok: false; error: VehicleVINWriteGuardError } {
  return result.ok === false;
}

export function normalizeVehicleWriteVIN<T extends VehicleWritePayload>(
  payload: T,
): VehicleVINWriteGuardResult<T> {
  if (!Object.prototype.hasOwnProperty.call(payload, "vin")) {
    return { ok: true, data: payload };
  }

  const rawVIN = payload.vin;
  if (rawVIN === null || rawVIN === undefined) {
    return {
      ok: true,
      data: { ...payload, vin: null } as T,
    };
  }

  if (typeof rawVIN !== "string") {
    return {
      ok: false,
      error: {
        code: "INVALID_VIN_TYPE",
        message: "VIN must be a string",
        vin: "",
      },
    };
  }

  if (rawVIN.trim() === "") {
    return {
      ok: true,
      data: { ...payload, vin: null } as T,
    };
  }

  const validation = validateVIN(rawVIN);
  if (!validation.isValid) {
    return {
      ok: false,
      error: {
        code: validation.errorCode ?? "INVALID_VIN_CHARACTERS",
        message: validation.errorMessage ?? "VIN is invalid",
        vin: validation.vin,
        expectedCheckDigit: validation.expectedCheckDigit,
        actualCheckDigit: validation.actualCheckDigit,
      },
    };
  }

  return {
    ok: true,
    data: { ...payload, vin: validation.vin } as T,
  };
}

export function vehicleVINWriteErrorResponse(error: VehicleVINWriteGuardError) {
  return {
    error: error.message,
    errorCode: error.code,
    vin: error.vin,
    expectedCheckDigit: error.expectedCheckDigit,
    actualCheckDigit: error.actualCheckDigit,
  };
}
