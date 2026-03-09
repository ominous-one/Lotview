# LotView Automation Overhaul — Researcher Critique (v0)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Critiqued package:**
> - `plans/automation-overhaul/ARCHITECT_PLAN_PACKAGE.md`
> - `plans/automation-overhaul/DELIVERABLE_MATRIX.md`
> - `plans/automation-overhaul/SPAWN_PLAN.md`
>
> **User constraints incorporated (hard requirements):**
> 1) Craigslist dealer posting areas: **Tri-Cities BC, Surrey BC, Whistler area**.
> 2) Competitive report radius default **100km**, selectable **250/500/1000/national**.
> 3) VIN decode must support **exact trim/options** (not just year/make/model/engine).

---

## Deliverables index (this task)

| Deliverable | Path | Status |
|---|---|---|
| Researcher critique (this document) | `plans/automation-overhaul/RESEARCHER_CRITIQUE.md` | ✅ Delivered |

---

## DoD Contract

### 0) Scope + assumptions
- **In scope:** Critique completeness/risks + provide online alternatives for (a) Craigslist MV3 automation, (b) Canadian competitive pricing intelligence sources, (c) VIN decode (exact trim/options).
- **Out of scope:** Any posting/scraping at scale, paid trials, account logins, or vendor onboarding.
- **Assumptions:** LotView can run a backend scheduler/worker; extension is MV3; dealership inventory is addressable with lat/lng for radius queries.
- **Inputs needed (if any):** None to produce this critique. (See “Blocking questions” for what the architect plan should ask.)

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\RESEARCHER_CRITIQUE.md`
  - Contains: critique, missing deliverables + QA gates, 3 options per workstream with pros/cons, templates/schemas, citations, and Gap Report.

### 2) Acceptance criteria
- File exists at the exact path above.
- Critique explicitly calls out risky assumptions and missing gates/deliverables.
- Provides **3 viable options per workstream** with **pros/cons** across: **cost, reliability, compliance, time-to-ship**.
- Incorporates the 3 user constraints verbatim (areas, radii, trim/options).
- Includes citations/links for key external constraints (Craigslist ToU, MV3 SW lifecycle, vendor capability pages).

### 3) Validation steps
- Re-open this file and spot-check:
  - Links are included for major claims.
  - The required constraints appear and are reflected in recommendations.
  - A **Gap Report** exists at end with auto-fill.

### 4) Gap report + auto-fill
- Included at end.

### 5) External side effects policy
- No logins/purchases/scraping/posting performed.

---

## 1) Executive critique summary

### What’s strong in the architect package
- Correctly anticipates **Craigslist fragility** and proposes **assisted autopost** (user publishes), which is the only remotely supportable posture given Craigslist’s explicit restrictions.
- Unifies platforms around a **posting job contract** (good reuse across Facebook/Craigslist).
- Calls out core QA gates (idempotency, snapshotting, deterministic scoring).

### Biggest gaps / risky assumptions (high impact)
1) **Craigslist ToU conflicts with automation** even in “assisted” mode.
   - Craigslist’s Terms of Use prohibit using or providing software *other than general-purpose web browsers* to interact with Craigslist (including posting/uploading) unless licensed in a separate agreement.
   - Citation: Craigslist ToU “USE” section: https://www.craigslist.org/about/terms.of.use/en
   - Implication: the plan needs an explicit **legal/compliance gate** and a **fallback operational mode** (manual posting with copy/export) if automation is disallowed or accounts get flagged.

2) **No explicit data schema deliverables** for the two data-heavy tracks (competitive report + comps engine).
   - You will need normalized schemas, caching + TTL, geospatial indexing, and a clear source-of-truth policy (API vs scrape).

3) **VIN “exact trim/options” requirement is not guaranteed by VIN alone**.
   - Even “good” VIN decoders sometimes need OEM order codes / option codes to truly identify packages/options.
   - The plan should explicitly include a **multi-source VIN+build pipeline** and UX expectations when “exact options” cannot be resolved.
   - DataOne (example) describes “vehicle decoders” that use extra inputs (model number, package code, option codes) to identify optional installed equipment. Citation: https://vin.dataonesoftware.com/vin_basics_blog/bid/146754/why-you-shouldn-t-settle-for-a-vin-decoder-that-just-decodes-the-vin

4) **Missing ops/observability gates**.
   - For all three workstreams you need: rate limiting, retries with jitter, alerting, vendor outage behavior, tenant quotas, and audit trails (especially for posting automation).

---

## 2) Craigslist posting automation (MV3 extension) — constraints + best practices

### 2.1 External constraint: Craigslist Terms of Use (material risk)
Craigslist’s ToU says (paraphrased): unless you have a separate license agreement, you agree not to use or provide software (except their app and general purpose browsers/email clients) that interacts with Craigslist for downloading/uploading/posting/account actions, and not to copy/collect content via automation.
- Citation: https://www.craigslist.org/about/terms.of.use/en

**Bottom line:** any “autoposting extension” is at risk of ToU violation and account blocking. The plan should treat this as a **launch risk** and include a compliance decision.

### 2.2 MV3 reliability constraints relevant to posting flows
Manifest V3 uses **extension service workers** that load/unload and can shut down when idle; they can’t access DOM; long flows must be event-driven and resilient.
- Citation (Chrome Extensions docs): https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/

### 2.3 Recommended Craigslist flow posture (most defensible)
If proceeding without a Craigslist license:
- “Assisted autopost” should be reframed as:
  - **User-in-the-loop** at each major step (location/category/details/images/review)
  - **No background batch posting**
  - Clear UI warnings (“may violate Craigslist ToU; use at your discretion; your account may be limited”) — coordinate with counsel.
- Provide a **non-automation alternative** that still saves time:
  - Export-ready post package (title/body/images) and a “copy to clipboard” + “open posting page” deep-link.

### 2.4 Required geographic constraint implementation (areas)
The plan currently asks “which domain” but must encode the actual *areas*:
- Dealer posting areas required at launch:
  - **Tri-Cities BC** (Coquitlam / Port Coquitlam / Port Moody)
  - **Surrey BC**
  - **Whistler area**

Craigslist Vancouver region has subareas such as **delta/surrey/langley**, **whistler**, **squamish**, etc. (Exact labels/IDs can change.)

**Missing deliverable:** a maintained **Area Mapping Table** describing:
- Market domain (likely `vancouver.craigslist.org`)
- Subarea label/value used in the posting flow
- Which LotView dealership locations map to which posting area
- Fallback when mapping fails (prompt user)

---

## 3) Competitive pricing report (Canada, 100–1000km + national)

### 3.1 Required report parameters (must be in spec)
Hard requirements to add into the report spec:
- Default radius: **100 km**
- User selectable: **250 / 500 / 1000 km / national**
- Include the dealership’s own location (lat/lng) as the center.
- Output should show **comp count**, **median**, **p25/p75**, and a **confidence** indicator.

**Missing QA gate:** verify radius units (km) end-to-end and ensure UI copy doesn’t mix miles.

### 3.2 3 viable sourcing options (with pros/cons)

#### Option A — MarketCheck APIs (listings + market comps + VIN decode)
- What it is: MarketCheck provides vehicle listings and related APIs; claims US + Canada coverage; includes listing history, and has VIN decoder options.
- Citations:
  - Coverage statement and listing history: https://www.marketcheck.com/apis/
  - Pricing per call (visible on same page): https://www.marketcheck.com/apis/

**Pros**
- **Time-to-ship:** fast (API-first), simplest for 48h scheduled reports.
- **Reliability:** vendor-managed ingestion/normalization; avoids brittle scraping.
- **Coverage:** marketed as US+Canada; includes listing change history.

**Cons / risks**
- **Cost:** pay-per-call; costs scale with dealer count * inventory * radii queries.
- **Compliance:** still must comply with their data license; less ToS risk than scraping, but you must ensure allowed usage in your product.
- **Data fit:** “comps” depend on their matching; may need additional normalization for exact trim/options.

**Best fit**
- Competitive report MVP and initial comps engine (especially if you want to avoid building a crawler).

#### Option B — Canadian Black Book (CBB) Retail Market Insights API (listings mapped to trim)
- What it is: CBB’s Retail Market Insights API advertises retail listings mapped to vehicle descriptions “down to the trim level,” with market stats and listing metadata.
- Citation: https://www.canadianblackbook.com/api/

**Pros**
- **Canada-native** brand; good for Canada-first positioning.
- **Trim-level mapping** is explicitly called out.
- Provides market-style metrics (days on market, price changes, median/mean), which align well with a manager report.

**Cons / risks**
- **Access/commercial:** likely enterprise sales + contract lead time.
- **Coverage nuance:** confirm coverage for BC markets and independent dealers; not all private marketplaces may be included.
- **Integration:** auth/onboarding and field semantics may be more “enterprise.”

**Best fit**
- Canada-focused competitive reporting with fewer engineering hacks.

#### Option C — DIY ingestion (targeted scraping / data brokers) for key marketplaces
- What it is: crawl/ingest listings from major Canadian marketplaces (AutoTrader.ca, Kijiji Autos, dealer sites, possibly Facebook Marketplace) and compute comps.

**Pros**
- **Cost control:** potentially cheaper than API at scale if you can run your own pipeline.
- **Custom scoring:** you own the matching logic and can tune to dealership needs.

**Cons / risks**
- **Compliance/ToS risk:** scraping marketplaces is frequently prohibited; legal review required.
- **Reliability:** constant breakage; anti-bot/captcha.
- **Time-to-ship:** slow; high ops burden.

**Best fit**
- Long-term moat if you can get explicit licenses/feeds; otherwise risky.

---

## 4) VIN decode + exact trim/options (better than “vAuto-level”)

### Reality check: VIN alone may not guarantee exact options
Many OEM options/packages are not fully encoded in the VIN; “exact” often requires OEM order/option codes, build sheet / window sticker, or DMS feed enrichment.
- DataOne describes using OEM model numbers, package codes, option codes to identify optional equipment; availability is the catch. Citation: https://vin.dataonesoftware.com/vin_basics_blog/bid/146754/why-you-shouldn-t-settle-for-a-vin-decoder-that-just-decodes-the-vin

### 3 viable provider strategies

#### Option A — J.D. Power ChromeData (VIN decoding + OEM build info)
- What it is: ChromeData (J.D. Power Autodata Solutions) is widely used for VIN decoding and OEM build/option data.
- Citation (capability claims re: OEM build info + options/packages): Odessa + J.D. Power announcement: https://www.odessainc.com/newsroom/jd-power-automotive-data-collaboration/

**Pros**
- **Fidelity:** explicitly positioned around model/trim and “which options, features, and packages are included.”
- **Reliability:** established enterprise provider.

**Cons / risks**
- **Cost:** typically premium/enterprise pricing.
- **Sales cycle:** contracting can take time.
- **Canada coverage:** likely good but must be verified for Canada-market builds and bilingual descriptors.

**Best fit**
- If “exact trim/options” is truly non-negotiable.

#### Option B — DataOne “vehicle decoder” strategy (VIN + extra inputs where available)
- What it is: DataOne positions advanced decoding as accepting additional OEM codes to improve exact match and optional equipment identification.
- Citations:
  - DataOne overview: https://www.dataonesoftware.com/
  - Blog describing additional inputs for options/packages: https://vin.dataonesoftware.com/vin_basics_blog/bid/146754/why-you-shouldn-t-settle-for-a-vin-decoder-that-just-decodes-the-vin

**Pros**
- **Pragmatic:** can improve beyond VIN-only when you have extra fields (from DMS, door-jamb stickers, etc.).
- **Time-to-ship:** potentially faster than the most expensive OEM-build providers.

**Cons / risks**
- **Exactness depends on extra inputs** you may not have.
- **Canada coverage** must be validated.

**Best fit**
- When you can obtain DMS/inventory feed fields (model number, option codes) for at least a subset of vehicles.

#### Option C — MarketCheck NeoVIN / enhanced decoders (paired with their listings data)
- What it is: MarketCheck provides NeoVIN ("Capture automotive build data at VIN level") and enhanced decoder endpoints.
- Citation: https://www.marketcheck.com/apis/

**Pros**
- **Bundled:** one vendor can supply both listing comps + enhanced decode.
- **Time-to-ship:** simplest integration if you already choose MarketCheck for competitive reports.

**Cons / risks**
- **Verification needed:** “build data at VIN level” marketing still must be validated against your “exact options” requirement.
- **Cost:** enhanced decoders are materially more expensive per call (see pricing table on MarketCheck API page).

**Best fit**
- Fast MVP where “pretty accurate” is acceptable with a roadmap to ChromeData if needed.

---

## 5) Missing deliverables (to add to matrix) + why they matter

These are gaps I recommend adding explicitly to `DELIVERABLE_MATRIX.md` (or producing as additional specs):

### 5.1 Cross-cutting (all workstreams)
1) **Data schemas + contracts**
   - `plans/automation-overhaul/schemas/POSTING_JOB.schema.json`
   - `plans/automation-overhaul/schemas/COMPETITIVE_REPORT.schema.json`
   - `plans/automation-overhaul/schemas/VEHICLE_SPEC_NORMALIZED.schema.json`
   - `plans/automation-overhaul/schemas/COMP.schema.json`

2) **Rate limiting + caching policy**
   - Define TTLs per vendor endpoint.
   - Define per-tenant quotas to cap cost.

3) **Observability runbook**
   - dashboards/alerts: job failures, vendor error rates, cost anomalies, account lockouts.

4) **Security + privacy notes**
   - what data goes into extension logs; PII minimization.

### 5.2 Craigslist-specific
1) **Compliance decision record (CDR)**
   - documents ToU risk + final decision + counsel sign-off.
2) **Fallback mode spec**
   - “Copy/export + open Craigslist posting page” mode.
3) **Area mapping table** (Tri-Cities/Surrey/Whistler) with test cases.

### 5.3 Competitive report
1) **Report template** (CSV columns + PDF layout outline)
2) **Geospatial computation spec**
   - km radii; bounding-box prefilter + haversine; national mode uses province or all Canada.
3) **Data quality gates**
   - exclude outliers, stale listings; minimum comp count; confidence scoring.

### 5.4 VIN decode/comps engine
1) **Field-level truth table**
   - for each spec attribute (trim, drivetrain, options), which source wins and under what confidence.
2) **Explainability payload spec**
   - reasons a comp matched, which fields matched/assumed.

---

## 6) Missing QA gates (concrete, testable)

### 6.1 Craigslist posting
- **Account-state detection QA:** logged out / phone verification / captcha / posting limit pages.
- **Publish prevention gate:** ensure the extension never clicks final publish.
- **Selector change monitoring:** record unknown step DOM snapshots (sanitized) for quick patching.
- **Area selection regression suite:** verify Tri-Cities / Surrey / Whistler path works.

### 6.2 Competitive report
- **Idempotency + snapshot correctness:** rerun generates identical report id for same params.
- **Unit tests on km radii:** 100/250/500/1000/national.
- **Vendor outage behavior:** last-known-good snapshot retained; report marked stale.

### 6.3 VIN decode + comps
- **Golden VIN set tests:** ~50 VINs across makes/years with expected trim/options.
- **Option-resolution confidence:** if exact options can’t be confirmed, UI must say so.
- **Deterministic scoring tests:** same input → same ranking.

---

## 7) Suggested templates / schemas (add to specs)

### 7.1 Competitive report CSV column template (MVP)
Recommended columns:
- `report_id`, `generated_at`, `dealer_id`, `radius_km`, `source_vendor`
- `stock_number`, `vin`, `year`, `make`, `model`, `trim`
- `your_price`, `your_mileage`, `your_dom`
- `comp_count`, `comp_median_price`, `comp_p25_price`, `comp_p75_price`
- `price_position` (under/at/over), `delta_to_median`
- `confidence` (low/med/high)

### 7.2 Normalized vehicle spec shape (for VIN + comps matching)
```json
{
  "vin": "1HGBH41JXMN109186",
  "year": 2021,
  "make": "Toyota",
  "model": "RAV4",
  "trim": "XLE Premium",
  "body": "SUV",
  "drivetrain": "AWD",
  "engine": "2.5L I4",
  "transmission": "8A",
  "fuel": "Gasoline",
  "doors": 4,
  "options": [
    {"code": "PKG1", "name": "Technology Package", "confidence": "confirmed", "source": "oem_build"}
  ],
  "decode_sources": [
    {"source": "chromedata", "confidence": "high"},
    {"source": "nhtsa_vpic", "confidence": "low"}
  ]
}
```

### 7.3 Caching / cost control (rules of thumb)
- VIN decode results: cache by VIN for **30–180 days**.
- Competitive comps: cache by `(vehicleSpecNormalized, radius_km, geography)` for **24–48h** (matches report cadence).
- Hard cap daily vendor spend per tenant (configurable).

---

## 8) Concrete critique of current deliverable matrix / spawn plan

### 8.1 Deliverable matrix improvements
Add rows for:
- Schemas (`schemas/*.schema.json`) and report templates.
- Compliance decision record (Craigslist ToU).
- Golden datasets and automated test harness plan (VIN + radius tests).

### 8.2 Spawn plan improvements
Researcher stream should explicitly produce:
- A Craigslist ToU risk memo (already listed in matrix) **plus** a fallback “manual export” spec.
- A VIN decoder evaluation that includes **exact options** reality and a plan for “unresolvable options.”

---

## 9) Blocking questions the architect plan should ask (minimal)
1) Craigslist: do we accept ToU risk of an autoposting extension without an explicit Craigslist license agreement?
2) Posting areas: confirm the exact Craigslist domain(s) and the subareas to use for Tri-Cities / Surrey / Whistler.
3) Competitive report: Canada-only vs Canada+US cross-border comps (BC dealers often compete with WA).
4) VIN decode: what percentage of vehicles must have “confirmed options” vs “best-effort,” and do we have DMS feed fields beyond VIN?

---

## Links / Citations
- Craigslist Terms of Use (automation/software restriction): https://www.craigslist.org/about/terms.of.use/en
- Chrome Extensions MV3 service worker lifecycle (loaded/unloaded, no DOM): https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/
- MarketCheck APIs (US+Canada coverage, listing history, decoder pricing table): https://www.marketcheck.com/apis/
- Canadian Black Book APIs (Retail Market Insights mapped to trim): https://www.canadianblackbook.com/api/
- DataOne discussion of using OEM codes to identify options/packages: https://vin.dataonesoftware.com/vin_basics_blog/bid/146754/why-you-shouldn-t-settle-for-a-vin-decoder-that-just-decodes-the-vin
- Odessa + J.D. Power ChromeData (options/packages + OEM build info): https://www.odessainc.com/newsroom/jd-power-automotive-data-collaboration/

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items (relative to this task’s DoD)
- None. This critique file was produced with options, risks, QA gaps, and citations.

### Why missing
- N/A

### Auto-fill action
- N/A
