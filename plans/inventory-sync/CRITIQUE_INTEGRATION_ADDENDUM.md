# Critique Integration Addendum — Inventory Sync v1.1 + Autopost Queue

**Project:** `C:\Users\omino\projects\lotview`

Purpose: record exactly how `RESEARCHER_CRITIQUE.md` has been incorporated into the v1.1 specs **without changing scope** (still: daily sync + enrichment + soft delete + autopost priority queue tracking).

---

## 1) What changed (high level)

### A) Identity ladder + merge-forward policy (VIN missing initially)
**Integrated into:** `MASTER_PLAN_INVENTORY_SYNC_V1_1.md` (Section 1.1, 4.2, 5.1)
- Replaced “VIN+stock only” with an explicit **identity ladder** that covers:
  - `(vin + normalizedStock)` strongest
  - `(vin)` and `(normalizedStock)` as unambiguous fallbacks
  - `canonicalDealerVdpUrl` as temporary pointer
- Added explicit **merge-forward** rule when VIN appears later.

### B) Photo enrichment state machine (0-photo handling + terminal states)
**Integrated into:** `MASTER_PLAN_INVENTORY_SYNC_V1_1.md` (Section 6.2, 5.3)
- Added deterministic enrichment states:
  - `PENDING_SOURCE` for new 0-photo vehicles (fast recheck)
  - `NEEDS_PHOTOS`
  - `SATISFIED`
  - `NO_MORE_AVAILABLE` (terminal / weekly recheck)
  - `BLOCKED`
- Added explicit delta-based terminal condition (`K` consecutive attempts w/ 0 new unique photos).

### C) Anti-thrash photo fingerprinting
**Integrated into:** `MASTER_PLAN_INVENTORY_SYNC_V1_1.md` (Section 6.2, 5.3)
- Added `lastPhotoSetHash` and rule:
  - unchanged hash => `SKIPPED_UNCHANGED` (no re-uploading daily)
- Clarified that the >=10 rule is based on **unique** photos.

### D) Cost caps + domain circuit breaker
**Integrated into:** `MASTER_PLAN_INVENTORY_SYNC_V1_1.md` (Section 8)
- Added hard per-dealership budgets for enrichment requests.
- Added a domain-level circuit breaker for Cloudflare/provider blocks.

### E) Failure taxonomy + escalation + run summary
**Integrated into:** `MASTER_PLAN_INVENTORY_SYNC_V1_1.md` (Section 8.4, 6.5)
- Added outcome taxonomy (FETCH_FAILED/BLOCKED/PARSE_FAILED/NO_NEW_PHOTOS/SKIPPED_UNCHANGED).
- Added reset policy and escalation tiers.
- Added dealership-run summary metrics.

### F) Autopost queue integration
**Integrated into:**
- `MASTER_PLAN_INVENTORY_SYNC_V1_1.md` (Section 2.3, 4.1)
- `AUTPOST_PRIORITY_QUEUE_SPEC.md` (Sections 2.2, 2.3, 4.3, 5.1)
- Defined upstream readiness signals: `autopostEligible`, `autopostBlockReason`, `autopostReadyAt`.
- Defined default ordering to satisfy "used-first" plus the critique’s "drain existing backlog first" idea.
- Clarified queue is **downstream** and does not trigger scraping.

---

## 2) Non-goals / scope unchanged
- No new external integrations were added.
- No new platform automation is required (queue still only tracks + supports claim/result API).
- No changes to the canonical scraping stack—still reuse `runRobustScrape()` and existing providers.

---

## 3) Remaining implementation-level choices (intentionally deferred)
These were left as “implementation decisions” rather than expanding scope:
- Where to store readiness signals (derived vs persisted columns).
- Exact values for budgets (`MAX_ENRICH_VDPS_PER_DAY`, `MAX_PAID_PROVIDER_REQUESTS_PER_DAY`).
- Exact definition of "used" vs "new" if `isNew` is missing.
- Auth model for `/api/autopost/*` endpoints (service token vs extension token).

---

## 4) Gap Report (addendum-level)
- The master plan now references `normalizedStockNumber` and `canonicalDealerVdpUrl`; implementation map may need a follow-up update to list the new columns/indexes explicitly.
- The queue spec assumes a durable backlog signal (e.g., `autopostPostCount`/`autopostLastPostedAt`); if missing, implementation must add it or derive it.
