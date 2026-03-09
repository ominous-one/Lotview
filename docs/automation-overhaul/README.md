# Automation Overhaul — Workstreams 1 + 4 (Extension)

> Project: `C:\Users\omino\projects\lotview`
>
> Scope in this folder: production-ready extension automation for:
> - **Workstream 1**: Craigslist assisted autopost
> - **Workstream 4**: Facebook Marketplace replies (auto-send)

---

## Deliverables index (this implementation)

| Deliverable | Path |
|---|---|
| Craigslist assist content script | `chrome-extension/src/content-craigslist.ts` |
| Craigslist driver (injects content script + runs assist) | `chrome-extension/src/drivers/craigslist.ts` |
| FB replies content script (v1.2 semantics: auto-send default ON, Safety Envelope, typing sim, DNC, audit) | `chrome-extension/src/content-facebook-messenger.ts` |
| Shared Safety Envelope + intent classifier | `chrome-extension/src/automation/fbPolicy.ts` |
| Shared typing simulation module | `chrome-extension/src/automation/typing.ts` |
| Shared retry helper | `chrome-extension/src/automation/retry.ts` |
| AUTO_POST→listingUrl map capture (thread→vehicle binding) | `chrome-extension/src/background.ts` (stores `lvFbListingMap`) |
| Manifest host permissions for Craigslist | `chrome-extension/manifest.json`, `chrome-extension/manifest.dev.json` |
| Build pipeline includes Craigslist script | `chrome-extension/build.cjs` |
| Unit tests: Safety Envelope primitives | `chrome-extension/tests/fbPolicy.test.ts` |
| Unit tests: typing module primitives | `chrome-extension/tests/typing.test.ts` |
| E2E validation checklist | `docs/automation-overhaul/VALIDATION_STEPS.md` |
| Workstream 1 notes | `docs/automation-overhaul/workstream-1-craigslist-assist.md` |
| Workstream 4 notes | `docs/automation-overhaul/workstream-4-fb-marketplace-replies.md` |

---

## DoD Contract (Standard)

### 0) Scope + assumptions
- **In scope**
  - Craigslist assisted autopost: prefill + best-effort photo upload + required-field validation + **stop before publish**.
  - FB Marketplace replies: inbox polling + dedupe/state + **auto-send default ON** with Safety Envelope + typing simulation + kill switch + audit logging.
  - Mapping: capture `listingUrl` returned by existing FB autopost flow and store a local `listingUrl → vehicleId` map.
- **Out of scope**
  - Backend schema + UI for Sales Inbox (this work is extension-only).
  - Sending real Marketplace messages during development.
- **Assumptions**
  - Facebook/Marketplace DOM is unstable; selectors use best-effort strategy and fail closed.
  - `__DEV__` builds run in **dry-run** by default (no actual click Send).

### 1) Acceptance criteria (objective, testable)
- Craigslist:
  - Prefills `title`, `price`, `description` when those fields exist.
  - Attempts photo upload via `<input type=file>` when present.
  - Never clicks Craigslist publish/continue.
  - Shows clear overlay status + errors.
- FB Replies:
  - Default enabled when no user setting exists.
  - Enforces DNC absolute.
  - Only auto-sends for allowlisted intents and within business hours.
  - Requires personalization (lead name + vehicle label) for auto-send.
  - Uses incremental typing simulation; aborts on thread change / action blocks.
  - In dev builds: **dry-run ON** (does not click Send).
- Tests: `npm test` passes in `chrome-extension/`.

### 2) Validation steps
See `docs/automation-overhaul/VALIDATION_STEPS.md`.

---

## Gap Report (auto-filled)

### Missing items
- **No server-side inbox ingestion / database-backed dedupe / webapp Sales Inbox UI** is implemented in this workstream slice.
- **Rate limiting per FB identity** beyond per-thread throttling is not wired to backend counters.

### Why missing
- This subtask focused on **browser automation inside the extension** (Workstreams 1 + 4). The full Workstream 4 architecture requires backend + webapp workstreams.

### Auto-fill action
- Next implementation step should add:
  1) backend routes to ingest `threads/messages/audit` (idempotent) and persist policy decisions,
  2) Sales Inbox UI and automation settings UI,
  3) per-dealer policy storage (business hours, allowlist/denylist, thresholds) and rate-limit counters.
