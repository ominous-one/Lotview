import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BarChart3,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Gauge,
  Inbox,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import {
  getActiveDealershipContext,
  loadOperationsSnapshot,
  loginWithCredentials,
  logoutCurrentSession,
  setActiveDealershipContext,
  type InventoryRow,
  type OperationsSnapshot,
} from "./api";
import { MarketingHome } from "./marketing";
import { shouldRenderMarketingSite } from "./routing";
import "./styles.css";

type QueueTab = "inventory" | "leads" | "scrape";

const statusLabels: Record<InventoryRow["status"], string> = {
  active: "Active",
  pending_review: "Review",
  blocked: "Blocked",
};

const initialSnapshot: OperationsSnapshot = {
  backendStatus: "blocked",
  authStatus: "unknown",
  healthStatus: "loading",
  readinessStatus: "loading",
  inventoryRows: [],
  inventoryTotal: null,
  blocker: null,
  user: null,
};

function StatusPill({ status }: { status: InventoryRow["status"] }) {
  return <span className={`status-pill status-${status}`}>{statusLabels[status]}</span>;
}

function isTenantSwitchingRole(role: string): boolean {
  const normalizedRole = role.trim().toLowerCase();
  return normalizedRole === "super_admin" || normalizedRole === "master" || normalizedRole === "admin";
}

function LoginPanel({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function submitLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    onLogin(email, password)
      .catch((loginError) => {
        setError(loginError instanceof Error ? loginError.message : "Login failed");
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <section className="login-panel" aria-labelledby="login-heading">
      <div className="login-heading">
        <ShieldCheck size={22} />
        <div>
          <h2 id="login-heading">Sign In</h2>
          <span>Sign in to Lotview operations.</span>
        </div>
      </div>
      <form className="login-form" onSubmit={submitLogin}>
        <label>
          <span>Email</span>
          <div className="input-wrap">
            <Mail size={17} />
            <input
              autoComplete="email"
              name="email"
              onChange={(event) => setEmail(event.currentTarget.value)}
              required
              type="email"
              value={email}
            />
          </div>
        </label>
        <label>
          <span>Password</span>
          <div className="input-wrap">
            <KeyRound size={17} />
            <input
              autoComplete="current-password"
              name="password"
              onChange={(event) => setPassword(event.currentTarget.value)}
              required
              type="password"
              value={password}
            />
          </div>
        </label>
        {error ? (
          <div className="login-error" role="alert">
            <AlertTriangle size={17} />
            <span>{error}</span>
          </div>
        ) : null}
        <button className="primary-action login-submit" type="submit" disabled={submitting}>
          <LogIn size={17} />
          {submitting ? "Signing In" : "Sign In"}
        </button>
      </form>
    </section>
  );
}

function ActiveDealershipPanel({
  snapshot,
  onSelect,
}: {
  snapshot: OperationsSnapshot;
  onSelect: (dealershipId: string) => Promise<void>;
}) {
  const activeDealershipId = snapshot.user?.activeDealershipId
    ? String(snapshot.user.activeDealershipId)
    : getActiveDealershipContext() ?? "1";
  const [dealershipId, setDealershipId] = useState(activeDealershipId);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDealershipId(activeDealershipId);
  }, [activeDealershipId]);

  function submitActiveDealership(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    onSelect(dealershipId)
      .catch((selectError) => {
        setError(selectError instanceof Error ? selectError.message : "Dealership context failed");
      })
      .finally(() => {
        setSubmitting(false);
      });
  }

  return (
    <section className="context-panel" aria-labelledby="context-heading">
      <div className="context-heading">
        <Building2 size={18} />
        <div>
          <h2 id="context-heading">Active Dealership View</h2>
          <span>{snapshot.user?.activeDealershipLabel ?? "Global super-admin account"}</span>
        </div>
      </div>
      <form className="context-form" onSubmit={submitActiveDealership}>
        <label>
          <span>Dealership ID</span>
          <div className="input-wrap">
            <Building2 size={17} />
            <input
              autoComplete="off"
              inputMode="numeric"
              name="activeDealershipId"
              onChange={(event) => setDealershipId(event.currentTarget.value)}
              pattern="[1-9][0-9]*"
              required
              type="text"
              value={dealershipId}
            />
          </div>
        </label>
        <button className="secondary-action" type="submit" disabled={submitting}>
          <Eye size={17} />
          {submitting ? "Opening" : "Open Dealership"}
        </button>
      </form>
      {error ? (
        <div className="login-error" role="alert">
          <AlertTriangle size={17} />
          <span>{error}</span>
        </div>
      ) : null}
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <section className="metric" aria-label={label}>
      <Icon size={18} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </section>
  );
}

function InventoryTable({ snapshot, loading }: { snapshot: OperationsSnapshot; loading: boolean }) {
  const liveInventoryAvailable = snapshot.backendStatus === "connected";
  const [selectedVin, setSelectedVin] = useState<string | null>(null);
  const selectedRow =
    snapshot.inventoryRows.find((row) => row.vin === selectedVin) ?? snapshot.inventoryRows[0] ?? null;

  return (
    <section className="workspace-panel" aria-labelledby="inventory-heading">
      <div className="panel-heading">
        <div>
          <h2 id="inventory-heading">Inventory Control</h2>
          <p>{liveInventoryAvailable ? "Live vehicles from Lotview API" : "Live inventory blocked"}</p>
        </div>
        <button className="primary-action" type="button" disabled={!liveInventoryAvailable}>
          <ClipboardCheck size={17} />
          Review Queue
        </button>
      </div>

      {loading ? (
        <div className="empty-state">
          <Gauge size={22} />
          <strong>Loading backend inventory</strong>
          <span>Waiting for Lotview health, readiness, and inventory APIs.</span>
        </div>
      ) : !liveInventoryAvailable ? (
        <div className="empty-state empty-state-blocked">
          <AlertTriangle size={22} />
          <strong>No live inventory is shown</strong>
          <span>{snapshot.blocker || "Backend inventory could not be verified."}</span>
        </div>
      ) : snapshot.inventoryRows.length === 0 ? (
        <div className="empty-state">
          <Truck size={22} />
          <strong>No active inventory returned</strong>
          <span>The API responded, but no vehicles were available for this tenant.</span>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stock</th>
                <th>Vehicle</th>
                <th>VIN</th>
                <th>Status</th>
                <th>Price</th>
                <th>Source</th>
                <th>Proof</th>
                <th>Inspect</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.inventoryRows.map((row) => (
                <tr key={`${row.stock}-${row.vin}`}>
                  <td>{row.stock}</td>
                  <td>{row.vehicle}</td>
                  <td className="mono">{row.vin}</td>
                  <td>
                    <StatusPill status={row.status} />
                  </td>
                  <td>{row.price}</td>
                  <td>{row.source}</td>
                  <td>{row.proof}</td>
                  <td>
                    <button
                      aria-label={`Inspect ${row.stock}`}
                      aria-pressed={selectedRow?.vin === row.vin}
                      className="secondary-action row-action"
                      type="button"
                      onClick={() => setSelectedVin(row.vin)}
                    >
                      <Eye size={16} />
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {selectedRow ? (
            <section className="vehicle-detail-band" aria-label="Selected vehicle proof">
              <div className="detail-heading">
                <div>
                  <h3>{selectedRow.vehicle}</h3>
                  <span className="mono">{selectedRow.vin}</span>
                </div>
                <StatusPill status={selectedRow.status} />
              </div>
              <div className="detail-grid">
                <div>
                  <span>Stock</span>
                  <strong>{selectedRow.stock}</strong>
                </div>
                <div>
                  <span>Price</span>
                  <strong>{selectedRow.price}</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>{selectedRow.source}</strong>
                </div>
                <div>
                  <span>Proof</span>
                  <strong>{selectedRow.proof}</strong>
                </div>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}

function LeadQueue() {
  return (
    <section className="workspace-panel" aria-labelledby="lead-heading">
      <div className="panel-heading">
        <div>
          <h2 id="lead-heading">Lead Inbox</h2>
          <p>CRM and AI lead workflows remain certification-blocked</p>
        </div>
        <button className="secondary-action" type="button" disabled>
          <Inbox size={17} />
          Open Inbox
        </button>
      </div>
      <div className="proof-stack" aria-label="Lead workflow blockers">
        <article>
          <AlertTriangle size={17} />
          <div>
            <strong>No live lead data is displayed</strong>
            <span>Route contracts, tenant isolation, and staging user-flow proof are still required.</span>
          </div>
        </article>
        <article>
          <AlertTriangle size={17} />
          <div>
            <strong>AI drafts remain review-only</strong>
            <span>Inventory grounding, finance guardrails, and escalation tests must pass before exposure.</span>
          </div>
        </article>
      </div>
    </section>
  );
}

function ScrapeRunPanel() {
  return (
    <section className="workspace-panel" aria-labelledby="scrape-heading">
      <div className="panel-heading">
        <div>
          <h2 id="scrape-heading">Scrape Run Review</h2>
          <p>Certification blockers for live scraper launch</p>
        </div>
        <button className="secondary-action" type="button" disabled>
          <BarChart3 size={17} />
          View Report
        </button>
      </div>
      <div className="run-grid">
        <div>
          <span>Vehicles extracted</span>
          <strong>Not certified</strong>
        </div>
        <div>
          <span>Stored</span>
          <strong>Blocked</strong>
        </div>
        <div>
          <span>Quarantine</span>
          <strong>Required</strong>
        </div>
        <div>
          <span>Source accuracy</span>
          <strong>Missing proof</strong>
        </div>
      </div>
      <ol className="proof-list" aria-label="Scrape proof blockers">
        <li>
          <AlertTriangle size={16} />
          Live pagination proof missing
        </li>
        <li>
          <AlertTriangle size={16} />
          Source-truth artifact missing
        </li>
        <li>
          <CheckCircle2 size={16} />
          Invalid VIN active-store guard tested
        </li>
      </ol>
    </section>
  );
}

function OperationsApp() {
  const [activeTab, setActiveTab] = useState<QueueTab>("inventory");
  const [snapshot, setSnapshot] = useState<OperationsSnapshot>(initialSnapshot);
  const [loading, setLoading] = useState(true);

  const refreshSnapshot = useCallback((ignoreUpdate?: () => boolean) => {
    setLoading(true);
    loadOperationsSnapshot()
      .then((nextSnapshot) => {
        if (!ignoreUpdate?.()) {
          setSnapshot(nextSnapshot);
        }
      })
      .catch((error) => {
        if (!ignoreUpdate?.()) {
          setSnapshot({
            ...initialSnapshot,
            blocker: error instanceof Error ? error.message : "Frontend data load failed",
          });
        }
      })
      .finally(() => {
        if (!ignoreUpdate?.()) {
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    let ignore = false;

    refreshSnapshot(() => ignore);

    return () => {
      ignore = true;
    };
  }, [refreshSnapshot]);

  async function handleLogin(email: string, password: string): Promise<void> {
    await loginWithCredentials({ email, password });
    refreshSnapshot();
  }

  async function handleActiveDealership(dealershipId: string): Promise<void> {
    setActiveDealershipContext(dealershipId);
    refreshSnapshot();
  }

  async function handleLogout(): Promise<void> {
    setLoading(true);
    await logoutCurrentSession();
    setActiveTab("inventory");
    setSnapshot({
      ...initialSnapshot,
      authStatus: "unauthenticated",
      blocker: "Signed out",
    });
    setLoading(false);
  }

  const activePanel = useMemo(() => {
    if (activeTab === "leads") return <LeadQueue />;
    if (activeTab === "scrape") return <ScrapeRunPanel />;
    return <InventoryTable snapshot={snapshot} loading={loading} />;
  }, [activeTab, loading, snapshot]);

  const inventoryValue =
    snapshot.backendStatus === "connected" && snapshot.inventoryTotal !== null
      ? `${snapshot.inventoryTotal} live`
      : "Blocked";
  const tenantGuardDetail =
    snapshot.backendStatus === "connected" ? "Authenticated tenant API response" : "No unverified inventory shown";
  const sessionValue = snapshot.authStatus === "authenticated" ? "Verified" : "Blocked";
  const loginRequired = !loading && snapshot.authStatus === "unauthenticated";
  const globalOperator = Boolean(
    snapshot.user && isTenantSwitchingRole(snapshot.user.role) && !snapshot.user.dealershipId,
  );
  const sessionContext = snapshot.user
    ? [
        snapshot.user.name,
        snapshot.user.role,
        snapshot.user.dealershipLabel,
        snapshot.user.activeDealershipLabel && snapshot.user.activeDealershipLabel !== snapshot.user.dealershipLabel
          ? `Viewing ${snapshot.user.activeDealershipLabel}`
          : null,
      ]
        .filter(Boolean)
        .join(" | ")
    : "";

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand">
          <ShieldCheck size={22} />
          <span>Lotview</span>
        </div>
        <nav className="nav-list">
          <button
            className={activeTab === "inventory" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveTab("inventory")}
          >
            <Truck size={18} />
            Inventory
          </button>
          <button
            className={activeTab === "leads" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveTab("leads")}
          >
            <Users size={18} />
            Leads
          </button>
          <button
            className={activeTab === "scrape" ? "is-active" : ""}
            type="button"
            onClick={() => setActiveTab("scrape")}
          >
            <Gauge size={18} />
            Scrape Proof
          </button>
        </nav>
      </aside>
      <section className="content">
        <header className="topbar">
          <div>
            <h1>Dealership Operations</h1>
            <span>
              Backend: {loading ? "loading" : snapshot.backendStatus} | Session:{" "}
              {loading ? "loading" : snapshot.authStatus}
            </span>
          </div>
          <div className="topbar-actions">
            <div className="environment-badge">Staging only</div>
            {snapshot.authStatus === "authenticated" ? (
              <button className="secondary-action" type="button" onClick={() => void handleLogout()}>
                <LogOut size={17} />
                Sign Out
              </button>
            ) : null}
          </div>
        </header>
        {snapshot.user && !loading ? (
          <section className="session-strip" aria-label="Authenticated user">
            <ShieldCheck size={18} />
            <span>{sessionContext}</span>
          </section>
        ) : null}
        {snapshot.blocker && !loading ? (
          <div className="system-banner" role="status">
            <AlertTriangle size={18} />
            <span>{snapshot.blocker}</span>
          </div>
        ) : null}
        {loginRequired ? (
          <LoginPanel onLogin={handleLogin} />
        ) : (
          <>
            {globalOperator && !loading ? (
              <ActiveDealershipPanel snapshot={snapshot} onSelect={handleActiveDealership} />
            ) : null}
            <div className="metrics-grid">
              <Metric icon={Truck} label="Inventory" value={loading ? "Loading" : inventoryValue} detail="From /api/vehicles" />
              <Metric icon={Inbox} label="Leads" value="Blocked" detail="CRM route proof pending" />
              <Metric icon={ShieldCheck} label="Session" value={loading ? "Loading" : sessionValue} detail={tenantGuardDetail} />
              <Metric
                icon={Gauge}
                label="Readiness"
                value={loading ? "Loading" : snapshot.readinessStatus}
                detail={`Health: ${snapshot.healthStatus}`}
              />
            </div>
            {activePanel}
          </>
        )}
      </section>
    </main>
  );
}

function App() {
  if (shouldRenderMarketingSite(window.location.hostname, window.location.search)) {
    return <MarketingHome />;
  }

  return <OperationsApp />;
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(<App />);
}

export { App };
