# LotView Automation Overhaul — MASTER PLAN (v1.1)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Supersedes:** `plans/automation-overhaul/MASTER_PLAN_V1.md`
>
> **Applies to:**
> - Chrome Extension (Craigslist assisted autopost)
> - Sales Manager competitive report (Canada-only)
> - Appraisal/comps engine + VIN/options (cheap hybrid)
> - **NEW (Workstream 4D): Facebook Marketplace replies** (AI assists/automates message replies like a world-class automotive sales expert)

---

## Deliverables index (this plan)

| Deliverable | Path |
|---|---|
| Master plan (this document) | `plans/automation-overhaul/MASTER_PLAN_V1_1.md` |
| Deliverable matrix v1.1 | `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_1.md` |
| Spawn plan v1.1 | `plans/automation-overhaul/SPAWN_PLAN_V1_1.md` |
| FB Marketplace replies spec | `plans/automation-overhaul/FB_MARKETPLACE_REPLIES_SPEC.md` |
| World-class sales playbook | `plans/automation-overhaul/SALES_PLAYBOOK_WORLDCLASS.md` |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope**
  - Existing workstreams from v1:
    - **4A Craigslist assisted autopost** (prefill + upload; stop before publish)
    - **4B Competitive report** (Sales Manager dashboard; every 48h; Canada-only; API-first + ZenRows fallback)
    - **4C Appraisal/comps + VIN/options** (Canada-only; radius selectable; exact-trim default with near-trim option; cheap hybrid VIN/options)
  - **NEW: 4D Facebook Marketplace replies**
    - Conversation ingestion from Facebook Marketplace messaging surfaces.
    - AI-generated suggested replies aligned to LotView brand voice and automotive compliance.
    - Strict policy gates and **explicit user approval** before sending messages to real people (unless user explicitly enables full auto-reply).
    - Sales manager inbox/dashboard view, conversation transcript, suggested replies, and auto-send toggle.
    - Integration points with the existing Facebook autopost flow (working today).
- **Out of scope**
  - Sending messages, logging into Facebook accounts, or touching real customer conversations from this planning artifact.
  - Any claims that require legal approval (we provide guardrails; counsel review is separate).
  - Enterprise CRM integrations (e.g., DealerSocket, VinSolutions) in v1.1.
- **Assumptions**
  - LotView already has (or can add) a backend to store conversation state and suggested replies.
  - The Chrome extension already automates Facebook Marketplace posting (known working flow).
  - Marketplace messaging access is primarily via **web UI automation** (extension) rather than official APIs.
- **Inputs needed (only truly blocking)**
  - **Approval mode choice:** Default = “suggest-only + user click to send”. If user wants auto-reply, they must explicitly opt-in (see §6.4).

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\MASTER_PLAN_V1_1.md`
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\DELIVERABLE_MATRIX_V1_1.md`
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\SPAWN_PLAN_V1_1.md`
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\FB_MARKETPLACE_REPLIES_SPEC.md`
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\SALES_PLAYBOOK_WORLDCLASS.md`

### 2) Acceptance criteria
- All deliverables exist at the exact paths above.
- Plan explicitly preserves the v1 constraints verbatim (see §2) and adds v1.1 constraints for Marketplace replies:
  - **Default policy gate:** no outbound message to a real person without explicit user approval per message.
  - **Auto-reply is OFF by default** and requires explicit user opt-in.
  - Compliance rules + safe-claims rules are enumerated.
  - Handoff-to-human triggers are concrete.
- Contains objective validation steps per workstream, including conversation QA and prompt-injection hardening tests.

### 3) Validation steps
- Open each file in the checklist and confirm:
  - constraints are present verbatim,
  - acceptance criteria + validation steps are concrete,
  - approval gates are explicit.

### 4) Gap report + auto-fill
- See “Gap Report” at end of this document.

### 5) External side effects policy
- No logins, purchases, posting, or **sending messages** will be executed from this plan without explicit user approval.

---

## 1) Executive summary (what we’re shipping)

### 1.1 Craigslist posting: assisted autopost (Chrome extension)
- A salesperson selects a unit in LotView → clicks **“Post to Craigslist (Assist)”**.
- Extension opens Craigslist posting flow, fills fields + uploads photos, **stops at the preview/review step**.
- **User must click Publish**.
- Every attempt is logged to LotView (dealer/user/time/unit/outcome) for audit.

### 1.2 Sales Manager competitive report: every 2 days, in-app
- A backend job runs every 48h per dealership.
- Produces a snapshot report visible in a Sales Manager dashboard.
- Report includes required comp fields (see §4B.3), with “unknown/not available” explicitly shown when a source cannot supply a field.

### 1.3 Appraisal/comps: Canada-only, radius selectable, exact trim default
- Sales Manager can appraise a trade-in or unit and pull comps.
- Controls:
  - Radius: selectable (default 100km; also 250/500/1000/national).
  - Trim match: **Exact (default)**, toggle **Near-trim**.
  - Mileage tolerance: **not exposed** (disregarded).
- VIN decode uses a **cheap hybrid router**: free baseline always; paid enrichment only when needed.

### 1.4 NEW: Facebook Marketplace replies (AI sales assistant, policy-gated)
- A salesperson posts to Facebook Marketplace using the existing (working) autopost flow.
- Leads message the listing.
- LotView surfaces the conversation in a **Sales Inbox**:
  - Full transcript
  - Lead summary + qualification status
  - Suggested reply(ies) in dealer-tough tone
  - **Send** button (manual approval default)
  - **Auto-send toggle** (OFF by default; explicit opt-in per dealer/user)
- AI runs a sales playbook:
  - Qualify, book appointment, gather trade-in/finance intent, and keep the lead moving.
  - Escalate to a human when risk/complexity is high.

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

**NEW (v1.1) constraints for Marketplace replies**
10) **No outbound message to a real person without explicit user approval** (per message) **unless** the user explicitly enables full auto-reply.
11) **Auto-reply is OFF by default**. Opt-in must be explicit and reversible (kill switch).
12) AI must follow **safe-claims** rules: no misrepresentation, no guarantees, no pressure tactics; unknowns must be stated as unknown.
13) Must support **handoff to human** with clear triggers and audit logs.

---

## 3) Compliance + risk posture (explicit)

### 3.1 Craigslist ToS risk (non-negotiable warning)
Craigslist Terms of Use restrict using/providing software other than general-purpose web browsers to interact with Craigslist for posting/uploading/account actions (unless separately licensed).
- Terms: https://www.craigslist.org/about/terms.of.use/en

**Plan posture:**
- Ship **Assisted Autopost** only.
- No unattended batch posting.
- Add a **fallback mode**: “Export/Copy post package + open Craigslist posting page” so dealers can still post manually if automation gets blocked.
- Add a **compliance decision record** (internal doc) and a feature flag/kill switch.

### 3.2 Scraping ToS risk (competitive sources)
- Prefer **licensed APIs**.
- Scraping allowed for public sources, but we will:
  - rate limit per domain,
  - cache aggressively,
  - include circuit breakers and block-page detection,
  - keep a vendor/API path as primary to reduce ToS exposure.

### 3.3 Marketplace messaging compliance posture
- Marketplace messages are real-person communications.
- **Default behavior is assist-only** (suggested reply + user clicks Send).
- Any auto-send requires explicit opt-in and must include:
  - stop conditions,
  - do-not-contact handling,
  - audit logs and easy disable.

---

## 4) Workstreams and specs

## 4A) Craigslist assisted autopost (Chrome extension)

(Identical intent to v1; included here for completeness.)

### 4A.1 UX behavior (salesperson)
- Button: **Post to Craigslist (Assist)**.
- User selects posting area (if not already resolved):
  - **Tri-Cities BC**
  - **Surrey BC**
  - **Whistler area**
- Extension fills:
  - title, price, mileage, VIN (if used), location/area, description, contact, images.
- Extension stops at review step with a big callout: **“Review and click Publish on Craigslist.”**

### 4A.2 Technical approach (MV3)
- Background service worker orchestrates tab + messages.
- Content script detects step and fills fields.
- Image upload uses existing Debugger-based upload fallback.

### 4A.3 QA gates
- Must never click final publish.
- Must handle:
  - logged out/login step
  - phone verification/captcha → stop and instruct user
  - posting limit pages → stop and instruct user

---

## 4B) Competitive report (Sales Manager dashboard)

(Identical intent to v1; included here for completeness.)

### 4B.1 Cadence + scope
- Every 48 hours per dealer.
- **Canada-only** comps.
- Radii supported: default **100km**, selectable **250/500/1000/national**.

### 4B.2 Source strategy (required)
- **API-first** for comps/listings.
- **ZenRows fallback** for public scraping when API is missing or coverage is poor.
- Cache results to control cost.

### 4B.3 Required output fields (per comp listing)
Competitive report must include:
- **price**
- **days on lot** (or best-available proxy)
- **mileage**
- **trim**
- **condition**
- **accident history**
- **exterior color**
- **interior color**

---

## 4C) Appraisal/comps engine + VIN/options (cheap hybrid)

(Identical intent to v1; included here for completeness.)

### 4C.1 VIN decode router (cheap hybrid)
- Always run baseline decode (free): NHTSA vPIC.
- Paid enrichment only when required (trim/options ambiguity, low confidence).

### 4C.2 Trim handling: exact default + near-trim option
- Default: exact trim match required.
- Near-trim toggle relaxes matching; UI labels near-trim comps clearly.

### 4C.3 Canada-only enforcement
- Exclude comps outside Canada by default.

---

## 4D) NEW — Facebook Marketplace replies (AI conversation assistant)

**Objective:** convert more Marketplace messages into booked appointments and closed deals by responding fast, professionally, and accurately—without compliance risk.

### 4D.1 System behavior (high level)
- Ingest inbound/outbound Marketplace messages into LotView.
- Maintain a **conversation state machine** (qualification → appointment setting → follow-up → closed/lost).
- Generate one or more **suggested replies** based on:
  - the vehicle/VIP context (VDP data, price, availability),
  - playbook (qualification script, objections),
  - policy gates (safe claims + compliance).
- **Default send mode:** user reviews and clicks **Send**.
- **Optional auto-send mode:** explicitly enabled; hard stop/escalation rules apply.

### 4D.2 Ingestion architecture (where messages come from)
Given Marketplace limitations, we design two ingestion lanes:

1) **Primary lane (expected): Chrome extension DOM bridge**
   - Extension runs on Marketplace inbox / messenger surfaces.
   - Captures:
     - new message events (polling + DOM mutation observers),
     - thread identifiers, participant display name/handle, timestamps,
     - transcript content (text + lightweight attachments metadata).
   - Writes to LotView backend via authenticated API.

2) **Secondary lane (future): Official APIs where applicable**
   - If Meta Graph APIs ever support the exact Marketplace messaging surface for the dealer’s setup, we can switch/augment.
   - v1.1 does not assume official API support.

### 4D.3 Identity + roles
- **Dealership tenant** (dealerId)
- **User** (LotView RBAC): GM > Sales Manager > Salesperson
- **FB Identity**
  - A Facebook account (or Page) currently used for Marketplace.
  - Linked inside LotView as `fbIdentity` with:
    - display name,
    - mapping to dealerId,
    - extension-local token/handshake (no password storage).
- **Lead identity**
  - Marketplace participant (buyer) stored as `leadIdentity` with stable thread id when possible.

### 4D.4 State machine (conversation lifecycle)
Minimum states (each transition logged):
- `NEW_INBOUND` (first message seen)
- `RESPONDING` (reply drafted, awaiting approval)
- `QUALIFYING` (collect needs + timing + payment + trade)
- `APPOINTMENT_PROPOSED`
- `APPOINTMENT_SET` (time + location captured)
- `FOLLOW_UP` (no response; timed follow-ups)
- `ESCALATED_TO_HUMAN`
- `CLOSED_WON` / `CLOSED_LOST`
- `DO_NOT_CONTACT`

### 4D.5 Human handoff (non-negotiable)
Handoff triggers (examples):
- Customer asks for financing approval/guarantees.
- Customer asks for accident history/warranty coverage beyond known facts.
- Customer becomes hostile, threatens legal action, or requests manager.
- Any request involving sensitive data (SIN, driver’s license, full DOB).
- Detected prompt injection / malicious instructions.
- Model confidence low or missing required vehicle facts.

### 4D.6 UI (Sales Inbox + transcript + suggested replies)
- **Sales Inbox**
  - Filters: New, Waiting on customer, Needs human, Appointments, Closed
  - SLA indicator: minutes since last inbound
  - Badge: auto-send ON/OFF per thread
- **Conversation view**
  - Transcript (buyer + dealer messages)
  - Vehicle card (year/make/model/price/miles + link to VDP)
  - Lead summary (qual status, intent, trade, finance/cash)
  - Suggested reply panel:
    - 1-click insert
    - edit box
    - **Send** (manual)
    - **Enable auto-send** (explicit toggle with warning)
- **Manager controls**
  - Set global policy: suggest-only vs auto-send allowed
  - Define business hours, response rules, escalation rules
  - Audit log export

### 4D.7 Integration with existing Facebook autopost flow
- When the extension posts a unit to Facebook Marketplace (existing flow), it must persist:
  - the Facebook listing URL (or listing id when available),
  - mapping `vehicleId → fbListingRef`.
- Replies system uses that mapping to:
  - attach the right vehicle context to each conversation,
  - enforce safe claims (only claim what we know from VDP/inventory).

### 4D.8 QA gates (conversation quality + safety)
- No auto-send unless explicitly enabled.
- Suggested replies must:
  - ask at most 1–2 questions per message,
  - move toward appointment,
  - avoid unsafe claims,
  - comply with do-not-contact.
- Prompt-injection hardening tests on inbound messages.

---

## 5) Work breakdown (phased)

### Phase 0 — Decisions + approvals (fast)
- Pick comps data vendor (API-first).
- Decide Craigslist account provisioning approach.
- **Marketplace replies:** confirm desired send mode:
  - default suggest-only (recommended)
  - allow optional auto-reply (explicit opt-in)

### Phase 1 — Foundations (shared)
- Data schemas + DB tables for:
  - competitive report snapshot
  - comps listings (normalized)
  - VIN decode cache
  - posting audit logs
  - **NEW:** conversation threads, messages, suggestions, policy decisions, audit log
- Rate limiting + caching framework.

### Phase 2 — Competitive report MVP (API-first)
- Implement report generator worker.
- Implement Sales Manager dashboard.

### Phase 3 — Appraisal/comps v1
- Implement VIN decode router.
- Implement comps retrieval + scoring.

### Phase 4 — Craigslist assisted autopost
- Implement Craigslist driver + content script.

### Phase 4.5 — NEW: Marketplace replies MVP (suggest-only)
- Extension ingestion of inbox threads + messages.
- Backend conversation store + suggestion generator.
- Sales Inbox UI + suggested replies.
- Manual send with explicit approval.

### Phase 5 — Harden + rollout
- Observability dashboards, cost guardrails, kill switches.
- Staged rollout per dealer.
- Optional: auto-reply (opt-in) after QA pass + user approval.

---

## 6) Approval gates (explicit)

### 6.1 External side effect: Craigslist dealer account creation (REQUIRED GATE)
Creating Craigslist accounts is an external side effect.

**We will not create accounts unless the user explicitly approves it.**

### 6.2 External side effect: paid APIs
- No paid vendor onboarding or key usage without explicit approval.

### 6.3 External side effect: scraping scale-up
- If we move beyond minimal testing (or add new sources), require explicit approval and legal review of ToS.

### 6.4 External side effect: sending Marketplace messages (REQUIRED GATE)
Sending messages to real Marketplace buyers is an external side effect.

**Default mode:** suggest-only (user clicks Send).

**Optional mode (requires explicit opt-in):** auto-reply.
- Must be enabled explicitly by the user (dealer admin/GM) and visible in UI.
- Must have per-thread override + kill switch.
- Must log every auto-sent message with reason + policy checks.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items (relative to this plan’s DoD)
- None (all required v1.1 deliverable files are produced by this task; see deliverables checklist).

### Why missing
- N/A

### Auto-fill action
- N/A
