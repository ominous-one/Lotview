# LotView Scraper Audit Report

## Overall assessment
The scraper stack is ambitious and has real recovery paths, but it is **not production-ready for "all necessary vehicle information including pictures"** yet. The biggest gaps are in the **image pipeline**, **data truthfulness**, and **deployment/runtime assumptions**. The system does preserve inventory better than a naive scraper, but it still has multiple ways to save incomplete photos, incorrect metadata, or fail outright on Render for object-storage-backed features.

---

## Critical

### 1) Image cache can permanently shrink a vehicle gallery to only the subset of images that downloaded successfully
- **Evidence**:
  - `server/scraper.ts:520` starts DB image caching.
  - `server/scraper.ts:556-600` downloads images one-by-one and only appends successfully downloaded images to `localUrls`.
  - `server/scraper.ts:604-608` rewrites `vehicles.images` to `localUrls` if any succeeded.
- **Why this is critical**: if 20 CDN URLs are extracted and only 6 download, the DB record is rewritten to 6 local `/api/public/vehicle-image/...` URLs. The other 14 photos are dropped from the vehicle record.
- **Impact**: incomplete galleries even when extraction originally found more photos.
- **Fix**:
  - Change cache writes to be **all-or-nothing** or preserve original URLs for failed positions.
  - Store per-slot status and only replace `vehicles.images` after all images are cached.
  - Keep exact original order/index mapping instead of compacting successful images to `0..successCount-1`.

### 2) Precision image validation discards non-VIN gallery images whenever even a few VIN-matching URLs exist
- **Evidence**:
  - `server/precision-image-extractor.ts:809-835`.
  - If `hasVinMatches`, validator returns **only** `vinMatches` and pushes all other gallery images to `suspicious`.
- **Why this is critical**: many dealer/CDN galleries do not include VIN or stock in every image URL. A gallery with 2 VIN-matching URLs and 18 real photos can collapse to only 2 valid images.
- **Impact**: massive under-capture of real vehicle photos.
- **Fix**:
  - When VIN matches exist, keep gallery-slide/gallery-active images from the same gallery/container unless they conflict with a recommendation/similar-vehicle signal.
  - Score images instead of hard-excluding all non-VIN gallery images.

### 3) Failed precision extraction falls back to legacy image extraction that is explicitly less trustworthy
- **Evidence**:
  - `server/dealer-listing-scraper.ts:1592-1615` runs precision extraction.
  - `server/dealer-listing-scraper.ts:1608-1614` falls back to `data.images` when precision returns zero valid images.
  - Legacy extraction logic is broad and gallery-container heuristic based (`server/dealer-listing-scraper.ts:919-971`).
- **Why this is critical**: the fallback can reintroduce recommended/similar vehicle images that precision extraction was designed to eliminate.
- **Impact**: wrong pictures on listings.
- **Fix**:
  - Add a middle path: accept gallery-sourced precision images at lower confidence instead of immediately reverting to legacy.
  - Persist confidence/debug metrics and mark suspect galleries for enrichment/retry, not silent fallback.

### 4) Missing interior color is silently fabricated as `Black`
- **Evidence**:
  - Insert path: `server/scraper.ts:605` sets `interiorColor: writeDecision.fields.interiorColor || 'Black'`.
  - Update path: `server/scraper.ts:307` preserves/mutates to `existingVehicle?.interiorColor) || 'Black'`.
- **Why this is critical**: this is not a scrape failure; it is false data insertion.
- **Impact**: inaccurate inventory data, bad feeds, and misleading marketplace exports.
- **Fix**:
  - Remove the fallback default.
  - Leave null when unverified.
  - If a business default is needed for UI, apply it in presentation, not persistence.

### 5) `objectStorage.ts` is hard-wired to the Replit sidecar and will break object-storage-backed features on Render
- **Evidence**:
  - `server/objectStorage.ts:12-27` uses `http://127.0.0.1:1106` for token/credential exchange.
  - `server/objectStorage.ts:478` signs URLs through the same sidecar.
  - Callers in `server/routes.ts`: public-object serving around `:350-356`, vehicle image migration `:2615` / `:2654`, logo upload `:6894-6903`, logo delete `:6933`.
- **Why this is critical**: on Render there is no Replit sidecar at `127.0.0.1:1106`.
- **Impact**:
  - dealership logo uploads/deletes break;
  - any `/public-objects/...` serving breaks;
  - object-storage migration/reupload flows break.
  - DB-backed `/api/public/vehicle-image/:vehicleId/:index` is separate and still works (`server/routes.ts:3259-3287`).
- **Fix**:
  - Replace sidecar auth with standard GCP/AWS/S3-compatible credentials from env.
  - Feature-flag object storage separately from DB image caching.
  - Fail fast during startup on unsupported runtime, not at first user action.

---

## High

### 6) Cache-preserve mode prevents deletion, but does not actually restore or enrich stale inventory
- **Evidence**:
  - `server/robust-scraper.ts:4064-4087` Tier 6 is labeled cache preserve.
  - `server/robust-scraper.ts:2438-2450` `preserveExistingInventory()` only counts existing vehicles and returns that count.
- **Why this matters**: this is good as a guard against catastrophic deletion, but it is not a real recovery mode.
- **Impact**: stale prices/photos/details remain untouched while the run reports a partial preservation outcome.
- **Fix**:
  - Explicitly mark preserved rows `verificationStatus='STALE'` and/or set a scrape health flag.
  - Expose preserve-mode state in admin/UI.
  - Trigger targeted re-enrichment retries after preserve mode.

### 7) Price extraction still has low-confidence fallbacks that can select the wrong price
- **Evidence**:
  - `server/dealer-listing-scraper.ts:1460-1540` has tiered price extraction.
  - Strategy 3 scans many dollar amounts and uses the **median** of matches.
  - `server/robust-scraper.ts:1620-1630` and `:2260-2412` also use regex/HTML heuristics for VDP extraction.
- **Why this matters**: dealer pages often contain MSRP, sale price, finance payment, lease payment, and accessories in one DOM.
- **Impact**: payment-vs-sale confusion is reduced but not eliminated.
- **Fix**:
  - Persist `priceSource`, `priceConfidence`, and raw matched text.
  - Reject low-confidence prices when a labeled selling-price node is absent.
  - Add dealer-specific extractor plugins for known platforms instead of median-of-page fallback.

### 8) New-vs-used detection can misclassify demo/new inventory if it lives under a used URL
- **Evidence**:
  - `server/dealer-listing-scraper.ts:169-204` (`isLikelyNewVehicle`).
  - If `scrapingUsedInventory` is true, the function returns false unless page explicitly says `New`.
- **Why this matters**: low-mileage demos/manager units or miscategorized inventory can appear in used SRPs without a strong explicit “New” flag.
- **Impact**: wrong inventory classification and downstream merchandising issues.
- **Fix**:
  - Combine URL context with raw odometer, year, badge text, structured data condition, and VDP labels into a scored decision.
  - Persist confidence and review borderline cases.

### 9) Multi-dealer support exists structurally, but core extraction remains strongly tuned to specific dealer implementations
- **Evidence**:
  - Multi-tenant scheduler loops active dealerships: `server/scheduler.ts:19-30`, `:42-61`.
  - Active scrape sources come from DB in `server/dealer-listing-scraper.ts:32-69`.
  - But many selectors and comments are Olympic-specific or platform-specific, e.g. `server/robust-scraper.ts:1604-1762`, `:2285-2287`, `:2663`, `:3237`; dealer-listing selectors are also narrowly tuned (`server/dealer-listing-scraper.ts:302-346`, `:919-971`).
  - Fallback hardcoded config is one dealer only: `server/dealer-listing-scraper.ts:24-30`.
- **Why this matters**: onboarding a dealer with different VDP/gallery markup will degrade quickly.
- **Impact**: inconsistent field/photo capture across dealerships.
- **Fix**:
  - Introduce scraper profiles by platform/CMS.
  - Store per-source selector overrides in DB.
  - Record per-dealer extraction KPIs (photo count, VIN hit rate, field completeness).

### 10) The scheduler is correct only if process-role env is configured correctly; otherwise inventory sync may never run
- **Evidence**:
  - Web starts schedulers only if `LOTVIEW_SCHEDULER_PROCESS === 'web'` (`server/index-prod.ts:39-44`).
  - Worker starts schedulers only if `LOTVIEW_SCHEDULER_PROCESS === 'worker'` (`server/index-worker.ts:77-84`).
  - Both start inventory scheduler when enabled (`server/index-prod.ts:47-57`, `server/index-worker.ts:69-75`).
- **Why this matters**: deployment misconfiguration can leave both web and worker skipping scrape schedules, or run them in the wrong process.
- **Impact**: “scraper isn’t working” can simply mean “scheduler never started”.
- **Fix**:
  - Add startup logging that explicitly states whether inventory scheduler is active.
  - Add a health endpoint/admin status exposing scheduler role and next run.
  - Enforce one required process role in production readiness checks.

### 11) VDP enrichment script only updates description/Carfax badges/tech specs and ignores other missing supported fields
- **Evidence**:
  - `server/scrape-vdp-details.ts:15-18` defines returned details as only `vdpDescription`, `carfaxBadges`, `techSpecs`.
  - `server/scrape-vdp-details.ts:132-138` only updates those columns.
- **Why this matters**: if enrichment is used to backfill weak rows, it leaves out `carfaxUrl`, `stockNumber`, colors, drivetrain, engine, fuel type, transmission, etc.
- **Impact**: partial enrichment never reaches schema completeness.
- **Fix**:
  - Expand enrichment to reuse the main VDP extractors and update all supported fields under write guardrails.

### 12) Legacy and robust image extraction paths are duplicated, increasing drift and inconsistent results
- **Evidence**:
  - Precision extractor: `server/precision-image-extractor.ts`.
  - Legacy VDP extraction in dealer scraper: `server/dealer-listing-scraper.ts:785-971`.
  - Generic/Olympic extraction in robust scraper: `server/robust-scraper.ts:1604-1762`, `:1824+`, `:2285-2287`, `:3080-3081`.
- **Why this matters**: fixes in one path do not automatically improve the others.
- **Impact**: different scrape tiers save different photos for the same vehicle.
- **Fix**:
  - Consolidate all final VDP image extraction through one shared engine and one validator.

---

## Medium

### 13) Data completeness is good for most target fields, but the persistence model still has gaps/ambiguities for body style and structured specs
- **Evidence**:
  - Supported schema fields include VIN, stock, colors, transmission, fuel, drivetrain, engine, carfaxUrl, carfaxBadges, highlights, vdpDescription, techSpecs, dealerVdpUrl (`shared/schema.ts:186-206`).
  - There is **no dedicated `bodyStyle` column**; body/body style is stored indirectly in `type` (`shared/schema.ts:186-190`).
  - Dealer scraper extracts `bodyStyle` (`server/dealer-listing-scraper.ts:1238-1253`) but returns it mapped into `type` later (`server/dealer-listing-scraper.ts:1620-1668`).
- **Why this matters**: “type” and “body style” are not always the same thing operationally.
- **Fix**:
  - Add explicit `bodyStyle` column if feeds/admin use it distinctly from marketplace `type`.

### 14) Image serving route is solid, but it assumes compact sequential `imageIndex` values
- **Evidence**:
  - `server/routes.ts:3259-3287` serves by `vehicleId + imageIndex`.
  - `server/scraper.ts:542-545` and `:590-600` generate local URLs by sequential array index.
- **Why this matters**: any future sparse index strategy or partial recache preservation will break unless route/index semantics are updated.
- **Fix**:
  - Treat image identity as a first-class row ID or preserve original slot indexes explicitly.

### 15) Scrape failure logging exists, but remediation telemetry is weak for production operations
- **Evidence**:
  - Robust scrape logs and scrape run status are present (`server/robust-scraper.ts:3839-4087`).
  - Image cache logs failures only to console and continues (`server/scraper.ts:566-600`, `:611-615`).
- **Why this matters**: operators can see that something failed, but not easily which vehicles lost photos/fields.
- **Fix**:
  - Persist per-vehicle scrape diagnostics: photo extraction count, cache success ratio, price confidence, field completeness, and last extraction method.

---

## Scope coverage summary

### 1) Image extraction pipeline
Flow traced:
- VDP page loaded and gallery optionally clicked through in `server/dealer-listing-scraper.ts:302-346`.
- Precision extraction opens/lightboxes and navigates galleries in `server/precision-image-extractor.ts:598-734`.
- Validation/filtering happens in `server/precision-image-extractor.ts:782-839`.
- Upsert calls image DB cache in `server/scraper.ts:341`, `:432`, `:520-615`.
- Served through `server/routes.ts:3259-3287`.

Main loss points:
- over-strict VIN-only validation when any VIN matches exist;
- legacy fallback reintroducing wrong images;
- partial DB cache success shrinking galleries.

### 2) Data extraction completeness
For the requested fields, the main scraper **attempts** to capture most of them:
- VIN, price, odometer, stock, colors, transmission, drivetrain, fuelType, body style/type, Carfax URL/badges, highlights, vdpDescription, techSpecs, dealer VDP URL are all extracted in the dealer or robust paths.
- Biggest completeness problem is not absence of fields but **truthfulness and consistency**:
  - fabricated `interiorColor='Black'`;
  - body style collapsed into `type` rather than a dedicated field;
  - enrichment script backfills only a subset.

### 3) `objectStorage.ts` Replit dependency
Confirmed broken on Render for object-storage-backed features due to sidecar-only auth design.

### 4) Error handling and resilience
- Strongest part of the system is `runRobustScrape()` fallback orchestration (`server/robust-scraper.ts:3839-4087`).
- Cache preserve mode does prevent mass data loss, but is only a retention mode, not a recovery mode.
- Failed scrapes are logged and scrape runs are updated, but per-vehicle failure telemetry needs work.

### 5) Scraping accuracy
Fragile areas:
- price fallback selection;
- new-vs-used classification on used SRPs;
- image confidence/validation rules.

### 6) Scheduler integration
- Scheduler exists and is wired for nightly 2 AM inventory sync (`server/scheduler.ts:42-61`).
- Production startup is split by process role (`server/index-prod.ts`, `server/index-worker.ts`).
- If deployment env is wrong, scheduler can silently not run.

### 7) Multi-dealer support
- Infrastructure supports multi-tenant scraping.
- Extraction logic is still heavily dealer/platform-specific, so operational multi-dealer reliability is not yet strong.

---

## Top 5 findings
1. **Partial image caching rewrites vehicles to incomplete local galleries** (`server/scraper.ts:520-615`).
2. **Precision image validator throws away real gallery images when a few VIN-matching URLs exist** (`server/precision-image-extractor.ts:809-835`).
3. **Fallback to legacy image extraction can reintroduce wrong/similar-vehicle photos** (`server/dealer-listing-scraper.ts:1608-1614`, `:919-971`).
4. **Interior color is fabricated as Black when unknown** (`server/scraper.ts:307`, `:605`).
5. **Object storage is Replit-sidecar-only and will fail on Render for logo/public-object features** (`server/objectStorage.ts:12-27`, `:478`; callers in `server/routes.ts:350-356`, `:2615-2654`, `:6894-6933`).

---

## Specific fix recommendations

### Image pipeline
- Refactor `uploadVehicleImagesToStorage()` in `server/scraper.ts` to preserve original gallery cardinality and ordering.
- Relax `validateImages()` in `server/precision-image-extractor.ts` so VIN matches raise confidence instead of excluding all non-VIN gallery slides.
- Remove direct legacy fallback from `server/dealer-listing-scraper.ts:1608-1614`; use a low-confidence precision fallback instead.
- Add per-vehicle metrics: extracted image count, validated image count, cached image count, cache failures.

### Data correctness
- Remove `interiorColor || 'Black'` defaults in `server/scraper.ts`.
- Add `bodyStyle` as a distinct schema field if required by feeds/admin.
- Expand `server/scrape-vdp-details.ts` to backfill all supported VDP fields, not only description/badges/specs.

### Resilience/ops
- Upgrade cache-preserve mode in `server/robust-scraper.ts` to mark rows stale and expose preserve mode to UI/admin.
- Add production readiness checks for scheduler process role and object storage runtime compatibility.
- Persist vehicle-level scrape diagnostics rather than console-only logs.

### Multi-dealer readiness
- Add source-platform profiles and per-dealer selector overrides.
- Route all VDP image extraction through one shared extractor path.
- Add automated completeness scoring per dealer: price hit rate, VIN hit rate, photo count percentile, field coverage.
