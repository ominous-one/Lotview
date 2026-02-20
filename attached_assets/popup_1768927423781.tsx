import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ExtensionAuthState, VehicleSummary, Template, Platform } from "./types";

function Popup() {
  const [auth, setAuth] = useState<ExtensionAuthState | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [query, setQuery] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tplName, setTplName] = useState("");
  const [tplTitle, setTplTitle] = useState("{year} {make} {model} - ${price}");
  const [tplDescription, setTplDescription] = useState(
    "Check out this {year} {make} {model} {trim}! {odometer} on the clock, {fuel} / {transmission} / {drivetrain}. Priced at {price}. Call today."
  );
  const [tplShared, setTplShared] = useState(false);

  useEffect(() => {
    chrome.storage.sync.get(["auth"], (data) => {
      if (data.auth) setAuth(data.auth);
    });
  }, []);

  const login = async () => {
    setLoading(true);
    setError(null);
    chrome.runtime.sendMessage(
      { type: "EXT_LOGIN", payload: { email, password } },
      (res) => {
        setLoading(false);
        if (!res?.ok) {
          setError(res?.error || "Login failed");
        } else {
          setAuth(res.auth);
        }
      }
    );
  };

  const fetchInventory = () => {
    setLoading(true);
    setError(null);
    chrome.runtime.sendMessage(
      { type: "FETCH_INVENTORY", payload: { query } },
      (res) => {
        setLoading(false);
        if (!res?.ok) {
          setError(res?.error || "Failed to load vehicles");
        } else {
          setVehicles(res.vehicles || []);
        }
      }
    );
  };

  const fetchTemplates = () => {
    chrome.runtime.sendMessage({ type: "FETCH_TEMPLATES" }, (res) => {
      if (!res?.ok) {
        setError(res?.error || "Failed to load templates");
      } else {
        setTemplates(res.templates || []);
      }
    });
  };

  const saveTemplate = () => {
    setError(null);
    chrome.runtime.sendMessage(
      {
        type: "SAVE_TEMPLATE",
        payload: {
          templateName: tplName || `Template ${templates.length + 1}`,
          titleTemplate: tplTitle,
          descriptionTemplate: tplDescription,
          isShared: tplShared,
        },
      },
      (res) => {
        if (!res?.ok) {
          setError(res?.error || "Failed to save template");
        } else {
          fetchTemplates();
        }
      }
    );
  };

  useEffect(() => {
    if (auth) {
      fetchInventory();
      fetchTemplates();
    }
  }, [auth]);

  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const fillListing = async () => {
    if (!selectedVehicle) {
      setError("Pick a vehicle first");
      return;
    }
    setError(null);
    // Construct job payload for content script
    const formData: Record<string, any> = {
      title: selectedTemplate?.titleTemplate
        ? selectedTemplate.titleTemplate
            .replace("{year}", String(selectedVehicle.year || ""))
            .replace("{make}", selectedVehicle.make || "")
            .replace("{model}", selectedVehicle.model || "")
            .replace("{price}", selectedVehicle.price ? `$${selectedVehicle.price}` : "")
      : `${selectedVehicle.year || ""} ${selectedVehicle.make || ""} ${selectedVehicle.model || ""}`.trim(),
      price: selectedVehicle.price || "",
      description: selectedTemplate?.descriptionTemplate
        ? selectedTemplate.descriptionTemplate
            .replace("{year}", String(selectedVehicle.year || ""))
            .replace("{make}", selectedVehicle.make || "")
            .replace("{model}", selectedVehicle.model || "")
            .replace("{trim}", selectedVehicle.trim || "")
            .replace("{odometer}", selectedVehicle.odometer ? `${selectedVehicle.odometer} km` : "")
            .replace("{fuel}", selectedVehicle.fuelType || "")
            .replace("{transmission}", selectedVehicle.transmission || "")
            .replace("{drivetrain}", selectedVehicle.drivetrain || "")
            .replace("{price}", selectedVehicle.price ? `$${selectedVehicle.price}` : "")
      : selectedVehicle.description || "",
      location: selectedVehicle.location || "",
    };

    chrome.runtime.sendMessage(
      {
        type: "FILL_CONTENT",
        payload: {
          platform,
          vehicleId: selectedVehicle.id,
          formData,
          imageUrls: selectedVehicle.images.slice(0, 10),
          templateId: selectedTemplate?.id,
        },
      },
      (res) => {
        if (!res?.ok) {
          setError(res?.error || "Fill failed");
        }
      }
    );
  };

  if (!auth) {
    return (
      <div className="p-4 w-[360px]">
        <h2 className="text-lg font-semibold mb-2">Lotview Auto Poster</h2>
        <p className="text-sm text-gray-600 mb-3">Log in with your Lotview account.</p>
        <input
          className="w-full border rounded px-2 py-1 mb-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full border rounded px-2 py-1 mb-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="w-full bg-blue-600 text-white rounded py-2 text-sm"
          disabled={loading}
          onClick={login}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </div>
    );
  }

  return (
    <div className="p-4 w-[400px] space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-sm">Logged in as</h3>
          <p className="text-xs text-gray-600">
            {auth.email} · Dealer #{auth.dealershipId}
          </p>
        </div>
        <button
          className="text-xs text-blue-600 underline"
          onClick={() => chrome.runtime.sendMessage({ type: "EXT_LOGOUT" }, () => setAuth(null))}
        >
          Logout
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-700">Search inventory</label>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded px-2 py-1 text-sm"
            placeholder="VIN, stock, make/model..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            className="px-3 py-1 bg-gray-100 rounded text-xs"
            onClick={fetchInventory}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="border rounded p-2 max-h-48 overflow-y-auto space-y-1">
        {vehicles.map((v) => (
          <button
            key={v.id}
            className={`w-full text-left text-sm px-2 py-1 rounded ${
              selectedVehicleId === v.id ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50"
            }`}
            onClick={() => setSelectedVehicleId(v.id)}
          >
            <div className="font-medium">
              {v.year} {v.make} {v.model} {v.trim || ""}
            </div>
            <div className="text-xs text-gray-600">
              {v.stockNumber || v.vin || "No ID"} · {v.price ? `$${v.price}` : "No price"}
            </div>
          </button>
        ))}
        {vehicles.length === 0 && <p className="text-xs text-gray-500">No vehicles found.</p>}
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-700">Platform</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform)}
        >
          <option value="facebook">Facebook Marketplace</option>
          <option value="craigslist">Craigslist (coming soon)</option>
          <option value="kijiji">Kijiji (coming soon)</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-700">Template</label>
        <select
          className="w-full border rounded px-2 py-1 text-sm"
          value={selectedTemplateId ?? ""}
          onChange={(e) => setSelectedTemplateId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Default</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.templateName}
            </option>
          ))}
        </select>
      </div>

      <button
        className="w-full bg-blue-600 text-white rounded py-2 text-sm"
        onClick={fillListing}
        disabled={loading || !selectedVehicleId}
      >
        {loading ? "Working..." : "Auto-fill listing"}
      </button>

      <div className="border-t pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-sm">Templates</h4>
          <button
            className="text-xs text-blue-600 underline"
            onClick={saveTemplate}
            disabled={!tplTitle || !tplDescription}
          >
            Save Template
          </button>
        </div>
        <input
          className="w-full border rounded px-2 py-1 text-sm"
          placeholder="Template name"
          value={tplName}
          onChange={(e) => setTplName(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-2 py-1 text-sm"
          rows={2}
          placeholder="{year} {make} {model} - ${price}"
          value={tplTitle}
          onChange={(e) => setTplTitle(e.target.value)}
        />
        <textarea
          className="w-full border rounded px-2 py-1 text-sm"
          rows={4}
          placeholder="Description template"
          value={tplDescription}
          onChange={(e) => setTplDescription(e.target.value)}
        />
        <label className="text-xs flex items-center gap-1">
          <input
            type="checkbox"
            checked={tplShared}
            onChange={(e) => setTplShared(e.target.checked)}
          />
          Shared template (manager/admin only)
        </label>
      </div>

      {error && <p className="text-red-600 text-xs">{error}</p>}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Popup />);
