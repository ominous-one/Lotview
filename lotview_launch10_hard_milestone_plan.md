# LotView 10-Dealership Hard Milestone Plan

Status: ACTIVE
Date: 2026-03-31
Scope: first 10 dealerships only

## Truth boundary
This plan is intentionally narrower than a 1000-dealership SaaS plan. It is designed to get LotView to a truthful launch position for the first 10 dealerships with the following priority order:
1. Scraping truth foundation
2. Facebook posting on scrape-certified dealerships
3. AI messaging with grounded CARFAX/history handling
4. Craigslist assist-only or full automation only if proven

## Launch claim allowed today
- Scraping hardening in progress
- Facebook automation groundwork exists
- AI messaging guardrails exist
- Craigslist full autopost is NOT launch-ready; assist-only unless proven otherwise

## Milestone 1 — Scraping truth foundation
Goal: no dealership can enter downstream posting/messaging automation until scraping fidelity is measured, scored, and gated.

### 1.1 Canonical scrape truth contract
Tasks:
- Define field-level reconciliation model for source truth vs normalized vehicle record
- Define pass/fail scoring for VIN, price, images, core details, freshness, and CARFAX readiness
- Define per-dealership scrape gate result with explicit blockers and thresholds

Files:
- `server/scrape-truth-foundation.ts`
- `server/tests/scrape-truth-foundation.test.ts`

Tests:
- weighted scoring stays green when all critical fields match
- VIN mismatch hard-fails gate
- price mismatch over threshold fails gate
- photo/image mismatch blocks gate when above tolerance
- dealership score only passes after 7 consecutive days at 95+
- CARFAX absent => unknown, not fabricated pass

Exit criteria:
- reusable scoring/gating code exists
- Jest proof exists for the scoring contract

### 1.2 Per-vehicle reconciliation artifact generation
Tasks:
- Build machine-readable reconciliation output for sampled vehicles
- Include expected vs observed values and mismatch reasons
- Include confidence and publish-block reasons

Files:
- `server/scrape-truth-foundation.ts`
- `tmp/swarm-launch10/scrape-reconciliation-sample.json` (artifact target)

Tests:
- sampled vehicle emits mismatch entries by field
- exact-match vehicle emits no blocking mismatches

Exit criteria:
- a reconciliation artifact can be generated for a dealership sample

### 1.3 Pre-publish scrape gate
Tasks:
- Add helper that converts reconciliation summary into a publish-eligibility decision
- Block FB/Craigslist/message automation when scrape gate is red

Files:
- `server/scrape-truth-foundation.ts`
- later integration targets:
  - `server/autopost-queue-service.ts`
  - `server/routes.ts`
  - `server/runtime-readiness.ts`

Tests:
- dealership below threshold is blocked
- dealership above threshold but with critical VIN/price mismatch is blocked
- dealership above threshold for 7 consecutive days passes

Exit criteria:
- there is one callable gate function for downstream systems

### 1.4 Gold-set dealership samples
Tasks:
- Create representative sample definitions for each launch dealership
- Cover weird trim, missing CARFAX, sparse images, premium units, trucks, EVs, sold removals

Files:
- `qa/launch10-gold-set/` (new folder)
- `tmp/swarm-launch10/` proof artifacts

Tests:
- fixture-driven reconciliation tests per dealer adapter

Exit criteria:
- every launch dealership has a gold-set sample pack

## Milestone 2 — Facebook launch lane
Goal: only scrape-certified dealerships can queue Facebook posting.

Tasks:
- wire scrape gate into posting eligibility
- capture one real current-run proof bundle per qualified dealership
- store listing URL/result/screenshot/error taxonomy

Files:
- `server/autopost-queue-service.ts`
- `chrome-extension/src/content-facebook.ts`
- `server/tests/autopost-queue-service.test.ts`
- new proof targets under `tmp/swarm-launch10/facebook/`

Tests:
- queue rejects non-certified dealerships
- queue accepts certified dealerships
- result ledger captures vehicle version + account + result state

Exit criteria:
- one truthful FB posting proof path exists

## Milestone 3 — AI messaging with grounded CARFAX handling
Goal: AI replies only when grounded by trusted vehicle/history data.

Tasks:
- hard-wire scrape gate + vehicle truthfulness signals into reply decisions
- add explicit unsupported-history block path
- capture one grounded CARFAX answer + one blocked case artifact

Files:
- `server/routes.ts`
- `server/tests/fb-replies-decide-send.unit.test.ts`
- `server/tests/ai-prompts-trust.test.ts`
- `tmp/swarm-launch10/messaging/`

Tests:
- unsupported CARFAX/history question blocks
- wrong-vehicle context blocks
- grounded case passes

Exit criteria:
- one runtime-proofed grounded reply path exists

## Milestone 4 — Craigslist truth reset
Goal: stop overstating Craigslist.

Tasks:
- narrow claim to assist-only unless/until full publish is implemented and proven
- if full automation is desired, implement explicit submit stage and proof bundle

Files:
- `chrome-extension/src/content-craigslist.ts`
- `README.md`
- launch/readiness docs that mention Craigslist behavior

Tests:
- content script behavior matches product claim
- no docs claim full autopost while code stops before publish

Exit criteria:
- claim and implementation match

## Milestone 5 — Current-run proof package
Goal: reviewer signoff becomes possible.

Required artifacts under `tmp/swarm-launch10/`:
- `engineer-plan.md` ✅
- `qa-proof.md` ✅
- `scrape-reconciliation-sample.json`
- `facebook/` posting proof bundle
- `messaging/` CARFAX grounded + blocked proof bundle
- `reviewer-signoff.md`

## Current blockers
- No current-run 10-dealership scrape reconciliation artifact yet
- No current-run FB posting runtime artifact yet
- Craigslist full autopost claim mismatches current code
- No current-run message runtime artifact yet

## Immediate next implementation target
Start Milestone 1.1 / 1.2 / 1.3 now:
- create scrape truth scoring utility
- create reconciliation output model
- create downstream publish gate helper
- back it with Jest coverage
