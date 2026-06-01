/**
 * Sales Manager operator tools — what they pay for.
 *
 * These three tools are the reason a dealership writes a $2K/mo check
 * instead of fighting Excel:
 *   - VinInquiryTool      — paste a VIN, see decode + history + market position
 *   - MarketAnalysisTable — every unit on lot graded against the live market
 *   - AIContentGenerator  — headline / subheadline / description per VDP, one click
 *
 * All data is fixture for now (`mockup-data.ts`). The shapes match the
 * production endpoints we already shipped (decodeVIN, scrape sources,
 * vehicle records) so wiring them to live data is a small step.
 */

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Car,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  DollarSign,
  Filter,
  History,
  Maximize2,
  Pause,
  Play,
  Search,
  Send,
  Sparkles,
  Tag,
  Target,
  TrendingDown,
  TrendingUp,
  Wand2,
} from "lucide-react";
import {
  aiContentSamples,
  marketAnalysisRows,
  sampleVinInquiry,
  vinInquiryHistory,
  type MarketAnalysisRow,
} from "./mockup-data";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// CAD throughout — single Olympic Hyundai is a Vancouver BC dealership.
// Future multi-tenant work can read the dealership's `defaultCurrency`
// off the tenant row and pick CAD / USD per tenant.
function money(value: number, hideCents = true): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: hideCents ? 0 : 2,
    maximumFractionDigits: hideCents ? 0 : 2,
  }).format(value);
}

// Numbers in CA locale — comma-separated thousands.
function num(value: number): string {
  return new Intl.NumberFormat("en-CA").format(value);
}

function km(value: number): string {
  return `${num(value)} km`;
}

// ---------------------------------------------------------------------------
// VIN Inquiry — the headline tool
// ---------------------------------------------------------------------------

export function VinInquiryTool() {
  const [vin, setVin] = useState(sampleVinInquiry.vin);
  const [result, setResult] = useState(sampleVinInquiry);
  const [loading, setLoading] = useState(false);

  function handleLookup(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    window.setTimeout(() => {
      setResult(sampleVinInquiry);
      setLoading(false);
    }, 350);
  }

  const positionLabel =
    result.market.pricePosition > 0.3
      ? "Above market"
      : result.market.pricePosition < -0.3
        ? "Below market"
        : "At market";
  const positionClass =
    result.market.pricePosition > 0.3 ? "mp-badge-warn" : result.market.pricePosition < -0.3 ? "mp-badge-info" : "mp-badge-success";

  return (
    <section className="mp-card mp-tool">
      <div className="mp-card__head">
        <div>
          <h2 className="mp-card__title"><Search size={15} style={{ marginRight: 6, verticalAlign: -2 }} />VIN Inquiry</h2>
          <div className="mp-card__hint">Decode + Carfax + market position + appraisal range</div>
        </div>
        <span className="mp-badge mp-badge-success"><Cpu size={10} /> Live</span>
      </div>

      <form className="mp-vin-input" onSubmit={handleLookup}>
        <span className="mp-vin-input__prefix"><Search size={14} /></span>
        <input
          type="text"
          maxLength={17}
          minLength={17}
          value={vin}
          onChange={(e) => setVin(e.currentTarget.value.toUpperCase())}
          placeholder="Paste a 17-character VIN"
          aria-label="VIN"
        />
        <button type="submit" className="mp-btn mp-btn-primary mp-btn-sm" disabled={loading}>
          {loading ? "Decoding…" : "Lookup"}
          {loading ? null : <ArrowRight size={13} />}
        </button>
      </form>

      <div className="mp-tool__row">
        {/* Decoded specs — NHTSA vPIC (free, real) */}
        <div className="mp-tool__pane">
          <div className="mp-tool__pane-title">
            Decoded · NHTSA vPIC
            <span className="mp-source-pill"><Cpu size={9} /> {result.decoded.decodedAt}</span>
          </div>
          <div className="mp-tool__grid-2">
            <SpecRow label="Year / Make / Model" value={`${result.decoded.year} ${result.decoded.make} ${result.decoded.model}`} />
            <SpecRow label="Trim" value={result.decoded.trim} highlight />
            <SpecRow label="Body" value={result.decoded.bodyClass} />
            <SpecRow label="Engine" value={result.decoded.engine} />
            <SpecRow label="Drivetrain" value={result.decoded.drivetrain} />
            <SpecRow label="Transmission" value={result.decoded.transmission} />
            <SpecRow label="Fuel" value={result.decoded.fuelType} />
            <SpecRow label="Colour" value={`${result.decoded.exteriorColor} / ${result.decoded.interiorColor}`} />
            <SpecRow label="MSRP new" value={money(result.decoded.msrpNew)} />
          </div>
        </div>

        {/* Recalls — NHTSA (free, real). Carfax fields are only shown if the
            dealer has connected their own Carfax-for-Dealers account. */}
        <div className="mp-tool__pane">
          <div className="mp-tool__pane-title">
            NHTSA recalls
            {result.recalls.length === 0 ? <span className="mp-source-pill"><CheckCircle2 size={9} /> Clean</span> : null}
          </div>
          {result.recalls.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--mp-text-muted)" }}>No open recalls on this VIN.</div>
          ) : (
            result.recalls.map((r) => (
              <div key={r.campaign} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="mp-mono" style={{ fontSize: 11 }}>{r.campaign}</span>
                  <span className={`mp-badge ${r.status === "Remedied" ? "mp-badge-success" : "mp-badge-warn"}`}>{r.status}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--mp-text-faint)" }}>Remedy {r.remedyDate}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--mp-text-muted)", marginTop: 4 }}>{r.summary}</div>
              </div>
            ))
          )}

          {/* Carfax connector — honest empty state. We do not invent accident
              counts or owner counts. Carfax data only appears when the
              dealer has connected their own Carfax-for-Dealers subscription. */}
          <div className="mp-source-empty">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <BookOpen size={13} color="var(--mp-text-muted)" />
              <strong style={{ fontSize: 12 }}>Carfax history</strong>
              <span className="mp-badge">Add-on · paid by dealer</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--mp-text-muted)", margin: "4px 0 8px" }}>
              Accidents, owner count, service records, and title status require your Carfax-for-Dealers subscription.
              Connect once — Lotview pulls per-VIN automatically.
            </div>
            <button className="mp-btn mp-btn-sm"><BookOpen size={11} /> Connect Carfax for Dealers</button>
          </div>
        </div>
      </div>

      {/* Market position bar — only when a market data source is configured */}
      {result.market ? (
        <div className="mp-tool__market">
          <div className="mp-tool__market-head">
            <div>
              <div className="mp-tool__pane-title">
                Live market position
                <span className="mp-source-pill"><Target size={9} /> {result.market.source} · refreshed {result.market.refreshedAt}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>
                {result.market.listingsActive} active comparable listings · {result.market.similarSold} sold in last 60 days · avg time to sell {result.market.avgDaysToSell}d
              </div>
            </div>
            <span className={`mp-badge ${positionClass}`}>{positionLabel}</span>
          </div>
          <MarketBar
            low={result.market.marketLow}
            avg={result.market.marketAvg}
            high={result.market.marketHigh}
            listed={
              result.appraisal
                ? result.appraisal.retailLow + (result.appraisal.retailHigh - result.appraisal.retailLow) * (0.5 + result.market.pricePosition * 0.5)
                : result.market.marketAvg
            }
          />
        </div>
      ) : (
        <div className="mp-source-empty">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Target size={13} color="var(--mp-text-muted)" />
            <strong style={{ fontSize: 12 }}>Market comparison</strong>
            <span className="mp-badge">Source required</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--mp-text-muted)", margin: "4px 0 8px" }}>
            Connect a data source to see how this VIN is priced against the BC market:
            MarketCheck (paid), or AutoTrader.ca / CarGurus.ca scrapers (free, Lotview-managed).
          </div>
          <button className="mp-btn mp-btn-sm"><Target size={11} /> Configure source</button>
        </div>
      )}

      {/* Appraisal — only when both market data + history exist */}
      {result.appraisal ? (
        <div className="mp-tool__appraisal">
          <div className="mp-tool__pane-title" style={{ marginBottom: 8 }}>
            Appraisal range
            <span className="mp-source-pill"><Cpu size={9} /> Computed from live market + dealer cost model</span>
          </div>
          <div className="mp-appraisal-grid">
            <AppraisalCell label="Wholesale" range={[result.appraisal.wholesaleLow, result.appraisal.wholesaleHigh]} tone="warn" />
            <AppraisalCell label="Retail" range={[result.appraisal.retailLow, result.appraisal.retailHigh]} tone="success" />
            <AppraisalCell label="Suggested ask" range={[result.appraisal.retailLow + result.appraisal.targetGross, result.appraisal.retailLow + result.appraisal.targetGross]} single tone="brand" />
            <AppraisalCell label="Confidence" range={[0, 0]} text={result.appraisal.confidence} tone="info" />
          </div>
        </div>
      ) : null}

      {/* Comparables */}
      <div style={{ marginTop: 16 }}>
        <div className="mp-tool__pane-title" style={{ marginBottom: 8 }}>
          Comparable active listings · sorted by distance from store
        </div>
        <table className="mp-table mp-table-compact">
          <thead>
            <tr><th>Distance</th><th>Dealer</th><th>Year</th><th className="mp-num">Kilometres</th><th className="mp-num">Listed</th><th className="mp-num">Days on lot</th><th></th></tr>
          </thead>
          <tbody>
            {result.comparables.map((c) => (
              <tr key={`${c.dealer}-${c.price}`}>
                <td className="mp-mono">{c.distanceKm} km</td>
                <td>{c.dealer}</td>
                <td>{c.year}</td>
                <td className="mp-num mp-mono">{km(c.odoKm)}</td>
                <td className="mp-num"><strong>{money(c.price)}</strong></td>
                <td className="mp-num"><span className="mp-badge">{c.daysOnLot}d</span></td>
                <td><button className="mp-btn mp-btn-sm mp-btn-ghost"><Maximize2 size={11} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mp-tool__actions">
        <button className="mp-btn mp-btn-sm"><Tag size={12} /> Apply to appraisal</button>
        <button className="mp-btn mp-btn-sm"><Sparkles size={12} /> Draft AI listing for this VIN</button>
        <button className="mp-btn mp-btn-sm mp-btn-action"><Sparkles size={12} /> Stock at suggested ask</button>
      </div>
    </section>
  );
}

function SpecRow({ label, value, ok, highlight }: { label: string; value: string; ok?: boolean; highlight?: boolean }) {
  return (
    <>
      <div className="mp-spec__label">{label}</div>
      <div className={`mp-spec__value${highlight ? " is-highlight" : ""}`}>
        {value}
        {ok ? <CheckCircle2 size={12} color="var(--mp-live)" style={{ marginLeft: 4, verticalAlign: -2 }} /> : null}
      </div>
    </>
  );
}

function MarketBar({ low, avg, high, listed }: { low: number; avg: number; high: number; listed: number }) {
  const pct = Math.max(0, Math.min(100, ((listed - low) / (high - low)) * 100));
  const avgPct = Math.max(0, Math.min(100, ((avg - low) / (high - low)) * 100));
  return (
    <div className="mp-market-bar">
      <div className="mp-market-bar__track">
        <div className="mp-market-bar__avg" style={{ left: `${avgPct}%` }} title={`Market avg ${money(avg)}`} />
        <div className="mp-market-bar__listed" style={{ left: `${pct}%` }} title={`Your listed ${money(listed)}`} />
      </div>
      <div className="mp-market-bar__labels">
        <span>{money(low)}<br /><span className="mp-tag-meta">Low</span></span>
        <span style={{ textAlign: "center" }}><strong>{money(avg)}</strong><br /><span className="mp-tag-meta">Market avg</span></span>
        <span style={{ textAlign: "right" }}>{money(high)}<br /><span className="mp-tag-meta">High</span></span>
      </div>
    </div>
  );
}

function AppraisalCell({ label, range, single, text, tone }: { label: string; range: [number, number]; single?: boolean; text?: string; tone: "warn" | "success" | "brand" | "info" }) {
  return (
    <div className={`mp-appraisal-cell is-${tone}`}>
      <div className="mp-appraisal-cell__label">{label}</div>
      <div className="mp-appraisal-cell__value">
        {text ? <span style={{ textTransform: "capitalize" }}>{text}</span> :
          single ? money(range[0]) :
          `${money(range[0])} – ${money(range[1])}`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// VIN Inquiry — recent history sidebar widget
// ---------------------------------------------------------------------------

export function VinInquiryHistoryPanel() {
  return (
    <section className="mp-card">
      <div className="mp-card__head">
        <div>
          <h2 className="mp-card__title"><History size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Recent inquiries</h2>
          <div className="mp-card__hint">Last 24h · whole team</div>
        </div>
        <button className="mp-btn mp-btn-sm mp-btn-ghost">View all</button>
      </div>
      <div>
        {vinInquiryHistory.map((h, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "8px 0", borderBottom: i === vinInquiryHistory.length - 1 ? 0 : "1px solid var(--mp-border)", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{h.vehicle}</div>
              <div className="mp-mono" style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>{h.vin}</div>
              <div style={{ fontSize: 11, color: "var(--mp-text-faint)", marginTop: 2 }}>{h.actor} · {h.at}</div>
            </div>
            <button className="mp-btn mp-btn-sm mp-btn-ghost"><ArrowRight size={12} /></button>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Inventory market analysis — every unit graded
// ---------------------------------------------------------------------------

export function MarketAnalysisTable() {
  const [filter, setFilter] = useState<"all" | "above" | "below" | "aging">("all");
  const rows = useMemo(() => {
    if (filter === "above") return marketAnalysisRows.filter((r) => r.pricePosition > 0.3);
    if (filter === "below") return marketAnalysisRows.filter((r) => r.pricePosition < -0.1);
    if (filter === "aging") return marketAnalysisRows.filter((r) => r.daysOnLot >= 30);
    return marketAnalysisRows;
  }, [filter]);

  return (
    <section className="mp-card">
      <div className="mp-card__head">
        <div>
          <h2 className="mp-card__title"><Target size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Inventory market analysis</h2>
          <div className="mp-card__hint">{rows.length} units · vs. live competitive market · auto-refreshes every 6 hours</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Filter size={13} color="var(--mp-text-muted)" />
          <FilterChip label="All" active={filter === "all"} onClick={() => setFilter("all")} count={marketAnalysisRows.length} />
          <FilterChip label="Above market" active={filter === "above"} onClick={() => setFilter("above")} count={marketAnalysisRows.filter((r) => r.pricePosition > 0.3).length} />
          <FilterChip label="Below market" active={filter === "below"} onClick={() => setFilter("below")} count={marketAnalysisRows.filter((r) => r.pricePosition < -0.1).length} />
          <FilterChip label="Aging > 30d" active={filter === "aging"} onClick={() => setFilter("aging")} count={marketAnalysisRows.filter((r) => r.daysOnLot >= 30).length} />
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="mp-table mp-table-compact">
          <thead>
            <tr>
              <th>Stock</th>
              <th>Vehicle</th>
              <th className="mp-num">Kilometres</th>
              <th className="mp-num">Listed</th>
              <th className="mp-num">Market avg</th>
              <th>Position</th>
              <th className="mp-num">Comps</th>
              <th className="mp-num">Days on lot</th>
              <th className="mp-num">Est. days to turn</th>
              <th>Recommended action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <MarketRow key={r.vin} row={r} />
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 10, color: "var(--mp-text-faint)", marginTop: 8, fontWeight: 500 }}>
        Source: AutoTrader.ca scrape · refreshed every 6h · BC + lower mainland radius
      </div>
    </section>
  );
}

function MarketRow({ row }: { row: MarketAnalysisRow }) {
  const delta = row.listed - row.marketAvg;
  const positiveDelta = delta > 0;
  const actionTone =
    row.action === "Hold" ? "" :
    row.action === "Promote" ? "mp-badge-success" :
    row.action === "Move to wholesale" ? "mp-badge-danger" :
    "mp-badge-warn";

  return (
    <tr>
      <td className="mp-mono" style={{ fontSize: 11 }}>{row.stock}</td>
      <td>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{row.vehicle}</div>
        <div style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>{row.trim} · <span className="mp-mono">{row.vin}</span></div>
      </td>
      <td className="mp-num mp-mono">{km(row.odoKm)}</td>
      <td className="mp-num"><strong>{money(row.listed)}</strong></td>
      <td className="mp-num mp-mono">{money(row.marketAvg)}</td>
      <td>
        <PositionBar position={row.pricePosition} />
        <div style={{ fontSize: 10, color: positiveDelta ? "var(--mp-danger)" : "var(--mp-info)", fontWeight: 700, marginTop: 2 }}>
          {positiveDelta ? "+" : ""}{money(delta)}
        </div>
      </td>
      <td className="mp-num mp-mono">{row.comps}</td>
      <td className="mp-num">
        <span className={`mp-badge ${row.daysOnLot > 45 ? "mp-badge-danger" : row.daysOnLot > 30 ? "mp-badge-warn" : ""}`}>{row.daysOnLot}d</span>
      </td>
      <td className="mp-num mp-mono">{row.estDaysToTurn}d</td>
      <td>
        <span className={`mp-badge ${actionTone}`}>{row.action}</span>
        {row.action !== "Hold" ? <button className="mp-btn mp-btn-sm" style={{ marginLeft: 6 }}>Apply</button> : null}
      </td>
    </tr>
  );
}

function PositionBar({ position }: { position: number }) {
  // -1..+1 → 0..100%
  const pct = Math.max(0, Math.min(100, (position + 1) * 50));
  const color = position > 0.3 ? "var(--mp-danger)" : position < -0.1 ? "var(--mp-info)" : "var(--mp-live)";
  return (
    <div className="mp-position-bar">
      <div className="mp-position-bar__center" />
      <div className="mp-position-bar__dot" style={{ left: `${pct}%`, background: color }} />
    </div>
  );
}

function FilterChip({ label, active, count, onClick }: { label: string; active: boolean; count: number; onClick: () => void }) {
  return (
    <button type="button" className={`mp-chip${active ? " is-active" : ""}`} onClick={onClick}>
      {label}
      <span className="mp-chip__count">{count}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// AI Content Generator — headline + subheadline + description
// ---------------------------------------------------------------------------

export function AIContentGenerator() {
  const [activeIdx, setActiveIdx] = useState(0);
  const content = aiContentSamples[activeIdx];
  const [headline, setHeadline] = useState(content.headline);
  const [sub, setSub] = useState(content.subheadline);
  const [desc, setDesc] = useState(content.description);
  const [generating, setGenerating] = useState(false);

  React.useEffect(() => {
    setHeadline(content.headline);
    setSub(content.subheadline);
    setDesc(content.description);
  }, [content]);

  function regenerate() {
    setGenerating(true);
    window.setTimeout(() => setGenerating(false), 600);
  }

  return (
    <section className="mp-card">
      <div className="mp-card__head">
        <div>
          <h2 className="mp-card__title"><Wand2 size={15} style={{ marginRight: 6, verticalAlign: -2 }} />AI listing generator</h2>
          <div className="mp-card__hint">Headline · subheadline · description per VDP · grounded in decoded VIN + Carfax + market</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <select value={activeIdx} onChange={(e) => setActiveIdx(Number(e.currentTarget.value))} className="mp-select">
            {aiContentSamples.map((c, i) => (
              <option key={c.vin} value={i}>{c.vehicle} · {c.trim}</option>
            ))}
          </select>
          <button className="mp-btn mp-btn-sm" onClick={regenerate} disabled={generating}>
            <Sparkles size={12} /> {generating ? "Generating…" : "Regenerate"}
          </button>
        </div>
      </div>

      <div className="mp-ai-meta">
        <span className="mp-badge mp-badge-brand"><Cpu size={10} /> {content.model}</span>
        <span style={{ fontSize: 11, color: "var(--mp-text-muted)" }}>Generated {content.generatedAt}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          {content.callouts.map((c) => <span key={c} className="mp-badge">{c}</span>)}
        </span>
      </div>

      <div className="mp-ai-fields">
        <Field label="Headline" sub="Used as VDP page title and Marketplace post title">
          <input className="mp-ai-input" value={headline} onChange={(e) => setHeadline(e.currentTarget.value)} />
        </Field>
        <Field label="Subheadline" sub="Second line · highlights features and value">
          <input className="mp-ai-input" value={sub} onChange={(e) => setSub(e.currentTarget.value)} />
        </Field>
        <Field label="Description" sub="Long-form for VDP body and Marketplace description">
          <textarea className="mp-ai-textarea" rows={6} value={desc} onChange={(e) => setDesc(e.currentTarget.value)} />
        </Field>
      </div>

      <div className="mp-tool__actions">
        <button className="mp-btn mp-btn-sm"><Copy size={12} /> Copy all</button>
        <button className="mp-btn mp-btn-sm"><Send size={12} /> Post to website</button>
        <button className="mp-btn mp-btn-sm mp-btn-action"><Sparkles size={12} /> Publish to Marketplace</button>
      </div>
    </section>
  );
}

function Field({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="mp-field">
      <div className="mp-field__label">
        {label}
        {sub ? <span className="mp-field__sub">{sub}</span> : null}
      </div>
      {children}
    </div>
  );
}
