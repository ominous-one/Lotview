# LotView Automation Overhaul — DELIVERABLE MATRIX (v1.1)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Master plan:** `plans/automation-overhaul/MASTER_PLAN_V1_1.md`
>
> **Supersedes:** `plans/automation-overhaul/DELIVERABLE_MATRIX_V1.md`

---

## Deliverables index (this file)

| Deliverable | Path | Status |
|---|---|---|
| Deliverable matrix v1.1 (this document) | `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_1.md` | ✅ Delivered |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** enumerate implementation deliverables for v1.1 across extension + backend + web app + data, including the new Marketplace replies workstream.
- **Out of scope:** writing production code in this task; signing vendors; sending messages to real users.
- **Assumptions:** Next.js + Postgres; MV3 extension exists and already autoposts to FB Marketplace.
- **Inputs needed (if any):** none to produce this matrix.

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\DELIVERABLE_MATRIX_V1_1.md`

### 2) Acceptance criteria
- Matrix includes: deliverable, owner role/agent, exact path/artifact, dependencies, acceptance criteria, validation steps.
- Includes explicit approval gates for external side effects (Craigslist account creation, paid APIs, scraping scale-up, **sending Marketplace messages**).

### 3) Validation steps
- Re-open file and confirm all rows have objective acceptance + validation.

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- Planning only.

---

## Matrix

**Legend (Owner):**
- **architect** = systems/plan/spec
- **ext** = extension engineer
- **be** = backend engineer
- **fe** = web app engineer
- **data** = data/ML engineer
- **qa** = QA/test engineer

| # | Workstream | Deliverable | Owner | Artifact / Path | Depends on | Acceptance criteria (objective) | Validation steps |
|---:|---|---|---|---|---|---|---|
| 1 | Cross-cutting | Master plan v1.1 | architect | `plans/automation-overhaul/MASTER_PLAN_V1_1.md` | — | Includes Workstream 4D, approval gates, acceptance + validation | Open file; spot-check §2 and §6 |
| 2 | Cross-cutting | Deliverable matrix v1.1 | architect | `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_1.md` | #1 | All workstreams covered; objective gates included | Open file; scan for “TBD” |
| 3 | Cross-cutting | Spawn plan v1.1 | architect | `plans/automation-overhaul/SPAWN_PLAN_V1_1.md` | #1 | Spawns cover 4A–4D; each has DoD contract | Open file; check 2 spawns for full DoD |
| 4 | Marketplace replies | End-to-end spec | architect | `plans/automation-overhaul/FB_MARKETPLACE_REPLIES_SPEC.md` | #1 | Data model, flows, prompts, safety, QA | Open file; confirm policy gates + state machine |
| 5 | Marketplace replies | World-class sales playbook | architect | `plans/automation-overhaul/SALES_PLAYBOOK_WORLDCLASS.md` | #4 | Templates + scripts + disclaimers + tone | Open file; ensure templates cover common objections |
| 6 | Data contracts | PostingJob schema (normalized) | architect/be | `plans/automation-overhaul/schemas/POSTING_JOB.schema.json` | #1 | Schema includes craigslist+facebook fields, audit fields; versioned | JSON validates; sample job passes |
| 7 | Data contracts | CompetitiveReport schema | architect/be | `plans/automation-overhaul/schemas/COMPETITIVE_REPORT.schema.json` | Vendor decision | Includes required fields (price, DOM, mileage, trim, condition, accident history, colors) + unknowns | Validate with example payload |
| 8 | Data contracts | VehicleSpecNormalized schema | architect/data | `plans/automation-overhaul/schemas/VEHICLE_SPEC_NORMALIZED.schema.json` | — | Includes trim confidence + options list + sources | Validate JSON + example |
| 9 | Data contracts | CompListing schema | architect/data | `plans/automation-overhaul/schemas/COMP_LISTING.schema.json` | — | Includes listing source + required report fields + provenance | Validate JSON + example |
| 10 | **NEW: Data contracts** | ConversationThread schema | architect/be | `plans/automation-overhaul/schemas/CONVERSATION_THREAD.schema.json` | #4 | Encodes thread id, dealerId, fbIdentity, vehicle mapping, state | Validate JSON + example thread |
| 11 | **NEW: Data contracts** | ConversationMessage schema | architect/be | `plans/automation-overhaul/schemas/CONVERSATION_MESSAGE.schema.json` | #4 | Encodes direction, sender, timestamps, content, safety flags | Validate JSON + example transcript |
| 12 | **NEW: Data contracts** | ReplySuggestion schema | architect/be | `plans/automation-overhaul/schemas/REPLY_SUGGESTION.schema.json` | #4 | Includes text, rationale, policy checks, confidence, sendMode | Validate JSON + example suggestions |
| 13 | Backend | DB migration: vin_decode_cache | be | `db/migrations/*_vin_decode_cache.sql` (or ORM equivalent) | #8 | Cache by VIN; TTL; source + confidence | Run migrations in dev; insert/select |
| 14 | Backend | DB migration: competitive_report_snapshot | be | `db/migrations/*_competitive_report_snapshot.sql` | #7 | Snapshot table stores params, generatedAt, dealerId, radiusKm, summary, blob/JSON | Run migrations; create snapshot |
| 15 | Backend | DB migration: posting_audit_log | be | `db/migrations/*_posting_audit_log.sql` | #6 | Logs assisted autopost attempts; no credentials stored | Run migrations; write log entry |
| 16 | **NEW: Backend** | DB migrations: conversation store | be | `db/migrations/*_conversation_threads.sql` + `*_conversation_messages.sql` + `*_reply_suggestions.sql` + `*_policy_decisions.sql` | #10–#12 | Stores threads/messages/suggestions; indexes for inbox | Run migrations; seed and query inbox |
| 17 | Backend | Rate limiting + caching module | be | `src/server/lib/rateLimit.ts` + `cache.ts` (paths TBD) | — | Per-domain token bucket + backoff + circuit breaker | Unit tests for 429/403 + backoff |
| 18 | Backend | Vendor client (API-first) | be | `src/server/vendors/<vendor>.ts` | Vendor decision | Supports comps search in km radii; maps to normalized schema | Integration tests with mocked responses |
| 19 | Backend | ZenRows fetcher fallback | be | `src/server/vendors/zenrows.ts` | ZenRows config exists | Escalation ladder + cost caps + cache | Simulate block pages; assert fallback triggered |
| 20 | Backend | Report generator worker (48h) | be | `src/server/jobs/competitiveReport.ts` | #14, #18 | Generates per-dealer snapshot; idempotent; stores report | Run job twice; verify no duplicates |
| 21 | Web app | Sales Manager dashboard (report) | fe | `src/app/(sales)/competitive-report/*` | #20 | Shows latest snapshot, drilldowns, CSV export | Manual QA with seeded data |
| 22 | Data/logic | Comps scoring engine (Canada-only) | data/be | `src/server/comps/score.ts` | #8, #9 | Deterministic scoring; exact-trim default; near-trim toggle | Unit tests: exact vs near-trim ranking |
| 23 | Data/logic | VIN decode router (cheap hybrid) | be/data | `src/server/vin/router.ts` | #13, vendor decisions | Always baseline decode; paid enrichment only on triggers; caches results | Unit tests: trigger rules + caching |
| 24 | Extension | Craigslist driver (background orchestration) | ext | `extension/src/drivers/craigslist.ts` | #6 | Opens correct domain, injects content script, sends fill message | Manual run in dev extension |
| 25 | Extension | Craigslist content script stepper | ext | `extension/src/content/craigslist.ts` | #24 | Detects steps; fills fields; uploads images; stops before publish | Manual QA + DOM fixture tests |
| 26 | Extension | Publish prevention gate (Craigslist) | ext/qa | tests + runtime checks | — | Extension never triggers final publish click | Static scan + manual QA |
| 27 | Ops | Feature flags + kill switch | be | `src/server/config/flags.ts` | — | Can disable craigslist assist and/or scraping per dealer globally | Toggle in dev; verify behavior |
| 28 | Compliance | Craigslist compliance decision record (CDR) | architect | `plans/automation-overhaul/COMPLIANCE_CRAIGSLIST_CDR.md` | Legal input | Records ToS risk, posture, fallback mode, go/no-go | Open file; verify decision captured |
| 29 | Approvals | Approval gate doc (account creation + paid vendors + messaging) | architect | `plans/automation-overhaul/APPROVAL_GATES.md` | — | Explicitly lists all external side effects requiring approval | Review list completeness |
| 30 | **NEW: Extension** | Marketplace inbox ingestion (DOM bridge) | ext | `extension/src/drivers/fbInbox.ts` + `extension/src/content/fbInbox.ts` (paths TBD) | #4, #16 | Captures threads/messages reliably; does not auto-send by default | Manual QA with test FB account; logs show captures |
| 31 | **NEW: Backend** | Ingestion API endpoints | be | `src/server/api/fb/inbox/*` (paths TBD) | #16, #30 | Authenticated; validates schemas; idempotent inserts | Postman/REST test; duplicate events safe |
| 32 | **NEW: Backend** | Reply suggestion generator | be/data | `src/server/ai/replies/generate.ts` | #4, #5, #12 | Produces 1–3 suggestions; includes policy check results | Unit tests with fixtures; golden transcripts |
| 33 | **NEW: Web app** | Sales Inbox UI + conversation view | fe | `src/app/(sales)/inbox/*` | #16, #31 | Shows transcript + vehicle card + suggestions + send controls | Manual QA with seeded data |
| 34 | **NEW: Web app** | Send approval UX + audit log view | fe | `src/app/(sales)/inbox/*` | #33 | Manual send requires explicit click; logs displayed | Manual QA: cannot send without click |
| 35 | **NEW: Backend/Ext** | Optional send bridge (only when approved) | be/ext | `src/server/api/fb/send/*` + extension send hook | Approval gate §6 | No outbound without approval; auto-send requires explicit opt-in | E2E test in sandbox; ensure safe stop |
| 36 | **NEW: QA** | Conversation safety + quality test suite | qa | `plans/automation-overhaul/testdata/fb_convo_fixtures/*` + `tests/fbReplies.test.ts` | #4, #5, #32 | Covers objections, DNC, injection, escalation | Run tests; review failure diffs |

---

## Approval gates (must be enforced)
- Craigslist dealer account creation: user creates accounts OR explicit approval.
- Paid vendor onboarding/API keys: explicit approval.
- Scraping scale-up to new sources: explicit approval + ToS review.
- **Marketplace messaging:** no messages sent without explicit user approval unless auto-reply explicitly enabled by user.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- The matrix references implementation artifacts (schemas, migrations, code) not created by this planning task.

### Why missing
- This task is to publish the revised master plan + matrix + spawn plan + Marketplace spec + sales playbook. Implementation artifacts are owned by the next spawns.

### Auto-fill action
- The spawn plan (`plans/automation-overhaul/SPAWN_PLAN_V1_1.md`) includes concrete next spawns to create the referenced artifacts with DoD contracts.
