import { describe, expect, it } from "@jest/globals";
import {
  isScraplingSidecarEnabled,
  runScraplingSidecarWithRunner,
  type ScraplingRunnerResult,
  type ScraplingSidecarRequest,
} from "../services/scrapling-sidecar";

const baseRequest: ScraplingSidecarRequest = {
  sourceId: 21,
  dealershipId: 7,
  sourceUrl: "https://dealer.example/inventory",
  sourceName: "Dealer Inventory",
  dealershipName: "Trusted Dealer",
  location: "Vancouver",
  maxVehicles: 50,
  timeoutMs: 30000,
};

function ok(stdout: unknown): ScraplingRunnerResult {
  return {
    exitCode: 0,
    stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout),
    stderr: "",
  };
}

describe("Scrapling sidecar boundary", () => {
  it("is disabled unless the explicit feature flag is true", () => {
    expect(isScraplingSidecarEnabled({})).toBe(false);
    expect(isScraplingSidecarEnabled({ FEATURE_SCRAPLING_SIDECAR: "false" })).toBe(false);
    expect(isScraplingSidecarEnabled({ FEATURE_SCRAPLING_SIDECAR: "true" })).toBe(true);
    expect(isScraplingSidecarEnabled({ ENABLE_SCRAPLING_SIDECAR: "true" })).toBe(true);
  });

  it("normalizes accepted vehicles while preserving the Node-owned tenant boundary", async () => {
    let payload: Record<string, unknown> | undefined;

    const result = await runScraplingSidecarWithRunner(baseRequest, async (rawPayload) => {
      payload = JSON.parse(rawPayload) as Record<string, unknown>;
      return ok({
        success: true,
        method: "scrapling_stealth_adaptive",
        vehicles: [
          {
            dealershipId: 999,
            dealership: "Untrusted Dealer",
            location: "Toronto",
            year: "2024",
            make: "Hyundai",
            model: "Ioniq 5",
            vin: "1HGCM82633A004352",
            stock: "H123",
            price: "$51,995",
            mileage: "1,234",
            images: ["/front.jpg", "javascript:alert(1)", "/front.jpg"],
            dealerVdpUrl: "/vehicles/ioniq-5",
            carfaxUrl: "https://carfax.example/report",
          },
        ],
        sourceVehicleUrls: ["/vehicles/ioniq-5", "ftp://invalid.example/vdp"],
        diagnostics: { rawVehicleCount: 1 },
      });
    });

    expect(payload).toMatchObject({
      sourceId: 21,
      dealershipId: 7,
      sourceUrl: "https://dealer.example/inventory",
      maxVehicles: 50,
      timeoutMs: 30000,
    });
    expect(result).toMatchObject({
      success: true,
      method: "scrapling_stealth_adaptive",
      sourceVehicleCount: 1,
    });
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0]).toMatchObject({
      dealershipId: 7,
      dealership: "Trusted Dealer",
      location: "Vancouver",
      year: 2024,
      make: "Hyundai",
      model: "Ioniq 5",
      vin: "1HGCM82633A004352",
      stockNumber: "H123",
      price: 51995,
      odometer: 1234,
      images: ["https://dealer.example/front.jpg"],
      dealerVdpUrl: "https://dealer.example/vehicles/ioniq-5",
      carfaxUrl: "https://carfax.example/report",
    });
    expect(result.sourceVehicleUrls).toEqual(["https://dealer.example/vehicles/ioniq-5"]);
  });

  it("fails closed when the worker reports success but all vehicles are rejected", async () => {
    const result = await runScraplingSidecarWithRunner(baseRequest, async () =>
      ok({
        success: true,
        method: "scrapling_stealth_adaptive",
        vehicles: [
          {
            year: "2024",
            make: "Hyundai",
            vin: "KM8KNDAF3PU123456",
            images: ["data:image/png;base64,abc"],
          },
        ],
        sourceVehicleUrls: [],
      }),
    );

    expect(result).toMatchObject({
      success: false,
      vehicles: [],
      error: "scrapling_sidecar_no_accepted_vehicles",
      diagnostics: {
        rawVehicleCount: 1,
        acceptedVehicleCount: 0,
      },
    });
  });

  it("fails closed on timeout, process failure, and invalid JSON", async () => {
    await expect(
      runScraplingSidecarWithRunner(baseRequest, async () => ({
        exitCode: null,
        stdout: "",
        stderr: "",
        timedOut: true,
      })),
    ).resolves.toMatchObject({
      success: false,
      error: "scrapling_sidecar_timeout",
    });

    await expect(
      runScraplingSidecarWithRunner(baseRequest, async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "worker crashed",
      })),
    ).resolves.toMatchObject({
      success: false,
      error: "worker crashed",
    });

    await expect(
      runScraplingSidecarWithRunner(baseRequest, async () => ok("not json")),
    ).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("scrapling_sidecar_invalid_json"),
    });
  });
});
