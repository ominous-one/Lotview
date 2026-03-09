# LotView — Master Plan: Inventory Sync + Photo/Price Enrichment + Deletion

**Project:** `C:\Users\omino\projects\lotview`

## 0) Goal (what we’re shipping)
A **daily, idempotent, multi-tenant inventory sync** that:
1) Ingests **new vehicles** from the dealership “source of truth” without duplicates.
2) Refreshes **price + photos** for existing vehicles.
3) Runs a deterministic **enrichment pass**: if a vehicle has **<10 photos**, attempt to fetch/add photos (including vehicles created with 0 photos).
4) Produces **audit logs + notification events** (Sales Manager + ops escalation) when enrichment fails repeatedly.
5) Adds a **safe, RBAC-protected vehicle deletion** capability (soft-delete preferred) with audit trail.

This plan is explicitly aligned with (and reuses) the existing scraping stack (ZenRows/ScrapingBee/Browserless/Puppeteer) and safety rules.

---

## 1) Definitions
### 1.1 “Source of truth” (SoT)
LotView already models dealership inventory via **Scrape Sources** (URLs per dealership) and scrapers that extract inventory + VDP.

**SoT definition:**
- For each dealership, the **active `scrape_sources`** records are the canonical input set.
- The sync job treats the listing pages + VDP pages referenced by those sources as authoritative for:
  - vehicle presence (what’s on-lot)
  - current price
  - current photo set

**Non-SoT inputs:**
- Facebook Marketplace / Craigslist postings are **distribution channels**, not SoT.
- Internal “created manually” vehicles are treated as **user-managed** and should not be hard-deleted by sync; they can be flagged as `source=manual` and excluded from sold-detection.

### 1.2 “Enrichment”
Enrichment is any post-ingest improvement after a vehicle exists in DB:
- photo fill (reach >=10 photos)
- price refresh
- VDP description/specs/carfax updates (already partially implemented)

### 1.3 Deletion
Two types:
- **System lifecycle** (sold/off-site): mark as `SOLD` or `REMOVED_BY_SYNC` via sync logic.
- **User deletion** (ops action): soft-delete with RBAC + audit.

---

## 2) Canonical scraping logic we must reuse
**Canonical code paths:**
- `server/robust-scraper.ts` — production-grade, multi-tier scrape orchestration with Cloudflare detection, rate limiting, safe stale handling (`missedScrapeCount`), and provider fallbacks.
- `server/scraper.ts` — shared vehicle upsert logic + image caching + enrichment helpers (`upsertVehicleByVin`, `checkVehicleNeedsEnrichment`, `updateVehiclePriceOnly`).
- `server/browserless-unified.ts` / `server/browserless-service.ts` — provider integrations used by robust scraper.

**Important existing rules we must not break:**
- Rate limiting between VDP requests (notably `await sleep(5000)` for Cloudflare-prone sites).
- Cloudflare block page detection (`isCloudflareBlockPage`).
- “Safe stale vehicle handling”: **no immediate mass deletion**; use consecutive misses + minimum scrape size threshold.
- Smart merge in `upsertVehicleByVin` to preserve good values when new scrape has gaps.

---

## 3) Architecture overview (inventory sync pipeline)
### 3.1 Daily job structure
A single **daily scheduler entry** triggers a **multi-stage pipeline** per dealership:

1) **Inventory discovery / ingest (SoT sync)**
   - Use `runRobustScrape('scheduler', dealershipId)` as the one canonical ingest path.
   - Idempotency is guaranteed by existing upsert rules (primary match by normalized VDP URL, secondary by VIN).

2) **Price refresh (fast path)**
   - For vehicles already enriched and stable, prefer price-only updates where possible.
   - Reuse existing `updateVehiclePriceOnly`.

3) **Photo enrichment pass**
   - Query vehicles where `imageCount < 10` (including 0).
   - For each vehicle, attempt to fetch VDP and extract additional photo URLs.
   - Reuse robust extraction utilities (Olympic/AutoTrader CDN normalization, folder-ID validation).
   - Cache images via the existing image caching pipeline (vehicle_images table / object storage service), preserving current behavior.

4) **Failure accounting + notifications**
   - Persist per-vehicle enrichment outcomes.
   - When a vehicle fails enrichment repeatedly (ex: 3 consecutive days), create:
     - in-app notification for Sales Managers
     - optional email outbox entry (leveraging existing notification service patterns)

### 3.2 Idempotency / dedupe strategy
- **Primary identity:** normalized `dealerVdpUrl` + `dealershipId` (already implemented)
- **Secondary identity:** VIN + `dealershipId`
- All cron re-runs are safe: upsert merges and enrichment state machine avoids repeating heavy work unless needed.

---

## 4) Deletion capability plan
### 4.1 Preferred: soft delete
Add a soft-delete layer to vehicles:
- `vehicles.deletedAt` (timestamp)
- `vehicles.deletedByUserId` (FK)
- `vehicles.deletedReason` (text)
- `vehicles.isDeleted` (bool) OR derive from `deletedAt`

**Behavior:**
- Deleted vehicles do not appear in active inventory lists, VDP pages, FB catalog exports, etc.
- Deleted vehicles are never modified by sync/enrichment unless explicitly restored.

### 4.2 RBAC
- Only `role in ('master','sales_manager')` can delete/restore.
- Salesperson cannot delete.

### 4.3 Audit
Every delete/restore must emit:
- an immutable audit log row (who/when/what/reason)
- a `notification_events` row (optional but consistent with app patterns)

---

## 5) Work breakdown (phases)
### Phase A — Spec + Schema
- Define inventory sync state machine and storage model (run table, per-vehicle attempts, outcomes)
- Add DB fields for soft-delete + enrichment attempt tracking

### Phase B — Backend implementation
- Add `InventorySyncService` (or equivalent) that:
  - orchestrates `runRobustScrape` then enrichment pass
  - writes audit + notification events
- Add API endpoints:
  - trigger sync (admin)
  - fetch sync history
  - delete/restore vehicles

### Phase C — UI
- Inventory table: show photo count + enrichment status + delete actions
- Vehicle detail: deletion banner + restore
- Audit view: inventory sync + deletions

### Phase D — Tests
- Unit tests for enrichment gating + idempotency
- Integration tests for delete/restore RBAC
- Scheduler test to ensure cron registers and calls service (mock)

### Phase E — QA + rollout safety
- Feature flags:
  - `ENABLE_INVENTORY_ENRICHMENT_CRON`
  - `ENABLE_VEHICLE_SOFT_DELETE`
- Dry-run mode for enrichment (no writes) for early validation.

---

## 6) Acceptance criteria (objective)
1) Nightly/daily job runs without duplicating vehicles across reruns.
2) Vehicles with <10 photos trend upward toward >=10 when available; enrichment stops retrying once satisfied.
3) Enrichment failures produce audit log entries and create manager notifications after threshold.
4) Vehicle deletion is RBAC-protected, soft by default, audited, and excluded from all “active inventory” queries.
5) No scraping stack duplication: enrichment reuses the same provider/fallback logic and rate limiting.

---

## 7) Validation steps
- Run sync twice; verify no duplicates, and `upsertVehicleByVin` updates instead of inserts.
- Seed a vehicle with 0–3 photos; run enrichment; verify images updated to >=10 when possible.
- Force enrichment failures (invalid VDP URL); verify audit logs + notification on 3rd failure.
- Delete a vehicle as Sales Manager; verify hidden from inventory UI + APIs; verify audit row and restore works.

---

## 8) Gap Report (auto-fill)
**Known unknowns that must be confirmed during implementation (non-blocking for this spec):**
- Exact current DB schema fields for `vehicles` and whether `missedScrapeCount` already exists in migrations for all environments.
- Existing audit log table availability (if none, we must add `inventory_audit_log`).
- Current UI routes for manager inventory views (for wiring delete controls).

**Auto-fill plan:**
- If no audit table exists, create one as part of Phase A (schema + migration), and route all events through it.
