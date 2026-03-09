# LotView Automation Overhaul — SPAWN PLAN (v1.1)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Master plan:** `plans/automation-overhaul/MASTER_PLAN_V1_1.md`
>
> **Supersedes:** `plans/automation-overhaul/SPAWN_PLAN_V1.md`
>
> **Purpose:** concrete execution spawns (specialist tasks) that produce implementation-ready specs/code artifacts with DoD contracts.

---

## Deliverables index

| Deliverable | Path | Status |
|---|---|---|
| Spawn plan v1.1 (this document) | `plans/automation-overhaul/SPAWN_PLAN_V1_1.md` | ✅ Delivered |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** define next agent spawns, parallelization, and per-spawn DoD contracts for 4A–4D.
- **Out of scope:** running spawns from this file.
- **Assumptions:** Next.js/Node + MV3 extension.
- **Inputs needed:** vendor choices for API-first; Craigslist account decision; **Marketplace replies send-mode choice** (suggest-only default; auto-reply opt-in).

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\SPAWN_PLAN_V1_1.md`

### 2) Acceptance criteria
- Spawn tasks are grouped by parallel tracks.
- Each spawn includes:
  - scope/out-of-scope
  - exact output file paths
  - acceptance criteria + validation steps
  - explicit approval gates
- Includes new spawns for Marketplace replies (ingestion + UI + policy + QA).

### 3) Validation steps
- Re-open file and spot-check at least 2 spawns for complete DoD sections.

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- No external side effects without explicit user approval.

---

## 1) Parallelization map

**Can run in parallel now (no external side effects):**
- Backend schemas + DB migrations planning (including conversation store)
- Web app dashboard UI scaffolding (mocked data)
- VIN decode router implementation (baseline vPIC)
- Extension Craigslist stepper scaffolding + fixtures
- **Marketplace replies: backend conversation model + suggestion generator (fixture-driven)**
- **Marketplace replies: inbox UI scaffolding (seeded fixtures, no send)**

**Gated by approval/inputs:**
- Craigslist real-flow testing (needs dealer account + user approval gate)
- API vendor connector integration (needs vendor choice + keys)
- Scraping at scale (needs explicit approval)
- **Marketplace outbound send testing** (needs explicit approval; and should start in suggest-only mode)

---

## 2) Recommended spawn sequence (v1.1)

### Spawn 1 — Backend data contracts + DB migrations (foundations + conversation store)
**Owner agent:** `backend`

**DoD Contract**

### 0) Scope + assumptions
- **In scope:** define JSON schemas and implement DB migrations for caches/snapshots/audit logs **plus** conversation threads/messages/suggestions/policy decisions.
- **Out of scope:** vendor integration; outbound messaging.
- **Assumptions:** Postgres.
- **Inputs needed:** none.

### 1) Deliverables checklist
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\POSTING_JOB.schema.json` — includes facebook+craigslist audit fields
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\COMPETITIVE_REPORT.schema.json`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\VEHICLE_SPEC_NORMALIZED.schema.json`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\COMP_LISTING.schema.json`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\CONVERSATION_THREAD.schema.json`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\CONVERSATION_MESSAGE.schema.json`
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\schemas\REPLY_SUGGESTION.schema.json`
- [ ] DB migrations in repo (exact path per codebase conventions):
  - `vin_decode_cache`
  - `competitive_report_snapshot`
  - `posting_audit_log`
  - `conversation_threads`
  - `conversation_messages`
  - `reply_suggestions`
  - `policy_decisions`

### 2) Acceptance criteria
- Schemas include required competitive report fields (including accident history + colors with `unknown` allowed).
- Conversation tables support inbox queries (latest inbound, state, assignee).
- Migrations apply cleanly in dev.

### 3) Validation steps
- Validate schemas with example payloads.
- Apply migrations to a fresh dev DB.

### 4) Gap report + auto-fill
- If repo migration path is unclear, search repo and use the established pattern.

### 5) External side effects
- None.

---

### Spawn 2 — Competitive report generator (API-first) + dashboard (mock-first)
**Owner agent:** `backend+frontend`

**DoD Contract**

### 0) Scope + assumptions
- **In scope:** implement report snapshot generation pipeline with mocked vendor connector; build Sales Manager dashboard wired to snapshot table.
- **Out of scope:** real vendor keys.
- **Assumptions:** 48h cadence.

### 1) Deliverables checklist
- [ ] Backend job: `src/server/jobs/competitiveReport.ts` (or established path)
- [ ] API route(s) to fetch latest snapshot
- [ ] UI pages/components for dashboard
- [ ] CSV export

### 2) Acceptance criteria
- Snapshot is idempotent.
- UI shows required fields and uses `unknown` explicitly.

### 3) Validation steps
- Seed DB with a fake snapshot and render UI.
- Run job twice and verify no duplicates.

### 4) Gap report + auto-fill
- Create any missing fixtures automatically.

### 5) External side effects
- No real external calls.

---

### Spawn 3 — VIN decode router (cheap hybrid) + golden VIN tests
**Owner agent:** `data+backend`

**DoD Contract**

### 0) Scope + assumptions
- **In scope:** baseline vPIC integration, caching, trigger logic for paid enrichment, and golden VIN test harness.
- **Out of scope:** purchasing a paid decoder.

### 1) Deliverables checklist
- [ ] VIN router module + cache reads/writes
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\testdata\golden_vins.csv`
- [ ] Unit tests for deterministic behavior

### 2) Acceptance criteria
- Baseline decode always works.
- Exact-trim default logic supported; near-trim toggle supported.

### 3) Validation steps
- Run tests.

### 4) Gap report + auto-fill
- If exact trim cannot be confirmed from baseline, ensure confidence is low and enrichment trigger fires (without calling paid API).

### 5) External side effects
- Only NHTSA vPIC (free) unless disallowed; otherwise mock.

---

### Spawn 4 — Extension: Craigslist assisted autopost stepper + publish prevention + fallback export
**Owner agent:** `extension`

**Approval gate note:** Real testing requires a Craigslist dealer account.

**DoD Contract**

### 0) Scope + assumptions
- **In scope:** craigslist driver + content script that fills forms and stops at review; never publishes; export/copy fallback.
- **Out of scope:** unattended batch posting.

### 1) Deliverables checklist
- [ ] `extension/src/drivers/craigslist.ts`
- [ ] `extension/src/content/craigslist.ts`
- [ ] `extension/src/config/craigslistAreas.ts` (Tri-Cities/Surrey/Whistler)
- [ ] UI: export/copy post package
- [ ] DOM fixture tests for step detection

### 2) Acceptance criteria
- Extension never clicks publish.
- Works end-to-end through review step for at least one region.

### 3) Validation steps
- Manual QA in dev extension.
- Run fixture tests.

### 4) Gap report + auto-fill
- If any step selectors are unknown, add robust selectors and log diagnostics.

### 5) External side effects
- No account creation without explicit approval.

---

### Spawn 5 — NEW: Marketplace replies (MVP suggest-only) — backend conversation + suggestion generator
**Owner agent:** `backend+data`

**DoD Contract**

### 0) Scope + assumptions
- **In scope:** implement conversation state machine storage + reply suggestion generator using the playbook; fixture-driven; no outbound sending.
- **Out of scope:** auto-send; any real message sending.
- **Assumptions:** OpenAI/Claude available through existing AI abstraction.

### 1) Deliverables checklist
- [ ] Conversation state machine module (paths TBD): `src/server/conversations/stateMachine.ts`
- [ ] Suggestion generator module: `src/server/ai/replies/generate.ts`
- [ ] Safety/policy evaluator: `src/server/ai/replies/policy.ts`
- [ ] Test fixtures: `plans/automation-overhaul/testdata/fb_convo_fixtures/*.json`
- [ ] Unit tests: `tests/fbReplies.test.ts`

### 2) Acceptance criteria
- For each fixture conversation, generator outputs 1–3 suggestions.
- Suggestions include policy check results and escalation flags.
- Generator never outputs prohibited claims per policy.

### 3) Validation steps
- Run tests.
- Review fixture diffs for at least 10 scenarios (price, availability, trade, finance, appointment).

### 4) Gap report + auto-fill
- Add fixtures for any uncovered objection types.

### 5) External side effects
- None.

---

### Spawn 6 — NEW: Marketplace replies — extension ingestion (DOM bridge) + inbox UI (no send)
**Owner agent:** `extension+frontend`

**DoD Contract**

### 0) Scope + assumptions
- **In scope:** capture messages/threads via extension on Marketplace inbox surfaces and display in Sales Inbox UI; no outbound messaging.
- **Out of scope:** any auto-send; any login automation.

### 1) Deliverables checklist
- [ ] Extension driver: `extension/src/drivers/fbInbox.ts`
- [ ] Extension content script: `extension/src/content/fbInbox.ts`
- [ ] Backend ingestion endpoint(s): `src/server/api/fb/inbox/*`
- [ ] Sales Inbox pages/components: `src/app/(sales)/inbox/*`

### 2) Acceptance criteria
- New inbound messages appear in Sales Inbox within N seconds (configurable; e.g., 10–30s polling + event-driven where possible).
- Transcript ordering correct; dedupe works.
- No outbound sends are possible in this spawn.

### 3) Validation steps
- Manual QA with a test FB account and a second buyer account.
- Validate backend records match DOM transcript.

### 4) Gap report + auto-fill
- If thread ids are unstable, implement robust heuristics + warnings.

### 5) External side effects
- No messaging sent by the system.

---

### Spawn 7 — NEW (GATED): Marketplace replies — outbound send bridge + auto-send toggle
**Owner agent:** `backend+extension+qa`

**Approval gate note (HARD):** This spawn may send real messages. It must not be executed without explicit user approval.

**DoD Contract**

### 0) Scope + assumptions
- **In scope:** implement explicit-send path (user click) and optional auto-send (opt-in) with audit logs and kill switch.
- **Out of scope:** mass messaging; anything outside ongoing conversations.

### 1) Deliverables checklist
- [ ] Send API: `src/server/api/fb/send/*`
- [ ] Extension send hook (DOM click + verify send): `extension/src/drivers/fbSend.ts`
- [ ] UI send controls + auto-send toggles + warnings: `src/app/(sales)/inbox/*`
- [ ] Audit log viewer: `src/app/(sales)/inbox/audit/*`
- [ ] E2E tests (as feasible): `tests/fbSend.e2e.ts` (or documented manual script)

### 2) Acceptance criteria
- Manual send requires an explicit click (no background sending).
- Auto-send default OFF; enabling requires confirmation and is visible.
- Every sent message is logged with:
  - who/what sent it,
  - policy checks,
  - state transition.

### 3) Validation steps
- Run in a test environment; confirm no sends occur unless explicitly triggered.
- Verify kill switch disables all sending.

### 4) Gap report + auto-fill
- If selectors are brittle, add guardrails and “send verification” (message must appear in transcript before marking success).

### 5) External side effects
- **Requires explicit user approval before any real message testing.**

---

### Spawn 8 — Vendor connector implementation (after vendor decision)
**Owner agent:** `backend`

**DoD Contract**

### 0) Scope + assumptions
- **In scope:** integrate chosen vendor API for comps/listings; implement km radius support; map to normalized schemas.
- **Out of scope:** signing contracts (user-owned).
- **Inputs needed:** vendor selection + API keys (explicit approval).

### 1) Deliverables checklist
- [ ] Vendor client module(s)
- [ ] Normalization mapping
- [ ] Integration tests with mocked responses

### 2) Acceptance criteria
- Meets radii: 100/250/500/1000/national (Canada-only).
- Emits required report fields with provenance and `unknown` where missing.

### 3) Validation steps
- Run tests; run report job in staging.

### 4) Gap report + auto-fill
- If accident history cannot be provided, ensure schema supports `unknown` and UI displays it.

### 5) External side effects
- No vendor calls without explicit approval.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- None (this file is a plan for spawns; implementation artifacts are owned by those spawns).

### Why missing
- N/A

### Auto-fill action
- N/A
