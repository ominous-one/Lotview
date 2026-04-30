export async function lookupVehicleByVin(_vin: string): Promise<any> {
  return null;
}

function disabledPbsResult() {
  return {
    success: false,
    error: "PBS integration is not configured",
    errorCode: "PBS_NOT_CONFIGURED",
  };
}

export function createPbsApiService(_dealershipId: number): any {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "testConnection") {
          return async () => ({ success: false, message: "PBS integration is not configured" });
        }
        if (prop === "getApiLogs") {
          return async () => [];
        }
        if (prop === "clearSession") {
          return async () => undefined;
        }
        if (prop === "clearCache") {
          return async () => ({ sessions: 0, cacheEntries: 0 });
        }
        return async () => disabledPbsResult();
      },
    },
  );
}
