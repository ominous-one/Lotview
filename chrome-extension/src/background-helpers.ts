declare const __DEV__: boolean;

export const ALLOWED_IMAGE_HOSTS = [
  "lotview.ai",
  "cdn.lotview.ai",
  "images.lotview.ai",
  "olympicautogroup.ca",
  "olympichyundaivancouver.com",
  "res.cloudinary.com",
  "imageresizer.dealercloud.ca",
  "vehicle-photos-published.vauto.com",
  "autotradercdn.ca",
  "1s-photomanager-prd.autotradercdn.ca",
  "2s-photomanager-prd.autotradercdn.ca",
  "3s-photomanager-prd.autotradercdn.ca",
  "ls-photomanager-prd.autotradercdn.ca",
];

export const MAX_IMAGE_COUNT = 20;
export const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 50 * 1024 * 1024;

export const ALLOWED_PROD_DOMAINS = [
  "lotview.ai",
  "olympicautogroup.ca",
];

export const AUTH_EXPIRY_MS = 8 * 60 * 60 * 1000;
export const TOKEN_REFRESH_THRESHOLD_MS = 7.5 * 60 * 60 * 1000;
export const IMAGE_FETCH_TIMEOUT_MS = 10000;
export const PROTOCOL_VERSION = 1;

export const ALLOWED_ACTIONS = new Set([
  "EXT_LOGIN",
  "EXT_LOGOUT",
  "GET_AUTH",
  "FETCH_INVENTORY",
  "FETCH_TEMPLATES",
  "SAVE_TEMPLATE",
  "LOG_POSTING",
  "FETCH_LIMITS",
  "FILL_CONTENT",
  "REQUEST_POSTING_TOKEN",
  "CHECK_CONSENT",
  "DOWNLOAD_IMAGES",
  "AUTO_POST_VEHICLE",
  "GET_FB_COOKIES",
  "FETCH_IMAGE_BLOB",
  "EXTRACT_LOTVIEW_IMAGES",
  "GENERATE_AI_CONTENT",
]);

export const CONSENT_EXEMPT_ACTIONS = new Set([
  "CHECK_CONSENT",
]);

export function isValidServerUrl(url: string, isDev: boolean = false): boolean {
  try {
    const parsed = new URL(url);
    
    if (isDev) {
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return true;
      }
    }
    
    if (parsed.protocol !== "https:") {
      return false;
    }
    
    const isAllowedDomain = ALLOWED_PROD_DOMAINS.some(
      (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );
    
    return isAllowedDomain;
  } catch {
    return false;
  }
}

export function isAllowedImageHost(url: string): boolean {
  // Allow relative URLs for local images (Object Storage)
  if (url.startsWith("/public-objects/")) {
    return true;
  }
  
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOSTS.some(
      (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
    );
  } catch {
    return false;
  }
}

export function isAuthExpired(expiresAt: number): boolean {
  return Date.now() > expiresAt;
}

export function shouldRefreshToken(createdAt: number): boolean {
  const elapsed = Date.now() - createdAt;
  return elapsed > TOKEN_REFRESH_THRESHOLD_MS;
}

export function calculateAuthExpiry(createdAt: number): number {
  return createdAt + AUTH_EXPIRY_MS;
}

export function isValidLoginPayload(payload: unknown): payload is { 
  email: string; 
  password: string; 
  serverUrl: string; 
} {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.email === "string" && p.email.length > 0 &&
    typeof p.password === "string" && p.password.length > 0 &&
    typeof p.serverUrl === "string" && p.serverUrl.length > 0
  );
}

export function isValidPostingLogPayload(payload: unknown): payload is {
  vehicleId: number;
  platform: string;
  status: "success" | "failed";
  url?: string;
  error?: string;
  postingToken?: string;
} {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.vehicleId === "number" &&
    typeof p.platform === "string" &&
    (p.status === "success" || p.status === "failed")
  );
}

export function isValidFillContentPayload(payload: unknown): payload is {
  platform: string;
  vehicleId: number;
  formData: Record<string, unknown>;
  imageUrls?: string[];
  templateId?: number;
} {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.platform === "string" &&
    typeof p.vehicleId === "number" &&
    typeof p.formData === "object" &&
    p.formData !== null
  );
}

export function isValidSaveTemplatePayload(payload: unknown): payload is {
  templateName: string;
  titleTemplate: string;
  descriptionTemplate: string;
  isShared?: boolean;
} {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.templateName === "string" && p.templateName.trim().length > 0 &&
    typeof p.titleTemplate === "string" && p.titleTemplate.trim().length > 0 &&
    typeof p.descriptionTemplate === "string" && p.descriptionTemplate.trim().length > 0
  );
}

export function isValidRequestPostingTokenPayload(payload: unknown): payload is {
  vehicleId: number;
  platform: string;
} {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  return typeof p.vehicleId === "number" && typeof p.platform === "string";
}

export function sanitizeServerUrl(url: string): string {
  return url.replace(/\/$/, "");
}

export function extractImageFilename(url: string): string {
  return url.split("/").pop()?.split("?")[0] || "photo.jpg";
}
