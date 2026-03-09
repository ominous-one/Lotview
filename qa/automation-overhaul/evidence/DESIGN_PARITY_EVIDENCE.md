# Design Parity Evidence (v1.2)

## Goal
Provide concrete evidence that the **implemented UI** matches the **design exports**.

## Canonical design exports
Location: `plans/automation-overhaul/design/v1_2/exports/`
- `sales-inbox.png`
- `automation-settings.png`
- `competitive-report-dashboard.png`
- `appraisal-comps.png`
- `craigslist-assist-review.png`

## Required evidence
Screenshots of the implemented UI captured from a running dev instance (same key flows) stored under:
- `qa/automation-overhaul/evidence/screenshots/`

## Capture plan (reproducible)
Script (Puppeteer; Playwright-equivalent):
- `qa/automation-overhaul/evidence/scripts/capture-design-parity-screenshots.ts`

What it does:
1) optionally starts the app locally (`--start`) or assumes it’s already running
2) seeds a deterministic localStorage session (safe, DB-free) so UI route guards don’t redirect to `/login`
3) visits each required UI route
4) captures screenshots into `qa/automation-overhaul/evidence/screenshots/`

Exact commands:
- `qa/automation-overhaul/evidence/commands/capture-screenshots.txt`

## Status
- Evidence directory created.
- Screenshot capture script added (reproducible).
- Screenshots can be generated from a running dev server.
