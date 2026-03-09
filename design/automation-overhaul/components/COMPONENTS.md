# LotView Components (Automation Overhaul)

Component inventory and interaction rules for the Sales Manager app surfaces touched by the automation overhaul.

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** reusable UI components and patterns for Inbox, Settings, Competitive Reports, Appraisal/Comps, Craigslist Assist review.
- **Out of scope:** pixel-perfect implementation specs; final responsive breakpoints.
- **Assumptions:** shadcn/ui primitives, Radix, Tailwind; right-drawer drilldowns preferred.

### 1) Deliverables checklist
- [ ] `C:\Users\omino\projects\lotview\design\automation-overhaul\components\COMPONENTS.md`

### 2) Acceptance criteria
- Covers required surfaces and states (loading/empty/error).
- Defines kill switches, audit affordances, and keyboard behavior.

### 3) Validation steps
- Confirm every automation action has: status, why, audit, abort.

### 4) Gap report + auto-fill
- See bottom.

---

## 1) Layout primitives

### App Shell
- Left nav with section badges (e.g., Inbox SLA/Unassigned count).
- Top bar: dealer selector (if multi-dealer), global status (automation state), user menu.

### Page Header
- Title + one-line “what this is” subtitle.
- Right side: primary CTA + secondary actions.

### Split View (Inbox)
- 3-column: Conversation list | Transcript | Context/controls.
- Resizable panels allowed, but provide sane defaults.

### Right Drawer (Drilldown)
- Use for:
  - Comp set drilldown
  - “Why did we send this?” audit details
  - VIN decode / options detail

---

## 2) Core data components

### Data Table (Competitive, Inventory, Comps)
Features:
- Sticky header
- Column alignment (numbers right)
- Sort indicators
- Row density toggle (Comfort / Dense)
- “Unknown” values shown explicitly (`— Unknown`)
- Row actions menu (kebab)

States:
- Loading: skeleton rows (preserve column widths)
- Empty: explanation + next action
- Error: inline banner with retry + view details

Keyboard:
- Arrow/Tab navigates; Enter opens row drawer.

### Filters Bar
- Always visible under header.
- Uses chips/segmented controls for common filters.
- `Reset` link always visible.

---

## 3) Automation components (non-negotiable)

### Global Kill Switch
Purpose: immediate stop to outbound automation.
- Placement: top-level (header or persistent strip) and in Automation Settings.
- States:
  - ON (green)
  - PAUSED (amber)
  - BLOCKED (red)
- Interaction:
  - Requires confirmation dialog with reason selection.
  - Shows “last auto action” timestamp and count of queued items.

### Per-Thread Automation Toggle (Inbox)
- Toggle with explicit label: **Auto-send: ON**.
- Disabled-with-reason state (policy gating): show why (e.g., “Lead name confidence low”).
- Provides quick action: “Queue for human” / “Assign to me”.

### Suggested Reply Card
- Shows suggested message text.
- Shows status pill:
  - “Will auto-send” (with ETA)
  - “Needs approval” (blocked by policy)
- Includes “Why” link → opens Policy/Decision drawer.
- Actions:
  - `Send now` (manual)
  - `Edit` (opens composer)
  - `Queue` (send later)

### Typing Simulation Preview
- Inline strip above composer:
  - “Typing… 6s left” countdown
  - progress indicator
  - `Abort` button
- If abort triggered: surface toast + log entry.

### Audit Trail Snippet
- Inline mini-log in context panel:
  - last 3 events (sent/blocked/paused)
  - link to full Audit Log with filters pre-applied.

---

## 4) Messaging components (Inbox)

### Conversation List Item
- Lead name (or “Unknown lead”) + vehicle shorthand.
- SLA timer (time since last inbound).
- Assignment chip (Unassigned / Assigned to X).
- Automation state icon (Auto/Manual/Paused/Blocked).

### Transcript Bubble
- Buyer vs Dealer styling.
- Dealer bubbles show:
  - mode (auto/manual)
  - timestamp
  - delivery state (sent/failed)
  - “why” link when auto

### Composer
- Default: simple textarea, send button.
- Supports:
  - variable insert (Lead name, Vehicle)
  - character count (soft)
  - compliance warnings (inline)

---

## 5) Competitive Report components

### Snapshot Picker
- Dropdown: “Run: Mar 8, 10:00”
- Chip: “Fresh” vs “Cached”.

### Recommended Price Band
- Visual band with:
  - current price marker
  - recommended range
  - confidence indicator (high/med/low)
- “Why this band?” → reveals drivers (days on lot, local comps count, trim match).

### Export Menu
- Exports: CSV, PDF.
- Warning: “Exports may include lead/unit identifiers.” (if applicable)

---

## 6) Appraisal/Comps components

### VIN Decode Card
- VIN input + decode status.
- Confidence pill (High/Med/Low).
- Show decoded Year/Make/Model/Trim + key options.

### Exact vs Near-Trim Toggle
- Segmented control:
  - Exact (default)
  - Near-trim (+explain)

### Comp Results List
- Match label: Exact / Near / Unknown
- Provenance: source + distance + fetched timestamp
- Expand row: adjustments + reasoning

### Adjustments Panel
- List adjustments with +/− values and notes.
- Shows impact on estimated value.

---

## 7) Craigslist Assist review components

### Prefill Preview Panel
- Title, price, category, region, description preview.
- Photo order strip with drag handles + “Set cover”.

### Publish-Ready Checklist
- Checkbox list (auto-checked when validated):
  - photos uploaded
  - category valid
  - region selected
  - description length ok
  - no blocked terms

### Validation Errors
- Inline error summary + field-level highlights.
- Clear statement: **LotView will not click Publish.**

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- None.

### Why missing
- N/A

### Auto-fill action
- If engineering needs a shorter implementation-targeted list, create a follow-up `components/COMPONENTS_IMPLEMENTATION_NOTES.md` mapping these patterns to shadcn component names.
