import { ExtensionAuthState, VehicleSummary, Template, PostJob, Platform, PostingLimits } from "./types";
import { getDriver, isDriverImplemented } from "./drivers";
import { isVehicleSummaryArray, isTemplateArray, isPostingLimits, isExtensionAuthState } from "./validators";
import { signRequest, encryptToken, decryptToken } from "./crypto";
import { ErrorCode, createError, parseHttpError, isOnline, StructuredError } from "./errors";
import {
  isValidServerUrl as isValidServerUrlHelper,
  isAllowedImageHost,
  isAuthExpired,
  shouldRefreshToken as shouldRefreshTokenHelper,
  calculateAuthExpiry,
  sanitizeServerUrl,
  extractImageFilename,
  ALLOWED_ACTIONS,
  CONSENT_EXEMPT_ACTIONS,
  MAX_IMAGE_COUNT,
  MAX_IMAGE_SIZE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  AUTH_EXPIRY_MS,
  TOKEN_REFRESH_THRESHOLD_MS,
  IMAGE_FETCH_TIMEOUT_MS,
  PROTOCOL_VERSION,
} from "./background-helpers";

declare const __DEV__: boolean;

async function hasPrivacyConsent(): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(["privacyConsent"]) as { privacyConsent?: boolean };
    return stored.privacyConsent === true;
  } catch {
    return false;
  }
}

function isValidServerUrl(url: string): boolean {
  return isValidServerUrlHelper(url, __DEV__);
}

interface StoredAuth {
  auth: Omit<ExtensionAuthState, "token"> & { token?: string };
  encryptedToken: string;
  expiresAt: number;
  createdAt: number;
}

async function getStoredAuth(): Promise<ExtensionAuthState | null> {
  // Use local storage for persistent login across browser sessions
  const stored = await chrome.storage.local.get(["authData"]) as { authData?: StoredAuth };
  if (!stored.authData) return null;
  
  if (isAuthExpired(stored.authData.expiresAt)) {
    await chrome.storage.local.remove(["authData"]);
    return null;
  }
  
  const token = await decryptToken(stored.authData.encryptedToken);
  return { ...stored.authData.auth, token };
}

async function shouldRefreshToken(): Promise<boolean> {
  const stored = await chrome.storage.local.get(["authData"]) as { authData?: StoredAuth };
  if (!stored.authData) return false;
  return shouldRefreshTokenHelper(stored.authData.createdAt);
}

async function setStoredAuth(auth: ExtensionAuthState): Promise<void> {
  const encryptedToken = await encryptToken(auth.token);
  const now = Date.now();
  const authData: StoredAuth = {
    auth: { ...auth, token: undefined },
    encryptedToken,
    expiresAt: calculateAuthExpiry(now),
    createdAt: now,
  };
  // Use local storage for persistent login across browser sessions
  await chrome.storage.local.set({ authData });
}

async function clearStoredAuth(): Promise<void> {
  await chrome.storage.local.remove(["authData"]);
}

async function attemptSilentRefresh(currentAuth: ExtensionAuthState): Promise<ExtensionAuthState | null> {
  const baseUrl = await getApiBaseUrl();
  if (!baseUrl) return null;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  
  try {
    const res = await fetch(`${baseUrl}/api/extension/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${currentAuth.token}`,
      },
      signal: controller.signal,
    });
    
    if (!res.ok) return null;
    
    const refreshedAuth = await res.json();
    if (!isExtensionAuthState(refreshedAuth)) return null;
    
    await setStoredAuth(refreshedAuth);
    return refreshedAuth;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function getApiBaseUrl(): Promise<string> {
  const stored = await chrome.storage.sync.get(["apiBaseUrl"]) as { apiBaseUrl?: string };
  if (stored.apiBaseUrl && typeof stored.apiBaseUrl === "string") {
    return stored.apiBaseUrl;
  }
  return "";
}

async function setApiBaseUrl(url: string): Promise<void> {
  if (!isValidServerUrl(url)) {
    throw new Error("Invalid server URL. Must use HTTPS with an allowed domain.");
  }
  await chrome.storage.sync.set({ apiBaseUrl: url });
}

interface ApiError extends Error {
  structured?: StructuredError;
}

async function apiWithRetry<T>(
  endpoint: string, 
  token: string, 
  options: RequestInit = {},
  retries: number = 3
): Promise<T> {
  let lastError: ApiError | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    if (!isOnline()) {
      const error = createError(ErrorCode.NETWORK_OFFLINE);
      const apiError: ApiError = new Error(error.message);
      apiError.structured = error;
      throw apiError;
    }
    
    try {
      return await api<T>(endpoint, token, options);
    } catch (err) {
      lastError = err as ApiError;
      
      if (lastError.structured?.retryable && attempt < retries - 1) {
        const delay = lastError.structured.retryAfterMs || 1000 * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      
      throw lastError;
    }
  }
  
  throw lastError;
}

async function api<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  if (!baseUrl) {
    throw new Error("Server URL not configured");
  }

  if (!isOnline()) {
    const error = createError(ErrorCode.NETWORK_OFFLINE);
    const apiError: ApiError = new Error(error.message);
    apiError.structured = error;
    throw apiError;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const method = options.method || "GET";
  const body = typeof options.body === "string" ? options.body : null;
  
  const signedHeaders = await signRequest(method, endpoint, body, token);

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...signedHeaders,
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      if (res.status === 401) {
        await clearStoredAuth();
        const error = createError(ErrorCode.AUTH_EXPIRED);
        const apiError: ApiError = new Error(error.message);
        apiError.structured = error;
        throw apiError;
      }
      
      let errorText = "";
      try {
        const errorJson = await res.json();
        errorText = errorJson.error || errorJson.message || "";
      } catch {
        try {
          errorText = await res.text();
        } catch {
          errorText = "";
        }
      }
      
      const structured = parseHttpError(res.status, errorText);
      const apiError: ApiError = new Error(structured.message);
      apiError.structured = structured;
      throw apiError;
    }

    return res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      const error = createError(ErrorCode.NETWORK_TIMEOUT);
      const apiError: ApiError = new Error(error.message);
      apiError.structured = error;
      throw apiError;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchImageViaProxy(url: string, token: string): Promise<Blob | null> {
  const baseUrl = await getApiBaseUrl();
  if (!baseUrl) return null;
  
  const proxyUrl = `${baseUrl}/api/extension/image-proxy?url=${encodeURIComponent(url)}`;
  
  const method = "GET";
  const endpoint = `/api/extension/image-proxy?url=${encodeURIComponent(url)}`;
  const signedHeaders = await signRequest(method, endpoint, null, token);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  
  try {
    const res = await fetch(proxyUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...signedHeaders,
      },
      signal: controller.signal,
    });
    
    if (!res.ok) {
      return null;
    }
    
    return await res.blob();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchImageDirect(url: string): Promise<Blob | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  
  try {
    const res = await fetch(url, { signal: controller.signal });
    
    if (!res.ok) {
      return null;
    }
    
    const contentType = res.headers.get("Content-Type") || "";
    if (!contentType.startsWith("image/")) {
      return null;
    }
    
    return await res.blob();
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  // Extension installed
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "Unauthorized sender", protocolVersion: PROTOCOL_VERSION });
    return true;
  }

  if (!message || typeof message.type !== "string" || !ALLOWED_ACTIONS.has(message.type)) {
    sendResponse({ ok: false, error: "Unknown message type", protocolVersion: PROTOCOL_VERSION });
    return true;
  }

  if (message.protocolVersion !== undefined && message.protocolVersion !== PROTOCOL_VERSION) {
    sendResponse({ 
      ok: false, 
      error: "Protocol version mismatch. Please refresh the extension.", 
      protocolVersion: PROTOCOL_VERSION,
      code: "PROTOCOL_MISMATCH"
    });
    return true;
  }

  (async () => {
    try {
      if (message.type === "CHECK_CONSENT") {
        const hasConsent = await hasPrivacyConsent();
        sendResponse({ ok: true, hasConsent });
        return;
      }

      if (!CONSENT_EXEMPT_ACTIONS.has(message.type)) {
        const hasConsent = await hasPrivacyConsent();
        if (!hasConsent) {
          sendResponse({ ok: false, error: "Privacy consent required", code: "CONSENT_REQUIRED" });
          return;
        }
      }

      if (message.type === "EXT_LOGIN") {
        const { email, password, serverUrl } = message.payload || {};
        
        if (!email || typeof email !== "string" || 
            !password || typeof password !== "string" || 
            !serverUrl || typeof serverUrl !== "string") {
          sendResponse({ ok: false, error: "Email, password, and server URL required" });
          return;
        }

        const cleanUrl = sanitizeServerUrl(serverUrl);
        if (!isValidServerUrl(cleanUrl)) {
          sendResponse({ ok: false, error: "Invalid server URL. Must use HTTPS with an allowed domain." });
          return;
        }
        
        await setApiBaseUrl(cleanUrl);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
          const res = await fetch(`${cleanUrl}/api/extension/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
            signal: controller.signal,
          });

          if (!res.ok) {
            let errorText = "";
            try {
              const errorJson = await res.json();
              errorText = errorJson.error || errorJson.message || "";
            } catch {
              try {
                errorText = await res.text();
              } catch {
                errorText = "";
              }
            }
            throw new Error(errorText || "Login failed");
          }

          const authData = await res.json();
          
          if (!isExtensionAuthState(authData)) {
            throw new Error("Invalid login response from server");
          }
          
          await setStoredAuth(authData);
          sendResponse({ ok: true, auth: authData });
        } finally {
          clearTimeout(timeoutId);
        }
        return;
      }

      if (message.type === "EXT_LOGOUT") {
        await clearStoredAuth();
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "GET_AUTH") {
        const auth = await getStoredAuth();
        const stored = await chrome.storage.sync.get(["apiBaseUrl"]) as { apiBaseUrl?: string };
        sendResponse({
          ok: true,
          auth: auth || null,
          apiBaseUrl: stored.apiBaseUrl || null,
        });
        return;
      }

      let auth = await getStoredAuth();
      if (!auth || !auth.token) {
        throw new Error("Not authenticated");
      }

      if (await shouldRefreshToken()) {
        const refreshed = await attemptSilentRefresh(auth);
        if (refreshed) {
          auth = refreshed;
        }
      }

      if (message.type === "FETCH_INVENTORY") {
        const query = typeof message.payload?.query === "string" ? message.payload.query : "";
        const vehicles = await apiWithRetry<unknown>(
          `/api/extension/inventory?query=${encodeURIComponent(query)}`,
          auth.token
        );
        
        if (!isVehicleSummaryArray(vehicles)) {
          throw new Error("Invalid inventory data received from server");
        }
        
        sendResponse({ ok: true, vehicles });
        return;
      }

      if (message.type === "FETCH_TEMPLATES") {
        const templates = await apiWithRetry<unknown>("/api/extension/templates", auth.token);
        
        if (!isTemplateArray(templates)) {
          throw new Error("Invalid template data received from server");
        }
        
        sendResponse({ ok: true, templates });
        return;
      }

      if (message.type === "SAVE_TEMPLATE") {
        const { templateName, titleTemplate, descriptionTemplate, isShared } = message.payload || {};
        
        if (typeof templateName !== "string" || !templateName.trim() ||
            typeof titleTemplate !== "string" || !titleTemplate.trim() ||
            typeof descriptionTemplate !== "string" || !descriptionTemplate.trim()) {
          sendResponse({ ok: false, error: "Template name, title, and description required" });
          return;
        }

        const endpoint = isShared === true ? "/api/ad-templates/shared" : "/api/ad-templates";
        const template = await apiWithRetry<Template>(endpoint, auth.token, {
          method: "POST",
          body: JSON.stringify({
            templateName: templateName.trim(),
            titleTemplate: titleTemplate.trim(),
            descriptionTemplate: descriptionTemplate.trim(),
            isDefault: false,
          }),
        });
        sendResponse({ ok: true, template });
        return;
      }

      if (message.type === "REQUEST_POSTING_TOKEN") {
        const { vehicleId, platform } = message.payload || {};
        
        if (typeof vehicleId !== "number" || typeof platform !== "string") {
          sendResponse({ ok: false, error: "vehicleId and platform required" });
          return;
        }

        try {
          const result = await apiWithRetry<{ postingToken: string }>(
            "/api/extension/posting-token",
            auth.token,
            {
              method: "POST",
              body: JSON.stringify({ vehicleId, platform }),
            }
          );
          sendResponse({ ok: true, postingToken: result.postingToken });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Failed to get posting token";
          sendResponse({ ok: false, error: msg });
        }
        return;
      }

      if (message.type === "LOG_POSTING") {
        const { vehicleId, platform, status, url, error, postingToken } = message.payload || {};
        
        if (typeof vehicleId !== "number" || 
            typeof platform !== "string" || 
            (status !== "success" && status !== "failed")) {
          sendResponse({ ok: false, error: "Invalid posting log data" });
          return;
        }

        // For successful posts, postingToken is required
        if (status === "success" && typeof postingToken !== "string") {
          sendResponse({ ok: false, error: "postingToken required for successful posts" });
          return;
        }
        
        await apiWithRetry("/api/extension/postings", auth.token, {
          method: "POST",
          body: JSON.stringify({ vehicleId, platform, status, url, error, postingToken }),
        });
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "FETCH_LIMITS") {
        try {
          const limits = await apiWithRetry<unknown>("/api/extension/limits", auth.token);
          
          if (!isPostingLimits(limits)) {
            throw new Error("Invalid limits data");
          }
          
          sendResponse({ ok: true, limits });
        } catch {
          sendResponse({
            ok: true,
            limits: {
              dailyLimit: 10,
              postsToday: 0,
              remaining: 10,
              postedVehicles: { facebook: [], kijiji: [], craigslist: [] },
            },
          });
        }
        return;
      }

      if (message.type === "EXTRACT_LOTVIEW_IMAGES") {
        try {
          const tabs = await chrome.tabs.query({
            url: [
              "https://lotview.ai/vehicle/*",
              "https://*.lotview.ai/vehicle/*",
            ],
          });

          if (tabs.length === 0) {
            sendResponse({ ok: false, error: "No Lotview vehicle page found. Open a vehicle detail page first." });
            return;
          }

          const targetTab = tabs[0];
          if (!targetTab.id) {
            sendResponse({ ok: false, error: "Cannot access Lotview tab" });
            return;
          }

          const response = await chrome.tabs.sendMessage(targetTab.id, { type: "LV_EXTRACT_IMAGES" });
          if (response?.ok) {
            sendResponse({ ok: true, images: response.data?.images || [], method: response.data?.method });
          } else {
            sendResponse({ ok: false, error: response?.error || "Image extraction failed" });
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : "Failed to extract images from Lotview page";
          sendResponse({ ok: false, error });
        }
        return;
      }

      if (message.type === "FILL_CONTENT") {
        const { platform, vehicleId, formData, imageUrls, templateId } = message.payload || {};

        if (typeof platform !== "string" || typeof vehicleId !== "number" || typeof formData !== "object") {
          sendResponse({ ok: false, error: "Invalid fill content payload" });
          return;
        }

        if (!isDriverImplemented(platform as Platform)) {
          sendResponse({
            ok: false,
            error: `${platform} driver coming soon. Use Facebook Marketplace for now.`,
          });
          return;
        }

        const validImageUrls = Array.isArray(imageUrls) 
          ? imageUrls.filter((u): u is string => typeof u === "string")
          : [];
        
        const baseUrl = await getApiBaseUrl();
        
        console.log(`[LV-BG] FILL_CONTENT: baseUrl="${baseUrl}", ${validImageUrls.length} image URLs received`);
        console.log(`[LV-BG] First 3 image URLs:`, validImageUrls.slice(0, 3));
        
        const resolvedImageUrls = validImageUrls.map(url => {
          if (url.startsWith("/public-objects/") && baseUrl) {
            const resolved = `${baseUrl}${url}`;
            console.log(`[LV-BG] Resolved: ${url} → ${resolved}`);
            return resolved;
          }
          if (url.startsWith("/") && baseUrl) {
            const resolved = `${baseUrl}${url}`;
            console.log(`[LV-BG] Resolved: ${url} → ${resolved}`);
            return resolved;
          }
          return url;
        });
        
        console.log(`[LV-BG] Final resolved URLs (first 3):`, resolvedImageUrls.slice(0, 3));

        const job: PostJob = {
          vehicleId,
          platform: platform as Platform,
          templateId: typeof templateId === "number" ? templateId : undefined,
          imageUrls: resolvedImageUrls,
          proxyBaseUrl: baseUrl || undefined,
          formData,
        };

        try {
          await getDriver(platform as Platform).fillForm(job);
          sendResponse({ ok: true });
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : "Fill failed";
          sendResponse({ ok: false, error });
        }
        return;
      }

      if (message.type === "DOWNLOAD_IMAGES") {
        const { imageUrls, vehicleInfo } = message.payload || {};
        
        if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
          sendResponse({ ok: false, error: "No images to download" });
          return;
        }
        
        const baseUrl = await getApiBaseUrl();
        const downloadedPaths: string[] = [];
        const vehicleName = vehicleInfo || "vehicle";
        const safeName = vehicleName.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 30);
        
        try {
          for (let i = 0; i < Math.min(imageUrls.length, 20); i++) {
            let url = imageUrls[i];
            
            // Resolve relative URLs
            if (url.startsWith("/") && baseUrl) {
              url = `${baseUrl}${url}`;
            }
            
            // Security: Only allow HTTPS URLs from trusted hosts
            try {
              const urlObj = new URL(url);
              if (urlObj.protocol !== "https:") {
                console.warn(`[LV] Skipping non-HTTPS URL: ${url}`);
                continue;
              }
              if (!isAllowedImageHost(urlObj.hostname)) {
                console.warn(`[LV] Skipping URL from untrusted host: ${urlObj.hostname}`);
                continue;
              }
            } catch {
              console.warn(`[LV] Skipping invalid URL: ${url}`);
              continue;
            }
            
            const filename = `${safeName}-${String(i + 1).padStart(2, "0")}.jpg`;
            
            // Use Chrome downloads API to save to user's downloads folder
            await chrome.downloads.download({
              url: url,
              filename: `Lotview-Photos/${filename}`,
              saveAs: false,
              conflictAction: "overwrite",
            });
            
            downloadedPaths.push(filename);
          }
          
          sendResponse({ 
            ok: true, 
            downloadedCount: downloadedPaths.length,
            folderName: "Lotview-Photos",
            message: `Downloaded ${downloadedPaths.length} photos to Downloads/Lotview-Photos folder`
          });
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : "Download failed";
          sendResponse({ ok: false, error });
        }
        return;
      }

      // Fetch image blob via background script (bypasses CORS)
      if (message.type === "FETCH_IMAGE_BLOB") {
        const { url } = message.payload || {};
        
        if (!url || typeof url !== "string") {
          sendResponse({ ok: false, error: "URL required" });
          return;
        }
        
        try {
          console.log(`[LV-BG] FETCH_IMAGE_BLOB: ${url.slice(0, 80)}...`);
          
          // Background script can fetch cross-origin without CORS restrictions
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);
          
          const response = await fetch(url, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/*,*/*',
            }
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            console.warn(`[LV-BG] Image fetch failed: ${response.status}`);
            sendResponse({ ok: false, error: `HTTP ${response.status}` });
            return;
          }
          
          const contentType = response.headers.get("content-type") || "";
          if (!contentType.startsWith("image/")) {
            console.warn(`[LV-BG] Not an image: ${contentType}`);
            sendResponse({ ok: false, error: `Not an image: ${contentType}` });
            return;
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          let binary = "";
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const base64 = btoa(binary);
          
          console.log(`[LV-BG] Image fetched: ${arrayBuffer.byteLength} bytes, ${contentType}`);
          sendResponse({ 
            ok: true, 
            base64, 
            contentType,
            size: arrayBuffer.byteLength 
          });
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : "Image fetch failed";
          console.error(`[LV-BG] FETCH_IMAGE_BLOB error:`, error);
          sendResponse({ ok: false, error });
        }
        return;
      }

      if (message.type === "GET_FB_COOKIES") {
        // Get Facebook cookies for server-side automation
        try {
          const cookies = await chrome.cookies.getAll({ domain: ".facebook.com" });
          if (cookies.length === 0) {
            sendResponse({ ok: false, error: "No Facebook cookies found. Please log into Facebook first." });
          } else {
            // Filter to essential cookies for authentication
            const essentialCookies = cookies.filter(c => 
              ['c_user', 'xs', 'datr', 'sb', 'fr', 'presence'].includes(c.name)
            );
            sendResponse({ ok: true, cookies: essentialCookies });
          }
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : "Failed to get cookies";
          sendResponse({ ok: false, error });
        }
        return;
      }

      if (message.type === "GENERATE_AI_CONTENT") {
        const { vehicleId, prompt, type, tone, useEmojis } = message.payload || {};
        
        if (!vehicleId || !prompt) {
          sendResponse({ ok: false, error: "Vehicle ID and prompt required" });
          return;
        }

        try {
          const result = await apiWithRetry<{ content: string }>(
            "/api/extension/generate-ai",
            auth.token,
            {
              method: "POST",
              body: JSON.stringify({ vehicleId, prompt, type, tone, useEmojis }),
            }
          );
          sendResponse({ ok: true, content: result.content });
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : "AI generation failed";
          sendResponse({ ok: false, error });
        }
        return;
      }

      if (message.type === "AUTO_POST_VEHICLE") {
        const { vehicleId } = message.payload || {};
        
        if (!vehicleId) {
          sendResponse({ ok: false, error: "Vehicle ID required" });
          return;
        }

        try {
          // First get Facebook cookies
          const cookies = await chrome.cookies.getAll({ domain: ".facebook.com" });
          const essentialCookies = cookies.filter(c => 
            ['c_user', 'xs', 'datr', 'sb', 'fr', 'presence'].includes(c.name)
          );

          if (essentialCookies.length === 0) {
            sendResponse({ ok: false, error: "Not logged into Facebook. Please log in first." });
            return;
          }

          const baseUrl = await getApiBaseUrl();
          if (!baseUrl) {
            sendResponse({ ok: false, error: "Server not configured" });
            return;
          }

          // Call server-side automation endpoint
          const res = await fetch(`${baseUrl}/api/extension/auto-post`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${auth.token}`,
            },
            body: JSON.stringify({
              vehicleId,
              sessionCookies: essentialCookies.map(c => ({
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                secure: c.secure,
                httpOnly: c.httpOnly,
              })),
            }),
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || `Server error: ${res.status}`);
          }

          const result = await res.json();
          sendResponse({ ok: true, ...result });
        } catch (err: unknown) {
          const error = err instanceof Error ? err.message : "Auto-post failed";
          sendResponse({ ok: false, error });
        }
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (err: unknown) {
      const error = err instanceof Error ? err.message : "Unexpected error";
      sendResponse({ ok: false, error });
    }
  })();

  return true;
});
