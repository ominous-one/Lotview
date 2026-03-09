# Automation Overhaul — QA Test Commands (Dry-run Safe)

Project root: `C:\Users\omino\projects\lotview`

This doc is **command-only** (with minimal notes) so results can be captured in CI or locally.

---

## 0) Safety / no external side effects (recommended env)

PowerShell (one session):

```powershell
$env:LOTVIEW_EXTERNAL_FETCHES = 'false'      # prevents scheduler/job from doing live fetches
$env:LOTVIEW_ALLOW_PAID_APIS   = 'false'     # disables MarketCheck enrichment
$env:ENABLE_COMPETITIVE_REPORT_SCHEDULER = 'false'
```

Extension safety:
- Dev build defaults to `lvDryRun=true` (does not click Send for FB replies).

---

## 0.5) Local DB (Postgres) — start + migrate (required for DB-backed scripts & screenshot capture)

```powershell
cd C:\Users\omino\projects\lotview

# 1) Create your local .env (safe defaults)
#    (or manually set DATABASE_URL)
Copy-Item -Force env\dev.local.example .env

# 2) Start local Postgres (Docker)
docker compose up -d db

# 3) Apply Drizzle migrations (creates schema)
#    NOTE: drizzle-kit reads DATABASE_URL from .env
npm run db:push
```

---

## 1) Workstream 1 + 4 (Extension) — automated tests

```powershell
cd C:\Users\omino\projects\lotview\chrome-extension
npm test
```

Capture output:

```powershell
npm test *>&1 | Tee-Object -FilePath ..\qa\automation-overhaul\_results_extension_tests.txt
```

---

## 2) Workstream 1 + 4 (Extension) — build

```powershell
cd C:\Users\omino\projects\lotview\chrome-extension
npm run build
```

Capture output:

```powershell
npm run build *>&1 | Tee-Object -FilePath ..\qa\automation-overhaul\_results_extension_build.txt
```

---

## 3) Workstreams 2 + 3 + 4 (Server) — Jest unit/integration-ish tests (DB-free subset)

> Note: The repo includes a mix of Jest tests and script-style tests under `server/tests/*`.
> This command intentionally runs the **DB-free subset**.

```powershell
cd C:\Users\omino\projects\lotview
npx jest \
  server/tests/auth.test.ts \
  server/tests/security.test.ts \
  server/tests/tenant-middleware.test.ts \
  server/tests/dealership-automation-settings.test.ts \
  server/tests/condition-normalization.test.ts \
  server/tests/comps-engine.test.ts \
  server/tests/competitive-report-service.int.test.ts
```

Capture output:

```powershell
npx jest server/tests/auth.test.ts server/tests/security.test.ts server/tests/tenant-middleware.test.ts server/tests/dealership-automation-settings.test.ts server/tests/condition-normalization.test.ts server/tests/comps-engine.test.ts server/tests/competitive-report-service.int.test.ts *>&1 | Tee-Object -FilePath qa\automation-overhaul\_results_server_jest_subset.txt
```

---

## 4) Workstream 4 (FB replies) — script tests

Docs reference: `docs/automation-overhaul/workstream-4-fb-marketplace-replies-implementation.md`

### 4A) Decide-send **unit** Jest test (DB-free)

```powershell
cd C:\Users\omino\projects\lotview
npx jest server/tests/fb-replies-decide-send.unit.test.ts
```

### 4B) DB-backed script tests (requires local server + DB)

Prereqs:
- Local Postgres available
- Migrations applied through the project’s Drizzle workflow
- API server running at `http://localhost:5000`

Start server (dev):

```powershell
cd C:\Users\omino\projects\lotview
npm run dev
```

In another terminal, run:

```powershell
cd C:\Users\omino\projects\lotview
npx tsx server/tests/fb-replies-ingestion.test.ts
npx tsx server/tests/fb-replies-decide-send.int.test.ts
```

Capture output:

```powershell
npx tsx server/tests/fb-replies-ingestion.test.ts *>&1 | Tee-Object -FilePath qa\automation-overhaul\_results_fb_ingestion_script.txt
```

---

## 5) Workstream 2 (Competitive report) — manual trigger (requires server + DB)

Trigger snapshot run:

```powershell
curl -X POST http://localhost:5000/api/manager/competitive-report/run
```

Read latest:

```powershell
curl "http://localhost:5000/api/manager/competitive-report/latest?radiusKm=100"
```

---

## 6) Workstream 3 (VIN decode + appraisal comps) — manual API call (requires server + DB)

```powershell
curl -X POST http://localhost:5000/api/manager/appraisal-comps `
  -H "Content-Type: application/json" `
  -d '{"vin":"1HGCM82633A123456","mileageKm":60000,"postalCode":"V6B 1A1","radiusKm":100,"trimMode":"exact"}'
```

---

## 7) Workstream 4E (Evidence) — capture design-parity screenshots (requires server + DB)

### 7A) If server already running

```powershell
cd C:\Users\omino\projects\lotview
npx tsx qa/automation-overhaul/evidence/scripts/capture-design-parity-screenshots.ts
```

### 7B) Start dev server automatically (best-effort)

```powershell
cd C:\Users\omino\projects\lotview
npx tsx qa/automation-overhaul/evidence/scripts/capture-design-parity-screenshots.ts --start
```

Expected output directory:
- `qa/automation-overhaul/evidence/screenshots/*.png`
