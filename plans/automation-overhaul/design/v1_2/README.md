# LotView — Automation Overhaul (UI/UX)

**Scope:** sales-manager web app surfaces for the automation overhaul (FB Marketplace replies, Competitive Reports, Appraisal/Comps, Craigslist Assist review) with an opinionated, shadcn/ui-friendly design system.

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope**
  - Wireframes + exports for 5 required surfaces:
    1) FB Marketplace Inbox
    2) Automation Settings (GM/Manager)
    3) Competitive Report Dashboard
    4) Appraisal/Comps UI
    5) Craigslist Assisted Autopost Review
  - Flow diagrams for the above, including automation safety envelope + kill switches.
  - Design system artifacts: tokens + component inventory.
- **Out of scope**
  - Production UI code.
  - Brand/logo redesign.
- **Assumptions**
  - Next.js + Tailwind + shadcn/ui.
  - Audience: non-technical dealership staff → “dead simple”, data-dense, fast.
  - Defaults from v1.2: **FB auto-send default ON** with visible kill switches and audit visibility.
- **Inputs needed (if any)**
  - None to create these artifacts.

### 1) Deliverables checklist (exact paths)
- [ ] `C:\Users\omino\projects\lotview\design\automation-overhaul\README.md` — overview + principles + how to use exports.
- [ ] `C:\Users\omino\projects\lotview\design\automation-overhaul\tokens\TOKENS.md` — semantic tokens for color/type/spacing/radius/elevation/motion + contrast guidance.
- [ ] `C:\Users\omino\projects\lotview\design\automation-overhaul\components\COMPONENTS.md` — component inventory + interaction patterns + keyboard rules.
- [ ] `C:\Users\omino\projects\lotview\design\automation-overhaul\wireframes\` — PNG exports for each required screen and states (main/loading/empty/error).
- [ ] `C:\Users\omino\projects\lotview\design\automation-overhaul\flows\` — user flow diagrams (SVG + PNG).

### 2) Acceptance criteria (pass/fail)
- Every required surface has **main + loading + empty + error** exports.
- Every automation surface includes:
  - visible **ON/OFF state**,
  - a **kill switch** (global + per-thread where applicable),
  - “View audit log” within 1 click,
  - “why” visibility for auto actions.
- Accessibility baseline:
  - keyboard-navigable primary flows,
  - visible focus styles,
  - contrast targets stated in tokens.
- No placeholders like “TBD/TODO”.

### 3) Validation steps (self-QA)
- Open each PNG at 100% zoom; confirm legibility.
- Confirm each screen exists in **4 states** (main/loading/empty/error).
- Confirm each flow exists as **SVG + PNG**.
- Quick string scan: no “TBD”, no conflicting defaults (auto-send must not be depicted as OFF by default).

### 4) Gap report + auto-fill
- See bottom of this file (kept current).

### 5) External side effects policy
- Local design artifacts only. No logins, no publishing.

---

## Design principles (LotView-specific)

### 1) Clarity in 3 seconds
- Page header answers: **What is this? What’s the current system state? What do I do next?**
- The primary action is dominant; secondary actions are quiet.

### 2) Operator confidence (automation must feel controllable)
- Automation must be **observable** (status + timers + last action), **explainable** (“why”), and **interruptible** (kill switch).
- The UI should never make a manager guess whether a customer was messaged.

### 3) Data-dense, scan-first
- Tables are first-class. Align numbers. Use tabular numerals.
- Prefer drawers for drilldowns (fast, non-destructive) over full navigation.

### 4) Guardrails beat confirmations
- Prevent risky actions via policy gating and clear states (e.g., auto-send disabled due to low confidence).
- Use confirmations only for high-risk actions (global kills, exports containing PII).

### 5) Error-proofing + recovery
- Every error message includes:
  - what happened,
  - what we did (paused/queued/etc),
  - what the user can do next.

### 6) Accessible by default
- Everything important is reachable by keyboard.
- No hover-only info for critical fields.

---

## Information architecture (recommended nav)
- **Inbox** (FB Marketplace)
- **Competitive**
- **Appraisals**
- **Automation** (settings + audit)

---

## Export naming convention

### Wireframes (PNG)
- `wireframes/<surface>__main.png`
- `wireframes/<surface>__loading.png`
- `wireframes/<surface>__empty.png`
- `wireframes/<surface>__error.png`

### Flows
- `flows/<surface>__flow.svg` and `flows/<surface>__flow.png`

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- None expected if the wireframes + flows + docs are present at the paths listed above.

### Why missing
- N/A

### Auto-fill action
- If any export is missing, regenerate via `design/automation-overhaul/_render/render.mjs` (see that folder). If render fails, the SVG sources in `flows/` and `wireframes/_src/` should still be committed and can be re-exported later.
