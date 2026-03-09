# E2E Checklist — Inventory Sync v1.1

**Project:** `C:\Users\omino\projects\lotview`

This checklist validates the v1.1 acceptance criteria end-to-end.

## Preflight
- [ ] Local env configured (`.env` present, DB reachable).
- [ ] Migrations applied (`npm run db:push`).
- [ ] At least 1 active dealership exists with scrape sources.
- [ ] Confirm scheduler is enabled in your runtime (or call the service functions manually).

## A) VIN + stock dedupe (idempotency)
**Goal:** Running ingest twice produces no duplicates; URL churn does not create new vehicles.

1) Confirm DB constraint exists
- [ ] Verify the canonical unique index exists:
  - `vehicles_dealership_vin_normstock_uq` on `(dealership_id, vin, normalized_stock_number)`

2) Run ingest twice (same dealership)
- [ ] Run robust ingest once.
- [ ] Record `COUNT(*)` for that dealership.
- [ ] Run robust ingest again.
- [ ] Confirm count is unchanged.

3) URL churn scenario
- [ ] Pick a known vehicle (VIN+stock present).
- [ ] Update its `dealer_vdp_url` to a different URL (simulate dealer URL churn) OR ingest a scrape result with same VIN+stock but different VDP URL.
- [ ] Expect: same row updated; no new row.

4) Missing VIN → later VIN merge-forward
- [ ] Create/ingest a vehicle with missing VIN but with stock and/or VDP URL.
- [ ] Later ingest includes VIN+stock.
- [ ] Expect: record merges forward; no duplicate rows.

## B) 0‑photo ingest
**Goal:** Vehicles may exist with 0 photos and later be enriched.

- [ ] Ingest a vehicle where `images=[]`.
- [ ] Confirm row exists in DB.
- [ ] Confirm `photo_status` is `pending` (or equivalent) and autopost is blocked.

> Regression guard: confirm no production ingest path still uses a legacy gate that skips `<1` photo vehicles.

## C) Photo enrichment loop (>=10 photos target)
**Goal:** Enrichment sweep retries vehicles until they reach >=10 unique photos (or hits terminal conditions).

1) Scheduler wiring
- [ ] Confirm cron exists in `server/scheduler.ts`:
  - `*/30 * * * *` runs `runPhotoEnrichmentSweep({ dealershipId: 1, limit: 25, minPhotosTarget: 10 })`.

2) Enrichment success path
- [ ] Seed/identify a vehicle with `<10` photos.
- [ ] Run enrichment sweep (wait for cron or run manually).
- [ ] Confirm `images` increases and stops updating once `>=10`.

3) Anti-thrash
- [ ] Run enrichment sweep twice without upstream photo changes.
- [ ] Confirm `photo_fingerprint` unchanged causes a skip (no repeated uploads).

4) Failure/terminal conditions
- [ ] Force a vehicle with a broken VDP URL.
- [ ] Confirm fail counters and `photo_enrich_last_error` update.
- [ ] Confirm lifecycle transitions to terminal state when no more photos are available (as implemented).

## D) Soft delete posture
**Goal:** No vehicle hard deletes; user deletes do not resurrect via scraper.

1) Manual soft delete via API
- [ ] Call `DELETE /api/vehicles/:id` as a master user.
- [ ] Confirm vehicle still exists in DB with `deleted_at` set and `lifecycle_status='DELETED'`.

2) Scraper respect for user deletes
- [ ] Soft delete a vehicle with `deleted_by_user_id` set.
- [ ] Run ingest that would otherwise update that vehicle.
- [ ] Confirm scraper skips updates (no resurrection).

3) System restore allowed
- [ ] Mark a vehicle deleted with `deleted_reason='REMOVED_BY_SYNC'`.
- [ ] Run ingest where it reappears.
- [ ] Confirm record is restored (`deleted_at` cleared).

## E) Autopost Priority Queue subsystem
**Goal:** Eligible vehicles are queued; managers can reorder; platform status tracked.

### Current status (as of 2026-03-09 QA)
- [x] DB tables + types exist (`autopost_queue_items`, `autopost_platform_statuses`, `autopost_queue_events`).
- [ ] Server APIs exist to list/reorder/override/claim/update statuses.
- [ ] Manager UI exists for queue + reorder.

### Once APIs/UI land
- [ ] Eligibility gating: `<10` photos blocks unless override.
- [ ] Default ordering: used above new.
- [ ] Reorder persists after refresh.
- [ ] Audit event `PRIORITY_REORDERED` written.
- [ ] Claim-next exclusivity: no double-claim under concurrency.

## Signoff criteria
- [ ] Sections A–D pass.
- [ ] Section E passes once APIs + UI are implemented.
- [ ] No hard deletes observed in server code paths for vehicles.