# LotView Automation Overhaul — Cheapest Options Research (v1)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Purpose:** follow-up research focused on **best-but-cheapest** vendor/API options and **open-source scrapers/automation**.
>
> **Must-keep constraints (verbatim):**
> 1) Craigslist dealer posting areas: **Tri-Cities BC, Surrey BC, Whistler area**.
> 2) Competitive report radius default **100km**, selectable **250/500/1000/national**.
> 3) VIN decode must support **exact trim/options** (not just year/make/model/engine).

---

## Deliverables index (this task)

| Deliverable | Path | Status |
|---|---|---|
| Cheapest options research (this document) | `plans/automation-overhaul/CHEAPEST_OPTIONS_RESEARCH.md` | ✅ Delivered |

---

## DoD Contract

### 0) Scope + assumptions
- **In scope:**
  - (1) VIN decode (exact trim/options) options for **Canada coverage**: cheapest viable vendors + open-source approaches; rough **cost per VIN** and **minimums** where publicly available.
  - (2) Competitive inventory/pricing sources that can work in **Canada** with radii **100/250/500/1000/national**: API availability, scraping feasibility, and cost notes.
  - (3) Craigslist posting automation: existing GitHub/Apify options; maintainability + ToS risk assessment.
  - (4) ZenRows fit: whether it helps for **scraping competitor listings** (not posting) + recommended architecture (caching, rate limits).
- **Out of scope:**
  - Signing contracts, requesting quotes, paid trials, credentialed scraping, or any live scraping/posting.
  - Legal advice; ToS risk is described, not “cleared”.
- **Assumptions:**
  - LotView can cache VIN decodes by VIN and cache comp queries per (normalized vehicle, radius, geo).
  - “National” mode means all Canada (all provinces) unless user chooses cross-border.
- **Inputs needed (if any):**
  - None to deliver this research file.

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\CHEAPEST_OPTIONS_RESEARCH.md`
  - Contains: cheapest vendor options, open-source approaches, cost estimates (where public), citations, and a Gap Report.

### 2) Acceptance criteria
- File exists at the exact path above.
- Includes **DataOne vs ChromeData vs Canadian Black Book vs NHTSA+OEM** discussion with **Canada-specific limitations**.
- Includes competitive sources: **MarketCheck, CarGurus, AutoTrader.ca, FB Marketplace, Kijiji, Craigslist**.
- Includes Craigslist posting: **existing GitHub projects / Apify actors** + maintainability/ToS risk.
- Includes ZenRows recommendation + architecture with caching + rate limiting.
- Contains a **Deliverables index table + Gap Report**.

### 3) Validation steps
1) Re-open the deliverable file at the exact path above.
2) Spot-check: includes pricing figures where publicly available and clearly marks “quote-only” where not.
3) Verify the 3 hard requirements appear and are used in recommendations.
4) Spot-check links open (MarketCheck pricing page, DataOne VIN decoder page, NHTSA vPIC API page, ZenRows pricing docs).

### 4) Gap report + auto-fill
- Included at end.

### 5) External side effects policy
- No logins/purchases/scraping/posting performed.

---

## 1) VIN decode with exact trim/options (Canada coverage) — cheapest viable paths

### 1.1 Reality check: “exact trim/options” is not guaranteed by VIN alone
- Many options/packages are not fully encoded in the VIN; “option-level” decoding often requires **as-built / OEM build data** or a vendor’s **vehicle-specific record** layer.
- NHTSA vPIC is useful and free, but it’s fundamentally a manufacturer-submitted catalog and does not reliably provide **installed optional equipment**.

**Implication for cheapest strategy:**
- Use a **two-tier** approach:
  1) **Free/cheap baseline decode** (NHTSA vPIC / pattern-based) for everyone.
  2) **Paid option-level decode** only when required (e.g., comp-matching confidence, window sticker display, feature checklists).

---

### 1.2 Option A (cheapest public $/VIN with Canada-friendly positioning): MarketCheck Basic VIN Decoder + targeted NeoVIN upgrades
MarketCheck publishes per-call pricing and explicitly states inventory coverage includes **US and Canada**.

**Pricing (public):**
- Basic VIN Decoder API: **$0.0015 / call**.
- NeoVIN Enhanced Decoder API: **$0.08 / call**.
- Minimum monthly subscription tiers (public):
  - Basic plan: **$299/month** (includes 5,000 calls/month; 100-mile radius restriction)
  - Standard plan: **$749/month** (unlimited calls; 500-mile radius restriction)
  - Enterprise: custom; no radius restriction.

Citations:
- MarketCheck pricing page (tiers + endpoint prices): https://www.marketcheck.com/apis/pricing/
- MarketCheck APIs page (coverage statement “across every dealership in the US and Canada” + endpoint list): https://www.marketcheck.com/apis/

**Cost framing (rough):**
- If you decode 10,000 VINs/month:
  - Basic decode calls cost: 10,000 × $0.0015 = **$15/month** (plus subscription).
  - If you “upgrade” 20% of VINs to NeoVIN: 2,000 × $0.08 = **$160/month**.
  - Total vendor spend dominated by subscription tier, not per-call cost.

**Canada coverage considerations:**
- MarketCheck’s core business is listings aggregation; “VIN build data at VIN level” (NeoVIN) must be validated on a **Canada-market VIN set** (BC inventory includes Canada-market trims/packages).

**Why this is “best-but-cheapest”:**
- Only vendor in this set with **transparent pricing** down to the penny and a clear “upgrade path” for exact options.

---

### 1.3 Option B (best fidelity, usually not cheapest): J.D. Power ChromeData (OEM build/option focus)
ChromeData is commonly used in automotive enterprise stacks for VIN descriptions, trims and equipment, and OEM build validation; however **pricing is typically quote-only** and tends to be premium.

**Cheapest positioning note:**
- ChromeData is often the *correct* answer for “exact options” at scale, but it is rarely the cheapest quick-start.

**Canada-specific considerations:**
- Must confirm:
  - coverage for Canada-market trims (sometimes distinct from US),
  - bilingual descriptors (EN/FR) if required,
  - whether “as-built” coverage varies by OEM.

(Unable to fetch JD Power’s page directly in this environment due to Cloudflare blocking; use the Odessa + J.D. Power collaboration citation already referenced in the critique as a capability indicator.)

---

### 1.4 Option C (option-level decode vendor with explicit claim): DataOne VIN Decoder API (OEM Build Data + “Verified Records”)
DataOne explicitly markets **exact trim match and installed optional equipment**, and describes **option-level VIN decoding** including options/packages unique to the vehicle.

Citations:
- DataOne VIN Decoder API page (trim + installed optional equipment; option-level decoding): https://www.dataonesoftware.com/web-services-vin-decoder-api

**Cost/minimums:**
- **Quote-only publicly** (no list pricing).

**Cheapest positioning note:**
- DataOne can be “cheaper than ChromeData” in some cases, but without public pricing it should be treated as a **bid/quote** track.

**Canada-specific considerations:**
- Validate:
  - which OEMs provide **OEM Build Data** for Canada-market vehicles,
  - whether “Verified Records” cover Canada-market packaging differences.

---

### 1.5 Option D (Canada-native data products, enterprise sales): Canadian Black Book (CBB) APIs
CBB’s Retail Market Insights positions retail listings mapped to vehicle descriptions “down to the trim level,” and includes optional/standard features in responses (per their API page).

Citations:
- Canadian Black Book API page (Retail Market Insights + trim-level mapping; features fields): https://www.canadianblackbook.com/api/

**Cost/minimums:**
- **Quote-only** publicly.

**Cheapest positioning note:**
- CBB is unlikely to be “cheapest” for a small MVP but may reduce engineering cost if it provides Canada-first comps + trim mapping reliably.

---

### 1.6 Option E (free / open-source baseline): NHTSA vPIC (+ offline DB) for pattern-level decode
NHTSA’s vPIC API is free and supports VIN decoding endpoints, with downloadable standalone databases.

Citations:
- vPIC API overview: https://vpic.nhtsa.dot.gov/api/

**What it can do well (cheap):**
- Year/make/model-ish variables, WMI decode, manufacturer-submitted variables.
- Good baseline normalization layer and a “sanity check” source.

**What it cannot reliably do (gap vs requirement):**
- Confirm “installed optional equipment/packages” for a specific vehicle.

**Open-source wrappers / offline approaches (cheap engineering wins):**
- Python: `Wal33D/nhtsa-vin-decoder` (wrapper + offline WMI fallback): https://github.com/Wal33D/nhtsa-vin-decoder
- Python: `davidpeckham/vpic-api`: https://github.com/davidpeckham/vpic-api
- TypeScript (offline, customized vPIC DB): `cardog-ai/corgi`: https://github.com/cardog-ai/corgi

**Cheapest architecture recommendation (VIN decode):**
- Implement a **VIN Decode Router**:
  - Always: vPIC decode (free) → normalized base fields.
  - If business logic demands “exact options”: call paid option-level decoder (MarketCheck NeoVIN or DataOne/ChromeData) and cache result by VIN 90–180 days.

---

## 2) Competitive inventory / pricing sources for Canada (radii 100/250/500/1000/national)

### 2.1 What “radius support” actually requires
To support 100/250/500/1000 km and national:
- listings must have **location** (lat/lng or at least city+province postal centroid),
- source must allow query-by-location or you must ingest + geocode + filter yourself.

**Cheapest strategy:**
- Prefer sources that already provide a **radius query** (MarketCheck does, but in miles and with tier radius caps).
- For sources without a radius API: ingest listings (API/scrape) + compute distance yourself.

---

### 2.2 MarketCheck (API-first, public pricing; best “cheap & shippable” for Canada/US)
MarketCheck explicitly claims coverage “across every dealership in the US and Canada,” and publishes endpoint pricing.

Citations:
- Coverage statement and endpoints list: https://www.marketcheck.com/apis/
- Endpoint pricing and plan restrictions: https://www.marketcheck.com/apis/pricing/

**Relevant pricing (public):**
- Inventory Search API: **$0.002 / call**
- Dealer API: **$0.0025 / call**
- Private Party Inventory Search: **$0.01 / call** (explicitly “across the US and Canada”)
- Plan radius restrictions:
  - Basic: **100 miles** radius cap
  - Standard: **500 miles** radius cap
  - Enterprise: “no radius restriction”

**Cheapest “meets requirement” mapping:**
- 100 km ≈ 62 mi → fits Basic.
- 250 km ≈ 155 mi → exceeds Basic; needs Standard/Enterprise or multiple calls/tiling.
- 500 km ≈ 311 mi → fits Standard.
- 1000 km ≈ 621 mi → exceeds Standard; needs Enterprise (or tiling + dedupe).
- National → effectively needs Enterprise or bulk feed approach.

**Key gotcha:** MarketCheck’s published restrictions are in **miles**, while LotView requirement is **km**. Implementation must convert and enforce.

---

### 2.3 Craigslist (easiest to scrape; cheapest; but incomplete for dealer inventory)
- Craigslist does not provide a standard public “listings API”, but it is historically **scrape-friendly** (HTML + RSS feeds per search in many areas).
- It can support radius-style queries using Craigslist’s own search filters where available; otherwise you can query by region/subarea.

**Cost:**
- $0 vendor cost if you scrape; engineering/ops costs apply.

**Feasibility:**
- Technically feasible; reliability moderate.

**Compliance/ToS:**
- ToS is strict about automation and software interaction; scraping may violate terms.

---

### 2.4 CarGurus (no official public API; scraping is the usual route)
- Public consensus across scraping vendors is that CarGurus does **not** offer an official public API; access is usually via scraping/unofficial endpoints.

Citation (scraping vendor statement):
- ScrapingBee notes “CarGurus does not offer an official API for public use” (secondary source): https://www.scrapingbee.com/scrapers/cargurus-api/

**Cost:**
- No official API cost; scraping costs via providers (ZenRows/ScrapingBee/BrightData/Apify) and engineering maintenance.

**Canada note:**
- CarGurus is Canada-relevant, but marketplace coverage and location granularity must be validated.

---

### 2.5 AutoTrader.ca (Canada-critical; official API not generally available publicly)
- There is no widely documented public AutoTrader.ca listings API for third parties; most solutions are scraping or data partnership.
- Be careful: many “autotrader api” repos target **AutoTrader.com (US)**, not **AutoTrader.ca**.

**Cost:**
- Partnership/feed: quote-only.
- Scraping: infra + anti-bot costs.

**Feasibility:**
- Technically possible but often **protected** (bot defenses), which increases cost and fragility.

---

### 2.6 Facebook Marketplace (no official public API; heavy anti-bot; login walls)
- No official public listings API.
- Scraping is difficult due to auth, dynamic content, and anti-bot controls.

Examples (third-party tooling):
- Apify Facebook Marketplace Scraper: https://apify.com/apify/facebook-marketplace-scraper
- OSS (Playwright-based) example project: https://github.com/passivebot/facebook-marketplace-scraper

**Cheapest positioning note:**
- FB Marketplace is often “expensive” operationally (proxy, rendering, auth), even if a scraper tool is cheap per request.

---

### 2.7 Kijiji / Kijiji Autos (Canada-relevant; no official public API)
- No official public API is generally available for 3P use.
- There are open-source projects aimed at posting/reposting, suggesting private endpoints or automation.

Examples:
- `adrienverge/kijijiapi` (posting robot): https://github.com/adrienverge/kijijiapi

**Feasibility:**
- Scraping feasible but will be an arms race; anti-bot varies.

---

### 2.8 Cheapest “good enough” recommendation (competitive report MVP)
**If you want lowest engineering + predictable cost with Canada support:**
- Start with **MarketCheck** for dealer inventory comps + optionally private party search, because pricing and endpoints are clear.

**If you want “cheapest vendor spend at all costs” and accept ToS/fragility risk:**
- Scrape **Craigslist** and (selectively) **Kijiji** and/or **FB Marketplace** using a scraping platform, but expect ongoing maintenance.

---

## 3) Craigslist posting automation — existing projects/actors + maintainability + ToS risk

### 3.1 ToS risk baseline
Craigslist Terms of Use restrict using/providing software other than general-purpose browsers to interact with Craigslist (including posting/uploading/account actions) unless separately licensed.
- Craigslist ToU: https://www.craigslist.org/about/terms.of.use/en

**Assessment:** any automated posting bot (Selenium/Playwright/extension) is **high ToS risk**.

---

### 3.2 Existing GitHub projects (posting/renewal automation)
These are useful as references for flow shape and selectors, but most are **unmaintained** and inherently brittle.

- `clickthisnick/CraigLister` — “Automatically post to craigslist every 72 hours with selenium”
  - https://github.com/clickthisnick/CraigLister
- `notmike101/craigslist-poster` — Selenium-based auto posting
  - https://github.com/notmike101/craigslist-poster
- `Wingman4l7/relisterine` — auto-renew Craigslist ads
  - https://github.com/Wingman4l7/relisterine
- `6aiaman/automate_craigslist` — Selenium posting
  - https://github.com/6aiaman/automate_craigslist

**Maintainability assessment:**
- High churn risk: selector changes, captcha/phone verification, account throttles.
- Operational risk: once a dealer account is flagged, recovery is difficult.

**Recommendation for LotView (aligns with critique):**
- Do **not** pursue unattended “bot posting.”
- Prefer “assist mode” tools (copy/export + guided fill) and never click final publish.

---

### 3.3 Apify actors (mostly scraping, not posting)
Apify has multiple Craigslist scraping actors (useful for comps ingestion, not posting).

Examples:
- `ivanvs/craigslist-scraper`: https://apify.com/ivanvs/craigslist-scraper

**Note:** Apify’s store is far richer for **scraping** than for **posting** due to ToS risk.

---

## 4) ZenRows evaluation (scraping competitor listings; not posting)

### 4.1 Where ZenRows helps
ZenRows is best viewed as a “managed anti-bot HTTP client” that can:
- add rotating proxies,
- add JS rendering,
- handle retries / block pages,
- reduce your bot-detection/infra burden.

Citations:
- ZenRows pricing docs (multipliers; example CPM costs; pay-only-success): https://docs.zenrows.com/first-steps/pricing

**From ZenRows docs (useful numbers):**
- Feature multipliers: JS rendering ×5; premium proxies ×10; both ×25.
- Example costs per 1,000 requests (CPM):
  - Basic pages: $0.28
  - JS: $1.40
  - Premium proxies: $2.80
  - Both: $7.00

---

### 4.2 Where ZenRows does NOT help (or is not appropriate)
- **Craigslist posting automation:** ZenRows is not a posting tool; and posting automation is ToS-risky regardless.
- Sites requiring authenticated sessions with heavy UI flows: ZenRows can render JS, but you still need to manage logins/cookies and the ethical/ToS side.

---

### 4.3 Recommended architecture: ZenRows + caching + rate limits (for comps scraping)

**Goal:** minimize cost + avoid hammering sites while producing 24–48h cadence competitive reports.

#### Components
1) **Fetcher**
   - Default: plain HTTP client.
   - Fallback: ZenRows Universal Scraper API with feature flags:
     - start with **basic** (no JS, no premium proxies),
     - escalate to **premium proxies**,
     - escalate to **JS + premium** only for protected pages.

2) **Normalizer / Parser**
   - Per-source parser converts HTML/JSON to a normalized `Listing` shape.

3) **Cache**
   - Two-layer caching:
     - Raw page cache (keyed by URL + headers + geo) TTL 6–24h.
     - Parsed listing cache (keyed by listing ID) TTL 1–7d.

4) **Scheduler / Rate limiter**
   - Per-source token bucket, e.g. 0.2–1 rps per domain initially.
   - Backoff on 403/429; circuit-break after repeated blocks.

5) **Cost guardrails**
   - Hard monthly request caps.
   - Prefer “search pages only” + minimal VDP fetches.

#### Radius implementation (100/250/500/1000/national)
- Normalize listing location to lat/lng.
- Compute distance via haversine.
- Filter by radius_km.
- For “national”: skip distance filter (or filter within Canada bounding polygons if needed).

**Cheapest heuristic:**
- Avoid JS rendering wherever possible.
- Do not fetch every VDP if the search results contain enough data for comps.

---

## 5) Summary recommendations (best-but-cheapest)

### VIN decode (exact trim/options; Canada)
1) **Baseline (free):** NHTSA vPIC for pattern-level decode + offline DB for resilience.
2) **Paid escalation (transparent cheap):** MarketCheck Basic decode for standardization + **NeoVIN** only when options must be confirmed.
3) **Enterprise “gold” option-level:** DataOne or ChromeData (quote-only; validate Canada builds).

### Competitive comps (Canada; radii)
- **MVP, API-first:** MarketCheck (clear pricing, Canada coverage claim, location-aware endpoints).
- **Add-on sources (scrape, riskier):** Craigslist + Kijiji + FB Marketplace using ZenRows/Apify, with caching + strict rate limits.

### Craigslist posting
- Treat all automation as **ToS-risky**.
- If anything ships: user-in-the-loop assisted workflow + never “final publish” click + fallback export mode.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items (relative to this task’s DoD)
- **Exact pricing/minimums for** ChromeData, DataOne, Canadian Black Book, AutoTrader.ca feeds: **not publicly posted** (quote-only).
- **Verified ToS citations** for CarGurus/AutoTrader.ca/FB/Kijiji scraping restrictions: not included (would require pulling each ToS page and quoting relevant clauses).

### Why missing
- Public web access limitations (Cloudflare blocks on JD Power in this environment) and vendors commonly use quote-only pricing.
- ToS pages vary by locale and are lengthy; collecting precise citations would take additional dedicated pass.

### Auto-fill action
- **Non-blocking:** I left clear “quote-only” markers and provided the cheapest path with publicly available pricing (MarketCheck, ZenRows, vPIC).
- **If we do a v2 of this file (no external side effects):**
  1) Add a ToS-citations appendix for each marketplace (CarGurus, AutoTrader.ca, FB, Kijiji) with direct links and quoted clauses.
  2) Add a “cost model sheet” section with variables and example monthly spend scenarios (VIN decode volume, comps report cadence, listing fetches) using MarketCheck + ZenRows published pricing.
