# Scraping Logic Alignment — Inventory Sync / Enrichment / Deletion

**Project:** `C:\Users\omino\projects\lotview`

## 1) Purpose
Inventory Sync + Enrichment MUST reuse the existing scraping stack. This document names the canonical files and the rules we must follow to avoid duplication, regressions, and ToS/rate-limit mistakes.

---

## 2) Canonical scraping files (authoritative)
### 2.1 Production orchestrator (single entrypoint)
**`server/robust-scraper.ts`**
- Primary entrypoint: `runRobustScrape(triggeredBy, dealershipId?)`
- Implements provider fallback chain:
  - ZenRows → ScrapingBee → Puppeteer → Browserless → Apify → Cache Preserve
- Implements:
  - Cloudflare block page detection (`isCloudflareBlockPage`)
  - Rate limiting between VDP requests (notably 5s)
  - Image extraction hygiene + validation (folder-ID strategy)
  - Safe stale handling via `missedScrapeCount` and minimum scrape thresholds

**Policy:** Inventory Sync cron should call `runRobustScrape` for ingestion. No new cron should bypass it.

### 2.2 Canonical upsert + merge + image caching
**`server/scraper.ts`**
- `upsertVehicleByVin(vehicleData)`
  - Primary identity: normalized dealer VDP URL (prevents PENDING-VIN duplication)
  - Secondary: VIN
  - Smart merge: avoids overwriting good images/price/odometer with blanks
- `checkVehicleNeedsEnrichment(vin, dealershipId)`
- `updateVehiclePriceOnly(vehicleId, newPrice)`
- `uploadVehicleImagesToStorage(vehicleId, dealershipId, cdnUrls)`
  - Downloads images to DB cache and rewrites `vehicles.images` to local API URLs

**Policy:** Enrichment should prefer reusing these utilities instead of inventing new “upsert” behavior.

### 2.3 Provider integrations (reused)
- `server/browserless-unified.ts` — unified access to Zyte/ZenRows/ScrapingBee (as seen in `run-zenrows-scrape.ts` and robust scraper)
- `server/browserless-service.ts` — Browserless scraping fallback
- `server/precision-image-extractor.ts` — image URL maximization

---

## 3) Non-canonical / legacy utilities (do not treat as primary)
### `server/run-zenrows-scrape.ts`
- Single-dealer oriented (hardcoded `dealershipId=1` and Olympic inventory URL)
- Contains a full scrape+save+delete loop.

**Alignment decision:** Keep it as a debugging / ad-hoc script, but the product’s scheduler should use `runRobustScrape` for multi-tenant correctness.

---

## 4) Rules to preserve (rate limits, caching, ToS posture)
### 4.1 Rate limiting
- Respect 5s VDP delay for Cloudflare-sensitive domains (already implemented in robust scraper).
- Cap parallelism for enrichment (recommended 2–3 concurrent).

### 4.2 Caching
- Preserve the image caching behavior that rewrites `vehicles.images` to local API URLs.
- Avoid mixing local cached URLs with external CDNs in the same array.

### 4.3 Safety and correctness
- Never mass-delete based on partial scrapes.
- Use `missedScrapeCount` / consecutive misses logic.
- Prefer soft delete for user-driven removal.

### 4.4 ToS posture
- The codebase already uses paid scraping providers (ZenRows/ScrapingBee/Zyte) and managed browser runners (Browserless). Inventory Sync and Enrichment must continue to:
  - identify block pages and back off
  - minimize request volume via skip rules (e.g., skip fully enriched vehicles)
  - avoid aggressive concurrent crawling

---

## 5) How Inventory Sync should reuse scraping (implementation guidance)
### 5.1 Ingest
- Call `runRobustScrape('scheduler', dealershipId)`.

### 5.2 Enrichment
- Reuse the VDP fetch chain inside robust scraper (ZenRows/ScrapingBee/Direct), or extract the VDP fetch into a shared helper used by both robust scraper and enrichment service.
- Reuse existing image extraction utilities (Olympic-specific + generic) and the folder-ID validation.
- Persist enrichment outcomes (attempt logs + vehicle counters) and trigger notifications using existing notification tables.

### 5.3 Deletion
- Replace hard deletes in “sold detection” with:
  - soft-delete or status transitions (SOLD/REMOVED)
  - audit log entries

---

## 6) Gap Report (auto-fill)
- Some image extraction helpers currently live inside `server/robust-scraper.ts` (not exported). If enrichment needs them, refactor into a shared module (e.g., `server/scraping/image-extractors.ts`) to prevent copy/paste.
- `run-zenrows-scrape.ts` still hard-deletes sold vehicles via `storage.deleteVehicle`; once soft delete is implemented, that script should be updated or clearly labeled as unsafe for production.
