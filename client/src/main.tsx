import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Gauge,
  Inbox,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { loadOperationsSnapshot, type InventoryRow, type OperationsSnapshot } from "./api";
import "./styles.css";

type QueueTab = "inventory" | "leads" | "scrape";

const statusLabels: Record<InventoryRow["status"], string> = {
  active: "Active",
  pending_review: "Review",
  blocked: "Blocked",
};

const initialSnapshot: OperationsSnapshot = {
  backendStatus: "blocked",
  healthStatus: "loading",
  readinessStatus: "loading",
  inventoryRows: [],
  inventoryTotal: null,
  blocker: null,
};

function StatusPill({ status }: { status: InventoryRow["status"] }) {
  return <span className={`status-pill status-${status}`}>{statusLabels[status]}</span>;
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
                </tr>
              ))}
            </tbody>
          </table>
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

function App() {
  const [activeTab, setActiveTab] = useState<QueueTab>("inventory");
  const [snapshot, setSnapshot] = useState<OperationsSnapshot>(initialSnapshot);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    loadOperationsSnapshot()
      .then((nextSnapshot) => {
        if (!ignore) {
          setSnapshot(nextSnapshot);
        }
      })
      .catch((error) => {
        if (!ignore) {
          setSnapshot({
            ...initialSnapshot,
            blocker: error instanceof Error ? error.message : "Frontend data load failed",
          });
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

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
    snapshot.backendStatus === "connected" ? "Tenant-scoped API response" : "No unverified inventory shown";

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
            <span>Backend: {loading ? "loading" : snapshot.backendStatus}</span>
          </div>
          <div className="environment-badge">Staging only</div>
        </header>
        {snapshot.blocker && !loading ? (
          <div className="system-banner" role="status">
            <AlertTriangle size={18} />
            <span>{snapshot.blocker}</span>
          </div>
        ) : null}
        <div className="metrics-grid">
          <Metric icon={Truck} label="Inventory" value={loading ? "Loading" : inventoryValue} detail="From /api/vehicles" />
          <Metric icon={Inbox} label="Leads" value="Blocked" detail="CRM route proof pending" />
          <Metric icon={ShieldCheck} label="Tenant Guard" value="Fail closed" detail={tenantGuardDetail} />
          <Metric
            icon={Gauge}
            label="Readiness"
            value={loading ? "Loading" : snapshot.readinessStatus}
            detail={`Health: ${snapshot.healthStatus}`}
          />
        </div>
        {activePanel}
      </section>
    </main>
  );
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(<App />);
}

export { App };
