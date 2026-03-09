# LotView Automation Overhaul — Work Breakdown (WBS)

## Phase 0 — Discovery + constraints (1–2 days)
0.1 Confirm required markets and workflows
- Craigslist regions/domains and posting categories
- Competitive report radius + target sources
- VIN decode fidelity + budget

0.2 Establish policy + compliance constraints
- Craigslist ToS / automation limitations
- Scraping policy for competitor sources
- Data retention and audit logging requirements

**Dependencies:** user answers for the few blocking inputs.

---

## Phase 1 — Craigslist extension (Assisted Autopost) (3–7 days)
1.1 Extension architecture alignment
- Formalize cross-platform `PostingJob` shape (reuse existing)
- Ensure consistent logging and error codes

1.2 Implement Craigslist driver
- Manifest: host permissions + content script matches
- Background driver: open tab, inject script, message-based fill
- Content script: step detection + field fill

1.3 Image upload pipeline
- Prefer normal file-input interaction
- Fallback to Debugger `DOM.setFileInputFiles`
- Enforce limits (count/size) and user-visible errors

1.4 UX + safety gates
- UI: “Craigslist assisted mode” explanation
- Hard stop at preview step; user must click Publish
- Provide “Resume” if flow interrupted

1.5 Robustness + QA
- Selector map + regression fixtures
- Manual test checklist across 2–3 Craigslist locales
- Telemetry via existing `LOG_POSTING`

**Dependencies:** access to Craigslist flow in browser (manual testing); user approval if any external automation is attempted beyond local DOM fill.

---

## Phase 2 — Competitive report (every 2 days) (5–10 days)
2.1 Data model + storage
- Tables for report snapshots and per-unit metrics
- Parameterization: radius, zipcode, market, sources

2.2 Data acquisition layer
- Decide primary market data source (API preferred)
- Implement connectors (API client) and caching
- Fallback scraping plan behind feature flag + approval

2.3 Computation
- For each unit: select comps, compute stats, compute “pricing position”
- Detect outliers and low-confidence cases

2.4 Report rendering
- In-app summary (table, filters)
- Export: CSV (required), PDF optional

2.5 Scheduling
- Cron/worker runs every 48 hours per dealership
- Idempotency and retry rules
- Observability: job logs + admin status

2.6 Acceptance + QA
- Golden dataset tests for computations
- Timing: completes within acceptable window for inventory sizes (10–200 units)

**Dependencies:** chosen data sources; may require paid API keys (approval).

---

## Phase 3 — Appraisal comps engine + VIN decode (10–20 days)
3.1 VIN decode pipeline
- Multi-source decode strategy
- Normalization schema (`VehicleSpecNormalized`)
- Confidence scoring per decoded attribute

3.2 Comps ingestion
- Prefer API(s) for listings + sold data if possible
- Normalize and dedupe listings

3.3 Matching + scoring
- Candidate retrieval via search facets
- Similarity scoring + weighting
- Price band recommendation + confidence

3.4 UX integration
- Appraisal screen: VIN decode preview, comps table, adjustments
- Explainability (“why matched”)

3.5 QA
- VIN decode regression fixtures
- Comps scoring tests and outlier handling

**Dependencies:** VIN decoder vendor/API and comps data source (approval).

---

## Phase 4 — Rollout + operations (2–5 days)
- Feature flags per dealership
- Admin kill-switch
- Support docs + troubleshooting playbooks
- Monitoring and alerting thresholds
