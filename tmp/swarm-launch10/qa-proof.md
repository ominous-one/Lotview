# QA Proof — 10-Dealership Launch Validation

Run ID: `launch10-20260331-0857`
Role: `qa-tester`
Date: 2026-03-31
Verdict: **BLOCKED / NOT APPROVED**

## QA stance
This package does **not** approve the 10-dealership launch plan. The repo shows meaningful implementation work, but the launch claim fails the proof standard because the evidence is either:
- stale relative to this run (`2026-03-30` logs for a `2026-03-31` launch decision),
- unit/integration scoped instead of end-to-end,
- incomplete for 10-dealership operational behavior,
- or explicitly contradictory to the launch goal.

Scraping is the hardest gate. It is also the least proven at launch level.

---

## Hard launch gates
A category passes only if **all** listed gates pass with fresh evidence tied to this run.

### 1) Scraping fidelity — hardest gate
**Pass criteria**
1. Fresh run proof exists for **10 distinct dealerships** in the current run.
2. For each dealership, there is a machine-readable reconciliation sample covering at least **25 vehicles or the full lot if smaller**.
3. For every sampled vehicle, the following must match source-of-truth dealer pages:
   - VIN
   - stock number
   - year / make / model / trim
   - price
   - odometer
   - primary photo set count and at least spot-check image identity
   - core details: transmission, drivetrain, fuel type, exterior/interior color when present
4. Aggregate accuracy across the sampled population must be at least:
   - VIN / identity: **100%**
   - price: **>= 99.5%**
   - photo set presence: **>= 99%**
   - core field extraction: **>= 98%**
5. There must be deletion/removal proof showing sold/removed units are deactivated without cross-tenant bleed.
6. There must be freshness proof showing each dealership can complete scheduled sync inside an operational window acceptable for launch.
7. CARFAX extraction claims may only pass if grounded by current-run proof of:
   - valid `carfaxUrl` capture when available,
   - correct badge capture,
   - explicit non-claim behavior when history data is absent.

**Current evidence found**
- `server/tests/robust-scraper-validation.test.ts`
- `server/tests/robust-scraper-vdp.test.ts`
- `qa/proofs/20260330-164439-jest-root.log`
- `qa/proofs/20260330-164439-jest-extra.log`
- `TASK_CARFAX_FIX_RESULTS.md`

**What the evidence proves**
- Some scraper helpers and VDP extraction logic have unit-test coverage.
- Current-head logs show targeted scraper-related Jest suites passed on 2026-03-30.
- CARFAX URL/badge extraction has a documented implementation/result snapshot.

**Why this still fails**
- No fresh `2026-03-31` scrape proof for this run.
- No 10-dealership reconciliation output.
- No vehicle-by-vehicle accuracy report against dealer source pages.
- No proof that sampled photos are the **right** photos rather than merely non-empty arrays.
- No current-run deletion/removal sync proof across 10 dealerships.
- `TASK_CARFAX_FIX_RESULTS.md` is a narrative result file, not a current-run reproducible proof artifact.
- Existing tests are mostly unit/integration scope; they do not prove live fidelity at launch scale.

**Category verdict**: **FAIL**

**Smallest unblock action**
Produce a current-run scrape validation bundle under `tmp/swarm-launch10/` with:
- 10 dealership IDs/slugs
- per-dealership inventory snapshots
- sampled vehicle reconciliations
- mismatch counts by field
- explicit stale/removed inventory handling proof
- CARFAX availability/no-claim proof samples

---

### 2) AI Facebook posting
**Pass criteria**
1. Fresh current-run proof shows the posting flow completes for at least **1 test listing in each of 10 dealership contexts** or a justified equivalent proving tenant isolation plus repeated success.
2. Proof must show:
   - correct title
   - correct price
   - correct odometer handling
   - correct photo upload count
   - correct description without duplicated/conflicting facts
   - successful Next -> Publish transition
3. Queue/state proof must exist for job claim, post result, error recording, and tenant isolation.
4. At least one artifact must be UI/runtime proof, not just code inspection: screenshot/video/browser log/post URL/result JSON.
5. Failure handling must show operator-visible status and retriable errors.

**Current evidence found**
- `chrome-extension/src/content-facebook.ts`
- `chrome-extension/src/popup.tsx`
- `chrome-extension/manifest.json`
- `server/tests/autopost-queue-service.test.ts`
- `qa/proofs/20260330-164439-jest-extra.log`
- `TASK_FIX_FB_POST.md`
- `TASK_FIX_FB_POSTING.md`

**What the evidence proves**
- Code exists for automated image upload attempts, min-300 odometer enforcement, and auto-clicking Next/Publish.
- Manifest includes `debugger` permission.
- Queue logic has DB-backed tests for claim/result/history/tenant boundaries when `DATABASE_URL` is present.

**Why this still fails**
- No fresh end-to-end post proof in this run.
- No browser artifact showing a real Facebook listing successfully posted.
- `qa/proofs/20260330-164439-jest-extra.log` shows `autopost-queue-service.test.ts` was skipped in the captured run, so the recorded proof does **not** prove FB queue behavior there.
- The existence of upload fallback code is not proof that Facebook accepted all photos in production.
- Task docs are instructions/narratives, not acceptance evidence.
- No 10-dealership repeated-success proof.

**Category verdict**: **FAIL**

**Smallest unblock action**
Capture a current-run FB posting evidence bundle with:
- one successful post artifact path,
- associated queue/result records,
- per-tenant isolation proof,
- and preferably a 10-attempt matrix or justified scaled equivalent.

---

### 3) AI Craigslist posting
**Pass criteria**
1. Fresh current-run proof shows the Craigslist flow reaches a launch-acceptable completion boundary.
2. If the product claim is full autopost, proof must show full autopost. If the product claim is assisted posting, proof must show the claim is narrowed accordingly.
3. UI/runtime proof must show:
   - core fields filled correctly,
   - photos uploaded correctly,
   - posting-area selection behavior,
   - explicit final-submit behavior.
4. Queue/result/error proof must exist analogous to Facebook posting.

**Current evidence found**
- `chrome-extension/src/content-craigslist.ts`
- `server/tests/autopost-queue-service.test.ts`

**What the evidence proves**
- Craigslist assist code exists.

**Why this fails immediately**
- The file header explicitly says `Craigslist Assisted Autopost` and `MUST STOP before final publish/submit`.
- The overlay text explicitly says `LotView will NOT click Publish. Review and submit manually.`
- That directly contradicts any 10-dealership launch claim of AI Craigslist posting being fully launch-ready.
- No current-run E2E proof exists.
- No current-run queue/result proof specific to live Craigslist posting exists.

**Category verdict**: **FAIL (hard fail / contradiction)**

**Smallest unblock action**
Decide the real product claim:
- either downgrade launch scope to `Craigslist assist only`, or
- implement and prove full submit automation with current-run artifacts.

---

### 4) AI message handling, including CARFAX questions
**Pass criteria**
1. Fresh current-run proof shows inbound Facebook Marketplace messages are detected, mapped to the right thread/listing/vehicle, and processed with auditable outcomes.
2. Safety envelope proof must cover:
   - DNC handling
   - escalation
   - business-hour enforcement
   - rate limiting
   - wrong-vehicle grounding rejection
   - stale/sold inventory rejection
3. CARFAX/history questions must prove:
   - grounded yes/no behavior,
   - no invented accident/history claims,
   - correct behavior when only a link/badge exists,
   - escalation/block when grounding is missing.
4. At least one runtime artifact must show the full detect -> decide -> reply or block path.

**Current evidence found**
- `chrome-extension/src/content-facebook-messenger.ts`
- `server/tests/fb-replies-decide-send.unit.test.ts`
- `server/tests/ai-prompts-trust.test.ts`
- `TASK_AI_AUTOREPLY_RESULTS.md`
- `TASK_CARFAX_FIX_RESULTS.md`

**What the evidence proves**
- There is meaningful policy logic for DNC, escalation, rate limits, business hours, stale inventory rejection, and grounded CARFAX handling.
- Unit tests explicitly deny unsupported CARFAX/history claims and wrong-vehicle claims.
- Prompt tests explicitly hard-block invented history summaries.

**Why this still fails**
- No current-run runtime proof of an actual inbox event being safely auto-sent or blocked.
- No fresh artifact tying browser detection, background request, policy decision, and final audit record together.
- `TASK_AI_AUTOREPLY_RESULTS.md` says build verification succeeded, but that is not launch proof for live message handling.
- No 10-dealership concurrency/tenant proof for reply routing.

**Category verdict**: **FAIL**

**Smallest unblock action**
Capture a current-run message-handling bundle with:
- one grounded CARFAX-asked thread,
- one unsupported-history block/escalation case,
- one normal availability reply case,
- audit/event artifacts and tenant mapping proof.

---

## Cross-category proof gaps
These block launch approval even if individual code paths look promising.

1. **Freshness gap**
   - Most proof artifacts found are dated `2026-03-30`, not this `2026-03-31` run.
2. **Scale gap**
   - No evidence bundle demonstrates 10 dealership behavior.
3. **End-to-end gap**
   - Strong code presence, weak runtime proof.
4. **Claim mismatch gap**
   - Craigslist code explicitly stops short of publish.
5. **Reviewer gate still pending**
   - Completion contract says reviewer required.

---

## Exact evidence paths used
- `qa/proofs/20260330-164439-jest-root.log`
- `qa/proofs/20260330-164439-jest-extra.log`
- `server/tests/robust-scraper-validation.test.ts`
- `server/tests/robust-scraper-vdp.test.ts`
- `server/tests/autopost-queue-service.test.ts`
- `server/tests/fb-replies-decide-send.unit.test.ts`
- `server/tests/ai-prompts-trust.test.ts`
- `chrome-extension/src/content-facebook.ts`
- `chrome-extension/src/popup.tsx`
- `chrome-extension/src/content-craigslist.ts`
- `chrome-extension/src/content-facebook-messenger.ts`
- `chrome-extension/manifest.json`
- `TASK_AI_AUTOREPLY_RESULTS.md`
- `TASK_CARFAX_FIX_RESULTS.md`
- `TASK_FIX_FB_POST.md`
- `TASK_FIX_FB_POSTING.md`
- `LOTVIEW_ACCEPTANCE_TESTS.md`
- `release_readiness_2026-03-29.md`

## Final QA decision
**Do not approve launch.**

### Exact blocker
Fresh, run-specific, end-to-end evidence for the four named launch surfaces does not exist at the required standard, and Craigslist currently contains an explicit manual-submit boundary that contradicts a full launch-ready autopost claim.

### Why it blocks
Without current-run proof, this would be approving a plan based on code presence and historical narratives rather than validated launch behavior.

### Smallest unblock action
Generate a current-run proof bundle under `tmp/swarm-launch10/` that contains:
- 10-dealership scrape fidelity reconciliation
- at least one proven FB post path with queue/result artifacts
- either a corrected Craigslist claim (`assist only`) or real submit proof
- message-handling runtime artifacts including one CARFAX-grounded case and one unsupported-history block case
- reviewer signoff after those artifacts exist
