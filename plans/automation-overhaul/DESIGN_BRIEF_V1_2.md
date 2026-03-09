# LotView Automation Overhaul — DESIGN BRIEF (v1.2)

> **Project:** `C:\Users\omino\projects\lotview`
>
> **Applies to:** Sales Manager web app (Next.js + Tailwind + shadcn/ui), Chrome extension UIs (Craigslist assist + FB inbox assist), and any internal/admin surfaces.
>
> **Purpose:** define what “world-class / industry-leading” means for LotView UI/UX and specify the concrete design deliverables and QA gates required for v1.2.

---

## Deliverables index (this document)

| Deliverable | Path |
|---|---|
| Design brief v1.2 (this document) | `plans/automation-overhaul/DESIGN_BRIEF_V1_2.md` |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope**
  - A **design-system-first** approach for the Sales Manager web app and extension UI surfaces.
  - UX deliverables required per workstream (Craigslist assisted autopost review, competitive report dashboard, appraisal/comps UI, FB marketplace inbox).
  - Objective **world-class UI acceptance criteria** (clarity, speed, accessibility, error/empty states, audit visibility, kill switches).
  - Required design artifacts, including **local exports committed to repo** (PNG/PDF) even if Figma is the source of truth.
- **Out of scope**
  - Producing final production UI code in this document.
  - Final brand/logo creation beyond current palette/typography constraints.
- **Assumptions**
  - Tech: Next.js 14 App Router, Tailwind CSS, shadcn/ui.
  - Audience: dealership staff, non-technical; UIs must be “dead simple” and fast.
  - Brand voice: sharp, efficient, dealer-tough (see `BRAND.md`).

### 1) Deliverables checklist (MUST be explicit)
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\DESIGN_BRIEF_V1_2.md` — this brief with principles + deliverables + acceptance criteria.
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\README.md` — index of design artifacts, with links to exports and (optional) Figma URLs.
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\design-system\TOKENS.md` — typography scale, spacing scale, colors, radii, elevations, motion, and semantic tokens.
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\design-system\COMPONENTS.md` — component inventory + interaction patterns.
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\exports\sales-inbox.png` — key screen export (PNG) **or** `sales-inbox.pdf`.
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\exports\automation-settings.png` — key screen export.
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\exports\competitive-report-dashboard.png` — key screen export.
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\exports\appraisal-comps.png` — key screen export.
- [ ] `C:\Users\omino\projects\lotview\plans\automation-overhaul\design\v1_2\exports\craigslist-assist-review.png` — key screen export.

> Notes
> - Exports may be wireframes for early phases, but must still include layout, hierarchy, and key states.
> - Figma links are allowed but do **not** replace exports.

### 2) Acceptance criteria (objective, testable)
- Design system artifacts exist at the exact paths above and contain no placeholders like “TBD”.
- Each listed key screen export exists (PNG or PDF) and reflects:
  - the v1.2 defaults (including FB auto-send default ON, visible kill switches),
  - critical empty/error/loading states,
  - accessibility basics (keyboard focus, contrast targets, readable type scale).
- “World-class UI acceptance criteria” section (below) is used verbatim as reviewer gate in engineering spawns.

### 3) Validation steps (self-QA)
- Confirm each file in checklist exists.
- Open each export and verify it is legible at 100% zoom and includes labels for key controls.
- Scan all docs for “TBD”, “TODO”, or contradictory defaults.

### 4) Gap report + auto-fill (MANDATORY)
- See “Gap Report + Auto-fill” at end.

### 5) External side effects policy
- No external publishing, no Figma edits required, no logins.

---

## 1) World-class / industry-leading principles (LotView-specific)

### 1.1 Clarity in 3 seconds
- A Sales Manager should understand what’s happening in a screen in **≤ 3 seconds**.
- The primary action is visually dominant; secondary actions are de-emphasized.
- Dealer terminology is used consistently (“unit”, “days on lot”, “turn rate”).

### 1.2 Speed is a feature (perceived + real)
- Target interaction latency:
  - **≤ 100ms** for UI state changes (local).
  - **≤ 500ms** for common server reads with skeletons.
  - **≤ 2s** for heavy dashboards with progressive rendering.
- Always show:
  - loading states,
  - last-updated timestamps,
  - cached vs fresh indicators.

### 1.3 Data-dense, not cluttered
- Prefer tables with clear alignment and scan patterns.
- Use **progressive disclosure**: show essentials first; drilldowns for details.
- Never hide critical numbers behind hover-only.

### 1.4 Error-proofing + recovery
- Every destructive or high-risk action has:
  - confirmation (when appropriate),
  - undo where feasible,
  - clear error messages with next steps.
- Errors are actionable (“Selector changed—automation paused. Click ‘Report issue’ or switch to manual mode.”), not generic.

### 1.5 Audit visibility and control (trust)
- Any automation that can affect customers must provide:
  - “why” explanations,
  - event logs,
  - kill switches (global + per-thread).
- Make system state obvious: ON/OFF, paused, blocked, queued.

### 1.6 Accessibility baseline (non-negotiable)
Minimum bar:
- WCAG 2.1 AA contrast targets for text and controls.
- Full keyboard navigation for web app.
- Visible focus styles.
- Screen-reader friendly labels for primary workflows.

---

## 2) Design system approach (Sales Manager web app)

### 2.1 Foundations / tokens
Define and use tokens so the UI is consistent and fast to build:
- **Typography**
  - Font: Inter (or system fallback).
  - Scale: e.g., 12/14/16/18/20/24/32.
  - Numeric tables: tabular-nums.
- **Spacing**
  - 4px base scale: 4/8/12/16/24/32/48.
- **Color** (from `BRAND.md`)
  - Primary: `#1A365D`, Secondary: `#4A5568`
  - Success: `#38A169`, Warning: `#D69E2E`, Danger: `#E53E3E`
  - Text: `#1A202C`, BG: `#FFFFFF`
  - Semantic tokens: `fg.muted`, `bg.subtle`, `border.default`, `status.*`.
- **Radii / elevation**
  - Radii: 6/10.
  - Elevation: 0/1/2 for surfaces, keep shadows subtle.
- **Motion**
  - Default 150–200ms ease-out; reduce motion option.

### 2.2 Component inventory (minimum)
- Layout: app shell, page header, subheader with filters.
- Data: table/grid, sortable headers, row actions, column chooser.
- Status: badges, SLA timers, “last updated”, freshness chips.
- Inputs: combobox, segmented control, range/radius selector, toggle with description.
- Messaging: conversation transcript, message composer, suggestion cards.
- Feedback: skeleton loaders, empty states, error banners, toasts.
- Controls: kill switch, pause automation, rate limit indicator.

### 2.3 Interaction patterns
- Tables: sticky headers, consistent column alignment, inline “unknown” values.
- Drilldowns: right-side drawer for details (fast, non-disruptive).
- Confirmations: use modals only for high-risk; otherwise inline confirmations.
- Audit: “View audit log” always within 1 click for automation surfaces.

---

## 3) UX deliverables required per workstream (v1.2)

### 3.1 Workstream 4A — Craigslist assisted autopost (review step)
Deliverable: “Craigslist Assist Review” UX
- An extension-side review overlay or LotView review screen must show:
  - post title/price/description/photos count,
  - detected posting area,
  - warnings (login/captcha/limits),
  - explicit callout: **LotView will not click Publish**.
- States:
  - happy path, login required, captcha/verification, posting limit, selector drift.

### 3.2 Workstream 4B — Competitive report dashboard
Deliverable: “Competitive Report Dashboard” UX
- Must support:
  - snapshot selection (last N runs),
  - filters (radius, make/model/trim),
  - drilldown to comp rows with provenance.
- States:
  - empty (no comps), partial data (unknown fields), fetch failed.

### 3.3 Workstream 4C — Appraisal/comps UI
Deliverable: “Appraisal + Comps” UX
- Must support:
  - VIN entry + decode confidence display,
  - radius selector (100/250/500/1000/national),
  - exact trim default + near-trim toggle,
  - comps list with match labeling.
- States:
  - VIN invalid, decode low confidence, no comps in radius.

### 3.4 Workstream 4D — FB Marketplace inbox
Deliverable: “Sales Inbox + Conversation” UX
- Must support:
  - inbox list with SLA, assignment, state.
  - conversation transcript + vehicle card.
  - suggested reply cards with “why” and policy status.
  - auto-send status: **default ON** (per user decision) with visible kill switch.
  - typing simulation indicator (“Typing…”, countdown, cancel/abort).
- Required management UX:
  - Automation Settings (GM): allowlist/denylist, business hours, rate limits, typing simulation config.
  - Audit Console (Sales Manager): searchable outbound logs with “why did we send this?”

---

## 4) World-class UI acceptance criteria (review gate)

These criteria are used as **pass/fail gates** in reviewer checks.

### 4.1 Clarity
- Primary action is obvious within 3 seconds.
- Terminology matches `PROJECT.md` + `BRAND.md` (dealer-tough, no jargon).

### 4.2 Speed + responsiveness
- No blank screens; skeletons for loading.
- Tables/dashboards remain usable while data loads.

### 4.3 Accessibility
- Keyboard navigation works for primary flows.
- Visible focus indicators and sufficient contrast.

### 4.4 Error + empty states
- Every major surface has:
  - loading, empty, error, partial-data states.
- Error messages include recovery steps.

### 4.5 Audit visibility
- For any automation:
  - “View audit log” exists,
  - auto/manual mode is visible,
  - “why” is explainable (policy report summary).

### 4.6 Kill switches + safety controls
- Global kill switch exists for:
  - Craigslist assist,
  - scraping,
  - FB inbox automation (auto-send).
- FB automation has:
  - per-thread pause,
  - escalation to human,
  - anti-loop guard visible.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- The design artifact files and exports listed in the checklist are **not created by this planning subtask**.

### Why missing
- This document defines the required design deliverables and QA gates; creation is owned by the v1.2 `designer` spawn.

### Auto-fill action
- The v1.2 spawn plan must spawn a `designer` early to produce the design system docs and export images/PDFs at the exact paths above.
