# Validation Steps — Workstreams 1 + 4 (Extension)

## 1) Unit tests
From `C:\Users\omino\projects\lotview\chrome-extension`:

```bash
npm test
```

## 2) Build extension
```bash
npm run build
```

Load unpacked:
- Chrome → `chrome://extensions/`
- Developer mode ON
- Load unpacked → `chrome-extension/dist`

## 3) E2E manual test (safe)

### A) FB replies — DRY RUN
1) Build dev extension (`npm run build`) and load unpacked.
2) Ensure you are logged into Facebook.
3) Open a Marketplace thread:
   - `https://www.facebook.com/marketplace/inbox/...` or `.../messages/t/...`
4) In the extension popup:
   - Turn **AI Bot ON** (default ON)
5) Send a test inbound message from a test account (or open a thread that has a new inbound).

Expected:
- Extension detects inbound.
- If envelope conditions pass, it types a reply **but does not click Send** in dev builds (dry-run).
- `chrome.storage.local["lvFbReplyAudit"]` has a new audit record with decision `DRY_RUN` or `BLOCKED`.

### B) Craigslist assist
1) Open `https://vancouver.craigslist.org`.
2) Start a new posting flow manually.
3) When on the posting form step (title/price/description), click **Fill** in the extension popup with platform = Craigslist (Assist).

Expected:
- Overlay appears: “LotView — Craigslist Assist”.
- Fields are filled where present.
- It **does not** click Continue/Publish.

## 4) Negative tests
- FB: message contains “stop messaging me” → must set DNC and never type/click send.
- FB: “lowest price” → must be `BLOCKED` (no auto-send).
- FB: outside business hours (Sunday) → must be `BLOCKED`.
- FB: action-block text present → decision `ESCALATED`.

---

# Appendix — Local DB-backed validation (Server + evidence)

## A1) Provision local Postgres (Docker) + apply migrations

From repo root:

```powershell
Copy-Item -Force env\dev.local.example .env

docker compose up -d db

npm run db:push
```

Safety defaults in `env/dev.local.example`:
- `NOTIFICATIONS_TEST_MODE=true`
- `LOTVIEW_EXTERNAL_FETCHES=false`
- `LOTVIEW_ALLOW_PAID_APIS=false`
- `ENABLE_COMPETITIVE_REPORT_SCHEDULER=false`

## A2) Start dev server (Windows/macOS/Linux)

```powershell
npm run dev
```

## A3) Run DB-backed QA scripts (WS4 ingestion + decide-send int)

In another terminal:

```powershell
npx tsx server/tests/fb-replies-ingestion.test.ts
npx tsx server/tests/fb-replies-decide-send.int.test.ts
```

## A4) Capture design-parity screenshots

```powershell
npx tsx qa/automation-overhaul/evidence/scripts/capture-design-parity-screenshots.ts
```

Expected:
- PNGs under `qa/automation-overhaul/evidence/screenshots/`
