/**
 * Super Admin Section.
 *
 * Three sub-tabs visible only to authenticated super_admin users:
 *   - Dealerships: list + create form
 *   - Scrape Sources: list + create + Run Now
 *   - VIN Test: single-input decoder (proves the free-tier trim extractor)
 *
 * Every form posts via the shared `api.ts` helpers so auth tokens and the
 * X-Dealership-Id header behavior remain consistent with the rest of the
 * app. Errors are surfaced inline rather than alerts.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Gauge,
  PlayCircle,
  Plus,
  RefreshCw,
  ScanLine,
  ShieldCheck,
} from "lucide-react";
import {
  createDealership,
  createScrapeSource,
  decodeVin,
  listDealerships,
  listScrapeSources,
  triggerScrape,
  type DealershipSummary,
  type ScrapeSourceSummary,
  type VinDecodeResult,
} from "./api";

type AdminTab = "dealerships" | "sources" | "vin";

export function AdminSection() {
  const [tab, setTab] = useState<AdminTab>("dealerships");

  return (
    <section className="workspace-panel" aria-labelledby="admin-heading">
      <div className="panel-heading">
        <div>
          <h2 id="admin-heading">Super Admin</h2>
          <p>Tenant lifecycle, scraping, and diagnostics</p>
        </div>
        <div className="topbar-actions" style={{ gap: 8 }}>
          <button
            className={tab === "dealerships" ? "primary-action" : "secondary-action"}
            type="button"
            onClick={() => setTab("dealerships")}
          >
            <Building2 size={17} /> Dealerships
          </button>
          <button
            className={tab === "sources" ? "primary-action" : "secondary-action"}
            type="button"
            onClick={() => setTab("sources")}
          >
            <Gauge size={17} /> Scrape Sources
          </button>
          <button
            className={tab === "vin" ? "primary-action" : "secondary-action"}
            type="button"
            onClick={() => setTab("vin")}
          >
            <ScanLine size={17} /> VIN Test
          </button>
        </div>
      </div>

      {tab === "dealerships" ? <DealershipsTab /> : null}
      {tab === "sources" ? <ScrapeSourcesTab /> : null}
      {tab === "vin" ? <VinTesterTab /> : null}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Dealerships
// ---------------------------------------------------------------------------

function DealershipsTab() {
  const [rows, setRows] = useState<DealershipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const list = await listDealerships();
      setRows(list);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load dealerships");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="admin-panel">
      <CreateDealershipForm onCreated={() => void refresh()} />

      <div className="panel-heading" style={{ marginTop: 20 }}>
        <div>
          <h3 style={{ margin: 0 }}>Tenants ({rows.length})</h3>
          <p style={{ margin: 0 }}>Every dealership the platform serves</p>
        </div>
        <button className="secondary-action" type="button" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw size={17} /> {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="system-banner" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>
      ) : null}

      {loading ? (
        <p>Loading dealerships…</p>
      ) : rows.length === 0 ? (
        <p>No dealerships yet. Create one above to onboard the first dealer.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Subdomain</th>
              <th>Location</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.name}</td>
                <td>{row.subdomain ?? "—"}</td>
                <td>{[row.city, row.province].filter(Boolean).join(", ") || "—"}</td>
                <td>{row.isActive ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CreateDealershipForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("Olympic Hyundai");
  const [slug, setSlug] = useState("olympic-hyundai");
  const [subdomain, setSubdomain] = useState("olympic");
  const [masterAdminEmail, setMasterAdminEmail] = useState("");
  const [masterAdminName, setMasterAdminName] = useState("");
  const [masterAdminPassword, setMasterAdminPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const dealership = await createDealership({
        name: name.trim(),
        slug: slug.trim(),
        subdomain: subdomain.trim(),
        masterAdminEmail: masterAdminEmail.trim(),
        masterAdminName: masterAdminName.trim() || "Owner",
        masterAdminPassword,
      });
      setSuccess(`Created dealership #${dealership.id}: ${dealership.name}`);
      setMasterAdminEmail("");
      setMasterAdminName("");
      setMasterAdminPassword("");
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <h3 style={{ margin: 0 }}>Create dealership</h3>
          <p style={{ margin: 0 }}>Spins up the tenant + a master user</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>Dealership name</span>
          <input type="text" value={name} onChange={(e) => setName(e.currentTarget.value)} required />
        </label>
        <label>
          <span>Slug</span>
          <input type="text" value={slug} onChange={(e) => setSlug(e.currentTarget.value)} required pattern="[a-z0-9-]+" />
        </label>
        <label>
          <span>Subdomain</span>
          <input type="text" value={subdomain} onChange={(e) => setSubdomain(e.currentTarget.value)} required pattern="[a-z0-9]+" />
        </label>
        <label>
          <span>Master admin email</span>
          <input type="email" value={masterAdminEmail} onChange={(e) => setMasterAdminEmail(e.currentTarget.value)} required />
        </label>
        <label>
          <span>Master admin name</span>
          <input type="text" value={masterAdminName} onChange={(e) => setMasterAdminName(e.currentTarget.value)} />
        </label>
        <label>
          <span>Master admin password (12+ chars)</span>
          <input type="password" value={masterAdminPassword} onChange={(e) => setMasterAdminPassword(e.currentTarget.value)} minLength={12} required />
        </label>
      </div>
      {error ? (
        <div className="system-banner" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>
      ) : null}
      {success ? (
        <div className="system-banner success" role="status"><CheckCircle2 size={18} /><span>{success}</span></div>
      ) : null}
      <button className="primary-action" type="submit" disabled={submitting}>
        <Plus size={17} /> {submitting ? "Creating" : "Create dealership"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Scrape Sources
// ---------------------------------------------------------------------------

function ScrapeSourcesTab() {
  const [sources, setSources] = useState<ScrapeSourceSummary[]>([]);
  const [dealerships, setDealerships] = useState<DealershipSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [actionStatus, setActionStatus] = useState<{ sourceId: number; message: string; success: boolean } | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const [sourceList, dealerList] = await Promise.all([listScrapeSources(), listDealerships()]);
      setSources(sourceList);
      setDealerships(dealerList);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function dealershipLabel(id: number): string {
    const match = dealerships.find((d) => d.id === id);
    return match ? `${match.name} (#${id})` : `#${id}`;
  }

  async function handleRun(sourceId: number) {
    setActionStatus(null);
    try {
      const result = await triggerScrape(sourceId);
      setActionStatus({ sourceId, message: result.message, success: result.success });
    } catch (runError) {
      setActionStatus({
        sourceId,
        message: runError instanceof Error ? runError.message : "Trigger failed",
        success: false,
      });
    }
  }

  return (
    <div className="admin-panel">
      <CreateScrapeSourceForm dealerships={dealerships} onCreated={() => void refresh()} />

      <div className="panel-heading" style={{ marginTop: 20 }}>
        <div>
          <h3 style={{ margin: 0 }}>Sources ({sources.length})</h3>
          <p style={{ margin: 0 }}>Every registered scrape source</p>
        </div>
        <button className="secondary-action" type="button" onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw size={17} /> {refreshing ? "Refreshing" : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="system-banner" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>
      ) : null}

      {loading ? (
        <p>Loading scrape sources…</p>
      ) : sources.length === 0 ? (
        <p>No scrape sources yet. Add one above to start scraping inventory.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Dealership</th>
              <th>Name</th>
              <th>URL</th>
              <th>Active</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((source) => (
              <tr key={source.id}>
                <td>{source.id}</td>
                <td>{dealershipLabel(source.dealershipId)}</td>
                <td>{source.sourceName}</td>
                <td><a href={source.sourceUrl} target="_blank" rel="noreferrer">{source.sourceUrl}</a></td>
                <td>{source.isActive ? "Yes" : "No"}</td>
                <td>
                  <button className="secondary-action" type="button" onClick={() => void handleRun(source.id)}>
                    <PlayCircle size={17} /> Run Now
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {actionStatus ? (
        <div className={`system-banner ${actionStatus.success ? "success" : ""}`} role="status">
          {actionStatus.success ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>Source #{actionStatus.sourceId}: {actionStatus.message}</span>
        </div>
      ) : null}
    </div>
  );
}

function CreateScrapeSourceForm({
  dealerships,
  onCreated,
}: {
  dealerships: DealershipSummary[];
  onCreated: () => void;
}) {
  const [dealershipId, setDealershipId] = useState<string>("");
  const [sourceName, setSourceName] = useState("Olympic Hyundai Used");
  const [sourceUrl, setSourceUrl] = useState("https://olympichyundaivancouver.com/vehicles/?sale_class=used");
  const [scrapeFrequency, setScrapeFrequency] = useState("daily");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!dealershipId && dealerships.length > 0) {
      setDealershipId(String(dealerships[0].id));
    }
  }, [dealerships, dealershipId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const created = await createScrapeSource({
        dealershipId: Number(dealershipId),
        sourceName: sourceName.trim(),
        sourceUrl: sourceUrl.trim(),
        sourceType: "dealer_website",
        scrapeFrequency,
      });
      setSuccess(`Created source #${created.id}: ${created.sourceName}`);
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-form" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <h3 style={{ margin: 0 }}>Add scrape source</h3>
          <p style={{ margin: 0 }}>Register a URL the scraper should pull inventory from</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>Dealership</span>
          <select value={dealershipId} onChange={(e) => setDealershipId(e.currentTarget.value)} required>
            <option value="">— Pick a dealership —</option>
            {dealerships.map((d) => (
              <option key={d.id} value={d.id}>{d.name} (#{d.id})</option>
            ))}
          </select>
        </label>
        <label>
          <span>Source name</span>
          <input type="text" value={sourceName} onChange={(e) => setSourceName(e.currentTarget.value)} required />
        </label>
        <label className="form-grid-wide">
          <span>Source URL</span>
          <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.currentTarget.value)} required />
        </label>
        <label>
          <span>Scrape frequency</span>
          <select value={scrapeFrequency} onChange={(e) => setScrapeFrequency(e.currentTarget.value)}>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </label>
      </div>
      {error ? (
        <div className="system-banner" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>
      ) : null}
      {success ? (
        <div className="system-banner success" role="status"><CheckCircle2 size={18} /><span>{success}</span></div>
      ) : null}
      <button className="primary-action" type="submit" disabled={submitting || dealerships.length === 0}>
        <Plus size={17} /> {submitting ? "Creating" : "Add source"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// VIN tester
// ---------------------------------------------------------------------------

function VinTesterTab() {
  const [vin, setVin] = useState("5XYZUDLA8PG123456");
  const [result, setResult] = useState<VinDecodeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const decoded = await decodeVin(vin.trim().toUpperCase(), null);
      setResult(decoded);
    } catch (decodeError) {
      setError(decodeError instanceof Error ? decodeError.message : "VIN decode failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-panel" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <h3 style={{ margin: 0 }}>VIN decoder</h3>
          <p style={{ margin: 0 }}>Proves year, make, model, and trim flow through the free-tier pipeline</p>
        </div>
      </div>
      <div className="form-grid">
        <label className="form-grid-wide">
          <span>VIN</span>
          <input type="text" value={vin} onChange={(e) => setVin(e.currentTarget.value)} required maxLength={17} minLength={17} />
        </label>
      </div>
      {error ? (
        <div className="system-banner" role="alert"><AlertTriangle size={18} /><span>{error}</span></div>
      ) : null}
      <button className="primary-action" type="submit" disabled={submitting}>
        <ScanLine size={17} /> {submitting ? "Decoding" : "Decode VIN"}
      </button>

      {result ? (
        <section style={{ marginTop: 16 }} aria-label="Decoded VIN">
          {result.errorCode ? (
            <div className="system-banner" role="alert">
              <AlertTriangle size={18} />
              <span>{result.errorMessage ?? result.errorCode}</span>
            </div>
          ) : (
            <div className="system-banner success" role="status">
              <ShieldCheck size={18} />
              <span>
                Decoded via {result.source ?? "unknown"} in {result.responseTimeMs ?? "?"}ms — confidence: {result.confidence ?? "n/a"}
              </span>
            </div>
          )}
          <table className="admin-table">
            <tbody>
              <tr><th>VIN</th><td>{result.vin}</td></tr>
              <tr><th>Year</th><td>{result.year ?? "—"}</td></tr>
              <tr><th>Make</th><td>{result.make ?? "—"}</td></tr>
              <tr><th>Model</th><td>{result.model ?? "—"}</td></tr>
              <tr>
                <th>Trim</th>
                <td>
                  {result.trim ?? "—"}
                  {result.trim ? null : <span style={{ marginLeft: 8, color: "#9a6900" }}> (NHTSA returned no trim for this VIN; paid sources required for 100% coverage)</span>}
                </td>
              </tr>
              <tr><th>Body</th><td>{result.bodyClass ?? "—"}</td></tr>
              <tr><th>Fuel</th><td>{result.fuelType ?? "—"}</td></tr>
              <tr><th>Drive</th><td>{result.driveType ?? "—"}</td></tr>
              <tr><th>Transmission</th><td>{result.transmission ?? "—"}</td></tr>
              <tr><th>Manufacturer</th><td>{result.manufacturer ?? "—"}</td></tr>
            </tbody>
          </table>
          {result.warnings.length > 0 ? (
            <ul style={{ marginTop: 12 }}>
              {result.warnings.map((warning, idx) => (
                <li key={idx} style={{ color: "#9a6900" }}>{warning}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}
