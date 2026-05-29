/**
 * Unit tests for the Patchright stealth tier.
 *
 * The tests inject fake Patchright module + extractor so they exercise the
 * orchestration (env-gate, CDP endpoint resolution, success/failure surfacing,
 * teardown ordering) without touching a real Chromium or Browserless account.
 */

import { describe, expect, it, jest } from "@jest/globals";
import {
  isPatchrightEnabled,
  runPatchrightFetcher,
  type PatchrightBrowserLike,
  type PatchrightContextLike,
  type PatchrightModuleLike,
  type PatchrightPageLike,
} from "../services/patchright-fetcher";
import type { VehicleListing } from "../browserless-unified";

function buildVehicle(overrides: Partial<VehicleListing> = {}): VehicleListing {
  return {
    year: 2024,
    make: "Hyundai",
    model: "Tucson",
    price: 32_999,
    odometer: 12_000,
    images: ["https://cdn.example.com/front.jpg"],
    badges: [],
    location: "Vancouver",
    dealership: "Olympic Hyundai",
    dealershipId: 7,
    vin: "5XYZUDLA8PG123456",
    stockNumber: "ST-001",
    ...overrides,
  };
}

interface FakeStub {
  module: PatchrightModuleLike;
  pageGoto: jest.Mock;
  pageContent: jest.Mock;
  pageClose: jest.Mock;
  contextClose: jest.Mock;
  browserClose: jest.Mock;
  capturedEndpoint: { value: string | null };
  capturedTimeout: { value: number | undefined };
}

function buildFakePatchright(html: string, options: { throwOn?: "connect" | "goto" } = {}): FakeStub {
  const pageGoto = jest.fn() as any;
  const pageContent = jest.fn() as any;
  const pageClose = jest.fn() as any;
  const contextClose = jest.fn() as any;
  const browserClose = jest.fn() as any;
  const capturedEndpoint: { value: string | null } = { value: null };
  const capturedTimeout: { value: number | undefined } = { value: undefined };

  pageContent.mockResolvedValue(html);
  pageClose.mockResolvedValue(undefined);
  contextClose.mockResolvedValue(undefined);
  browserClose.mockResolvedValue(undefined);

  if (options.throwOn === "goto") {
    pageGoto.mockRejectedValue(new Error("net::ERR_TIMED_OUT"));
  } else {
    pageGoto.mockResolvedValue(undefined);
  }

  const page: PatchrightPageLike = {
    setDefaultNavigationTimeout: () => undefined,
    goto: (...args: unknown[]) => pageGoto(...args),
    content: () => pageContent(),
    close: () => pageClose(),
  };

  const context: PatchrightContextLike = {
    newPage: async () => page,
    close: () => contextClose(),
  };

  const browser: PatchrightBrowserLike = {
    newContext: async () => context,
    close: () => browserClose(),
  };

  const module: PatchrightModuleLike = {
    chromium: {
      connectOverCDP: async (endpoint: string, opts) => {
        capturedEndpoint.value = endpoint;
        capturedTimeout.value = opts?.timeout;
        if (options.throwOn === "connect") {
          throw new Error("connectOverCDP refused");
        }
        return browser;
      },
    },
  };

  return { module, pageGoto, pageContent, pageClose, contextClose, browserClose, capturedEndpoint, capturedTimeout };
}

describe("isPatchrightEnabled", () => {
  it("returns false when LOTVIEW_USE_PATCHRIGHT is unset", () => {
    expect(isPatchrightEnabled({})).toBe(false);
  });

  it("returns true only when LOTVIEW_USE_PATCHRIGHT is the string \"true\"", () => {
    expect(isPatchrightEnabled({ LOTVIEW_USE_PATCHRIGHT: "true" })).toBe(true);
    expect(isPatchrightEnabled({ LOTVIEW_USE_PATCHRIGHT: "TRUE" })).toBe(true);
    expect(isPatchrightEnabled({ LOTVIEW_USE_PATCHRIGHT: "1" })).toBe(false);
    expect(isPatchrightEnabled({ LOTVIEW_USE_PATCHRIGHT: "false" })).toBe(false);
  });
});

describe("runPatchrightFetcher", () => {
  const baseRequest = {
    sourceUrl: "https://olympichyundaivancouver.com/vehicles/?sale_class=used",
    dealershipId: 7,
    dealershipName: "Olympic Hyundai",
    location: "Vancouver",
  };

  it("returns patchright_unavailable without loading the module when not opted in", async () => {
    const loadModule = jest.fn() as any;

    const result = await runPatchrightFetcher(baseRequest, {
      loadModule,
      env: {},
    });

    expect(result).toMatchObject({
      success: false,
      method: "patchright_unavailable",
      vehicles: [],
    });
    expect(result.error).toMatch(/not enabled/);
    expect(loadModule).not.toHaveBeenCalled();
  });

  it("returns patchright_unavailable when Browserless credentials are missing", async () => {
    const loadModule = jest.fn() as any;

    const result = await runPatchrightFetcher(baseRequest, {
      loadModule,
      env: { LOTVIEW_USE_PATCHRIGHT: "true" },
    });

    expect(result).toMatchObject({
      success: false,
      method: "patchright_unavailable",
      vehicles: [],
    });
    expect(result.error).toMatch(/BROWSERLESS/);
    expect(loadModule).not.toHaveBeenCalled();
  });

  it("returns patchright_unavailable when the patchright module fails to load", async () => {
    const loadModule = (jest.fn() as any).mockRejectedValue(new Error("module not found")) as any;

    const result = await runPatchrightFetcher(baseRequest, {
      loadModule,
      env: { LOTVIEW_USE_PATCHRIGHT: "true", BROWSERLESS_API_KEY: "tok-abc" },
    });

    expect(result).toMatchObject({
      success: false,
      method: "patchright_unavailable",
    });
    expect(result.error).toMatch(/module not found/);
  });

  it("connects via CDP to the Browserless WS endpoint and returns parsed vehicles", async () => {
    const html = "<html><div data-vin=\"5XYZUDLA8PG123456\"></div></html>";
    const stub = buildFakePatchright(html);

    const extractor = jest.fn(() => [buildVehicle()]) as any;

    const result = await runPatchrightFetcher(
      { ...baseRequest, connectTimeoutMs: 12345 },
      {
        loadModule: async () => stub.module,
        extractor,
        env: {
          LOTVIEW_USE_PATCHRIGHT: "true",
          BROWSERLESS_API_KEY: "tok-abc",
          BROWSERLESS_URL: "wss://chrome.browserless.io",
        },
      },
    );

    expect(result.success).toBe(true);
    expect(result.method).toBe("patchright_browserless_cdp");
    expect(result.vehicles).toHaveLength(1);
    expect(result.vehicles[0]).toMatchObject({ vin: "5XYZUDLA8PG123456" });
    expect(result.htmlBytes).toBe(html.length);
    expect(stub.capturedEndpoint.value).toBe("wss://chrome.browserless.io?token=tok-abc");
    expect(stub.capturedTimeout.value).toBe(12345);
    expect(extractor).toHaveBeenCalledWith(html, baseRequest.sourceUrl);
  });

  it("falls back to the default browserless endpoint when BROWSERLESS_URL is unset", async () => {
    const stub = buildFakePatchright("<html></html>");

    await runPatchrightFetcher(baseRequest, {
      loadModule: async () => stub.module,
      extractor: () => [buildVehicle()],
      env: {
        LOTVIEW_USE_PATCHRIGHT: "true",
        BROWSERLESS_TOKEN: "fallback-token",
      },
    });

    expect(stub.capturedEndpoint.value).toBe("wss://chrome.browserless.io?token=fallback-token");
  });

  it("caps the extractor output at maxVehicles", async () => {
    const stub = buildFakePatchright("<html></html>");
    const extractor = jest.fn(() => Array.from({ length: 500 }, (_, i) => buildVehicle({ vin: `vin-${i}` })) as any[]) as any;

    const result = await runPatchrightFetcher(
      { ...baseRequest, maxVehicles: 7 },
      {
        loadModule: async () => stub.module,
        extractor,
        env: { LOTVIEW_USE_PATCHRIGHT: "true", BROWSERLESS_API_KEY: "tok" },
      },
    );

    expect(result.vehicles).toHaveLength(7);
    expect(result.success).toBe(true);
  });

  it("returns success: false when the extractor yields no vehicles", async () => {
    const stub = buildFakePatchright("<html></html>");

    const result = await runPatchrightFetcher(baseRequest, {
      loadModule: async () => stub.module,
      extractor: () => [],
      env: { LOTVIEW_USE_PATCHRIGHT: "true", BROWSERLESS_API_KEY: "tok" },
    });

    expect(result.success).toBe(false);
    expect(result.method).toBe("patchright_browserless_cdp");
    expect(result.vehicles).toEqual([]);
  });

  it("surfaces CDP connect errors as failed results without leaking exceptions", async () => {
    const stub = buildFakePatchright("<html></html>", { throwOn: "connect" });

    const result = await runPatchrightFetcher(baseRequest, {
      loadModule: async () => stub.module,
      extractor: () => [buildVehicle()],
      env: { LOTVIEW_USE_PATCHRIGHT: "true", BROWSERLESS_API_KEY: "tok" },
    });

    expect(result.success).toBe(false);
    expect(result.method).toBe("patchright_browserless_cdp");
    expect(result.error).toMatch(/refused/);
    expect(result.vehicles).toEqual([]);
  });

  it("tears down page, context, and browser even when navigation throws", async () => {
    const stub = buildFakePatchright("<html></html>", { throwOn: "goto" });

    const result = await runPatchrightFetcher(baseRequest, {
      loadModule: async () => stub.module,
      extractor: () => [buildVehicle()],
      env: { LOTVIEW_USE_PATCHRIGHT: "true", BROWSERLESS_API_KEY: "tok" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/TIMED_OUT/);
    expect(stub.pageClose).toHaveBeenCalledTimes(1);
    expect(stub.contextClose).toHaveBeenCalledTimes(1);
    expect(stub.browserClose).toHaveBeenCalledTimes(1);
  });

  it("does not swallow page.close errors from the cleanup path", async () => {
    const stub = buildFakePatchright("<html></html>");
    (stub.pageClose as any).mockRejectedValue(new Error("page already closed"));

    const result = await runPatchrightFetcher(baseRequest, {
      loadModule: async () => stub.module,
      extractor: () => [buildVehicle()],
      env: { LOTVIEW_USE_PATCHRIGHT: "true", BROWSERLESS_API_KEY: "tok" },
    });

    expect(result.success).toBe(true);
    expect(stub.contextClose).toHaveBeenCalledTimes(1);
    expect(stub.browserClose).toHaveBeenCalledTimes(1);
  });
});
