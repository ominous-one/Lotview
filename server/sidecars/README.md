# Scrapling Inventory Sidecar

This sidecar is optional and disabled by default. The Node scraper remains the
orchestrator for tenant boundaries, deduplication, validation, and persistence.

## Local Setup

```powershell
python -m venv .venv-scraper
.\.venv-scraper\Scripts\python.exe -m pip install -r server\sidecars\requirements.txt
.\.venv-scraper\Scripts\scrapling.exe install
$env:FEATURE_SCRAPLING_SIDECAR = "true"
$env:SCRAPLING_PYTHON = ".\.venv-scraper\Scripts\python.exe"
```

## Runtime Contract

- Keep `FEATURE_SCRAPLING_SIDECAR=false` unless staging is being tested.
- The worker returns only candidate source facts as JSON.
- Node owns `dealershipId`, dealership name, source URL, location, validation,
  deduplication, and inventory writes.
- Worker failures, timeouts, missing Python dependencies, invalid JSON, and
  rejected vehicles fail closed and fall back to the existing scrape result.
