// Background service worker (MV3) - orchestrates auth, inventory fetch, and job routing.
import { ExtensionAuthState, VehicleSummary, Template, PostJob, Platform } from "./types";

const API_BASE = "https://app.lotview.ai"; // TODO: make configurable (dev/prod)
const FILL_CHANNEL = "LV_FILL_FACEBOOK";

async function api<T>(endpoint: string, token: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return res.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      // Public messages (no auth)
      if (message.type === "EXT_LOGIN") {
        const { email, password } = message.payload;
        const res = await fetch(`${API_BASE}/api/extension/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || "Login failed");
        }
        const data: ExtensionAuthState = await res.json();
        await chrome.storage.sync.set({ auth: data });
        sendResponse({ ok: true, auth: data });
        return;
      }

      if (message.type === "EXT_LOGOUT") {
        await chrome.storage.sync.remove(["auth"]);
        sendResponse({ ok: true });
        return;
      }

      // Authenticated messages
      const stored = await chrome.storage.sync.get(["auth"]);
      const auth: ExtensionAuthState | undefined = stored.auth;
      if (!auth) {
        throw new Error("Not authenticated");
      }

      if (message.type === "FETCH_INVENTORY") {
        const query = message.payload?.query ?? "";
        const vehicles = await api<VehicleSummary[]>(
          `/api/extension/inventory?query=${encodeURIComponent(query)}`,
          auth.token
        );
        sendResponse({ ok: true, vehicles });
        return;
      }

      if (message.type === "FETCH_TEMPLATES") {
        const templates = await api<Template[]>(`/api/ad-templates`, auth.token);
        sendResponse({ ok: true, templates });
        return;
      }

      if (message.type === "SAVE_TEMPLATE") {
        const { templateName, titleTemplate, descriptionTemplate, isShared } = message.payload;
        if (!templateName || !titleTemplate || !descriptionTemplate) {
          return sendResponse({ ok: false, error: "Template name, title, description required" });
        }
        const endpoint = isShared ? "/api/ad-templates/shared" : "/api/ad-templates";
        const tpl = await api<Template>(endpoint, auth.token, {
          method: "POST",
          body: JSON.stringify({ templateName, titleTemplate, descriptionTemplate, isDefault: false }),
        });
        sendResponse({ ok: true, template: tpl });
        return;
      }

      if (message.type === "LOG_POSTING") {
        const { vehicleId, platform, status, url, error } = message.payload;
        await api(`/api/extension/postings`, auth.token, {
          method: "POST",
          body: JSON.stringify({ vehicleId, platform, status, url, error }),
        });
        sendResponse({ ok: true });
        return;
      }

      if (message.type === "FILL_CONTENT") {
        const { platform, vehicleId, formData, imageUrls, templateId } = message.payload;
        if (platform !== "facebook") {
          return sendResponse({ ok: false, error: "Platform driver not implemented" });
        }
        const files = await fetchImages(imageUrls || []);
        const job: PostJob = {
          vehicleId,
          platform,
          templateId,
          images: files,
          formData,
        };

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab?.id) {
          return sendResponse({ ok: false, error: "No active tab found" });
        }
        chrome.tabs.sendMessage(tab.id, { type: FILL_CHANNEL, payload: job }, (res) => {
          if (chrome.runtime.lastError) {
            return sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          }
          sendResponse(res || { ok: true });
        });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (err: any) {
      sendResponse({ ok: false, error: err?.message || "Unexpected error" });
    }
  })();

  // Keep the message channel open for async
  return true;
});

// Utility: fetch images as File objects for upload via content script
export async function fetchImages(urls: string[]): Promise<File[]> {
  const files: File[] = [];
  for (const url of urls) {
    const res = await fetch(url);
    const blob = await res.blob();
    const name = url.split("/").pop() || "photo.jpg";
    files.push(new File([blob], name, { type: blob.type || "image/jpeg" }));
  }
  return files;
}
