export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type InventoryStatus = "active" | "pending_review" | "blocked";

export interface InventoryRow {
  stock: string;
  vin: string;
  vehicle: string;
  status: InventoryStatus;
  price: string;
  source: string;
  proof: string;
}

export interface AuthUserSummary {
  id: number | null;
  name: string;
  email: string;
  role: string;
  dealershipId: number | null;
  dealershipLabel: string;
}

export interface OperationsSnapshot {
  backendStatus: "connected" | "blocked";
  authStatus: "authenticated" | "unauthenticated" | "unknown";
  healthStatus: string;
  readinessStatus: string;
  inventoryRows: InventoryRow[];
  inventoryTotal: number | null;
  blocker: string | null;
  user: AuthUserSummary | null;
}

interface RequestOptions {
  allowHttpError?: boolean;
}

type JsonRecord = Record<string, unknown>;

const requestTimeoutMs = 8_000;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: JsonRecord, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return fallback;
}

function readNumber(record: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return null;
}

function formatPrice(record: JsonRecord): string {
  const price = readNumber(record, ["price", "currentPrice", "salePrice", "internetPrice"]);
  if (price === null || price <= 0) {
    return "Review";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(price);
}

function normalizeInventoryStatus(rawStatus: string, vin: string): InventoryStatus {
  const status = rawStatus.toLowerCase();
  if (!vin || status.includes("blocked") || status.includes("quarantine") || status.includes("invalid")) {
    return "blocked";
  }
  if (status.includes("pending") || status.includes("review") || status.includes("unknown")) {
    return "pending_review";
  }

  return "active";
}

function mapVehicleToInventoryRow(vehicle: unknown, index: number): InventoryRow | null {
  if (!isRecord(vehicle)) {
    return null;
  }

  const year = readString(vehicle, ["year"]);
  const make = readString(vehicle, ["make"]);
  const model = readString(vehicle, ["model"]);
  const trim = readString(vehicle, ["trim"]);
  const vehicleName = [year, make, model, trim].filter(Boolean).join(" ").trim() || "Untitled vehicle";
  const vin = readString(vehicle, ["vin"], "VIN missing");
  const stock = readString(vehicle, ["stockNumber", "stock", "stockNo"], `row-${index + 1}`);
  const source = readString(vehicle, ["source", "sourceName", "sourceType"], "Lotview API");
  const rawStatus = readString(vehicle, ["status", "inventoryStatus", "verificationStatus"], "active");
  const status = normalizeInventoryStatus(rawStatus, vin === "VIN missing" ? "" : vin);

  return {
    stock,
    vin,
    vehicle: vehicleName,
    status,
    price: formatPrice(vehicle),
    source,
    proof: vin === "VIN missing" ? "VIN missing - review" : "VIN present from API",
  };
}

function readAuthUser(body: JsonRecord): AuthUserSummary | null {
  const user = isRecord(body.user) ? body.user : null;
  if (!user) {
    return null;
  }

  const id = readNumber(user, ["id"]);
  const dealershipId = readNumber(user, ["dealershipId", "dealership_id"]);
  const name = readString(user, ["name"], "Signed-in user");
  const email = readString(user, ["email"]);
  const role = readString(user, ["role"], "unknown");
  const dealershipLabel = readString(user, ["dealershipName", "dealership"], dealershipId ? `Dealership #${dealershipId}` : "No dealership");

  return {
    id,
    name,
    email,
    role,
    dealershipId,
    dealershipLabel,
  };
}

async function fetchJson<T>(
  path: string,
  fetcher: FetchLike,
  options: RequestOptions = {},
): Promise<{ body: T; ok: boolean; status: number }> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetcher(path, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    const body = (await response.json()) as T;
    if (!response.ok && !options.allowHttpError) {
      const errorMessage = isRecord(body) && typeof body.error === "string" ? body.error : `${path} failed`;
      throw new Error(errorMessage);
    }

    return { body, ok: response.ok, status: response.status };
  } finally {
    window.clearTimeout(timeout);
  }
}

function blockedSnapshot(blocker: string): OperationsSnapshot {
  return {
    backendStatus: "blocked",
    authStatus: "unknown",
    healthStatus: "unknown",
    readinessStatus: "unknown",
    inventoryRows: [],
    inventoryTotal: null,
    blocker,
    user: null,
  };
}

export async function loadOperationsSnapshot(fetcher?: FetchLike): Promise<OperationsSnapshot> {
  const activeFetcher = fetcher ?? window.fetch?.bind(window);
  if (!activeFetcher) {
    return blockedSnapshot("Browser fetch API is unavailable");
  }

  let healthStatus = "unknown";
  let readinessStatus = "unknown";

  try {
    const [healthResult, readinessResult, authResult] = await Promise.all([
      fetchJson<JsonRecord>("/api/health", activeFetcher, { allowHttpError: true }),
      fetchJson<JsonRecord>("/api/ready", activeFetcher, { allowHttpError: true }),
      fetchJson<JsonRecord>("/api/auth/me", activeFetcher, { allowHttpError: true }),
    ]);

    healthStatus = readString(healthResult.body, ["status"], healthResult.ok ? "healthy" : "unhealthy");
    readinessStatus = readString(
      readinessResult.body,
      ["status"],
      readinessResult.ok ? "ready" : "not_ready",
    );

    if (!healthResult.ok) {
      return {
        ...blockedSnapshot(`Health check returned HTTP ${healthResult.status}`),
        healthStatus,
        readinessStatus,
      };
    }

    if (!authResult.ok) {
      const blocker = isRecord(authResult.body) && typeof authResult.body.error === "string"
        ? authResult.body.error
        : "Authenticated session is required";
      return {
        ...blockedSnapshot(blocker),
        authStatus: "unauthenticated",
        healthStatus,
        readinessStatus,
      };
    }

    const user = readAuthUser(authResult.body);
    if (!user || !user.dealershipId) {
      return {
        ...blockedSnapshot("Authenticated dealership context is required"),
        authStatus: user ? "authenticated" : "unknown",
        healthStatus,
        readinessStatus,
        user,
      };
    }

    try {
      const inventoryResult = await fetchJson<JsonRecord>("/api/vehicles?limit=10", activeFetcher);
      const data = Array.isArray(inventoryResult.body.data) ? inventoryResult.body.data : [];
      const inventoryRows = data
        .map((vehicle, index) => mapVehicleToInventoryRow(vehicle, index))
        .filter((row): row is InventoryRow => row !== null);
      const pagination = isRecord(inventoryResult.body.pagination) ? inventoryResult.body.pagination : {};
      const total = readNumber(pagination, ["total"]);

      return {
        backendStatus: "connected",
        authStatus: "authenticated",
        healthStatus,
        readinessStatus,
        inventoryRows,
        inventoryTotal: total ?? inventoryRows.length,
        blocker: readinessStatus === "ready" ? null : "Readiness check is not green",
        user,
      };
    } catch (error) {
      return {
        backendStatus: "blocked",
        authStatus: "authenticated",
        healthStatus,
        readinessStatus,
        inventoryRows: [],
        inventoryTotal: null,
        blocker: error instanceof Error ? error.message : "Inventory API failed",
        user,
      };
    }
  } catch (error) {
    return blockedSnapshot(error instanceof Error ? error.message : "Backend health check failed");
  }
}
