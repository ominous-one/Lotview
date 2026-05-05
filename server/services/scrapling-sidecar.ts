import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { VehicleListing } from "../browserless-unified";
import { validateVIN } from "../vin-validation";

export type ScraplingMethod =
  | "scrapling_sidecar"
  | "scrapling_stealth_adaptive"
  | "scrapling_dynamic"
  | "scrapling_http"
  | "scrapling_unavailable";

export interface ScraplingSidecarRequest {
  sourceId: number;
  dealershipId: number;
  sourceUrl: string;
  sourceName: string;
  dealershipName: string;
  location: string;
  maxVehicles?: number;
  timeoutMs?: number;
  profile?: string;
  captureXhrPattern?: string;
}

interface ScraplingRawVehicle {
  year?: unknown;
  make?: unknown;
  model?: unknown;
  trim?: unknown;
  type?: unknown;
  price?: unknown;
  odometer?: unknown;
  mileage?: unknown;
  images?: unknown;
  photos?: unknown;
  badges?: unknown;
  location?: unknown;
  dealership?: unknown;
  description?: unknown;
  vin?: unknown;
  stockNumber?: unknown;
  stock?: unknown;
  carfaxUrl?: unknown;
  dealerVdpUrl?: unknown;
  sourceUrl?: unknown;
  exteriorColor?: unknown;
  interiorColor?: unknown;
  engine?: unknown;
  transmission?: unknown;
  drivetrain?: unknown;
  fuelType?: unknown;
  features?: unknown;
}

interface ScraplingWorkerResponse {
  success?: unknown;
  method?: unknown;
  vehicles?: unknown;
  errors?: unknown;
  sourceVehicleUrls?: unknown;
  diagnostics?: unknown;
}

export interface ScraplingSidecarResult {
  success: boolean;
  method: ScraplingMethod;
  vehicles: VehicleListing[];
  error?: string;
  errors: string[];
  durationMs: number;
  sourceVehicleCount: number;
  sourceVehicleUrls: string[];
  diagnostics: Record<string, unknown>;
}

export interface ScraplingRunnerResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

type ScraplingRunner = (payload: string, request: ScraplingSidecarRequest) => Promise<ScraplingRunnerResult>;

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_VEHICLES = 200;
const DEFAULT_WORKER_PATH = "server/sidecars/scrapling_worker.py";

export function isScraplingSidecarEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.FEATURE_SCRAPLING_SIDECAR === "true" || env.ENABLE_SCRAPLING_SIDECAR === "true";
}

function configuredWorkerPath(): string {
  return resolve(process.env.SCRAPLING_WORKER_PATH || DEFAULT_WORKER_PATH);
}

function configuredPythonExecutable(): string {
  return process.env.SCRAPLING_PYTHON || "python";
}

function configuredTimeoutMs(request: ScraplingSidecarRequest): number {
  const raw = request.timeoutMs ?? Number(process.env.SCRAPLING_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isSafeInteger(raw) && raw >= 1000 ? raw : DEFAULT_TIMEOUT_MS;
}

function configuredMaxVehicles(request: ScraplingSidecarRequest): number {
  const raw = request.maxVehicles ?? Number(process.env.SCRAPLING_MAX_VEHICLES || DEFAULT_MAX_VEHICLES);
  return Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, 500) : DEFAULT_MAX_VEHICLES;
}

function cleanText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  const text = typeof value === "string" ? value.trim() : undefined;
  if (!text || !/^\d+$/.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseNonNegativeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  const text = typeof value === "string" ? value.trim().replace(/[,\s]/g, "") : undefined;
  if (!text || !/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  const text = typeof value === "string" ? value.trim().replace(/[$,\s]/g, "") : undefined;
  if (!text || !/^\d+(\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseYear(value: unknown): number | undefined {
  const parsed = parsePositiveInteger(value);
  if (!parsed) return undefined;
  const maxYear = new Date().getFullYear() + 2;
  return parsed >= 1981 && parsed <= maxYear ? parsed : undefined;
}

function sanitizeHttpUrl(value: unknown, baseUrl: string): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;

  try {
    const parsed = new URL(text, baseUrl);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const strings: string[] = [];

  for (const item of value) {
    const text = cleanText(item);
    if (text && !seen.has(text)) {
      seen.add(text);
      strings.push(text);
    }
  }

  return strings;
}

function sanitizeUrlArray(value: unknown, baseUrl: string): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const item of value) {
    const url = sanitizeHttpUrl(item, baseUrl);
    if (url && !seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  }

  return urls;
}

function normalizeScraplingVehicle(
  raw: ScraplingRawVehicle,
  request: ScraplingSidecarRequest,
): VehicleListing | null {
  if (!raw || typeof raw !== "object") return null;

  const year = parseYear(raw.year);
  const make = cleanText(raw.make);
  const model = cleanText(raw.model);
  const vinResult = validateVIN(cleanText(raw.vin));

  if (!year || !make || !model || !vinResult.isValid) {
    return null;
  }

  const dealerVdpUrl =
    sanitizeHttpUrl(raw.dealerVdpUrl, request.sourceUrl) ??
    sanitizeHttpUrl(raw.sourceUrl, request.sourceUrl);
  const images = sanitizeUrlArray(raw.images, request.sourceUrl).concat(
    sanitizeUrlArray(raw.photos, request.sourceUrl),
  );
  const uniqueImages = Array.from(new Set(images));

  return {
    year,
    make,
    model,
    trim: cleanText(raw.trim),
    type: cleanText(raw.type) || "Vehicle",
    price: parsePrice(raw.price),
    odometer: parseNonNegativeInteger(raw.odometer ?? raw.mileage),
    images: uniqueImages,
    badges: sanitizeStringArray(raw.badges),
    location: request.location,
    dealership: request.dealershipName,
    dealershipId: request.dealershipId,
    description: cleanText(raw.description),
    vin: vinResult.vin,
    stockNumber: cleanText(raw.stockNumber ?? raw.stock),
    carfaxUrl: sanitizeHttpUrl(raw.carfaxUrl, request.sourceUrl),
    dealerVdpUrl,
    exteriorColor: cleanText(raw.exteriorColor),
    interiorColor: cleanText(raw.interiorColor),
    engine: cleanText(raw.engine),
    transmission: cleanText(raw.transmission),
    drivetrain: cleanText(raw.drivetrain),
    fuelType: cleanText(raw.fuelType),
    features: sanitizeStringArray(raw.features),
  };
}

function normalizeSourceVehicleUrls(value: unknown, baseUrl: string): string[] {
  return sanitizeUrlArray(value, baseUrl);
}

function normalizeErrors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(cleanText).filter((item): item is string => Boolean(item));
}

function normalizeMethod(value: unknown): ScraplingMethod {
  const method = cleanText(value);
  if (method && method.startsWith("scrapling_")) {
    return method as ScraplingMethod;
  }
  return "scrapling_sidecar";
}

function parseWorkerResponse(rawOutput: string): ScraplingWorkerResponse {
  const trimmed = rawOutput.trim();
  if (!trimmed) {
    throw new Error("Scrapling sidecar returned empty output");
  }

  const lastLine = trimmed.split(/\r?\n/).filter(Boolean).at(-1) || trimmed;
  return JSON.parse(lastLine) as ScraplingWorkerResponse;
}

async function runPythonWorker(payload: string, request: ScraplingSidecarRequest): Promise<ScraplingRunnerResult> {
  const workerPath = configuredWorkerPath();
  if (!existsSync(workerPath)) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Scrapling worker not found: ${workerPath}`,
    };
  }

  const timeoutMs = configuredTimeoutMs(request);
  const child = spawn(configuredPythonExecutable(), [workerPath], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  let stdout = "";
  let stderr = "";
  let timedOut = false;

  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGKILL");
  }, timeoutMs);

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.stdin.end(payload);

  return await new Promise((resolvePromise) => {
    child.on("close", (exitCode) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode, stdout, stderr, timedOut });
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      resolvePromise({ exitCode: 1, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut });
    });
  });
}

export async function runScraplingSidecarWithRunner(
  request: ScraplingSidecarRequest,
  runner: ScraplingRunner,
): Promise<ScraplingSidecarResult> {
  const startTime = Date.now();
  const maxVehicles = configuredMaxVehicles(request);
  const payload = JSON.stringify({
    mode: "inventory",
    sourceId: request.sourceId,
    dealershipId: request.dealershipId,
    sourceUrl: request.sourceUrl,
    sourceName: request.sourceName,
    dealershipName: request.dealershipName,
    location: request.location,
    maxVehicles,
    timeoutMs: configuredTimeoutMs(request),
    profile: request.profile || "auto",
    captureXhrPattern: request.captureXhrPattern || "(inventory|vehicle|vehicles|search|listing)",
  });

  const runnerResult = await runner(payload, request);
  const durationMs = Date.now() - startTime;

  if (runnerResult.timedOut) {
    return {
      success: false,
      method: "scrapling_sidecar",
      vehicles: [],
      error: "scrapling_sidecar_timeout",
      errors: ["Scrapling sidecar timed out"],
      durationMs,
      sourceVehicleCount: 0,
      sourceVehicleUrls: [],
      diagnostics: { timedOut: true },
    };
  }

  if (runnerResult.exitCode !== 0) {
    const error = cleanText(runnerResult.stderr) || `Scrapling sidecar exited with code ${runnerResult.exitCode}`;
    return {
      success: false,
      method: "scrapling_sidecar",
      vehicles: [],
      error,
      errors: [error],
      durationMs,
      sourceVehicleCount: 0,
      sourceVehicleUrls: [],
      diagnostics: { exitCode: runnerResult.exitCode },
    };
  }

  try {
    const parsed = parseWorkerResponse(runnerResult.stdout);
    const rawVehicles = Array.isArray(parsed.vehicles) ? parsed.vehicles : [];
    const vehicles = rawVehicles
      .slice(0, maxVehicles)
      .map((vehicle) => normalizeScraplingVehicle(vehicle as ScraplingRawVehicle, request))
      .filter((vehicle): vehicle is VehicleListing => Boolean(vehicle));
    const sourceVehicleUrls = normalizeSourceVehicleUrls(parsed.sourceVehicleUrls, request.sourceUrl);
    const errors = normalizeErrors(parsed.errors);
    const method = normalizeMethod(parsed.method);
    const diagnostics =
      parsed.diagnostics && typeof parsed.diagnostics === "object"
        ? (parsed.diagnostics as Record<string, unknown>)
        : {};
    const rawSuccess = parsed.success === true;
    const success = rawSuccess && vehicles.length > 0;
    const error = success
      ? undefined
      : vehicles.length === 0
      ? "scrapling_sidecar_no_accepted_vehicles"
      : errors[0] || "scrapling_sidecar_failed";

    return {
      success,
      method,
      vehicles,
      error,
      errors,
      durationMs,
      sourceVehicleCount: sourceVehicleUrls.length || rawVehicles.length,
      sourceVehicleUrls,
      diagnostics: {
        ...diagnostics,
        rawVehicleCount: rawVehicles.length,
        acceptedVehicleCount: vehicles.length,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      method: "scrapling_sidecar",
      vehicles: [],
      error: `scrapling_sidecar_invalid_json: ${message}`,
      errors: [message],
      durationMs,
      sourceVehicleCount: 0,
      sourceVehicleUrls: [],
      diagnostics: { invalidJson: true },
    };
  }
}

export async function runScraplingSidecar(request: ScraplingSidecarRequest): Promise<ScraplingSidecarResult> {
  return runScraplingSidecarWithRunner(request, runPythonWorker);
}
