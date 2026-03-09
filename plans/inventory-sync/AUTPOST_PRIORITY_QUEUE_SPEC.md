# Autopost Priority Queue Spec (Craigslist + Facebook Marketplace) — LotView

**Project:** `C:\Users\omino\projects\lotview`

> Note: File name is intentionally `AUTPOST_PRIORITY_QUEUE_SPEC.md` to match requested output path.

## 1) Scope
Implement an **Autopost Priority Queue** subsystem that:
- Creates and maintains a prioritized list of vehicles to autopost
- Supports **Craigslist** and **Facebook Marketplace** as separate platforms with independent states
- Enforces eligibility rules (including **photo count gating >=10 unique photos**)
- Provides a **Sales Manager/GM UI** to reorder priority (default: used first, then new)
- Integrates with the pipeline: **inventory sync → enrichment → autopost-ready signal → queue**

This subsystem does **not** require automatically posting to platforms yet; it must at minimum:
- track queue and per-platform posting state
- expose APIs for the Chrome extension / autopost worker to claim next vehicle

**Out of scope (explicit):** this queue must not trigger scraping or enrichment itself. It consumes readiness signals produced by the inventory sync/enrichment jobs.

---

## 2) Definitions

### 2.1 Platforms
- `facebook_marketplace`
- `craigslist`

### 2.2 Autopost readiness + eligibility gate
A vehicle is eligible to be queued when:
- `deletedAt IS NULL`
- lifecycle status is “active inventory” (implementation-defined)
- `photoCount >= 10` (**unique**) OR photo gate override is enabled
- (optional but recommended) `price` present, if required by platform policy

Readiness signal semantics (produced upstream):
- `autopostEligible` boolean
- `autopostBlockReason` (e.g., `NEEDS_PHOTOS`, `MISSING_PRICE`, `DELETED`, `SOLD`, `ENRICHMENT_TERMINAL_NO_MORE_AVAILABLE`)
- `autopostReadyAt` timestamp (first time vehicle becomes eligible)

**Override:** Sales Manager/GM may override the photo gate per vehicle.

### 2.3 Default priority policy
When multiple vehicles become eligible, default ordering is:
1) **Backlog first**: already-in-inventory and never posted (drain backlog)
2) **Newly ingested** (today)
Within each partition:
- **Used inventory first**
- **New inventory second**
Within each group: oldest-first (or highest-days-on-lot first) unless the manager reorders.

---

## 3) DB schema
> Names below assume Postgres + Drizzle conventions. Adjust naming to match existing schema style.

### 3.1 `autopost_queue_items`
Represents “this vehicle is in the queue to be posted (in general)”.

Columns:
- `id uuid primary key`
- `dealershipId int not null`
- `vehicleId int not null`
- `isActive boolean not null default true`
- `priorityRank int not null`  
  - Smaller number = higher priority (rank 1 is the top)
- `createdAt timestamp not null default now()`
- `updatedAt timestamp not null default now()`
- `queuedAt timestamp not null default now()`
- `dequeuedAt timestamp null`
- `blockedReason text null`  
  - e.g., `"<10 photos"`, `"missing price"`, `"vehicle deleted"`, `"status not active"`, `"no_more_photos_available"`
- `photoGateOverride boolean not null default false`
- `photoGateOverrideByUserId int null`
- `photoGateOverrideAt timestamp null`

Optional (recommended) denormalized readiness snapshot for UI speed:
- `autopostReadyAt timestamp null` (copy from vehicle when enqueued)

Indexes/constraints:
- unique: `(dealershipId, vehicleId)` where `isActive=true` (prevents duplicates)
- index: `(dealershipId, isActive, priorityRank)`

### 3.2 `autopost_platform_status`
Tracks per-platform status for each queue item.

Columns:
- `id uuid primary key`
- `dealershipId int not null`
- `queueItemId uuid not null` (FK → `autopost_queue_items.id`)
- `platform enum('facebook_marketplace','craigslist') not null`
- `status enum(
    'not_queued',
    'queued',
    'blocked',
    'claimed',
    'posting',
    'posted',
    'failed',
    'skipped'
  ) not null default 'queued'`
- `attemptCount int not null default 0`
- `lastAttemptAt timestamp null`
- `lastError text null`
- `postedUrl text null` (if platform returns a URL)
- `postedExternalId text null` (platform listing id if available)
- `createdAt timestamp not null default now()`
- `updatedAt timestamp not null default now()`

Constraints:
- unique: `(queueItemId, platform)`
- index: `(dealershipId, platform, status, updatedAt desc)`

### 3.3 `autopost_queue_events` (audit trail)
Immutable event log for observability and dispute resolution.

Columns:
- `id uuid primary key`
- `dealershipId int not null`
- `queueItemId uuid not null`
- `platform enum('facebook_marketplace','craigslist') null`  
  - null for “global queue” events (priority reorder, enqueue, dequeue)
- `actorUserId int null` (null for cron/system)
- `eventType enum(
    'ENQUEUED',
    'DEQUEUED',
    'PRIORITY_REORDERED',
    'PHOTO_GATE_BLOCKED',
    'PHOTO_GATE_OVERRIDE_SET',
    'ELIGIBILITY_CHANGED',
    'CLAIMED',
    'POSTING_STARTED',
    'POSTED_SUCCESS',
    'POSTED_FAILED',
    'SKIPPED'
  ) not null`
- `message text null`
- `metadata jsonb null`
- `createdAt timestamp not null default now()`

Indexes:
- `(dealershipId, createdAt desc)`
- `(queueItemId, createdAt desc)`

---

## 4) Eligibility computation rules

### 4.1 Photo gate (unique photos) + upstream anti-thrash alignment
- Default: if `uniquePhotoCount < 10` then **do not allow platform status to progress** beyond `blocked`.
- If a vehicle was enqueued before photos were present, it may remain queued but platform status is `blocked` with reason `"<10 photos"`.
- When enrichment raises `uniquePhotoCount` to >=10, platform status auto-transitions to `queued`.

Anti-thrash note:
- The enrichment subsystem owns photo fingerprinting (`lastPhotoSetHash`) and should avoid re-uploading unchanged photos.
- The queue should rely on the derived `uniquePhotoCount` (not raw array length) and `autopostEligible` signal.

### 4.2 Deletion interaction
If a vehicle becomes soft-deleted:
- set `autopost_queue_items.isActive=false` and `dequeuedAt=now()`
- write `DEQUEUED` event
- set per-platform statuses to `skipped` with reason `"vehicle deleted"`

### 4.3 Terminal enrichment states
If upstream marks a vehicle as `NO_MORE_AVAILABLE` (cannot reach 10 photos):
- keep queue item inactive by default (do not enqueue), OR
- if already enqueued, set platform statuses to `blocked` with reason `"no_more_photos_available"`
- manager can still override via photo gate override if business wants posting with <10 photos

---

## 5) Queue ordering rules

### 5.1 Default population order
When creating queue items (system-generated), assign `priorityRank` by:
1) backlog first (never posted)
2) newly ingested (today)
Within each:
- used inventory (isNew=false)
- new inventory
Within each group:
- higher days-on-lot first (or older `createdAt` first)

### 5.2 Manager reordering
UI should support reordering per dealership:
- drag-and-drop list
- “Move to top” / “Move down” quick actions
- Reordering rewrites `priorityRank` deterministically (no gaps)

Implementation note:
- Use a transaction to renumber ranks to 1..N.
- Write `PRIORITY_REORDERED` event with before/after ranks.

---

## 6) API surface
> Exact route structure may vary; below assumes existing manager APIs.

### 6.1 List queue
`GET /api/manager/autopost/queue?dealershipId=...&platform=facebook_marketplace|craigslist|all`
- Auth: `master` or `sales_manager`
- Response:
  - queueItem fields
  - vehicle summary (year/make/model/trim/price/photoCount/uniquePhotoCount)
  - upstream readiness fields (autopostEligible/autopostBlockReason/autopostReadyAt)
  - per-platform statuses

### 6.2 Reorder queue
`POST /api/manager/autopost/queue/reorder`
- Auth: `master` or `sales_manager`
- Body: `{ dealershipId: number, orderedQueueItemIds: string[] }`
- Behavior:
  - validates all ids belong to dealership
  - renumbers `priorityRank`
  - writes events

### 6.3 Set/clear photo gate override
`POST /api/manager/autopost/queue/:queueItemId/photo-override`
- Auth: `master` or `sales_manager`
- Body: `{ enabled: boolean, reason?: string }`
- Behavior:
  - sets override on queue item
  - writes audit event

### 6.4 Claim next item (worker/extension)
`POST /api/autopost/claim-next`
- Auth: service token OR signed extension token (design TBD)
- Body: `{ dealershipId: number, platform: 'facebook_marketplace'|'craigslist' }`
- Behavior:
  - selects top eligible queue item for platform where:
    - queue item isActive
    - platform status in ('queued','failed') but not over retry limit
    - NOT blocked by photo gate unless override
    - NOT blocked by upstream `autopostBlockReason` (except photo override)
  - marks platform status → `claimed` and increments attemptCount
  - returns vehicle payload needed for posting

### 6.5 Post result callback
`POST /api/autopost/result`
- Auth: same as claim
- Body: `{ queueItemId, platform, status: 'posted'|'failed'|'skipped', postedUrl?, externalId?, error? }`
- Behavior:
  - updates platform status and error
  - if both platforms are `posted|skipped` then mark queue item inactive/dequeued

---

## 7) Scheduler integration

### 7.1 Pipeline hooks
After each:
- inventory ingest
- photo enrichment pass

Run:
- `AutopostEligibilityService.evaluateAndEnqueue(dealershipId)`

### 7.2 Scheduled tasks
- Every 10 minutes: evaluate and enqueue new eligible vehicles
- Every 10 minutes: attempt to claim/process items (if implementing worker server-side)

---

## 8) UI requirements (Sales Manager/GM)

### 8.1 Screen: Autopost Queue
- Route suggestion: `/manager/autopost/queue`
- Filters:
  - platform
  - status (blocked/queued/failed/posted)
  - used/new
  - backlog/newly-ingested
- Columns:
  - priority rank
  - vehicle summary
  - photo count + gate indicator
  - upstream `autopostBlockReason`
  - FB status + last error
  - CL status + last error
- Actions:
  - reorder (drag/drop)
  - set photo override
  - remove from queue (soft dequeue)

### 8.2 Default behavior
- Backlog drains first.
- Used units are top within backlog by default.
- New units follow.
- Manager reordering always wins over default logic.

---

## 9) Retry and failure rules
- Per-platform max attempts: recommend `3` before status becomes `failed` + manager notification.
- If a platform fails repeatedly, do not block the other platform from continuing.
- Notifications:
  - after 3 consecutive failures on a platform, notify Sales Manager

---

## 10) Tests

### Unit
- Eligibility computation: photo gate + override behavior + upstream block reason handling
- Reorder algorithm produces contiguous ranks
- Claim-next selects correct item under mixed statuses

### Integration
- API RBAC: only master/sales_manager can reorder/override
- Claim-next is exclusive (no double-claim); uses row-level lock or transaction

### E2E (optional)
- Manager reorders queue; refresh preserves order

---

## 11) Definition of Done (DoD) — contract
- DB tables exist with required indexes/constraints.
- APIs exist for list/reorder/override/claim/result.
- Manager UI exists for reorder and visibility.
- Photo gate enforced (<10 unique photos blocks) unless override.
- Inventory sync + enrichment jobs call eligibility → queue hook.

---

## 12) Gap Report (auto-fill)
- Platform posting implementation details (Craigslist/FB automation) may be extension-driven; this spec defines server-side tracking and claiming, but the auth model for extension workers must be chosen.
- Vehicle field `isNew` may not exist; need a deterministic rule to classify used vs new (e.g., `condition` field or `newUsed` flag from scrape).
- Backlog/newly-ingested partitioning requires a durable signal: `autopostPostCount/autopostLastPostedAt` and a definition for “ingested today”.
