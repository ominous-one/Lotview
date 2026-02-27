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
  const [tab, setTab] = useState<"post" | "history" | "chat-logs" | "ai-settings">("post");
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
  const [aiAutoReplyEnabled, setAiAutoReplyEnabled] = useState(false);
  const [chatLogs, setChatLogs] = useState<any[]>([]);
  const [chatLogsLoading, setChatLogsLoading] = useState(false);
  const [expandedConvId, setExpandedConvId] = useState<number | null>(null);
  const [privacyConsent, setPrivacyConsent] = useState<boolean | null>(null);
  const [consentLoading, setConsentLoading] = useState(true);

  // AI Settings state
  const [aiSalesPersonality, setAiSalesPersonality] = useState("");
  const [aiTone, setAiTone] = useState("professional");
  const [aiResponseLength, setAiResponseLength] = useState("short");
  const [aiGreetingTemplate, setAiGreetingTemplate] = useState("");
  const [aiAlwaysInclude, setAiAlwaysInclude] = useState("");
  const [aiNeverSay, setAiNeverSay] = useState("");
  const [aiObjectionHandling, setAiObjectionHandling] = useState<Array<{ key: string; value: string }>>([]);
  const [aiBusinessHours, setAiBusinessHours] = useState("");
  const [aiEscalationRules, setAiEscalationRules] = useState("");
  const [aiCustomCtas, setAiCustomCtas] = useState("");
  const [aiSampleConversations, setAiSampleConversations] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false);
  const [aiSettingsSaving, setAiSettingsSaving] = useState(false);
  const [aiTestMessage, setAiTestMessage] = useState("");
  const [aiTestResponse, setAiTestResponse] = useState("");
  const [aiTestLoading, setAiTestLoading] = useState(false);
  const [aiCollapsed, setAiCollapsed] = useState<Record<string, boolean>>({});

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

  const toggleAiAutoReply = async (newEnabled: boolean) => {
    setAiAutoReplyEnabled(newEnabled);
    await sendMessage({ type: "AI_AUTO_REPLY_TOGGLE", payload: { enabled: newEnabled } });
    addToast("info", newEnabled ? "AI Auto-Reply enabled" : "AI Auto-Reply disabled");
  };

  const loadChatLogs = useCallback(async () => {
    setChatLogsLoading(true);
    try {
      const res = await sendMessage<{ ok: boolean; data?: any[]; error?: string }>({
        type: "CHAT_LOGS_GET",
      });
      if (res?.ok && res.data) {
        setChatLogs(res.data);
      }
    } catch (err) {
      console.error("Failed to load chat logs:", err);
    } finally {
      setChatLogsLoading(false);
    }
  }, []);

  const loadAiSettings = useCallback(async () => {
    setAiSettingsLoading(true);
    try {
      const res = await sendMessage<{ ok: boolean; data?: any; error?: string }>({ type: "AI_SETTINGS_GET" });
      if (res?.ok && res.data) {
        const d = res.data;
        setAiSalesPersonality(d.salesPersonality || "");
        setAiTone(d.tone || "professional");
        setAiResponseLength(d.responseLength || "short");
        setAiGreetingTemplate(d.greetingTemplate || "");
        setAiAlwaysInclude(d.alwaysInclude || "");
        setAiNeverSay(d.neverSay || "");
        setAiBusinessHours(d.businessHours || "");
        setAiEscalationRules(d.escalationRules || "");
        setAiCustomCtas(d.customCtas || "");
        setAiSampleConversations(d.sampleConversations || "");
        setAiEnabled(d.enabled ?? true);
        // Parse objection handling
        if (d.objectionHandling && typeof d.objectionHandling === 'object') {
          setAiObjectionHandling(
            Object.entries(d.objectionHandling).map(([key, value]) => ({ key, value: String(value) }))
          );
        } else {
          setAiObjectionHandling([]);
        }
      }
    } catch (err) {
      console.error("Failed to load AI settings:", err);
    } finally {
      setAiSettingsLoading(false);
    }
  }, []);

  const saveAiSettings = async () => {
    setAiSettingsSaving(true);
    try {
      const objectionObj: Record<string, string> = {};
      aiObjectionHandling.forEach(({ key, value }) => {
        if (key.trim()) objectionObj[key.trim()] = value;
      });

      const res = await sendMessage<{ ok: boolean; error?: string }>({
        type: "AI_SETTINGS_SAVE",
        payload: {
          salesPersonality: aiSalesPersonality || null,
          greetingTemplate: aiGreetingTemplate || null,
          tone: aiTone,
          responseLength: aiResponseLength,
          alwaysInclude: aiAlwaysInclude || null,
          neverSay: aiNeverSay || null,
          objectionHandling: Object.keys(objectionObj).length > 0 ? objectionObj : null,
          businessHours: aiBusinessHours || null,
          escalationRules: aiEscalationRules || null,
          customCtas: aiCustomCtas || null,
          sampleConversations: aiSampleConversations || null,
          enabled: aiEnabled,
        },
      });
      if (res?.ok) {
        addToast("success", "AI settings saved!");
      } else {
        addToast("error", res?.error || "Failed to save AI settings");
      }
    } catch (err) {
      addToast("error", "Failed to save AI settings");
    } finally {
      setAiSettingsSaving(false);
    }
  };

  const testAiResponse = async () => {
    if (!aiTestMessage.trim()) return;
    setAiTestLoading(true);
    setAiTestResponse("");
    try {
      const res = await sendMessage<{ ok: boolean; reply?: string; error?: string }>({
        type: "AI_SETTINGS_TEST",
        payload: { customerMessage: aiTestMessage.trim() },
      });
      if (res?.ok && res.reply) {
        setAiTestResponse(res.reply);
      } else {
        setAiTestResponse(`Error: ${res?.error || "Failed to get response"}`);
      }
    } catch (err) {
      setAiTestResponse("Error: Failed to test AI response");
    } finally {
      setAiTestLoading(false);
    }
  };

  const toggleAiSection = (section: string) => {
    setAiCollapsed(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    if (auth) {
      fetchInventory();
      fetchTemplates();
      fetchLimits();
      // Load auto-reply status
      sendMessage<{ ok: boolean; enabled?: boolean }>({ type: "AI_AUTO_REPLY_STATUS" }).then(res => {
        if (res?.ok) setAiAutoReplyEnabled(res.enabled || false);
      });
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
      odometer: selectedVehicle.odometer ? String(Math.max(selectedVehicle.odometer, 300)) : "",
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
        <button
          className={`tab ${tab === "chat-logs" ? "active" : ""}`}
          onClick={() => { setTab("chat-logs"); loadChatLogs(); }}
          data-testid="tab-chat-logs"
        >
          💬 Chat Logs
        </button>
        <button
          className={`tab tab-ai ${aiAutoReplyEnabled ? "ai-active" : ""}`}
          onClick={() => toggleAiAutoReply(!aiAutoReplyEnabled)}
          data-testid="toggle-ai-auto-reply"
        >
          🤖 AI Bot {aiAutoReplyEnabled ? "ON" : "OFF"}
        </button>
        <button
          className={`tab ${tab === "ai-settings" ? "active" : ""}`}
          onClick={() => { setTab("ai-settings"); loadAiSettings(); }}
          data-testid="tab-ai-settings"
        >
          ⚙️ AI Train
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
                    {v.images[0] && <img src={v.images[0].startsWith("/") ? `${serverUrl}${v.images[0]}` : v.images[0]} alt="" className="vehicle-image" />}
                    <div className="vehicle-item-content">
                      <div className="vehicle-title">
                        {v.year} {v.make} {v.model} {v.trim || ""}
                        {posted && <span className="posted-badge">Posted</span>}
                      </div>
                      <div className="vehicle-meta">
                        <span>{v.price ? `$${v.price.toLocaleString()}` : "No price"}</span>
                        {v.odometer && <span>· {v.odometer.toLocaleString()} km</span>}
                        {v.stockNumber && <span>· #{v.stockNumber}</span>}
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

      {tab === "chat-logs" && (
        <div className="section" style={{ padding: "8px" }}>
          {chatLogsLoading ? (
            <div style={{ textAlign: "center", padding: "20px" }}><Spinner dark /></div>
          ) : chatLogs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "20px", color: "#888" }}>No AI conversations yet</div>
          ) : (
            <div style={{ maxHeight: "400px", overflowY: "auto" }}>
              {chatLogs.map((conv: any) => (
                <div key={conv.id} style={{ border: "1px solid #e0e0e0", borderRadius: "6px", marginBottom: "6px", fontSize: "12px" }}>
                  <div
                    onClick={() => setExpandedConvId(expandedConvId === conv.id ? null : conv.id)}
                    style={{ padding: "8px", cursor: "pointer", background: expandedConvId === conv.id ? "#f0f7ff" : "#fff", borderRadius: "6px" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>{conv.participantName || "Unknown"}</strong>
                      <span style={{ color: "#888", fontSize: "10px" }}>
                        {conv.messageCount} msgs{conv.aiMessageCount > 0 ? ` (${conv.aiMessageCount} AI)` : ""}
                      </span>
                    </div>
                    {conv.vehicleOfInterest && (
                      <div style={{ color: "#0066cc", fontSize: "11px" }}>🚗 {conv.vehicleOfInterest}</div>
                    )}
                    <div style={{ color: "#666", fontSize: "11px", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {conv.lastMessage || "No messages"}
                    </div>
                    {conv.lastMessageAt && (
                      <div style={{ color: "#999", fontSize: "10px", marginTop: "2px" }}>
                        {new Date(conv.lastMessageAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  {expandedConvId === conv.id && conv.messages && (
                    <div style={{ borderTop: "1px solid #e0e0e0", maxHeight: "250px", overflowY: "auto", padding: "6px" }}>
                      {conv.messages.map((msg: any) => (
                        <div
                          key={msg.id}
                          style={{
                            padding: "4px 8px",
                            margin: "3px 0",
                            borderRadius: "8px",
                            background: msg.isFromCustomer ? "#f0f0f0" : (msg.aiGenerated ? "#e8f5e9" : "#e3f2fd"),
                            marginLeft: msg.isFromCustomer ? "0" : "20px",
                            marginRight: msg.isFromCustomer ? "20px" : "0",
                            fontSize: "11px",
                          }}
                        >
                          <div style={{ fontWeight: "bold", fontSize: "10px", color: "#555" }}>
                            {msg.isFromCustomer ? "👤 Customer" : (msg.aiGenerated ? "🤖 AI" : "👨‍💼 Agent")}
                            <span style={{ fontWeight: "normal", marginLeft: "6px", color: "#999" }}>
                              {new Date(msg.sentAt).toLocaleTimeString()}
                            </span>
                          </div>
                          <div>{msg.content}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "ai-settings" && (
        <div className="ai-settings-panel">
          {aiSettingsLoading ? (
            <div style={{ textAlign: "center", padding: "20px" }}><Spinner /></div>
          ) : (
            <>
              <div className="ai-settings-header">
                <label className="checkbox-label" style={{ marginBottom: "8px" }}>
                  <input type="checkbox" checked={aiEnabled} onChange={(e) => setAiEnabled(e.target.checked)} />
                  <span>AI Bot Enabled</span>
                </label>
              </div>

              {/* Sales Personality */}
              <div className="ai-section">
                <div className="ai-section-header" onClick={() => toggleAiSection("personality")}>
                  <span>🎭 Sales Personality</span>
                  <span>{aiCollapsed.personality ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.personality && (
                  <div className="ai-section-body">
                    <textarea
                      placeholder="Describe your sales style... e.g. 'I'm friendly and casual, I always use the customer's name, I focus on value not price'"
                      value={aiSalesPersonality}
                      onChange={(e) => setAiSalesPersonality(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
              </div>

              {/* Tone & Length */}
              <div className="ai-section">
                <div className="ai-section-header" onClick={() => toggleAiSection("tone")}>
                  <span>🎯 Tone & Response Length</span>
                  <span>{aiCollapsed.tone ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.tone && (
                  <div className="ai-section-body">
                    <label>Tone</label>
                    <select value={aiTone} onChange={(e) => setAiTone(e.target.value)}>
                      <option value="professional">Professional</option>
                      <option value="friendly">Friendly</option>
                      <option value="casual">Casual</option>
                      <option value="luxury">Luxury</option>
                    </select>
                    <label style={{ marginTop: "8px" }}>Response Length</label>
                    <select value={aiResponseLength} onChange={(e) => setAiResponseLength(e.target.value)}>
                      <option value="short">Short (2-3 sentences)</option>
                      <option value="medium">Medium (3-5 sentences)</option>
                      <option value="long">Long (5-8 sentences)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Custom Greeting */}
              <div className="ai-section">
                <div className="ai-section-header" onClick={() => toggleAiSection("greeting")}>
                  <span>👋 Custom Greeting</span>
                  <span>{aiCollapsed.greeting ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.greeting && (
                  <div className="ai-section-body">
                    <textarea
                      placeholder="Custom first-message greeting... e.g. 'Hey {name}! Thanks for checking out the {vehicle}. Great choice!'"
                      value={aiGreetingTemplate}
                      onChange={(e) => setAiGreetingTemplate(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </div>

              {/* Always Mention */}
              <div className="ai-section">
                <div className="ai-section-header" onClick={() => toggleAiSection("always")}>
                  <span>✅ Always Mention</span>
                  <span>{aiCollapsed.always ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.always && (
                  <div className="ai-section-body">
                    <textarea
                      placeholder="Things to always mention... e.g. 'free CarProof with every vehicle, we finance everyone, family owned since 1985'"
                      value={aiAlwaysInclude}
                      onChange={(e) => setAiAlwaysInclude(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </div>

              {/* Never Say */}
              <div className="ai-section">
                <div className="ai-section-header" onClick={() => toggleAiSection("never")}>
                  <span>🚫 Never Say</span>
                  <span>{aiCollapsed.never ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.never && (
                  <div className="ai-section-body">
                    <textarea
                      placeholder="Things to never say... e.g. 'don't mention competitors, never offer discounts, don't discuss recalls'"
                      value={aiNeverSay}
                      onChange={(e) => setAiNeverSay(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </div>

              {/* Objection Handling */}
              <div className="ai-section">
                <div className="ai-section-header" onClick={() => toggleAiSection("objections")}>
                  <span>💬 Objection Handling ({aiObjectionHandling.length})</span>
                  <span>{aiCollapsed.objections ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.objections && (
                  <div className="ai-section-body">
                    {aiObjectionHandling.map((pair, i) => (
                      <div key={i} className="objection-pair">
                        <input
                          type="text"
                          placeholder="Objection (e.g. 'too expensive')"
                          value={pair.key}
                          onChange={(e) => {
                            const updated = [...aiObjectionHandling];
                            updated[i] = { ...updated[i], key: e.target.value };
                            setAiObjectionHandling(updated);
                          }}
                        />
                        <textarea
                          placeholder="Response..."
                          value={pair.value}
                          onChange={(e) => {
                            const updated = [...aiObjectionHandling];
                            updated[i] = { ...updated[i], value: e.target.value };
                            setAiObjectionHandling(updated);
                          }}
                          rows={2}
                        />
                        <button
                          className="btn-link"
                          style={{ color: "#dc2626", fontSize: "12px" }}
                          onClick={() => setAiObjectionHandling(aiObjectionHandling.filter((_, j) => j !== i))}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <button
                      className="btn-secondary"
                      style={{ fontSize: "12px", marginTop: "4px" }}
                      onClick={() => setAiObjectionHandling([...aiObjectionHandling, { key: "", value: "" }])}
                    >
                      + Add Objection
                    </button>
                  </div>
                )}
              </div>

              {/* Business Hours */}
              <div className="ai-section">
                <div className="ai-section-header" onClick={() => toggleAiSection("hours")}>
                  <span>🕐 Business Hours</span>
                  <span>{aiCollapsed.hours ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.hours && (
                  <div className="ai-section-body">
                    <input
                      type="text"
                      placeholder="e.g. Mon-Fri 9am-6pm, Sat 10am-4pm, Sun closed"
                      value={aiBusinessHours}
                      onChange={(e) => setAiBusinessHours(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Escalation Rules */}
              <div className="ai-section">
                <div className="ai-section-header" onClick={() => toggleAiSection("escalation")}>
                  <span>🔀 Escalation Rules</span>
                  <span>{aiCollapsed.escalation ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.escalation && (
                  <div className="ai-section-body">
                    <textarea
                      placeholder="When should the AI hand off to a human? e.g. 'When customer mentions trade-in value, financing issues, or asks for manager'"
                      value={aiEscalationRules}
                      onChange={(e) => setAiEscalationRules(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </div>

              {/* Custom CTAs */}
              <div className="ai-section">
                <div className="ai-section-header" onClick={() => toggleAiSection("ctas")}>
                  <span>📣 Call-to-Action Phrases</span>
                  <span>{aiCollapsed.ctas ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.ctas && (
                  <div className="ai-section-body">
                    <textarea
                      placeholder="Custom CTAs... e.g. 'Book a VIP test drive, Come see it today — we're open until 8pm!, Text us anytime at 604-555-1234'"
                      value={aiCustomCtas}
                      onChange={(e) => setAiCustomCtas(e.target.value)}
                      rows={2}
                    />
                  </div>
                )}
              </div>

              {/* Sample Conversations */}
              <div className="ai-section">
                <div className="ai-section-header" onClick={() => toggleAiSection("samples")}>
                  <span>📝 Sample Conversations</span>
                  <span>{aiCollapsed.samples ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.samples && (
                  <div className="ai-section-body">
                    <textarea
                      placeholder="Paste example conversations showing your ideal sales style..."
                      value={aiSampleConversations}
                      onChange={(e) => setAiSampleConversations(e.target.value)}
                      rows={4}
                    />
                  </div>
                )}
              </div>

              {/* Save Button */}
              <button
                className="btn-primary"
                onClick={saveAiSettings}
                disabled={aiSettingsSaving}
                style={{ marginTop: "8px" }}
              >
                {aiSettingsSaving ? <><Spinner /> Saving...</> : "💾 Save AI Settings"}
              </button>

              {/* Test Chat */}
              <div className="ai-section" style={{ marginTop: "12px" }}>
                <div className="ai-section-header" onClick={() => toggleAiSection("test")}>
                  <span>🧪 Test Chat</span>
                  <span>{aiCollapsed.test ? "▸" : "▾"}</span>
                </div>
                {!aiCollapsed.test && (
                  <div className="ai-section-body">
                    <p style={{ fontSize: "11px", color: "#6b7280", margin: "0 0 6px" }}>
                      Save settings first, then test how the AI responds.
                    </p>
                    <div className="search-row">
                      <input
                        type="text"
                        placeholder="Type a test buyer message..."
                        value={aiTestMessage}
                        onChange={(e) => setAiTestMessage(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && testAiResponse()}
                      />
                      <button
                        className="btn-secondary"
                        onClick={testAiResponse}
                        disabled={aiTestLoading || !aiTestMessage.trim()}
                      >
                        {aiTestLoading ? <Spinner dark /> : "Test"}
                      </button>
                    </div>
                    {aiTestResponse && (
                      <div className="ai-test-response">
                        <strong>AI Response:</strong>
                        <p>{aiTestResponse}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<Popup />);
}
