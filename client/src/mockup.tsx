/**
 * Lotview UI Mockup — visual direction for v1.
 *
 * Renders four role-specific dashboards using fixture data. Mounted at
 * /?preview=1 so the live production app remains the default render at
 * app.lotview.ai. The role switcher in the topbar flips between the four
 * dashboards in-page.
 *
 * The mockup deliberately uses its own .mp- CSS namespace (see
 * mockup-tokens.css) so it can't visually leak into the production app
 * while we evaluate the direction.
 */

import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  Flame,
  Gauge,
  Headphones,
  LayoutDashboard,
  LineChart as LineChartIcon,
  Mail,
  MessageSquare,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  Tag,
  Target,
  Truck,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  consultantMyLeads,
  consultantMyMetrics,
  consultantMyHolds,
  consultantToday,
  gmAging,
  gmPendingPriceApprovals,
  gmPipelineSeries,
  gmTodayMetrics,
  gmTopReps,
  inventoryHighlights,
  recentSignups,
  roles,
  smActionsNeeded,
  smActiveThread,
  smAppointmentsToday,
  smOpenConversations,
  systemAlerts,
  tenantMrrSeries,
  tenants,
  type RoleSlug,
} from "./mockup-data";
import {
  AIContentGenerator,
  MarketAnalysisTable,
  VinInquiryHistoryPanel,
  VinInquiryTool,
} from "./mockup-tools";

import "./mockup-tokens.css";

// ---------------------------------------------------------------------------
// Shell
// ---------------------------------------------------------------------------

interface SidebarItem {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  count?: number | string;
  active?: boolean;
}

interface SidebarGroup {
  title: string;
  items: SidebarItem[];
}

function Shell({
  role,
  setRole,
  sidebar,
  children,
}: {
  role: RoleSlug;
  setRole: (r: RoleSlug) => void;
  sidebar: SidebarGroup[];
  children: React.ReactNode;
}) {
  const me = roles.find((r) => r.slug === role) ?? roles[0];
  const initials = me.person.split(" ").map((n) => n[0]).join("").slice(0, 2);
  return (
    <div className="mp-shell">
      <header className="mp-topbar">
        <div className="mp-brand-mark">
          <span className="mp-brand-mark__dot">
            <Sparkles size={16} />
          </span>
          <span>Lotview</span>
          <span className="mp-badge mp-badge-brand" style={{ marginLeft: 6 }}>Olympic Hyundai</span>
        </div>
        <div className="mp-topbar__sep" />
        <div className="mp-topbar__search">
          <Search size={14} />
          <span>Search inventory, leads, conversations…</span>
          <kbd>⌘K</kbd>
        </div>
        <div className="mp-topbar__role-switcher" role="tablist" aria-label="Role preview">
          {roles.map((r) => (
            <button
              key={r.slug}
              type="button"
              role="tab"
              aria-selected={r.slug === role}
              className={r.slug === role ? "is-active" : ""}
              onClick={() => setRole(r.slug)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="mp-topbar__user">
          <span className="mp-topbar__bell" aria-label="Notifications"><Bell size={15} /></span>
          <span className="mp-topbar__avatar" aria-label={me.person}>{initials}</span>
        </div>
      </header>

      <nav className="mp-sidebar" aria-label="Primary">
        {sidebar.map((group) => (
          <div key={group.title}>
            <div className="mp-sidebar__section-title">{group.title}</div>
            {group.items.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`mp-sidebar__item${item.active ? " is-active" : ""}`}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
                {item.count !== undefined ? <span className="mp-sidebar__item__count">{item.count}</span> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <main className="mp-main">
        <div className="mp-banner" role="status">
          <Sparkles size={14} /> UI preview — fixture data. Live app unchanged. Approve to ship.
        </div>
        {children}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Primitive components
// ---------------------------------------------------------------------------

function Money({ value, hideCents }: { value: number; hideCents?: boolean }) {
  const fmt = new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: hideCents ? 0 : 0,
    maximumFractionDigits: hideCents ? 0 : 0,
  });
  return <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt.format(value)}</span>;
}

function Pct({ value }: { value: number }) {
  const positive = value > 0;
  const flat = value === 0;
  const klass = flat ? "mp-trend-flat" : positive ? "mp-trend-up" : "mp-trend-down";
  return (
    <span className={`mp-metric__trend ${klass}`}>
      {flat ? null : positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {positive ? "+" : ""}{value}% vs last month
    </span>
  );
}

function Heat({ score }: { score: 1 | 2 | 3 | 4 }) {
  const klass = score >= 4 ? "is-hot" : score <= 1 ? "is-cold" : "";
  return (
    <span className={`mp-heat ${klass}`} aria-label={`Heat ${score} of 4`}>
      <Flame size={12} />
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`mp-heat__bar${i <= score ? " is-on" : ""}`} />
      ))}
    </span>
  );
}

function Avatar({ name, color = "#5C6BC0", size = 32 }: { name: string; color?: string; size?: number }) {
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const style: React.CSSProperties = { width: size, height: size, fontSize: size <= 24 ? 10 : 11, background: color };
  return <span className={`mp-avatar${size <= 24 ? " mp-avatar-sm" : ""}`} style={style}>{initials}</span>;
}

function MetricTile({
  label,
  icon: Icon,
  value,
  unit,
  trend,
  series,
  format = "number",
}: {
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  value: number;
  unit?: string;
  trend?: number;
  series?: { v: number }[];
  format?: "number" | "money" | "percent" | "duration";
}) {
  const display =
    format === "money" ? (
      <Money value={value} hideCents />
    ) : format === "percent" ? (
      `${value}%`
    ) : (
      new Intl.NumberFormat("en-US").format(value)
    );
  return (
    <div className="mp-metric">
      <div className="mp-metric__label">
        <Icon size={13} />
        {label}
      </div>
      <div className="mp-metric__value">
        <strong>{display}</strong>
        {unit ? <span>{unit}</span> : null}
      </div>
      {trend !== undefined ? <Pct value={trend} /> : null}
      {series && series.length > 0 ? (
        <div className="mp-metric__chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series}>
              <defs>
                <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0E7A6E" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#0E7A6E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke="#0E7A6E" strokeWidth={1.5} fill="url(#g1)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Super Admin
// ---------------------------------------------------------------------------

interface ScreenProps {
  role: RoleSlug;
  setRole: (r: RoleSlug) => void;
}

function SuperAdminScreen({ role, setRole }: ScreenProps) {
  const totalMrr = tenants.reduce((acc, t) => acc + (t.status === "paused" ? 0 : t.mrr), 0);
  const liveCount = tenants.filter((t) => t.status === "live").length;
  const scrapeSuccess = 94;

  return (
    <Shell
      role={role}
      setRole={setRole}
      sidebar={[
        {
          title: "Platform",
          items: [
            { icon: LayoutDashboard, label: "Overview", active: true },
            { icon: Building2, label: "Dealerships", count: tenants.length },
            { icon: UserCog, label: "Users", count: 142 },
            { icon: CreditCard, label: "Billing" },
          ],
        },
        {
          title: "Operations",
          items: [
            { icon: Activity, label: "System health" },
            { icon: AlertTriangle, label: "Alerts", count: systemAlerts.length },
            { icon: Gauge, label: "Scrape runs" },
            { icon: Settings, label: "Settings" },
          ],
        },
      ]}
    >
      <header className="mp-page-head">
        <div>
          <h1 className="mp-page-title">Platform overview</h1>
          <div className="mp-page-subtitle">Tenant health and platform spend, May 31 · 7:32 PM</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="mp-btn"><Plus size={14} /> Add dealership</button>
          <button className="mp-btn mp-btn-primary"><Sparkles size={14} /> Impersonate</button>
        </div>
      </header>

      <div className="mp-metric-grid">
        <MetricTile label="MRR" icon={DollarSign} value={totalMrr} format="money" trend={+8} series={tenantMrrSeries.map((s) => ({ v: s.mrr }))} />
        <MetricTile label="Live dealerships" icon={Building2} value={liveCount} trend={+12} />
        <MetricTile label="Scrape success" icon={Gauge} value={scrapeSuccess} unit="% last 24h" trend={+2} />
        <MetricTile label="Open alerts" icon={AlertTriangle} value={systemAlerts.length} trend={-50} />
      </div>

      <div className="mp-split">
        <section className="mp-card">
          <div className="mp-card__head">
            <div>
              <h2 className="mp-card__title">Tenants</h2>
              <div className="mp-card__hint">{liveCount} live · 1 trial · 1 paused</div>
            </div>
            <button className="mp-btn mp-btn-sm">Export</button>
          </div>
          <table className="mp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Last scrape</th>
                <th className="mp-num">Vehicles</th>
                <th className="mp-num">Leads</th>
                <th className="mp-num">MRR</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="mp-mono">{t.subdomain}.lotview.ai</div>
                  </td>
                  <td><span className="mp-badge mp-badge-brand">{t.plan}</span></td>
                  <td>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span className={`mp-status-dot ${t.status === "live" ? "is-up" : t.status === "trial" ? "is-warn" : "is-down"}`} />
                      <span style={{ textTransform: "capitalize" }}>{t.status}</span>
                    </span>
                  </td>
                  <td className="mp-mono">{t.lastScrape}</td>
                  <td className="mp-num">{t.vehicles}</td>
                  <td className="mp-num">{t.leads}</td>
                  <td className="mp-num"><Money value={t.mrr} hideCents /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside>
          <section className="mp-card">
            <div className="mp-card__head">
              <h2 className="mp-card__title">Recent signups</h2>
              <button className="mp-btn mp-btn-ghost mp-btn-sm">View all</button>
            </div>
            {recentSignups.map((s) => (
              <div key={s.name} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--mp-border)" }}>
                <Avatar name={s.name} color="#26A69A" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: "var(--mp-text-muted)" }}>{s.contact} · {s.plan}</div>
                </div>
                <div style={{ fontSize: 11, color: "var(--mp-text-faint)", whiteSpace: "nowrap" }}>{s.at}</div>
              </div>
            ))}
          </section>

          <section className="mp-card">
            <div className="mp-card__head">
              <h2 className="mp-card__title">System alerts</h2>
              <span className="mp-badge mp-badge-warn">{systemAlerts.length} open</span>
            </div>
            {systemAlerts.map((a) => (
              <div key={a.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--mp-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13 }}>
                  <AlertTriangle size={13} color={a.severity === "warn" ? "var(--mp-warn)" : "var(--mp-info)"} />
                  {a.title}
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--mp-text-faint)" }}>{a.when}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--mp-text-muted)", marginTop: 4 }}>{a.body}</div>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// General Manager
// ---------------------------------------------------------------------------

function GMScreen({ role, setRole }: ScreenProps) {
  return (
    <Shell
      role={role}
      setRole={setRole}
      sidebar={[
        {
          title: "Today",
          items: [
            { icon: LayoutDashboard, label: "Dashboard", active: true },
            { icon: Calendar, label: "Pipeline" },
            { icon: Users, label: "Team" },
          ],
        },
        {
          title: "Store",
          items: [
            { icon: Truck, label: "Inventory", count: 142 },
            { icon: MessageSquare, label: "Conversations", count: 38 },
            { icon: Tag, label: "Pricing actions", count: 3 },
            { icon: Briefcase, label: "Reports" },
          ],
        },
      ]}
    >
      <header className="mp-page-head">
        <div>
          <h1 className="mp-page-title">Good morning, Marcus.</h1>
          <div className="mp-page-subtitle">Olympic Hyundai Vancouver · {gmTodayMetrics.leadsToday} leads in motion · {gmTodayMetrics.appointmentsBooked} appointments booked today · {gmTodayMetrics.agingOver45d} units aging over 45d</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="mp-btn"><LineChartIcon size={14} /> Weekly report</button>
          <button className="mp-btn mp-btn-primary"><Tag size={14} /> Review price actions ({gmPendingPriceApprovals.length})</button>
        </div>
      </header>

      <div className="mp-banner" style={{ background: "var(--mp-surface-sunken)", color: "var(--mp-text-muted)", borderColor: "var(--mp-border)" }}>
        <AlertTriangle size={13} /> Lotview reports leading indicators (leads, response time, appointments, inventory health, marketplace activity). Sale prices, gross margin, and units delivered live in the DMS — connect a DMS feed to see those here.
      </div>

      <div className="mp-metric-grid">
        <MetricTile label="Leads in motion" icon={Users} value={gmTodayMetrics.leadsToday} trend={gmTodayMetrics.leadsTrend} />
        <MetricTile label="Avg first response" icon={Clock} value={0} unit={gmTodayMetrics.avgResponse} trend={gmTodayMetrics.responseTrend} />
        <MetricTile label="Appointments booked" icon={Calendar} value={gmTodayMetrics.appointmentsBooked} trend={gmTodayMetrics.appointmentsTrend} />
        <MetricTile label="Active inventory" icon={Truck} value={gmTodayMetrics.activeInventory} unit={`${gmTodayMetrics.agingOver45d} aging >45d`} />
      </div>

      <div className="mp-split">
        <section className="mp-card">
          <div className="mp-card__head">
            <div>
              <h2 className="mp-card__title">Lead pipeline · last 4 weeks</h2>
              <div className="mp-card__hint">New lead → Replied → Appointment booked → Showed up — what Lotview observes end-to-end</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <span className="mp-badge"><span className="mp-status-dot" style={{ background: "#0F172A" }} /> Showed</span>
              <span className="mp-badge"><span className="mp-status-dot" style={{ background: "#0284C7" }} /> Booked</span>
              <span className="mp-badge"><span className="mp-status-dot" style={{ background: "#6366F1" }} /> Replied</span>
              <span className="mp-badge"><span className="mp-status-dot" style={{ background: "#CBD5E1" }} /> New</span>
            </div>
          </div>
          <div className="mp-chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gmPipelineSeries} margin={{ left: 0, right: 16, top: 8, bottom: 0 }}>
                <CartesianGrid stroke="#E2E8F0" vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="week" tickLine={false} axisLine={false} fontSize={12} stroke="#94A3B8" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#94A3B8" />
                <Tooltip cursor={{ fill: "#F1F5F9" }} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="new" stackId="a" fill="#CBD5E1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="replied" stackId="a" fill="#6366F1" radius={[0, 0, 0, 0]} />
                <Bar dataKey="booked" stackId="a" fill="#0284C7" radius={[0, 0, 0, 0]} />
                <Bar dataKey="showed" stackId="a" fill="#0F172A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <aside>
          <section className="mp-card">
            <div className="mp-card__head">
              <div>
                <h2 className="mp-card__title">Top reps · MTD activity</h2>
                <div className="mp-card__hint">Ranked by Lotview-observable activity</div>
              </div>
              <button className="mp-btn mp-btn-ghost mp-btn-sm">View team</button>
            </div>
            {gmTopReps.map((rep) => (
              <div key={rep.name} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, padding: "10px 0", alignItems: "center", borderBottom: "1px solid var(--mp-border)" }}>
                <Avatar name={rep.name} color={rep.color} />
                <div>
                  <div style={{ fontWeight: 600 }}>{rep.name}</div>
                  <div style={{ fontSize: 12, color: "var(--mp-text-muted)" }}>{rep.leadsWorked} leads · {rep.appointments} appts · {rep.avgFirstReply} reply</div>
                </div>
                <ChevronRight size={14} color="var(--mp-text-faint)" />
              </div>
            ))}
          </section>
        </aside>
      </div>

      <section className="mp-card">
        <div className="mp-card__head">
          <div>
            <h2 className="mp-card__title">Aging inventory needing action</h2>
            <div className="mp-card__hint">Units over 45 days on lot · suggested price action</div>
          </div>
          <button className="mp-btn mp-btn-sm"><Sparkles size={13} /> AI re-price all</button>
        </div>
        <table className="mp-table">
          <thead>
            <tr><th>Vehicle</th><th className="mp-num">Listed</th><th className="mp-num">Days on lot</th><th className="mp-num">AI suggestion</th><th></th></tr>
          </thead>
          <tbody>
            {gmAging.map((v) => (
              <tr key={v.vin}>
                <td>
                  <div style={{ fontWeight: 600 }}>{v.vehicle}</div>
                  <div className="mp-mono">{v.vin}</div>
                </td>
                <td className="mp-num"><Money value={v.price} hideCents /></td>
                <td className="mp-num">
                  <span className={`mp-badge ${v.days > 60 ? "mp-badge-danger" : "mp-badge-warn"}`}>{v.days}d</span>
                </td>
                <td className="mp-num" style={{ color: "var(--mp-danger)", fontWeight: 600 }}>
                  <Money value={v.suggested} hideCents />
                </td>
                <td className="mp-num"><button className="mp-btn mp-btn-sm mp-btn-primary">Approve</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="mp-card">
        <div className="mp-card__head">
          <div>
            <h2 className="mp-card__title">Price actions awaiting your approval</h2>
            <div className="mp-card__hint">Sales managers can request drops; you authorize.</div>
          </div>
        </div>
        {gmPendingPriceApprovals.map((p, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, padding: "12px 0", alignItems: "center", borderBottom: "1px solid var(--mp-border)" }}>
            <Avatar name={p.who} color="#26A69A" />
            <div>
              <div style={{ fontWeight: 600 }}>{p.who}</div>
              <div style={{ fontSize: 13, color: "var(--mp-text-muted)" }}>{p.action}</div>
              <div style={{ fontSize: 11, color: "var(--mp-text-faint)" }}>{p.at}</div>
            </div>
            <button className="mp-btn mp-btn-sm">Deny</button>
            <button className="mp-btn mp-btn-sm mp-btn-primary">Approve</button>
          </div>
        ))}
      </section>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Sales Manager
// ---------------------------------------------------------------------------

function SMScreen({ role, setRole }: ScreenProps) {
  return (
    <Shell
      role={role}
      setRole={setRole}
      sidebar={[
        {
          title: "Tools",
          items: [
            { icon: Search, label: "VIN Inquiry", active: true },
            { icon: Target, label: "Market analysis", count: 142 },
            { icon: Sparkles, label: "AI listings" },
            { icon: Tag, label: "Pricing actions", count: gmPendingPriceApprovals.length },
          ],
        },
        {
          title: "Floor",
          items: [
            { icon: MessageSquare, label: "Conversations", count: smOpenConversations.length },
            { icon: Calendar, label: "Appointments", count: smAppointmentsToday.length },
            { icon: AlertTriangle, label: "Actions", count: smActionsNeeded.filter((a) => a.urgent).length },
            { icon: Users, label: "Team" },
          ],
        },
        {
          title: "Inventory",
          items: [
            { icon: Truck, label: "All vehicles", count: 142 },
            { icon: Gauge, label: "Marketplace" },
          ],
        },
      ]}
    >
      <header className="mp-page-head">
        <div>
          <h1 className="mp-page-title">Sales floor</h1>
          <div className="mp-page-subtitle">{smOpenConversations.length} open conversations · {smAppointmentsToday.length} appointments · {smActionsNeeded.filter((a) => a.urgent).length} urgent actions · 142 active units</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="mp-btn"><Users size={14} /> Reassign leads</button>
          <button className="mp-btn mp-btn-primary"><Send size={14} /> Broadcast</button>
        </div>
      </header>

      {/* Compact stat strip */}
      <div className="mp-stat-strip">
        <StatCell icon={MessageSquare} label="Open conv." value={smOpenConversations.length} />
        <StatCell icon={Calendar} label="Appts today" value={smAppointmentsToday.length} />
        <StatCell icon={AlertTriangle} label="Urgent" value={smActionsNeeded.filter((a) => a.urgent).length} accent="warn" />
        <StatCell icon={Tag} label="Aging > 30d" value={3} accent="danger" />
        <StatCell icon={Target} label="Avg position" value="+12%" />
        <StatCell icon={DollarSign} label="Pipeline" value="$586K" />
      </div>

      {/* PRIMARY: VIN Inquiry + recent history */}
      <div className="mp-split">
        <VinInquiryTool />
        <div>
          <VinInquiryHistoryPanel />
          <section className="mp-card">
            <div className="mp-card__head">
              <h2 className="mp-card__title">Active thread</h2>
              <span className="mp-badge mp-badge-info">{smActiveThread.channel}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <Avatar name={smActiveThread.customer} color="#26A69A" />
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{smActiveThread.customer}</div>
                <div style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>{smActiveThread.vehicle}</div>
              </div>
            </div>
            <div className="mp-thread" style={{ maxHeight: 200, overflow: "auto" }}>
              {smActiveThread.bubbles.slice(-3).map((b, i) => (
                <div key={i} className={`mp-bubble mp-bubble-${b.side}`}>{b.body}</div>
              ))}
            </div>
            <div className="mp-ai-suggest">
              <div className="mp-ai-suggest__head">
                <Sparkles size={11} /> AI reply · grounded in vehicle specs
              </div>
              {smActiveThread.aiSuggested}
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                <button className="mp-btn mp-btn-sm mp-btn-primary"><Send size={11} /> Send</button>
                <button className="mp-btn mp-btn-sm">Edit</button>
                <button className="mp-btn mp-btn-sm mp-btn-ghost">Regenerate</button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* SECONDARY: Market analysis on every unit */}
      <MarketAnalysisTable />

      {/* TERTIARY: AI content generator */}
      <AIContentGenerator />

      {/* Operations: open conversations + actions needed */}
      <div className="mp-split">
        <section className="mp-card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="mp-card__head" style={{ padding: "12px 16px" }}>
            <div>
              <h2 className="mp-card__title">Open conversations</h2>
              <div className="mp-card__hint">{smOpenConversations.length} active · sorted by hotness</div>
            </div>
            <span className="mp-badge mp-badge-info">{smOpenConversations.filter((c) => c.hot >= 3).length} hot</span>
          </div>
          <div>
            {smOpenConversations.slice(0, 5).map((c) => (
              <div key={c.id} className="mp-lead" style={{ borderTop: "1px solid var(--mp-border)", borderRadius: 0 }}>
                <Avatar name={c.name} color={["#5C6BC0", "#26A69A", "#EF5350", "#FFB300", "#8D6E63"][c.id.charCodeAt(1) % 5]} />
                <div className="mp-lead__body">
                  <div className="mp-lead__name">{c.name} <span className="mp-badge">{c.channel}</span> {c.owner === "Unassigned" ? <span className="mp-badge mp-badge-warn">Unassigned</span> : null}</div>
                  <div className="mp-lead__msg">{c.vehicle} · {c.lastMsg}</div>
                </div>
                <div className="mp-lead__meta">
                  <Heat score={c.hot as 1 | 2 | 3 | 4} />
                  <div style={{ marginTop: 4 }}>{c.at}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mp-card">
          <div className="mp-card__head">
            <div>
              <h2 className="mp-card__title">Actions needed</h2>
              <div className="mp-card__hint">{smActionsNeeded.filter((a) => a.urgent).length} urgent · {smActionsNeeded.length - smActionsNeeded.filter((a) => a.urgent).length} routine</div>
            </div>
          </div>
          {smActionsNeeded.map((a) => (
            <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, padding: "10px 0", borderBottom: "1px solid var(--mp-border)", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className={`mp-badge ${a.urgent ? "mp-badge-danger" : "mp-badge-warn"}`}>{a.urgent ? "Urgent" : "Routine"}</span>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>{a.kind}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--mp-text)", marginTop: 4 }}>{a.target}</div>
                <div style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>{a.detail}</div>
              </div>
              <button className="mp-btn mp-btn-sm mp-btn-primary">Resolve</button>
            </div>
          ))}
        </section>
      </div>

      <section className="mp-card">
        <div className="mp-card__head">
          <h2 className="mp-card__title">Today's appointments</h2>
          <span className="mp-badge mp-badge-info">{smAppointmentsToday.length} scheduled</span>
        </div>
        <div className="mp-timeline">
          {smAppointmentsToday.map((a) => (
            <div key={a.time} className="mp-timeline__item">
              <span className="mp-timeline__time">{a.time}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.customer} · {a.kind}</div>
                <div style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>{a.vehicle} · {a.rep}</div>
              </div>
              <button className="mp-btn mp-btn-sm">Open</button>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}

function StatCell({ icon: Icon, label, value, accent }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string | number; accent?: "warn" | "danger" }) {
  const valColor = accent === "danger" ? "var(--mp-danger)" : accent === "warn" ? "var(--mp-warn)" : "var(--mp-text)";
  return (
    <div className="mp-stat-strip__cell">
      <div className="mp-stat-strip__icon"><Icon size={14} /></div>
      <div>
        <div className="mp-stat-strip__label">{label}</div>
        <div className="mp-stat-strip__value" style={{ color: valColor }}>{value}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sales Consultant
// ---------------------------------------------------------------------------

function ConsultantScreen({ role, setRole }: ScreenProps) {
  const m = consultantMyMetrics;
  return (
    <Shell
      role={role}
      setRole={setRole}
      sidebar={[
        {
          title: "My day",
          items: [
            { icon: LayoutDashboard, label: "Dashboard", active: true },
            { icon: MessageSquare, label: "My inbox", count: m.myLeadsOpen },
            { icon: Calendar, label: "Appointments", count: m.myAppointmentsToday },
            { icon: Target, label: "Pipeline" },
          ],
        },
        {
          title: "Store",
          items: [
            { icon: Truck, label: "Browse inventory", count: 142 },
            { icon: Headphones, label: "AI sales coach" },
          ],
        },
      ]}
    >
      <header className="mp-page-head">
        <div>
          <h1 className="mp-page-title">Hi Devon — {m.myLeadsHot} hot leads waiting.</h1>
          <div className="mp-page-subtitle">{m.myAppointmentsMtd} of {m.myAppointmentsMtdGoal} appointments this month · holding <Money value={m.myHeldInventoryValue} hideCents /> in inventory</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="mp-btn"><Plus size={14} /> Log walk-in</button>
          <button className="mp-btn mp-btn-primary"><Sparkles size={14} /> Reply to all hot ({m.myLeadsHot})</button>
        </div>
      </header>

      <div className="mp-metric-grid">
        <MetricTile label="My open leads" icon={Users} value={m.myLeadsOpen} unit={`${m.myLeadsHot} hot`} />
        <MetricTile label="Appts today" icon={Calendar} value={m.myAppointmentsToday} />
        <MetricTile label="Holding (listed price)" icon={DollarSign} value={m.myHeldInventoryValue} format="money" />
        <MetricTile label="Appts MTD" icon={Target} value={Math.round((m.myAppointmentsMtd / m.myAppointmentsMtdGoal) * 100)} format="percent" unit={`${m.myAppointmentsMtd}/${m.myAppointmentsMtdGoal}`} />
      </div>

      <div className="mp-split">
        <section className="mp-card" style={{ padding: 0 }}>
          <div className="mp-card__head" style={{ padding: "var(--mp-sp-4) var(--mp-sp-5)" }}>
            <div>
              <h2 className="mp-card__title">My inbox</h2>
              <div className="mp-card__hint">Sorted by AI hotness · click to open</div>
            </div>
            <button className="mp-btn mp-btn-sm"><Mail size={13} /> Compose</button>
          </div>
          <div>
            {consultantMyLeads.map((l) => (
              <div key={l.id} className="mp-lead" style={{ borderTop: "1px solid var(--mp-border)", borderRadius: 0 }}>
                <Avatar name={l.name} color={["#5C6BC0", "#26A69A", "#EF5350", "#FFB300", "#8D6E63"][l.id.charCodeAt(2) % 5]} />
                <div className="mp-lead__body">
                  <div className="mp-lead__name">{l.name} <span className="mp-badge">{l.status}</span></div>
                  <div className="mp-lead__msg">{l.vehicle} · {l.lastMsg}</div>
                </div>
                <div className="mp-lead__meta">
                  <Heat score={l.hot as 1 | 2 | 3 | 4} />
                  <div style={{ marginTop: 4 }}>{l.at}</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside>
          <section className="mp-card">
            <div className="mp-card__head">
              <h2 className="mp-card__title">Today's schedule</h2>
              <span className="mp-badge mp-badge-brand">{consultantToday.length}</span>
            </div>
            <div className="mp-timeline">
              {consultantToday.map((a) => (
                <div key={a.time} className="mp-timeline__item">
                  <span className="mp-timeline__time">{a.time}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.customer} · {a.kind}</div>
                    <div style={{ fontSize: 12, color: "var(--mp-text-muted)" }}>{a.vehicle}</div>
                  </div>
                  <span className={`mp-badge ${a.status === "confirmed" ? "mp-badge-success" : "mp-badge-warn"}`}>{a.status}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mp-card">
            <div className="mp-card__head">
              <h2 className="mp-card__title">Vehicles I'm holding</h2>
              <button className="mp-btn mp-btn-ghost mp-btn-sm">View all</button>
            </div>
            {consultantMyHolds.map((h) => (
              <div key={h.vin} className="mp-vehicle-card">
                <div className="mp-vehicle-card__thumb"><Car size={24} /></div>
                <div>
                  <div className="mp-vehicle-card__title">{h.vehicle}</div>
                  <div className="mp-vehicle-card__sub">{h.vin}</div>
                  {h.dropsApproved ? <span className="mp-badge mp-badge-success" style={{ marginTop: 4 }}><CheckCircle2 size={11} /> price drop approved</span> : null}
                </div>
                <div>
                  <div className="mp-vehicle-card__price"><Money value={h.price} hideCents /></div>
                  <div className="mp-vehicle-card__age">{h.holds} hold</div>
                </div>
              </div>
            ))}
          </section>
        </aside>
      </div>

      <section className="mp-card">
        <div className="mp-card__head">
          <div>
            <h2 className="mp-card__title">Recommended for your leads</h2>
            <div className="mp-card__hint">AI-matched inventory based on conversation context</div>
          </div>
          <button className="mp-btn mp-btn-sm"><Zap size={13} /> Refresh</button>
        </div>
        {inventoryHighlights.map((v) => (
          <div key={v.vin} className="mp-vehicle-card">
            <div className="mp-vehicle-card__thumb"><Car size={24} /></div>
            <div>
              <div className="mp-vehicle-card__title">{v.vehicle}</div>
              <div className="mp-vehicle-card__sub">{v.trim} · {v.vin}</div>
            </div>
            <div>
              <div className="mp-vehicle-card__price"><Money value={v.price} hideCents /></div>
              <div className="mp-vehicle-card__age">{v.days}d on lot</div>
            </div>
          </div>
        ))}
      </section>
    </Shell>
  );
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function MockupPreview() {
  const initial = useMemo<RoleSlug>(() => {
    if (typeof window === "undefined") return "general_manager";
    const params = new URLSearchParams(window.location.search);
    const r = params.get("role");
    const valid: RoleSlug[] = ["super_admin", "general_manager", "sales_manager", "sales_consultant"];
    return (valid as string[]).includes(r ?? "") ? (r as RoleSlug) : "general_manager";
  }, []);
  const [role, setRoleState] = useState<RoleSlug>(initial);

  function setRole(next: RoleSlug) {
    setRoleState(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("role", next);
      window.history.replaceState({}, "", url.toString());
    }
  }

  switch (role) {
    case "super_admin":
      return <SuperAdminScreen role={role} setRole={setRole} />;
    case "general_manager":
      return <GMScreen role={role} setRole={setRole} />;
    case "sales_manager":
      return <SMScreen role={role} setRole={setRole} />;
    case "sales_consultant":
      return <ConsultantScreen role={role} setRole={setRole} />;
  }
}
