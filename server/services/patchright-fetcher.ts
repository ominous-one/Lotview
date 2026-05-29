/**
 * Patchright Stealth Tier
 *
 * Adds a CDP-level stealth tier to the cascading scrape chain.
 *
 * Patchright (https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) is a patched
 * Playwright Node.js client that closes the CDP detection vectors that defeat
 * puppeteer-extra-plugin-stealth in 2026 (Runtime.enable cold-start leak,
 * automation flags, navigator.webdriver, etc.).
 *
 * Critical design choice: this tier uses `chromium.connectOverCDP(...)` against
 * the Browserless cloud Chromium that Lotview already pays for, rather than
 * launching its own bundled Chromium. That means:
 *   1. No Dockerfile change is required (no Chromium-on-Alpine issue).
 *   2. Browserless residential proxying and CAPTCHA solving still apply.
 *   3. We gain Patchright's client-side stealth patches over CDP.
 *
 * The tier is opt-in via LOTVIEW_USE_PATCHRIGHT=true. If unset, the chain
 * behaves exactly as it did before this file was introduced.
 */

import type { VehicleListing } from "../browserless-unified";

export type PatchrightFetchMethod = "patchright_browserless_cdp" | "patchright_unavailable";

export interface PatchrightFetchRequest {
  sourceUrl: string;
  dealershipId: number;
  dealershipName: string;
  location: string;
  /** Maximum vehicles to extract from the listing page. Defaults to 250. */
  maxVehicles?: number;
  /** Connect timeout to the Browserless CDP endpoint. Defaults to 30s. */
  connectTimeoutMs?: number;
  /** Page navigation timeout. Defaults to 60s. */
  navigationTimeoutMs?: number;
}

export interface PatchrightFetchResult {
  success: boolean;
  method: PatchrightFetchMethod;
  vehicles: VehicleListing[];
  htmlBytes?: number;
  durationMs?: number;
  error?: string;
}

const DEFAULT_BROWSERLESS_ENDPOINT = "wss://chrome.browserless.io";

export function isPatchrightEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.LOTVIEW_USE_PATCHRIGHT ?? "").toLowerCase() === "true";
}

function resolveCdpEndpoint(env: NodeJS.ProcessEnv = process.env): string | null {
  const token = env.BROWSERLESS_API_KEY ?? env.BROWSERLESS_TOKEN;
  if (!token) {
    return null;
  }

  const endpoint = env.BROWSERLESS_URL ?? DEFAULT_BROWSERLESS_ENDPOINT;
  return `${endpoint}?token=${token}`;
}

/**
 * Indirection so tests can inject a fake Patchright module without touching
 * the real `import("patchright")` (which would require a real Chromium).
 */
export interface PatchrightModuleLike {
  chromium: {
    connectOverCDP: (endpointURL: string, options?: { timeout?: number }) => Promise<PatchrightBrowserLike>;
  };
}

export interface PatchrightBrowserLike {
  newContext: () => Promise<PatchrightContextLike>;
  close: () => Promise<void>;
}

export interface PatchrightContextLike {
  newPage: () => Promise<PatchrightPageLike>;
  close: () => Promise<void>;
}

export interface PatchrightPageLike {
  setDefaultNavigationTimeout: (ms: number) => void;
  goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  content: () => Promise<string>;
  close: () => Promise<void>;
}

export type HtmlVehicleExtractor = (html: string, baseUrl: string) => VehicleListing[];

interface RunOptions {
  loadModule?: () => Promise<PatchrightModuleLike>;
  extractor?: HtmlVehicleExtractor;
  env?: NodeJS.ProcessEnv;
}

const defaultLoadModule: () => Promise<PatchrightModuleLike> = async () => {
  const mod = (await import("patchright")) as unknown as PatchrightModuleLike;
  return mod;
};

const defaultExtractor: HtmlVehicleExtractor = () => [];

export async function runPatchrightFetcher(
  request: PatchrightFetchRequest,
  options: RunOptions = {},
): Promise<PatchrightFetchResult> {
  const env = options.env ?? process.env;
  const loadModule = options.loadModule ?? defaultLoadModule;
  const extractor = options.extractor ?? defaultExtractor;

  if (!isPatchrightEnabled(env)) {
    return {
      success: false,
      method: "patchright_unavailable",
      vehicles: [],
      error: "LOTVIEW_USE_PATCHRIGHT is not enabled",
    };
  }

  const cdpEndpoint = resolveCdpEndpoint(env);
  if (!cdpEndpoint) {
    return {
      success: false,
      method: "patchright_unavailable",
      vehicles: [],
      error: "BROWSERLESS_API_KEY/BROWSERLESS_TOKEN required for Patchright CDP tier",
    };
  }

  const startedAt = Date.now();
  let mod: PatchrightModuleLike;
  try {
    mod = await loadModule();
  } catch (error) {
    return {
      success: false,
      method: "patchright_unavailable",
      vehicles: [],
      error: `patchright module failed to load: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let browser: PatchrightBrowserLike | null = null;
  let context: PatchrightContextLike | null = null;
  let page: PatchrightPageLike | null = null;

  try {
    browser = await mod.chromium.connectOverCDP(cdpEndpoint, {
      timeout: request.connectTimeoutMs ?? 30_000,
    });
    context = await browser.newContext();
    page = await context.newPage();
    page.setDefaultNavigationTimeout(request.navigationTimeoutMs ?? 60_000);

    await page.goto(request.sourceUrl, {
      waitUntil: "domcontentloaded",
      timeout: request.navigationTimeoutMs ?? 60_000,
    });

    const html = await page.content();
    const vehicles = extractor(html, request.sourceUrl).slice(0, request.maxVehicles ?? 250);

    return {
      success: vehicles.length > 0,
      method: "patchright_browserless_cdp",
      vehicles,
      htmlBytes: html.length,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      success: false,
      method: "patchright_browserless_cdp",
      vehicles: [],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    try { await page?.close(); } catch { /* ignore */ }
    try { await context?.close(); } catch { /* ignore */ }
    try { await browser?.close(); } catch { /* ignore */ }
  }
}
