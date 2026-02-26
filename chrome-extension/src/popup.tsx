import React, { useEffect, useState, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import { ExtensionAuthState, VehicleSummary, Template, Platform, PostingLimits } from "./types";
import { sanitizeTemplateOutput } from "./sanitize";

const PROTOCOL_VERSION = 1;

type ToastType = "success" | "error" | "info" | "warning";
interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

interface PostingRecord {
  vehicleId: number;
  vehicleTitle: string;
  platform: Platform;
  status: "success" | "failed";
  timestamp: number;
  error?: string;
}

function sendMessage<T = unknown>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve) => {
    const msgWithVersion = { ...message, protocolVersion: PROTOCOL_VERSION };
    chrome.runtime.sendMessage(msgWithVersion, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || "Communication error";
        resolve({ ok: false, error: errorMsg } as T);
        return;
      }
      if (response?.code === "PROTOCOL_MISMATCH") {
        resolve({ ok: false, error: "Extension version mismatch. Please reload the extension." } as T);
        return;
      }
      resolve(response as T);
    });
  });
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return <span className={`spinner ${dark ? "dark" : ""}`} />;
}

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  const timersRef = useRef<Map<number, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    toasts.forEach((t) => {
      if (!timersRef.current.has(t.id)) {
        const timer = setTimeout(() => {
          onDismiss(t.id);
          timersRef.current.delete(t.id);
        }, 5000);
        timersRef.current.set(t.id, timer);
      }
    });

    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} onClick={() => onDismiss(t.id)}>
          <span className="toast-icon">
            {t.type === "success" && "✓"}
            {t.type === "error" && "✕"}
            {t.type === "info" && "ℹ"}
            {t.type === "warning" && "⚠"}
          </span>
          {t.message}
        </div>
      ))}
    </div>
  );
}

function Popup() {
  const [auth, setAuth] = useState<ExtensionAuthState | null>(null);
  const [serverUrl, setServerUrl] = useState("https://lotview.ai");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [query, setQuery] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [loginLoading, setLoginLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [fillLoading, setFillLoading] = useState(false);
  const [tab, setTab] = useState<"post" | "history">("post");
  const [history, setHistory] = useState<PostingRecord[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [limits, setLimits] = useState<PostingLimits | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplTitle, setTplTitle] = useState("{year} {make} {model} - ${price}");
  const [tplDescription, setTplDescription] = useState(
    "Check out this {year} {make} {model} {trim}! {odometer} km, {fuel} / {transmission} / {drivetrain}. Priced at ${price}. Call today!"
  );
  const [tplShared, setTplShared] = useState(false);
  const [dataLoadFailed, setDataLoadFailed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState<boolean | null>(null);
  const [consentLoading, setConsentLoading] = useState(true);

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const HISTORY_RETENTION_DAYS = 30;
  const HISTORY_RETENTION_MS = HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  const loadHistory = useCallback(async () => {
    try {
      const stored = await chrome.storage.local.get(["postingHistory"]) as { postingHistory?: PostingRecord[] };
      if (stored.postingHistory && Array.isArray(stored.postingHistory)) {
        const now = Date.now();
        const validHistory = stored.postingHistory.filter(
          (record) => now - record.timestamp < HISTORY_RETENTION_MS
        );
        if (validHistory.length !== stored.postingHistory.length) {
          await chrome.storage.local.set({ postingHistory: validHistory });
        }
        setHistory(validHistory);
      }
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  }, []);

  const saveHistoryRecord = useCallback(async (record: PostingRecord) => {
    try {
      const stored = await chrome.storage.local.get(["postingHistory"]) as { postingHistory?: PostingRecord[] };
      const currentHistory = Array.isArray(stored.postingHistory) ? stored.postingHistory : [];
      const newHistory = [record, ...currentHistory].slice(0, 50);
      await chrome.storage.local.set({ postingHistory: newHistory });
      setHistory((prev) => [record, ...prev].slice(0, 50));
    } catch (err) {
      console.error("Failed to save history:", err);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await chrome.storage.local.get([
          "privacyConsent",
          "rememberedEmail",
          "rememberedServerUrl",
          "rememberMe"
        ]) as {
          privacyConsent?: boolean;
          rememberedEmail?: string;
          rememberedServerUrl?: string;
          rememberMe?: boolean;
        };

        // Load remembered credentials (never store passwords)
        if (stored.rememberMe) {
          setRememberMe(true);
        }
        if (stored.rememberedEmail) {
          setEmail(stored.rememberedEmail);
        }
        if (stored.rememberedServerUrl) {
          setServerUrl(stored.rememberedServerUrl);
        }
        // Clear any legacy password storage from older versions
        await chrome.storage.local.remove(["rememberedPassword"]);
        
        if (typeof stored.privacyConsent === "boolean") {
          setPrivacyConsent(stored.privacyConsent);
        } else {
          setPrivacyConsent(null);
        }
        setConsentLoading(false);

        if (stored.privacyConsent === true) {
          const res = await sendMessage<{ ok: boolean; auth?: ExtensionAuthState; apiBaseUrl?: string }>({ type: "GET_AUTH" });
          if (res?.auth) {
            setAuth(res.auth);
          }
          if (res?.apiBaseUrl) {
            setServerUrl(res.apiBaseUrl);
          }
          loadHistory();
        }
      } catch (err) {
        console.error("Failed to load auth:", err);
        setConsentLoading(false);
        addToast("error", "Failed to load saved session");
      }
    })();
  }, [loadHistory, addToast]);

  const acceptPrivacyConsent = async () => {
    await chrome.storage.local.set({ privacyConsent: true });
    setPrivacyConsent(true);
    loadHistory();
    const res = await sendMessage<{ ok: boolean; auth?: ExtensionAuthState; apiBaseUrl?: string }>({ type: "GET_AUTH" });
    if (res?.auth) {
      setAuth(res.auth);
    }
    if (res?.apiBaseUrl) {
      setServerUrl(res.apiBaseUrl);
    }
  };

  const declinePrivacyConsent = async () => {
    await chrome.storage.local.set({ privacyConsent: false });
    setPrivacyConsent(false);
  };

  const login = async () => {
    setLoginLoading(true);
    try {
      const res = await sendMessage<{ ok: boolean; error?: string; auth?: ExtensionAuthState }>({
        type: "EXT_LOGIN",
        payload: { email, password, serverUrl: serverUrl.replace(/\/$/, "") },
      });
      if (!res?.ok) {
        addToast("error", res?.error || "Login failed");
      } else if (res.auth) {
        setAuth(res.auth);
        // Save email and server URL (never store passwords)
        await chrome.storage.local.set({
          rememberedEmail: email,
          rememberedServerUrl: serverUrl.replace(/\/$/, ""),
          rememberMe
        });
        addToast("success", "Logged in successfully");
      }
    } catch (err) {
      addToast("error", "Login failed");
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = async () => {
    await sendMessage({ type: "EXT_LOGOUT" });
    setAuth(null);
    setVehicles([]);
    setTemplates([]);
    setSelectedVehicleId(null);
    setSelectedTemplateId(null);
    setLimits(null);
    setDataLoadFailed(false);
    addToast("info", "Logged out");
  };

  const clearAllData = async () => {
    if (!confirm("This will clear all your posting history, saved preferences, and privacy consent. Continue?")) {
      return;
    }
    try {
      await chrome.storage.local.remove(["postingHistory", "privacyConsent"]);
      await sendMessage({ type: "EXT_LOGOUT" });
      setHistory([]);
      setAuth(null);
      setVehicles([]);
      setTemplates([]);
      setSelectedVehicleId(null);
      setSelectedTemplateId(null);
      setLimits(null);
      setShowSettings(false);
      setPrivacyConsent(null);
      addToast("success", "All data cleared");
    } catch (err) {
      addToast("error", "Failed to clear data");
    }
  };

  const exportData = async () => {
    try {
      const stored = await chrome.storage.local.get(["postingHistory"]) as { postingHistory?: PostingRecord[] };
      const exportData = {
        exportedAt: new Date().toISOString(),
        postingHistory: stored.postingHistory || [],
        email: auth?.email || "unknown",
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lotview-data-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast("success", "Data exported successfully");
    } catch (err) {
      addToast("error", "Export failed");
    }
  };

  const clearHistory = async () => {
    if (!confirm("Clear all posting history?")) return;
    try {
      await chrome.storage.local.remove(["postingHistory"]);
      setHistory([]);
      addToast("success", "History cleared");
    } catch (err) {
      addToast("error", "Failed to clear history");
    }
  };

  const fetchInventory = async () => {
    setInventoryLoading(true);
    try {
      const res = await sendMessage<{ ok: boolean; error?: string; vehicles?: VehicleSummary[] }>({
        type: "FETCH_INVENTORY",
        payload: { query },
      });
      if (!res?.ok) {
        addToast("error", res?.error || "Failed to load vehicles");
        setDataLoadFailed(true);
      } else {
        setVehicles(res.vehicles || []);
        setDataLoadFailed(false);
        if ((res.vehicles?.length || 0) === 0) {
          addToast("info", "No vehicles found");
        }
      }
    } catch (err) {
      addToast("error", "Failed to load vehicles");
      setDataLoadFailed(true);
    } finally {
      setInventoryLoading(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await sendMessage<{ ok: boolean; error?: string; templates?: Template[] }>({ type: "FETCH_TEMPLATES" });
      if (!res?.ok) {
        addToast("warning", res?.error || "Failed to load templates");
      } else {
        setTemplates(res.templates || []);
      }
    } catch (err) {
      addToast("warning", "Failed to load templates");
    }
  };

  const fetchLimits = async () => {
    try {
      const res = await sendMessage<{ ok: boolean; error?: string; limits?: PostingLimits }>({ type: "FETCH_LIMITS" });
      if (!res?.ok) {
        addToast("warning", res?.error || "Failed to load posting limits");
      } else if (res.limits) {
        setLimits(res.limits);
      }
    } catch (err) {
      addToast("warning", "Failed to load posting limits");
    }
  };

  const saveTemplate = async () => {
    const res = await sendMessage<{ ok: boolean; error?: string }>({
      type: "SAVE_TEMPLATE",
      payload: {
        templateName: tplName || `Template ${templates.length + 1}`,
        titleTemplate: tplTitle,
        descriptionTemplate: tplDescription,
        isShared: tplShared,
      },
    });
    if (!res?.ok) {
      addToast("error", res?.error || "Failed to save template");
    } else {
      addToast("success", "Template saved");
      fetchTemplates();
      setTplName("");
    }
  };

  useEffect(() => {
    if (auth) {
      fetchInventory();
      fetchTemplates();
      fetchLimits();
    }
  }, [auth]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const isVehiclePosted = (vehicleId: number): boolean => {
    if (!limits) return false;
    const postedOnPlatform = limits.postedVehicles[platform] || [];
    return postedOnPlatform.includes(vehicleId);
  };

  const isLimitReached = limits ? limits.remaining <= 0 : false;
  const selectedVehiclePosted = selectedVehicle ? isVehiclePosted(selectedVehicle.id) : false;

  const fillTemplate = (template: string, vehicle: VehicleSummary): string => {
    const filled = template
      .replace(/{year}/g, String(vehicle.year || ""))
      .replace(/{make}/g, vehicle.make || "")
      .replace(/{model}/g, vehicle.model || "")
      .replace(/{trim}/g, vehicle.trim || "")
      .replace(/{price}/g, vehicle.price ? vehicle.price.toLocaleString() : "")
      .replace(/{odometer}/g, vehicle.odometer ? vehicle.odometer.toLocaleString() : "")
      .replace(/{fuel}/g, vehicle.fuelType || "")
      .replace(/{transmission}/g, vehicle.transmission || "")
      .replace(/{drivetrain}/g, vehicle.drivetrain || "")
      .replace(/{vin}/g, vehicle.vin || "")
      .replace(/{stock}/g, vehicle.stockNumber || "");
    return sanitizeTemplateOutput(filled);
  };

  const fillListing = async () => {
    if (!selectedVehicle) {
      addToast("error", "Pick a vehicle first");
      return;
    }

    setFillLoading(true);

    // Auto-navigate to Facebook Marketplace vehicle create page if platform is Facebook
    if (platform === "facebook") {
      try {
        const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const vehicleCreateUrl = "https://www.facebook.com/marketplace/create/vehicle";
        
        if (!currentTab?.url?.includes("facebook.com/marketplace/create/vehicle")) {
          addToast("info", "Opening Facebook Marketplace vehicle form...");
          await chrome.tabs.update(currentTab.id!, { url: vehicleCreateUrl });
          // Wait for page to load
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (err) {
        console.error("[LV] Error navigating to vehicle create page:", err);
      }
    }

    const titleTpl = selectedTemplate?.titleTemplate || "{year} {make} {model}";
    const descTpl = selectedTemplate?.descriptionTemplate || selectedVehicle.description || "";
    const vehicleTitle = `${selectedVehicle.year || ""} ${selectedVehicle.make || ""} ${selectedVehicle.model || ""}`.trim();

    // Debug: show visible toast with vehicle data to diagnose fuelType issue
    const debugInfo = {
      id: selectedVehicle.id,
      model: selectedVehicle.model,
      fuelType: selectedVehicle.fuelType || "(MISSING!)",
      exteriorColour: selectedVehicle.exteriorColour || "(none)",
      transmission: selectedVehicle.transmission || "(none)",
      imageCount: (selectedVehicle.images || []).length,
      firstImage: (selectedVehicle.images || [])[0] || "(no images)",
    };
    console.log("[LV-Popup] Vehicle data:", debugInfo);
    
    // Show visible toast with fuel type for debugging
    addToast("info", `FuelType: "${selectedVehicle.fuelType || 'EMPTY'}" | Images: ${(selectedVehicle.images || []).length}`);

    const formData = {
      title: fillTemplate(titleTpl, selectedVehicle).trim(),
      price: selectedVehicle.price || "",
      description: fillTemplate(descTpl, selectedVehicle).trim(),
      location: selectedVehicle.location || "Vancouver, British Columbia",
      year: selectedVehicle.year ? String(selectedVehicle.year) : "",
      make: selectedVehicle.make || "",
      model: selectedVehicle.model || "",
      odometer: selectedVehicle.odometer ? String(selectedVehicle.odometer) : "",
      exteriorColor: selectedVehicle.exteriorColour || "",
      interiorColor: selectedVehicle.interiorColour || "",
      transmission: selectedVehicle.transmission || "",
      fuelType: selectedVehicle.fuelType || "",
      drivetrain: selectedVehicle.drivetrain || "",
      bodyType: selectedVehicle.bodyType || "",
      trim: selectedVehicle.trim || "",
      highlights: selectedVehicle.highlights || "",
    };
    
    console.log("[LV-Popup] Form data being sent:", formData);

    // Prioritize local Object Storage images over CDN URLs (they don't have CORS issues)
    // selectedVehicle.images should already have local images first from API response
    let imageUrls = [...new Set(selectedVehicle.images || [])].slice(0, 20);
    
    // Check if we have local images (start with /public-objects/ or /api/public/vehicle-image/)
    const localImages = imageUrls.filter(url => url.startsWith('/public-objects/') || url.startsWith('/api/public/vehicle-image/'));
    const hasLocalImages = localImages.length > 0;
    
    // Convert relative local URLs to absolute using server URL
    if (hasLocalImages) {
      imageUrls = imageUrls.map(url => 
        url.startsWith('/') ? `${serverUrl}${url}` : url
      );
    }
    
    console.log("[LV-Popup] Image sources:", { 
      totalImages: imageUrls.length,
      localImages: localImages.length,
      hasLocalImages,
      sampleUrls: imageUrls.slice(0, 3)
    });
    
    // Only try to extract Lotview page images if we DON'T have local images
    // This avoids CORS issues since local images are hosted on our server
    if (!hasLocalImages) {
      const lotviewImages = await sendMessage<{ ok: boolean; images?: string[]; method?: string; error?: string }>({
        type: "EXTRACT_LOTVIEW_IMAGES",
      });
      
      if (lotviewImages?.ok && lotviewImages.images && lotviewImages.images.length > 0) {
        const uniqueImages = [...new Set([...lotviewImages.images, ...imageUrls])].slice(0, 20);
        imageUrls = uniqueImages;
        addToast("info", `Found ${lotviewImages.images.length} images from open vehicle page`);
      }
    } else {
      console.log("[LV-Popup] Using local Object Storage images, skipping Lotview page extraction");
    }

    const res = await sendMessage<{ ok: boolean; error?: string; imageWarnings?: string[] }>({
      type: "FILL_CONTENT",
      payload: {
        platform,
        vehicleId: selectedVehicle.id,
        formData,
        imageUrls,
        templateId: selectedTemplate?.id,
      },
    });

    setFillLoading(false);

    const record: PostingRecord = {
      vehicleId: selectedVehicle.id,
      vehicleTitle,
      platform,
      status: res?.ok ? "success" : "failed",
      timestamp: Date.now(),
      error: res?.error,
    };
    
    await saveHistoryRecord(record);

    if (res?.ok) {
      if (res.imageWarnings && res.imageWarnings.length > 0) {
        addToast("warning", res.imageWarnings[0]);
      }
      addToast("success", "Listing form filled! Complete the post on Facebook.");
      
      // Request a one-time posting token from server (enforces server-side limits)
      const tokenRes = await sendMessage<{ ok: boolean; postingToken?: string; error?: string }>({
        type: "REQUEST_POSTING_TOKEN",
        payload: { vehicleId: selectedVehicle.id, platform },
      });

      if (tokenRes?.ok && tokenRes.postingToken) {
        await sendMessage({
          type: "LOG_POSTING",
          payload: { 
            vehicleId: selectedVehicle.id, 
            platform, 
            status: "success",
            postingToken: tokenRes.postingToken,
          },
        });
      } else {
        // Token request failed (likely daily limit reached)
        addToast("warning", tokenRes?.error || "Could not verify posting - limit may have been reached");
      }
    } else {
      addToast("error", res?.error || "Fill failed");
      await sendMessage({
        type: "LOG_POSTING",
        payload: { vehicleId: selectedVehicle.id, platform, status: "failed", error: res?.error },
      });
    }
  };

  if (consentLoading) {
    return (
      <div className="popup-container">
        <div className="header">
          <h1>Lotview Auto Poster</h1>
        </div>
        <div style={{ textAlign: "center", padding: "20px" }}>
          <Spinner />
        </div>
      </div>
    );
  }

  if (privacyConsent === null || privacyConsent === false) {
    return (
      <div className="popup-container" data-testid="consent-banner">
        <div className="header">
          <h1>Lotview Auto Poster</h1>
        </div>

        <div style={{ padding: "16px", fontSize: "13px", lineHeight: "1.5" }}>
          <h3 style={{ marginTop: 0 }}>Privacy & Data Collection</h3>
          
          <p>This extension collects and stores the following data to provide its functionality:</p>
          
          <ul style={{ paddingLeft: "20px", margin: "12px 0" }}>
            <li><strong>Login credentials</strong> - Securely stored and encrypted</li>
            <li><strong>Posting history</strong> - Stored locally for 30 days</li>
            <li><strong>Vehicle data</strong> - Retrieved from your dealership inventory</li>
          </ul>

          <p><strong>Data security:</strong></p>
          <ul style={{ paddingLeft: "20px", margin: "12px 0" }}>
            <li>All tokens are encrypted using AES-GCM</li>
            <li>No data is shared with third parties</li>
            <li>History is automatically purged after 30 days</li>
            <li>You can export or delete all data at any time</li>
          </ul>

          <p style={{ marginBottom: "16px" }}>
            By clicking "Accept", you consent to this data collection. 
            <a 
              href="https://lotview.ai/privacy" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: "#2563eb", textDecoration: "underline", marginLeft: "4px" }}
            >
              View full Privacy Policy
            </a>
          </p>

          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn-primary"
              onClick={acceptPrivacyConsent}
              data-testid="button-accept-consent"
              style={{ flex: 1 }}
            >
              Accept
            </button>
            <button
              className="btn-secondary"
              onClick={declinePrivacyConsent}
              data-testid="button-decline-consent"
              style={{ flex: 1 }}
            >
              Decline
            </button>
          </div>

          {privacyConsent === false && (
            <p style={{ marginTop: "12px", color: "#dc2626", fontSize: "12px" }}>
              You must accept the privacy policy to use this extension.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!auth) {
    return (
      <div className="popup-container">
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <div className="header">
          <div>
            <h1>Lotview Auto Poster</h1>
            <p>Log in with your Lotview account</p>
          </div>
        </div>

        <div className="form-group">
          <label>Server URL</label>
          <input
            type="url"
            placeholder="https://lotview.ai"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            data-testid="input-server-url"
          />
        </div>

        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-testid="input-email"
          />
        </div>

        <div className="form-group">
          <label>Password</label>
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && login()}
            data-testid="input-password"
          />
        </div>

        <div className="form-group remember-me">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              data-testid="checkbox-remember-me"
            />
            <span>Remember me</span>
          </label>
          <span className="remember-hint">Saves your login credentials</span>
        </div>

        <button
          className="btn-primary"
          disabled={loginLoading || !serverUrl || !email || !password}
          onClick={login}
          data-testid="button-login"
        >
          {loginLoading ? <><Spinner /> Signing in...</> : "Sign In"}
        </button>
      </div>
    );
  }

  return (
    <div className="popup-container">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="header">
        <div className="user-info">
          <span className="user-email">{auth.email}</span>
          <span className="dealer-id">{auth.dealershipName || `Dealer #${auth.dealershipId}`}</span>
        </div>
        <button className="btn-link" onClick={logout} data-testid="button-logout">
          Logout
        </button>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "post" ? "active" : ""}`} onClick={() => setTab("post")} data-testid="tab-post">
          Post Vehicle
        </button>
        <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")} data-testid="tab-history">
          History ({history.length})
        </button>
      </div>

      {tab === "post" && (
        <>
          <div className="section">
            <div className="section-title">
              <label>Search Inventory</label>
              <span className="section-count">{vehicles.length} vehicles</span>
            </div>
            <div className="search-row">
              <input
                type="text"
                placeholder="VIN, stock, make/model..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchInventory()}
                data-testid="input-search"
              />
              <button className="btn-secondary" onClick={fetchInventory} disabled={inventoryLoading} data-testid="button-search">
                {inventoryLoading ? <Spinner dark /> : "Search"}
              </button>
            </div>
          </div>

          {dataLoadFailed && (
            <div className="data-error-banner" data-testid="data-error-banner">
              Failed to load data. <button onClick={fetchInventory}>Retry</button>
            </div>
          )}

          <div className="vehicle-list" style={{ position: "relative" }}>
            {inventoryLoading && (
              <div className="loading-overlay">
                <div className="loading-text"><Spinner dark /> Loading vehicles...</div>
              </div>
            )}
            {!inventoryLoading && vehicles.length === 0 && !dataLoadFailed && (
              <div className="empty-state">
                <div className="empty-state-icon">🚗</div>
                <p>No vehicles found. Try a different search.</p>
              </div>
            )}
            {vehicles.map((v) => {
              const posted = isVehiclePosted(v.id);
              return (
                <button
                  key={v.id}
                  className={`vehicle-item ${selectedVehicleId === v.id ? "selected" : ""} ${posted ? "posted" : ""}`}
                  onClick={() => setSelectedVehicleId(v.id)}
                  data-testid={`vehicle-item-${v.id}`}
                >
                  <div className="vehicle-item-row">
                    {v.images[0] && <img src={v.images[0]} alt="" className="vehicle-image" />}
                    <div className="vehicle-item-content">
                      <div className="vehicle-title">
                        {v.year} {v.make} {v.model} {v.trim || ""}
                        {posted && <span className="posted-badge">Posted</span>}
                      </div>
                      <div className="vehicle-meta">
                        {v.stockNumber || v.vin || "No ID"} · {v.price ? `$${v.price.toLocaleString()}` : "No price"}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="section">
            <label>Platform</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value as Platform)} data-testid="select-platform">
              <option value="facebook">Facebook Marketplace</option>
              <option value="kijiji" disabled>Kijiji (coming soon)</option>
              <option value="craigslist" disabled>Craigslist (coming soon)</option>
            </select>
          </div>

          <div className="section">
            <label>Template</label>
            <select
              value={selectedTemplateId ?? ""}
              onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
              data-testid="select-template"
            >
              <option value="">Default</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.templateName}</option>
              ))}
            </select>
          </div>

          {limits && (
            <div className={`limit-indicator ${isLimitReached ? "limit-reached" : ""}`} data-testid="limit-indicator">
              {isLimitReached ? (
                <>Daily limit reached (0/{limits.dailyLimit})</>
              ) : (
                <>{limits.remaining} of {limits.dailyLimit} posts remaining today</>
              )}
            </div>
          )}

          {selectedVehiclePosted && (
            <div className="duplicate-warning" data-testid="duplicate-warning">
              This vehicle was already posted to {platform === "facebook" ? "Facebook Marketplace" : platform}. Posting again may create a duplicate listing.
            </div>
          )}

          <button
            className="btn-primary"
            onClick={fillListing}
            disabled={fillLoading || !selectedVehicleId || isLimitReached || dataLoadFailed}
            data-testid="button-fill"
          >
            {fillLoading ? <><Spinner /> Filling form...</> : isLimitReached ? "Daily Limit Reached" : selectedVehiclePosted ? "Re-post Vehicle" : "Auto-fill Listing"}
          </button>

          <details className="template-section">
            <summary>Create Template</summary>
            <div className="template-form">
              <input
                type="text"
                placeholder="Template name"
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                data-testid="input-template-name"
              />
              <textarea
                placeholder="Title: {year} {make} {model} - ${price}"
                value={tplTitle}
                onChange={(e) => setTplTitle(e.target.value)}
                rows={2}
                data-testid="input-template-title"
              />
              <textarea
                placeholder="Description template..."
                value={tplDescription}
                onChange={(e) => setTplDescription(e.target.value)}
                rows={4}
                data-testid="input-template-desc"
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={tplShared}
                  onChange={(e) => setTplShared(e.target.checked)}
                  data-testid="checkbox-shared"
                />
                Shared template (manager/admin only)
              </label>
              <button
                className="btn-secondary"
                onClick={saveTemplate}
                disabled={!tplTitle || !tplDescription}
                data-testid="button-save-template"
              >
                Save Template
              </button>
            </div>
          </details>
        </>
      )}

      {tab === "history" && (
        <>
          <div className="history-list">
            {history.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon">📋</div>
                <p>No posting history yet</p>
              </div>
            )}
            {history.map((h, i) => (
              <div key={i} className="history-item" data-testid={`history-item-${i}`}>
                <div>
                  <div className="history-vehicle">{h.vehicleTitle}</div>
                  <div className="history-meta">
                    {new Date(h.timestamp).toLocaleDateString()} · {h.platform}
                  </div>
                </div>
                <span className={`history-status ${h.status}`}>
                  {h.status === "success" ? "✓ Posted" : "✕ Failed"}
                </span>
              </div>
            ))}
          </div>
          
          {history.length > 0 && (
            <button className="btn-secondary" onClick={clearHistory} data-testid="button-clear-history">
              Clear History
            </button>
          )}
          
          <details className="template-section">
            <summary>Privacy & Data</summary>
            <div className="template-form">
              <p style={{ fontSize: "12px", color: "#6b7280", marginBottom: "8px" }}>
                History is automatically deleted after 30 days. You can export or clear your data below.
              </p>
              <div style={{ display: "flex", gap: "8px" }}>
                <button className="btn-secondary" onClick={exportData} data-testid="button-export-data">
                  Export Data
                </button>
                <button 
                  className="btn-secondary" 
                  style={{ color: "#dc2626", borderColor: "#fecaca" }} 
                  onClick={clearAllData}
                  data-testid="button-clear-all-data"
                >
                  Clear All Data
                </button>
              </div>
              <a 
                href="https://lotview.ai/privacy" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ fontSize: "12px", color: "#3b82f6", marginTop: "8px" }}
                data-testid="link-privacy-policy"
              >
                Privacy Policy
              </a>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<Popup />);
}
