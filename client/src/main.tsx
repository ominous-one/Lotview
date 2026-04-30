import React, { useMemo, useState } from "react";
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
import "./styles.css";

type QueueTab = "inventory" | "leads" | "scrape";

interface InventoryRow {
  stock: string;
  vin: string;
  vehicle: string;
  status: "active" | "pending_review" | "blocked";
  price: string;
  source: string;
  proof: string;
}

interface LeadRow {
  name: string;
  vehicle: string;
  stage: string;
  owner: string;
  age: string;
}

const inventoryRows: InventoryRow[] = [
  {
    stock: "H24019",
    vin: "1HGCM82633A004352",
    vehicle: "2024 Hyundai Tucson Preferred",
    status: "active",
    price: "$34,995",
    source: "Olympic Hyundai",
    proof: "VIN checked",
  },
  {
    stock: "Q-118",
    vin: "2INVALIDVIN00000",
    vehicle: "Quarantined scrape candidate",
    status: "blocked",
    price: "Review",
    source: "Scrape candidate",
    proof: "Invalid VIN blocked",
  },
  {
    stock: "P24077",
    vin: "5NMS3CAD4PH123456",
    vehicle: "2023 Hyundai Santa Fe Luxury",
    status: "pending_review",
    price: "$41,880",
    source: "Manual review",
    proof: "Source mismatch",
  },
];

const leadRows: LeadRow[] = [
  {
    name: "Maya C.",
    vehicle: "2024 Tucson",
    stage: "AI draft ready",
    owner: "BDC",
    age: "12m",
  },
  {
    name: "Jordan L.",
    vehicle: "2023 Santa Fe",
    stage: "Needs manager",
    owner: "Sales manager",
    age: "31m",
  },
  {
    name: "Priya S.",
    vehicle: "Inventory request",
    stage: "Waiting on source truth",
    owner: "Sales rep",
    age: "44m",
  },
];

const statusLabels: Record<InventoryRow["status"], string> = {
  active: "Active",
  pending_review: "Review",
  blocked: "Blocked",
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

function InventoryTable() {
  return (
    <section className="workspace-panel" aria-labelledby="inventory-heading">
      <div className="panel-heading">
        <div>
          <h2 id="inventory-heading">Inventory Control</h2>
          <p>Olympic Hyundai Vancouver</p>
        </div>
        <button className="primary-action" type="button">
          <ClipboardCheck size={17} />
          Review Queue
        </button>
      </div>
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
            {inventoryRows.map((row) => (
              <tr key={row.stock}>
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
    </section>
  );
}

function LeadQueue() {
  return (
    <section className="workspace-panel" aria-labelledby="lead-heading">
      <div className="panel-heading">
        <div>
          <h2 id="lead-heading">Lead Inbox</h2>
          <p>Drafts stay review-only until certification</p>
        </div>
        <button className="secondary-action" type="button">
          <Inbox size={17} />
          Open Inbox
        </button>
      </div>
      <div className="lead-list">
        {leadRows.map((lead) => (
          <article className="lead-row" key={`${lead.name}-${lead.vehicle}`}>
            <div>
              <strong>{lead.name}</strong>
              <span>{lead.vehicle}</span>
            </div>
            <span>{lead.stage}</span>
            <span>{lead.owner}</span>
            <small>{lead.age}</small>
          </article>
        ))}
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
          <p>Latest candidate import</p>
        </div>
        <button className="secondary-action" type="button">
          <BarChart3 size={17} />
          View Report
        </button>
      </div>
      <div className="run-grid">
        <div>
          <span>Vehicles extracted</span>
          <strong>47</strong>
        </div>
        <div>
          <span>Stored</span>
          <strong>44</strong>
        </div>
        <div>
          <span>Blocked</span>
          <strong>3</strong>
        </div>
        <div>
          <span>Source accuracy</span>
          <strong>Not certified</strong>
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

  const activePanel = useMemo(() => {
    if (activeTab === "leads") return <LeadQueue />;
    if (activeTab === "scrape") return <ScrapeRunPanel />;
    return <InventoryTable />;
  }, [activeTab]);

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
            <span>Tenant: Olympic Hyundai Vancouver</span>
          </div>
          <div className="environment-badge">Staging only</div>
        </header>
        <div className="metrics-grid">
          <Metric icon={Truck} label="Inventory" value="44 active" detail="3 blocked candidates" />
          <Metric icon={Inbox} label="Leads" value="12 open" detail="2 manager escalations" />
          <Metric icon={ShieldCheck} label="Tenant Guard" value="Enabled" detail="No header fallback" />
          <Metric icon={Gauge} label="Readiness" value="CI verified" detail="Staging proof pending" />
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
