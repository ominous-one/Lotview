# CEO Improvements & Gaps — “Industry-leading / onboard 1000 dealerships” Readiness

> Project: `C:\Users\omino\projects\lotview`
>
> Context inputs reviewed:
> - `plans/automation-overhaul/MASTER_PLAN_V1_2.md`
> - `plans/automation-overhaul/DELIVERABLE_MATRIX_V1_2.md`
> - `plans/automation-overhaul/SPAWN_PLAN_V1_2.md`
> - `docs/automation-overhaul/*` (Workstreams 1–4 implementation notes)
> - `design/automation-overhaul/DESIGN_PARITY_REPORT.md`
>
> CEO lens: assume **1000 dealerships**, each with **15 sales**, **5 managers**, **1 GM** (≈ **21,000 users**), heavy compliance expectations, and highly variable operational maturity.

---

## Deliverables index (this document)

| Deliverable | Path | Description |
|---|---|---|
| CEO Improvements & Gaps report (this file) | `plans/automation-overhaul/CEO_IMPROVEMENTS_AND_GAPS.md` | Prioritized missing pieces, world-class enhancements, production readiness gates, and v1 vs v1.5 scope recommendations |

---

## Acceptance criteria (objective)

This document is **done** when it includes:

1) A **prioritized** list of missing product/ops/security pieces for onboarding 1000 dealerships (explicitly anchored to roles: sales, manager, GM).
2) **Recommended enhancements beyond** the current plan (automation, observability, onboarding, support workflows, RBAC/audit/safety).
3) A **production-readiness checklist** with clear **pass/fail** gates.
4) A clear **minimal v1 launch scope vs v1.5** scope.
5) A **Gap Report** that calls out what is not covered by the current v1.2 plan/docs/implementation.

---

## Executive summary (CEO signoff position)

The v1.2 plan is strong on **feature intent** and correctly introduces automation safety primitives (policy envelope, kill switches, audit visibility) plus **world-class UX gates**. The docs show meaningful implementation progress (server-authoritative send gating, idempotent ingestion, scheduler guards).

However, onboarding **1000 dealerships** is primarily a **multi-tenant ops + security + support + governance** problem. The plan currently under-specifies:

- **Identity / RBAC / provisioning** (who can do what across 21k users)
- **Dealer onboarding and configuration workflows** (timezones, business hours, policies, inventory feed mapping)
- **Observability + incident response** (automation failures, DOM drift, blocked actions)
- **Compliance & audit** for automation decisions (immutable logs, retention, export)
- **Operational scalability** (rate limiting, per-dealer quotas, canary rollouts, safe defaults)

If the goal is “industry-leading” at scale, the product must behave like a **regulated automation platform** with strong guardrails, transparent decisions, and first-class support tooling.

---

# 1) Prioritized missing pieces (Product / Ops / Security) for 1000 dealerships

Below is the **priority order** I would require before signing off on large-scale rollout.

## P0 — must-have before onboarding at scale (foundational)

### P0.1 Multi-tenant identity, RBAC, and dealer provisioning
**Why:** 1000 dealerships × roles means constant join/leave, transfers, permission mistakes, and audit risk.

**Missing pieces (product + security):**
- **RBAC model**: at minimum `Sales`, `Manager`, `GM`, `Admin/SuperAdmin` (internal).
- **Permission matrix**:
  - Sales: inbox actions on assigned threads, create drafts, manual send, set per-thread DNC, view limited audit for their threads.
  - Manager: view dealership inbox, assignment, view audit, approve blocked replies, run competitive report, appraise comps.
  - GM: manage automation policies (auto-send, hours, allow/deny lists, thresholds), global kill switch, user management.
- **Provisioning flows**:
  - Invite users, role assignment, deactivate users, enforce password policy.
  - Optional: **SSO/SAML/OIDC** (v1.5 likely) but at least clean “invite + reset” in v1.
- **Dealer setup wizard** (timezone, business hours, default policies, rate limits).

**Gates:** cannot ship “auto-send default ON” broadly without a GM-grade control plane and delegation model.

---

### P0.2 Automation governance: policy versioning + immutable audit + retention
**Why:** When a message is auto-sent, you need to prove “why” later.

**Missing pieces:**
- **Policy versioning**: every outbound decision references a **policy version hash** (allowlist/denylist, thresholds, hours, rate limits).
- **Immutable audit events**:
  - append-only log, write-once semantics,
  - capture “inputs → decision → outputs”,
  - include model prompt/version (or rule set version), confidence values, and operator overrides.
- **Retention rules**: define retention (e.g., 90/180/365 days) per dealer tier; support export.
- **Audit export**: CSV/JSON export by date range + thread/user + “auto only”.

**Note:** docs mention audit events and server storage; the missing part is **immutability + retention + export + policy versioning**.

---

### P0.3 Operational safety controls (beyond “kill switch exists”)
**Why:** At scale, the most common incident is automation misbehaving silently (DOM drift, blocked actions, wrong thread).

**Missing pieces:**
- **Hard fail-closed rules** with visible UI outcomes:
  - if DOM drift detected → auto-disable send and escalate.
  - if action-block detected → auto-pause + alert GM/Manager.
- **Staged rollout + canary controls** per dealership:
  - shadow mode → suggestion-only → supervised auto-send → full.
- **Quotas & rate limits** with per-dealer and per-identity counters, plus override process.
- **Business hours + holiday calendars** (timezone safe; per store).
- **Human-in-the-loop queue**:
  - “Needs approval” inbox, assignments, SLA timers, escalation.

The design parity report explicitly calls out missing “observable / explainable / interruptible” components. That is P0 for safety.

---

### P0.4 Dealer onboarding playbook + support workflows (in-product)
**Why:** 1000 dealerships means you cannot onboard with manual Slack + ad-hoc config.

**Missing pieces:**
- **In-app onboarding checklist**:
  - install extension, connect dealership, verify permissions,
  - verify Marketplace inbox ingestion,
  - set business hours, select default allowlist/denylist, confirm compliance copy.
- **Diagnostics page**:
  - extension heartbeat, last ingestion time, last send attempt, DOM drift status.
- **Support bundle export**:
  - “Download diagnostic snapshot” (settings + last N audit events + extension version + browser version).
- **Internal support tooling**:
  - impersonation/readonly view (superadmin) with strict audit,
  - dealer-level toggles and safe-mode.

---

### P0.5 Data correctness and domain mapping (inventory ↔ listing ↔ thread)
**Why:** Wrong-vehicle personalization is existentially brand-damaging.

**Missing pieces:**
- **Guaranteed thread→vehicle binding workflow**:
  - confidence gating exists, but needs a **first-class remediation UI**:
    - “Link vehicle” control,
    - choose from inventory,
    - show current binding provenance,
    - audit changes.
- **Inventory source-of-truth** definition:
  - feeds/imports, canonical VIN/unitId, normalization.
- **Collision handling**:
  - multiple similar listings, re-posted listings, buyer referencing multiple units.

Docs mention mapping storage; the missing piece is **operator workflow + correctness guarantees**.

---

## P1 — important for scale, but can be phased (90 days)

### P1.1 Observability: metrics, tracing, alerting (automation platform-grade)
- **Core metrics**:
  - inbound threads/messages rate
  - auto-send attempts/allowed/blocked/escalated
  - action-block rate
  - DOM drift detection hits
  - time-to-first-response and SLA compliance
  - per-dealer error budgets
- **Structured logs** with correlation ids: `dealerId`, `threadId`, `eventKey`.
- **Alerting**:
  - sudden spikes in blocked sends
  - ingestion stall (no messages in X minutes)
  - decide-send endpoint errors

### P1.2 Security posture & compliance basics
- **Least privilege** for extension permissions and server tokens.
- **Token rotation**, device/session management, revoke extension tokens.
- **PII handling policy**:
  - data minimization, encryption at rest,
  - redaction in logs,
  - access audit.
- **Incident response runbook** and breach notification template.

### P1.3 Enterprise-ready admin + billing primitives
- Dealer plan tiers with feature gating (shadow mode, advanced reports, longer retention).
- Usage reporting per dealer (messages processed, listings scraped, API costs).

---

## P2 — differentiation / “world-class” (after initial scale)

### P2.1 Workflow automation and coaching loops
- “Suggested reply quality” scoring + coaching tips.
- Playbooks by intent (availability, scheduling, trade-in interest).

### P2.2 Cross-channel expansion readiness
- Abstraction layer for future channels (SMS, email, website chat) without re-architecting.

---

# 2) Recommended enhancements beyond the current plan (make it truly world-class)

These are **incremental but high-leverage** additions that turn “features” into an “automation product.”

## 2.1 A real “Automation Control Plane” (GM + Manager first)
**Add:** a single “Automation” area in-app with:
- Global status banner: `ON / PAUSED / BLOCKED / SHADOW`
- Kill switch with **confirmation + reason capture** (called out in design parity report)
- “Recent auto actions” timeline
- “Blocked reasons leaderboard” (top reason codes last 24h)
- “Safety envelope coverage” card (what intents are enabled)

**Outcome:** automation is visible and governable, not a hidden switch.

---

## 2.2 Policy-as-code with deterministic decision records
**Add:**
- A formal policy engine interface (even if implemented as rules now):
  - inputs are a typed struct
  - outputs include standardized reason codes
- A **Decision Record** saved for each auto-send attempt.

**Outcome:** support can answer “why didn’t it send?” in seconds.

---

## 2.3 “Shadow mode first” rollout + A/B + safe ramp
**Add:**
- Shadow mode runs the full pipeline but never sends; measures “would have sent.”
- Ramp schedule per dealer: 0% → 10% → 50% → 100% of allowlisted intents.

**Outcome:** you can onboard aggressive dealers safely.

---

## 2.4 “DOM drift early warning” system
**Add:**
- Versioned DOM contracts + snapshot tests (docs mention DOM contract tests; elevate to platform feature)
- Telemetry that identifies which selector failed and on which FB UI variant

**Outcome:** fewer silent failures, faster patch cycles.

---

## 2.5 Support-first UX patterns (reduce tickets)
**Add:**
- “Copy diagnostic info” button on every automation error state
- In-context explanations: “Blocked because: negotiation / outside business hours”
- One-click “Request approval” for a blocked thread

---

## 2.6 Data governance for scraping/reporting
For competitive report + comps:
- Explicit source provenance: each comp includes `source`, `fetchedAt`, `confidence`, “unknown” fields.
- Dealer-level “sources enabled” toggle with ToS warnings.

---

# 3) Production-readiness checklist (pass/fail gates)

This is a **release gate** list for “onboard 1000 dealerships.” Each item is pass/fail.

## 3.1 Security & identity gates
- [ ] **PASS**: RBAC implemented and tested for roles: Sales, Manager, GM, internal admin.
- [ ] **PASS**: Dealer provisioning flow exists (create dealer, invite users, deactivate users).
- [ ] **PASS**: Token revocation/rotation supported for extension auth.
- [ ] **PASS**: Access to audit logs is permissioned and logged.

## 3.2 Automation safety gates (FB replies)
- [ ] **PASS**: Server-authoritative decide-send is enforced (extension cannot bypass).
- [ ] **PASS**: Global kill switch + per-thread pause + DNC are all enforced server-side.
- [ ] **PASS**: Anti-loop guard proven by tests (no consecutive outbound without inbound; max auto turns).
- [ ] **PASS**: Rate limiting works per dealer and per identity/day.
- [ ] **PASS**: DOM drift/action-block detection fails closed and creates visible incident event.

## 3.3 Observability & ops gates
- [ ] **PASS**: Metrics dashboards exist for ingestion health, send decisions, error rates.
- [ ] **PASS**: Alerting configured for ingestion stall, spikes in action-block, decide-send error rate.
- [ ] **PASS**: Structured logs include correlation ids (dealerId/threadId/eventKey).
- [ ] **PASS**: Incident runbook exists (kill switch procedure, rollback procedure, comms template).

## 3.4 Data & audit gates
- [ ] **PASS**: Every outbound message has a Decision Record with reason codes + policy version.
- [ ] **PASS**: Audit events are append-only and retention is defined.
- [ ] **PASS**: Audit export available to GM (date range).

## 3.5 Product UX gates (world-class bar)
- [ ] **PASS**: Inbox/Settings/Audit/Competitive Report all have main/loading/empty/error states.
- [ ] **PASS**: “Why” drilldown exists for auto actions and blocked decisions.
- [ ] **PASS**: Suggested reply card + typing simulation strip + abort control exist.
- [ ] **PASS**: Accessibility baseline: keyboard navigation + visible focus in threads list.

## 3.6 Scale & rollout gates
- [ ] **PASS**: Dealer-level canary controls: shadow mode and staged rollout.
- [ ] **PASS**: Per-dealer quotas and safe defaults; override workflow exists.
- [ ] **PASS**: Backpressure behavior defined (what happens when rate-limited).

---

# 4) Minimal “v1 launch” scope vs “v1.5” scope

## V1 Launch (minimum to onboard initial cohorts safely)
**Goal:** onboard ~10–50 dealerships safely; prove retention and operational control.

**Include:**
- FB replies with:
  - server-authoritative decide-send,
  - kill switches (global/per-thread) + DNC,
  - audit console with decision reasons,
  - business hours + rate limits,
  - suggested reply card + “why” visibility (even if basic).
- RBAC baseline (Sales/Manager/GM) + dealer provisioning/invite.
- Diagnostics page for extension health.
- Competitive report + comps features as planned, with provenance and safe caching.
- Basic observability dashboards + alerting for critical failures.

**Explicitly exclude from v1 (acceptable):**
- SSO/SAML
- Full policy version diff UI
- Sophisticated A/B ramps (but basic shadow mode recommended)

## V1.5 (scale to 1000 dealerships with confidence)
**Goal:** harden into an enterprise automation platform.

**Add:**
- SSO/OIDC + SCIM-like provisioning (or at least bulk import/deactivate).
- Full policy versioning + change approvals.
- Shadow mode + staged rollout controls per dealer and per intent.
- Advanced support tooling:
  - “support bundle” export
  - superadmin readonly impersonation with audit
- Stronger audit: immutability guarantees, retention policies, export.
- Full observability suite (SLOs, error budgets, alert tuning).
- Holiday calendars and multi-store/timezone support.

---

# Gap Report (CEO)

## Gaps vs “1000 dealership” readiness

### Gap A — RBAC/provisioning is not fully specified as a deliverable
- **Current state:** v1.2 plan focuses on workstreams and UI quality; docs show functional Inbox/Settings pages.
- **Gap:** no explicit RBAC/role permission matrix, onboarding wizard, or user lifecycle spec.
- **Risk:** misconfiguration, unauthorized policy changes, audit exposure.

### Gap B — Audit is present but not enterprise-grade
- **Current state:** audit events exist; UI exists; reasons partially present.
- **Gap:** lack of explicit immutability, retention, export, and policy version binding.
- **Risk:** cannot defend incidents, cannot satisfy enterprise procurement/security reviews.

### Gap C — Observability and incident operations are under-scoped
- **Current state:** design parity report calls out UX gaps; docs mention tests and guard env vars.
- **Gap:** missing standard dashboards/alerts/runbooks.
- **Risk:** hard downtime, silent automation failures, slow recovery.

### Gap D — Onboarding/support workflows are missing as first-class product
- **Current state:** validation steps exist as internal docs.
- **Gap:** no in-product onboarding checklist, diagnostics, support bundle.
- **Risk:** support load explodes at 1000 dealers.

### Gap E — Data correctness: thread↔vehicle remediation workflow missing
- **Current state:** mapping table exists + stored mapping; confidence gating exists.
- **Gap:** no operator UI to fix mapping when confidence is low or mapping is wrong.
- **Risk:** wrong-vehicle messaging (high reputational harm).

## Auto-fill recommendations (what to add to the plan/matrix next)

1) Add a new cross-cutting workstream: **“Dealer Platform Foundations”** with explicit deliverables:
   - RBAC/permissions matrix doc
   - onboarding wizard UX + implementation
   - diagnostics/support bundle
   - audit retention/export
   - observability dashboards + alerts

2) Add a “Policy versioning + decision record” deliverable to the deliverable matrix:
   - decision record schema
   - policy hash/version
   - export endpoint

3) Add v1 release gate doc: **“Production Readiness Gates”** derived from §3 above.

---

## Notes for the main agent (implementation alignment)

- `design/automation-overhaul/DESIGN_PARITY_REPORT.md` already identifies concrete UI gaps that map directly to P0 safety needs (kill switch confirmation, suggested reply card, typing sim strip, why/audit drilldown). Treat those as **release blockers** for any broad auto-send rollout.
- `docs/automation-overhaul/workstream-4-fb-marketplace-replies-implementation.md` shows a strong direction: server-authoritative decide-send. The CEO requirement is to add: policy versioning, retention/export, and operational dashboards.
