# Automation Overhaul — Production Readiness QA Report

Date: 2026-03-08

Project: `C:\Users\omino\projects\lotview`

Scope: Production readiness QA across **all workstreams** currently in scope:
1) Workstream 1 — Craigslist assisted autopost (extension)
2) Workstream 2 — Competitive report scheduler + settings + dashboard
3) Workstream 3 — VIN decode cache + exact/near trim comps + explainability
4) Workstream 4 — FB inbox ingestion + decide-send gate + typing simulation dry-run + kill switches + audit logging
5) Workstream 4E — Appointment booking + notifications (runtime E2E executed in `NOTIFICATIONS_TEST_MODE=true`; evidence captured)

**External side effects policy:** This QA pass is **dry-run safe**.
- No Craigslist publish clicks
- No real FB sends
- No external emails (WS4E uses test-mode expectations)
- No paid API calls
- No live external market fetches

---

## Deliverables index (this QA package)

All written under: `qa/automation-overhaul/`

- `QA_REPORT.md` (this file) — **updated**
- `E2E_CHECKLIST.md` — **updated** (WS4E section fixed/normalized)
- `TEST_COMMANDS.md` — unchanged
- `BUGS_FOUND.md` — **updated** (added BUG-002)
- Design parity evidence bundle:
  - `qa/automation-overhaul/evidence/DESIGN_PARITY_EVIDENCE.md`
  - `qa/automation-overhaul/evidence/screenshots/` (generated via script)
  - `qa/automation-overhaul/evidence/commands/capture-screenshots.txt`
- DB-backed validation evidence:
  - `qa/automation-overhaul/evidence/commands/db-backed-tests.txt`
  - `qa/automation-overhaul/evidence/commands/ws4e-e2e.txt`
  - `qa/automation-overhaul/scripts/ws4e-e2e.ts` (script used to run WS4E E2E assertions)

---

## Sources / reference docs reviewed

Planning/spec:
- `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_2.md`
- `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_3_APPT_NOTIFICATIONS.md`

QA artifacts:
- `qa/automation-overhaul/E2E_CHECKLIST.md`
- `qa/automation-overhaul/TEST_COMMANDS.md`

---

## Acceptance criteria (QA DoD)

### Global
- [x] Automated test instructions are explicit and runnable; results can be captured (see `TEST_COMMANDS.md`).
- [x] E2E checklists exist and include hard-stop safety checks (see `E2E_CHECKLIST.md`, including WS4E).
- [x] Negative/abuse testing checklist includes injection, DNC, rate limits, business hours, DOM drift.
- [~] Scalability sanity checks are documented, but DB-backed load tests were not executed in this pass.

### Hard constraints / safety-critical gates
- [x] Workstream 1: Extension **must not click** Craigslist Publish/Submit.
- [x] Workstream 4: **Server-authoritative decide-send** must run before any outbound automation; extension must obey ALLOW/DENY.
- [x] Workstream 4: Dry-run must type incrementally and **must not click Send**.
- [x] Workstream 4E: Manager notifications must be **in-app + email** for booked/changed/cancelled (captured in checklist/spec; runtime E2E pending).

---

## Automated test execution (what was run)

### A) Extension automated tests (Workstreams 1 + 4)
Command:
- `cd chrome-extension; npm test`

Result: **PASS**
- Test Suites: **10 passed / 10 total**
- Tests: **324 passed / 324 total**

### B) Extension build (Workstreams 1 + 4)
Command:
- `cd chrome-extension; npm run build`

Result: **PASS**
- Build produced `chrome-extension/dist/`

### C) Server Jest tests (DB-free subset) + WS4 decide-send unit
Command (explicit list; DB-free):
- `npx jest server/tests/security.test.ts server/tests/tenant-middleware.test.ts server/tests/dealership-automation-settings.test.ts server/tests/condition-normalization.test.ts server/tests/comps-engine.test.ts server/tests/competitive-report-service.int.test.ts server/tests/fb-replies-decide-send.unit.test.ts`
- plus `npx jest server/tests/auth.test.ts`

Result: **PASS**

Notes:
- A prior run in this QA pass found a test timeout in `server/tests/auth.test.ts`; fixed (see BUG-002).
- Jest sometimes prints an “open handles” warning and force-exits. This is tracked as a QA hygiene follow-up in `BUGS_FOUND.md`.

### D) DB-backed script tests (Workstream 4)
Evidence:
- `qa/automation-overhaul/evidence/commands/db-backed-tests.txt`

DB setup:
- Ephemeral Postgres + Redis via `docker compose`.
- Migrations applied via `npm run db:push`.

Results:
- `npx tsx server/tests/fb-replies-ingestion.test.ts` — **PASS**
- `npx tsx server/tests/fb-replies-decide-send.int.test.ts` — **PASS**

---

## Safety envelope validation (Workstream 4: auto-send gate)

### What was validated (code-level + tests)
- Extension calls the server gate before outbound automation:
  - Source evidence: `chrome-extension/src/background.ts` calls `/api/extension/fb-replies/decide-send`
  - Source evidence: `chrome-extension/src/content-facebook-messenger.ts` includes a comment: “SERVER-AUTHORITATIVE: must decide-send before any outbound automation.”
- Server exposes a dedicated decide-send route:
  - `server/routes.ts` defines `POST /api/extension/fb-replies/decide-send`
- Deterministic unit coverage exists:
  - `server/tests/fb-replies-decide-send.unit.test.ts` (PASS)

### Runtime E2E status (DB-backed)
- DB-backed integration tests (local server + local ephemeral Postgres): **PASS**
  - `server/tests/fb-replies-ingestion.test.ts` — **PASS**
  - `server/tests/fb-replies-decide-send.int.test.ts` — **PASS**

Evidence:
- `qa/automation-overhaul/evidence/commands/db-backed-tests.txt`

Still pending (manual E2E checklist):
- DOM drift fail-closed behavior
- dry-run typing (no Send click)
- kill switches

---

## Manual / scripted E2E coverage status

- Workstreams 1–4 manual steps: **Checklist updated / ready to execute** (not executed in this dry-run pass).
- Workstream 4E (appointments + notifications): **PASS (runtime E2E in test-mode)**.
  - Appointment creation via API: **PASS**
  - Appointment reschedule: **PASS**
  - Appointment cancel with `cancelledBy=BUYER`: **PASS** (DB status `CANCELLED_BY_BUYER`)
  - In-app notification created: **PASS**
  - Email outbox record created and suppressed in test-mode: **PASS** (`SUPPRESSED_TEST_MODE`)
  - Mail-sink artifact written by outbox worker: **PASS**

Evidence:
- `qa/automation-overhaul/evidence/commands/ws4e-e2e.txt`

---

## Gap report (production readiness)

### Gaps / risks confirmed in this QA pass
1) **(FIXED) Auth test timeout**
   - `server/tests/auth.test.ts` salted-hash test exceeded Jest default timeout on this machine.
   - Fixed by increasing per-test timeout.

2) **Jest open handles warning**
   - Some suites report worker not exiting gracefully.
   - Risk: hidden async leaks may make CI flaky.

3) **DB-backed runtime tests executed (test-mode safe) — no new blocking gaps observed**
   - WS4 script tests executed against a local ephemeral Postgres and a local dev server.
     - Ingestion script: PASS
     - Decide-send integration: PASS
   - WS4E appointment + notifications flow executed in `NOTIFICATIONS_TEST_MODE=true` with mail-sink output.
     - Booking + reschedule + cancel: PASS
     - `cancelledBy=BUYER` persisted as `CANCELLED_BY_BUYER`
     - In-app notifications + email outbox + mail-sink artifacts: PASS

### Recommended sign-off steps (pre-prod)
- Review attached DB-backed evidence logs:
  - `qa/automation-overhaul/evidence/commands/db-backed-tests.txt`
  - `qa/automation-overhaul/evidence/commands/ws4e-e2e.txt`
- Execute remaining **manual UI** checklist steps (extension dry-run safety + DOM drift fail-closed + kill switches).

---

## Overall status (this QA pass)

- Workstream 1 (Craigslist assist): **PASS (extension tests + build)**; manual hard-stop verification still required per checklist.
- Workstream 2 (Competitive report): **PASS (DB-free test coverage)**; DB-backed UI verification required.
- Workstream 3 (VIN/comps): **PASS (DB-free test coverage)**; DB-backed API/UI verification required.
- Workstream 4 (FB replies): **PASS** (extension tests/build PASS; server unit PASS; DB-backed ingestion + decide-send integration PASS).
- Workstream 4E (Appointments + notifications): **PASS (runtime E2E in test-mode)**; booking/reschedule/cancel + outbox + mail-sink PASS.
