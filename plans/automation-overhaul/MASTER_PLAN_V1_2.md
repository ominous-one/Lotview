# LotView Automation Overhaul — MASTER PLAN (v1.2)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Supersedes:**
> - `plans/automation-overhaul/MASTER_PLAN_V1_1.md`
>
> **Applies to:**
> - Chrome Extension (Craigslist assisted autopost)
> - Sales Manager competitive report (Canada-only)
> - Appraisal/comps engine + VIN/options (cheap hybrid)
> - Facebook Marketplace replies (AI assists/automates message replies like a world-class automotive sales expert)
>
> **Change summary (v1.2):**
> - Incorporates `RESEARCHER_CRITIQUE_V1_1.md` user final decisions:
>   - **FB Marketplace replies: AUTO-SEND enabled by default**
>   - Replies must include **lead name** + **vehicle personalization**
>   - Outbound delivery uses **typing simulation delay** (configurable + jitter)
> - Adds **world-class UI / design system** deliverables + acceptance gates.

---

## Deliverables index (this plan)

| Deliverable | Path |
|---|---|
| Master plan v1.2 (this document) | `plans/automation-overhaul/MASTER_PLAN_V1_2.md` |
| Deliverable matrix v1.2 | `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_2.md` |
| Spawn plan v1.2 | `plans/automation-overhaul/SPAWN_PLAN_V1_2.md` |
| Design brief v1.2 | `plans/automation-overhaul/DESIGN_BRIEF_V1_2.md` |
| FB Marketplace replies spec (current) | `plans/automation-overhaul/FB_MARKETPLACE_REPLIES_SPEC.md` |
| Researcher critique (source) | `plans/automation-overhaul/RESEARCHER_CRITIQUE_V1_1.md` |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope**
  - Maintain v1 workstreams 4A–4C as-is.
  - Update workstream 4D defaults and safeguards to match user decisions.
  - Add **world-class UI requirements** and design deliverables gates across workstreams.
  - Update work breakdown to reflect design + reviewer parallelization.
- **Out of scope**
  - Writing production code.
  - Using real FB/Craigslist accounts or sending messages.
- **Assumptions**
  - Web app: Next.js + Tailwind + shadcn/ui.
  - MV3 extension exists and already autoposts to FB Marketplace.
  - Marketplace messaging automation is via extension UI automation.
- **Inputs needed (only if truly blocking)**
  - None for planning. (Implementation will later need dealer preferences like business hours/timezone.)

### 1) Deliverables checklist (MUST be explicit)
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\MASTER_PLAN_V1_2.md` — updated plan with v1.2 constraints.
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\DELIVERABLE_MATRIX_V1_2.md` — includes explicit design artifacts + quality gates.
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\SPAWN_PLAN_V1_2.md` — includes `designer` early and `reviewer` enforcing design quality.
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\DESIGN_BRIEF_V1_2.md` — world-class UI principles + deliverables + acceptance criteria.

### 2) Acceptance criteria
- All checklist files exist at the exact paths above.
- v1.2 plan is internally consistent with:
  - `RESEARCHER_CRITIQUE_V1_1.md` final decisions,
  - `PROJECT.md` audience and stack,
  - `BRAND.md` voice + visual constraints.
- Explicitly states:
  - FB auto-send default ON,
  - lead name + vehicle personalization requirement,
  - typing simulation delay requirement,
  - kill switches + audit visibility requirements.

### 3) Validation steps
- Re-open the 4 delivered files and confirm:
  - no “Auto-send OFF by default” language remains,
  - typing simulation parameters are specified at least at planning level,
  - design deliverables paths are present in the matrix and spawn plan.

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- Planning only.

---

## 1) Executive summary (what we’re shipping)

### 1.1 Workstream 4A — Craigslist assisted autopost (Chrome extension)
- Salesperson selects a unit → clicks **“Post to Craigslist (Assist)”**.
- Extension fills fields + uploads photos, then **stops at the preview/review step**.
- **User must click Publish** on Craigslist.
- Every attempt is logged to LotView for audit.

### 1.2 Workstream 4B — Sales Manager competitive report (every 48h; Canada-only)
- Backend job runs every 48 hours per dealer.
- Sales Manager dashboard shows snapshots + drilldowns.
- Output includes required fields: **price, days on lot, mileage, trim, condition, accident history, exterior/interior color** with explicit unknowns.

### 1.3 Workstream 4C — Appraisal/comps + VIN/options (cheap hybrid; Canada-only)
- Sales Manager appraises a trade-in/unit and pulls comps.
- Radius selectable; exact trim default; near-trim option.
- VIN decode uses **cheap hybrid router**: free baseline always; paid enrichment only when needed.

### 1.4 Workstream 4D — Facebook Marketplace replies (AUTO-SEND default ON; policy-gated)
- Ingest Marketplace messages via extension DOM bridge.
- Generate replies aligned to LotView voice and dealer compliance.
- **Auto-send is enabled by default** (per user decision) but only within a strict **safety envelope**:
  - allowlist intents,
  - name + vehicle confidence thresholds,
  - rate limits + anti-loop guards,
  - business hours limits,
  - action-block detection → auto-pause.
- All outbound delivery uses **typing simulation** (length-based, jittered, configurable).

---

## 2) Hard constraints (must not drift)

1) Craigslist: **assisted autopost** (prefill + human confirm submit).
2) Competitive pricing: **API-first + ZenRows fallback**.
3) VIN/options: **cheap hybrid** with **trim exactness required**; allow near-trim option.
4) Sales manager: web app; **in-app dashboard report**.
5) Competitive report fields must include: **price, days on lot, mileage, trim, condition, accident history, exterior/interior color**.
6) Appraisal/comps: radius selectable; mileage tolerance disregarded; exact trim default; near-trim option; **Canada-only**.
7) Regions at launch: **Tri-Cities BC, Surrey BC, Whistler area**.
8) Scraping public sources is approved, but we must implement rate limits and ToS risk notes.
9) ZenRows is already in project; design assumes it is available for fallback fetches.

**Workstream 4D (v1.2) constraints for Marketplace replies**
10) **AUTO-SEND is enabled by default** (user decision) but must be constrained by the Safety Envelope in §4D.8.
11) Replies must be **personalized** with:
   - the **lead’s name** (when confidently extracted), and
   - the **vehicle identity** (year/make/model/trim) tied to the conversation.
12) Outbound delivery uses **typing simulation delay**:
   - length-based,
   - configurable per dealer/user,
   - jittered to avoid robotic patterns,
   - abortable.
13) Must provide **kill switches** (global + per-thread) and **audit visibility** for every outbound message.
14) **Do-not-contact always wins**.
15) **No sensitive data collection**.
16) **Safe claims**: unknowns are stated as unknown; no guarantees.

---

## 3) World-class UI requirements (applies to all workstreams)

- “World-class” is defined and enforced via `plans/automation-overhaul/DESIGN_BRIEF_V1_2.md`.
- Each workstream must ship:
  - clear primary flows,
  - loading/empty/error states,
  - accessible controls,
  - audit visibility where automation exists,
  - kill switches.

---

## 4) Workstreams and specs

## 4A) Craigslist assisted autopost (Chrome extension)

### 4A.1 UX behavior
- Button: **Post to Craigslist (Assist)**.
- User selects posting area if not resolved:
  - Tri-Cities BC / Surrey BC / Whistler area.
- Extension fills listing fields and uploads photos.
- Extension stops at review step with a callout: **“Review and click Publish on Craigslist.”**

### 4A.2 QA gates
- Must never click final publish.
- Must handle login/captcha/limits by stopping and instructing user.

---

## 4B) Competitive report (Sales Manager dashboard)

### 4B.1 Cadence + scope
- Every 48 hours per dealer.
- **Canada-only** comps.

### 4B.2 Source strategy (required)
- **API-first**, ZenRows fallback.
- Aggressive caching + rate limits.

---

## 4C) Appraisal/comps engine + VIN/options (cheap hybrid)

### 4C.1 VIN decode router
- Always baseline decode (free).
- Paid enrichment only on triggers (trim/options ambiguity).

### 4C.2 Trim handling
- Exact trim default; near-trim toggle.

---

## 4D) Facebook Marketplace replies (AUTO-SEND default ON)

**Objective:** respond fast like a top salesperson while minimizing compliance and account-health risk.

### 4D.1 Architecture (unchanged core)
- Extension DOM bridge ingests threads/messages → backend store.
- Backend generates reply suggestions + policy reports.
- Web app shows Sales Inbox + audit + controls.
- Extension performs outbound sends via UI automation.

### 4D.2 Default send mode (v1.2)
- **AUTO-SEND is ON by default** at the dealership policy level.
- However, the system must treat auto-send as a **narrow, constrained capability**, not a blanket permission.

### 4D.3 Personalization requirements (non-negotiable)
Every outbound message must include:
- **Lead name** (e.g., “Hey Sam—”) **only when confidently extracted**.
- **Vehicle identity** (e.g., “the 2019 F-150 XLT”) from mapped inventory.

**Confidence gating:**
- If lead name confidence is below threshold → do **not** auto-send; queue for human or require confirmation.
- If vehicle mapping confidence is below threshold → do **not** auto-send; prompt user to select the unit.

### 4D.4 Typing simulation (delivery delay)
Typing simulation must be implemented as incremental input events (not just a wait-before-send).

**Config parameters (per dealer; optionally per user):**
- `msPerCharMin`, `msPerCharMax` (e.g., 30–90ms)
- `minDelayMs`, `maxDelayMs`
- `jitterPct` (or `jitterMs`)
- `pauseEveryNChars` + `pauseDurationMsMin/Max`
- `sendAfterTypingDoneDelayMs`

**Abort conditions:**
- focus lost, thread changed, DOM drift detected, action-block detected, DNC set.

### 4D.5 Safety Envelope (required for auto-send default)
Auto-send is permitted only when **all** are true:
- Thread is not DNC and not escalated.
- Last message is inbound from buyer.
- Intent is allowlisted (dealer-configurable; defaults should be conservative):
  - availability check (“is it still available?”)
  - store hours/location
  - scheduling (“can I see it today?”)
- Not denylisted:
  - negotiation (“lowest price”), offers
  - financing promises/approval requests
  - accident history if unknown
  - warranty specifics beyond known facts
  - shipping/delivery scams
- Lead name confidence ≥ threshold.
- Vehicle mapping confidence ≥ threshold.
- Within business hours (or dealer policy permits after-hours).
- Rate limits not exceeded (per identity/day/hour + burst control).
- Anti-loop guard:
  - never auto-send twice without an inbound,
  - max N auto-turns per thread before escalation.

If any condition fails → generate suggestion but **do not auto-send**; route to human queue.

### 4D.6 Auditability + controls
- Every outbound message (manual or auto) must log:
  - mode (auto/manual), timestamps,
  - extracted lead name + confidence,
  - vehicle mapping method + confidence,
  - policy report summary (allow/deny reasons),
  - typing simulation duration.
- Kill switches:
  - global (dealer) and per-thread.
- Action-block detection must auto-pause outbound sending and surface a clear UI error.

---

## 5) Work breakdown (phased, v1.2)

### Phase 0 — UX + design system foundations (parallelized)
- Define design tokens + component inventory (design system).
- Produce key UX screens for all 4 workstreams.
- Establish reviewer gates for world-class UI.

### Phase 1 — Data + backend foundations (shared)
- Schemas and DB tables for:
  - competitive reports
  - comps listings + VIN cache
  - posting audit logs
  - conversation threads/messages/suggestions/policy decisions

### Phase 2 — Competitive report MVP
- Report worker + dashboard.

### Phase 3 — Appraisal/comps MVP
- VIN router + comps retrieval/scoring + UI.

### Phase 4 — Craigslist assisted autopost
- Driver + content script + review overlay.

### Phase 5 — Marketplace replies MVP (auto-send default ON, envelope enforced)
- Inbox ingestion + policy engine + outbound send with typing simulation.
- Automation settings + audit console + kill switches.

### Phase 6 — Harden + rollout
- Shadow mode, staged ramp, telemetry and DOM drift detector.

---

## 6) Approval gates (explicit)

### 6.1 External side effect: Craigslist dealer account creation
- No account creation without explicit approval.

### 6.2 External side effect: paid APIs
- No paid vendor onboarding or key usage without explicit approval.

### 6.3 External side effect: scraping scale-up
- New sources or scale requires explicit approval + ToS review.

### 6.4 External side effect: sending Marketplace messages
Sending messages to real buyers is an external side effect.
- Engineering must implement strict policy gates and kill switches.
- Any real-world testing that sends messages requires explicit user approval and a sandbox plan.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- This v1.2 master plan updates planning requirements, but does not update `FB_MARKETPLACE_REPLIES_SPEC.md` text (still states auto-send OFF by default).

### Why missing
- This subtask’s required outputs are the v1.2 plan/matrix/spawn/design brief. The Marketplace spec is an existing file not listed as required output.

### Auto-fill action
- In the v1.2 deliverable matrix, add a required patch deliverable to revise `FB_MARKETPLACE_REPLIES_SPEC.md` to v1.2 semantics (or author an addendum) before engineering begins.
