# LotView Automation Overhaul — OPEN QUESTIONS / BLOCKERS (v1)

> Keep this list **small**: only questions that block implementation choices.

---

## Deliverables index

| Deliverable | Path | Status |
|---|---|---|
| Open blockers list (this document) | `plans/automation-overhaul/OPEN_QUESTIONS_BLOCKERS.md` | ✅ Delivered |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope:** truly blocking questions only.
- **Out of scope:** nice-to-haves and optimizations.
- **Assumptions:** constraints in `MASTER_PLAN_V1.md` are fixed.
- **Inputs needed:** answers to items below.

### 1) Deliverables checklist
- [x] `C:\Users\omino\projects\lotview\plans\automation-overhaul\OPEN_QUESTIONS_BLOCKERS.md`

### 2) Acceptance criteria
- ≤ 7 blockers.
- Each blocker has a clear “why it blocks” and the minimum acceptable answer set.

### 3) Validation steps
- Count items; ensure all are blocking.

### 4) Gap report + auto-fill
- See end.

### 5) External side effects policy
- None.

---

## Blockers

### B1) Craigslist account provisioning (external side effect gate)
- **Question:** Will the user create Craigslist dealer account(s), or do they explicitly approve us to create them?
- **Why it blocks:** we cannot test or implement real assisted flows without an account; we also cannot create accounts without explicit approval.
- **Minimum answer:** “User will create” + account exists OR explicit approval and a credential-handling approach.

### B2) Competitive comps vendor decision (API-first)
- **Question:** Which API vendor is the v1 primary for competitive report + comps (e.g., MarketCheck vs Canadian Black Book vs other)?
- **Why it blocks:** connector contracts, cost controls, and field coverage (DOM, colors, accident history) depend on vendor.
- **Minimum answer:** pick one primary vendor for v1; name one fallback source if coverage gaps appear.

### B3) Accident history field sourcing
- **Question:** What is the accepted v1 source for **accident history** in competitive comps?
- **Why it blocks:** most marketplaces don’t provide it; it may require a separate licensed product or “unknown” acceptance.
- **Minimum answer:** either (a) accept `unknown` in v1, or (b) name an approved provider/product and budget.

### B4) Craigslist domain + posting category confirmation
- **Question:** Confirm the Craigslist domain(s) and category flow used for vehicle posts for BC (likely `vancouver.craigslist.org` + cars+trucks by dealer).
- **Why it blocks:** content script step detection and area mapping depend on it.
- **Minimum answer:** domain(s) + category.

### B5) Exact trim vs near-trim UX defaults
- **Question:** Confirm the exact UI wording and default behavior for “Exact trim (default)” and “Near-trim (include close trims)”.
- **Why it blocks:** impacts comps matching and user trust.
- **Minimum answer:** approve default exact + toggle near-trim.

---

## Gap Report + Auto-fill (MANDATORY)

### Missing items
- None.

### Why missing
- N/A

### Auto-fill action
- N/A
