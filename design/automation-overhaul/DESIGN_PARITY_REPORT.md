# LotView Automation Overhaul — Design Parity Report

Date: 2026-03-08

## Deliverables index
- **Report (this file):** `design/automation-overhaul/DESIGN_PARITY_REPORT.md`
- **Design references audited:**
  - `design/automation-overhaul/README.md`
  - `design/automation-overhaul/tokens/TOKENS.md`
  - `design/automation-overhaul/components/COMPONENTS.md`
- **Implemented pages audited:**
  - `client/src/pages/FbInbox.tsx`
  - `client/src/pages/FbAutomationSettings.tsx`
  - `client/src/pages/FbAuditConsole.tsx`
  - `client/src/pages/Manager.tsx` (Competitive Report tab only)

## Code changes made (minimal, low-refactor)
1) `client/src/pages/FbInbox.tsx`
   - Implemented a closer-to-spec 3-column layout (Threads | Transcript | Context).
   - Added main/loading/empty/error rendering for threads + messages (Skeletons + inline error/empty cards).
   - Improved header hierarchy (title + subtitle) and thread metadata.
   - Added explicit automation state readouts in Context panel.

2) `client/src/pages/FbAuditConsole.tsx`
   - Added header subtitle and filter helper text.
   - Added loading skeletons + empty + error states.
   - Improved event kind badge mapping to more semantic status styling.

> Note: No backend/API contracts were changed.

---

## Executive summary
The current implementation uses shadcn/ui primitives (Card/Button/Switch/Badge/ScrollArea) and generally follows the **light, data-dense** intent, but it falls short of the design pack’s **non‑negotiables** for automation UX:

- **Observable / Explainable / Interruptible** automation is only partially present.
- **Required 4 states (main/loading/empty/error)** are missing or inconsistent on several surfaces.
- **Kill switch patterns** (confirmation + reason + visibility of last action/queue) are not implemented.
- Inbox is missing key workflow components (Suggested Reply Card, Typing Simulation Preview, Audit Trail Snippet, per-thread “why”).
- Competitive Report tab (in `Manager.tsx`) uses ad-hoc controls and does not follow the Data Table + Filters Bar patterns.

This report provides a **punch list** and **missing-state UI specs** to reach “world-class / industry-leading” parity.

---

## Design system alignment checklist (tokens + components)

### What’s aligned
- Uses shadcn/ui primitives and Tailwind utility classes.
- Page padding generally matches `space.6` (24px) via `p-6`.
- Cards and subtle surfaces are used appropriately.

### Gaps against `TOKENS.md`
- **Tabular numerals** are not consistently applied in tables and numeric columns (Competitive Report, badge counts, etc.).
- Status colors are not systematically mapped to semantic tokens (success/warning/danger/info). Implementation often uses generic variants (default/secondary/destructive/outline) without consistent meaning.
- Focus ring guidance is assumed via shadcn defaults, but key interactive areas (thread list items) are plain `<button>`s without explicit focus styling.

### Gaps against `COMPONENTS.md` (key non-negotiables)
- **Global Kill Switch**: present as a toggle/flag, but missing confirmation dialog, reason capture, and “last auto action / queued items” visibility.
- **Per-thread automation toggle label**: should read “Auto-send: ON” (explicit). Current UI had only an unlabeled switch; partially improved.
- **Suggested Reply Card**: missing.
- **Typing Simulation Preview**: missing.
- **Audit Trail Snippet in Inbox context panel**: missing.
- **Right Drawer drilldowns** (“Why did we send this?” / Policy Decision): missing.

---

## Screen-by-screen parity audit

### 1) FB Marketplace Inbox — `client/src/pages/FbInbox.tsx`

#### Expected (from `COMPONENTS.md`)
- 3-column split view: Conversation list | Transcript | Context/controls.
- Per-thread automation toggle with explicit label and disabled-with-reason state.
- Suggested Reply Card with “Will auto-send” / “Needs approval” + “Why” link.
- Typing simulation countdown strip + Abort.
- Audit snippet (last 3 events) + link to filtered Audit Log.
- Clear states for loading / empty / error.

#### Current implementation (pre-patch)
- 2-column (Threads | Conversation). No context column.
- Switches exist (Pause, Auto-send, DNC) but:
  - no explicit ON/OFF text,
  - no “disabled with reason” affordance,
  - no why/audit visibility at thread/message level.
- No loading/empty/error states.

#### Improvements made in this pass
- Layout updated to 3 columns and added Context panel.
- Added loading/empty/error states for threads + transcript.
- Added explicit automation readouts (“ON/OFF/Blocked”).

#### Remaining gaps / punch list
P0 (must-have for parity):
- Add **Suggested Reply Card** (even if initially a stub) with states:
  - Will auto-send (ETA)
  - Needs approval
  - Blocked (policy)
  - Manual only
- Add **Audit Trail Snippet** in Context panel (last 3 events) and 1-click **open audit with threadId prefilled**.
- Add **Typing Simulation Preview** strip with countdown + Abort.
- Add per-message metadata:
  - delivery status (sent/failed/queued)
  - auto/manual mode
  - “Why” link for auto actions.

P1 (quality + operator confidence):
- Add keyboard focus styling + roving focus in thread list.
- Add SLA timer and assignment chip in thread list item.
- Add per-thread “Queue for human / Assign to me”.


### 2) FB Automation Settings — `client/src/pages/FbAutomationSettings.tsx`

#### Expected
- Kill switch is a **non-negotiable** pattern:
  - visible global status (ON/PAUSED/BLOCKED)
  - confirmation dialog for high-risk toggles
  - reason selection
  - visibility into last auto action + queued items
- Settings should favor **operator-safe controls** over raw JSON editing.

#### Current implementation
- Uses Switches for: Auto-send enabled, Global kill switch, Dry run.
- Shows config as raw JSON textareas for business hours/thresholds/rate limits/typing sim.
- No confirmation dialog or reason capture for kill switch.
- No “last action / queue” visibility.

#### Gaps / punch list
P0:
- Wrap **Global kill switch toggling ON** in `AlertDialog` confirmation.
- Add clear, persistent state banner:
  - “Automation: ON / PAUSED / BLOCKED” + what it means.
- Provide 1-click navigation to Audit Console.

P1:
- Replace JSON editors with structured forms over time:
  - business hours editor
  - thresholds sliders/inputs
  - rate limit fields
  - typing simulation min/max controls
- Add validation messaging and “restore defaults”.


### 3) FB Audit Console — `client/src/pages/FbAuditConsole.tsx`

#### Expected
- Filters bar under header, always visible.
- Table/list with loading skeletons preserving layout.
- Empty and error states explain what happened and what to do.
- “Why” drilldown should open a drawer (policy/decision details).

#### Current implementation (pre-patch)
- Filters exist (kind/threadId).
- Event list rendered with JSON `pre`.
- No empty/loading/error state.
- Kind badge variants were inconsistent with semantic meaning.

#### Improvements made in this pass
- Added loading skeletons + empty + error rendering.
- Added page-level subtitle.
- Improved kind badge styling to more semantic success/warn/danger look.

#### Remaining gaps / punch list
P0:
- Add “View details” drawer for each event (instead of raw JSON only).
- Add quick filter chips for top kinds.

P1:
- Add pagination or “Load more”.
- Add copy-to-clipboard for eventKey/threadId.


### 4) Competitive Report tab — `client/src/pages/Manager.tsx` (competitive)

#### Expected (from `COMPONENTS.md`)
- Data Table pattern:
  - sticky header
  - numeric right align + **tabular-nums**
  - skeleton loading preserving widths
  - empty state with next action
  - error banner with retry
- Filters bar directly under header.
- Snapshot picker (“Run: …”) + fresh/cached indicators.

#### Current implementation
- Basic header and actions.
- Uses native `<select>` for radius.
- Loading/empty are simple bordered blocks (not skeleton table).
- Table lacks tabular numerals and consistent density.

#### Punch list
P0:
- Replace native `<select>` with shadcn `Select` and match Filters Bar.
- Add skeleton rows for loading.
- Apply `tabular-nums` to price/delta/comps columns.
- Add explicit empty state CTA (“Run Now”).

P1:
- Add snapshot picker (run list) and fresh/cached chip.
- Add row drawer drilldown (Why band / comp set).

---

## Missing-state UI specs (implementation-ready)

### Inbox
- **Loading**
  - Thread list: 6–10 skeleton rows.
  - Transcript: skeleton message bubbles, preserve height.
  - Context: skeleton blocks.
- **Empty**
  - “No threads yet” with explanation and next action (check FB connection / refresh / verify extension).
- **Error**
  - Inline banner in each panel with:
    - what failed (threads/messages)
    - suggested next step
    - retry (if feasible)

### Automation Settings
- **Loading**
  - skeleton for switches + config area.
- **Empty**
  - not applicable (settings always exist). If not present, show “No settings returned from server” and retry.
- **Error**
  - banner with retry and guidance (“Check auth token / server status”).

### Audit Console
- **Loading**
  - skeleton event cards.
- **Empty**
  - “No events match these filters.” Suggest removing kind/threadId.
- **Error**
  - banner + retry.

### Competitive Report
- **Loading**
  - skeleton table with fixed columns.
- **Empty**
  - “No snapshot yet” with primary CTA “Run now”.
- **Error**
  - banner with retry.

---

## Implementation punch list (prioritized)

### P0 — required for “industry-leading” automation UX
1) **Global kill switch confirmation + reason capture** (Settings + persistent header strip)
2) **Inbox suggested reply + why** (policy decision drilldown)
3) **Typing simulation preview + Abort**
4) **Audit trail snippet** in Inbox context panel
5) **Consistent 4 states** on every surface

### P1 — high leverage improvements
1) Keyboard-first thread navigation + focus states
2) Drawer-based drilldowns (audit details, why, comp set)
3) Filters bar + density toggle for tables
4) Tabular numerals + consistent alignment in all numeric tables

### P2 — polish
1) Standardized status chips/badges mapped to semantic tokens
2) Better empty state illustrations and operator guidance

---

## Validation steps (self-QA)
1) **Inbox**
   - With no threads → verify empty state.
   - With threads but slow API → verify skeletons.
   - Simulate API error → verify error banners.
   - Confirm 3-column layout at `lg` widths.

2) **Audit Console**
   - Verify filter typing updates query and auto-refresh behavior.
   - Verify skeleton/empty/error paths render correctly.

3) **Competitive Report**
   - Verify numeric alignment and legibility at 100% zoom.

---

## Definition of Done (DoD) — parity acceptance criteria
Pass/fail criteria for design parity on these surfaces:
- [ ] Inbox, Automation Settings, Audit Console, Competitive Report each have **main/loading/empty/error** states.
- [ ] Automation surfaces include visible **ON/OFF** and **kill switch** affordances.
- [ ] “View audit log” within 1 click from Inbox and Settings.
- [ ] No automation action is “mysterious”: UI provides “why” visibility (drawer or details panel).
- [ ] Keyboard navigation works for primary flows; focus is visible.

---

## Gap Report (MANDATORY)

### Missing items vs design pack requirements
- Suggested Reply Card (Inbox)
- Typing Simulation Preview (Inbox)
- Audit Trail Snippet (Inbox)
- Kill switch confirmation + reason + last-action/queue visibility (Settings + Header)
- Data Table full pattern + Filters Bar pattern (Competitive Report)

### Why missing
- Current pages implement core wiring and basic layout with shadcn primitives, but do not yet include the specialized automation components described in `COMPONENTS.md`.

### Auto-fill action
- Next implementation pass should introduce:
  - a small set of reusable components under `client/src/components/automation/`:
    - `AutomationStatePill`
    - `KillSwitchDialog`
    - `SuggestedReplyCard`
    - `TypingSimulationStrip`
    - `AuditSnippet`
  - and refactor pages to use them, without changing backend contracts initially.
