# Re-Scrape Results: Olympic Hyundai Vancouver

**Date:** 2026-02-26  
**Dealership:** Olympic Hyundai Vancouver (dealership_id = 1)  
**Total Vehicles:** 32

## Before/After Stats

| Field | Before | After | Notes |
|-------|--------|-------|-------|
| Engine | 0/32 | **32/32** ✅ | New `engine` column added to DB |
| Carfax URL | 0/32 | **31/32** ✅ | Constructed from VIN (`vhr.carfax.ca/?id=<VIN>`) |
| Tech Specs | 31/32 | **32/32** ✅ | Was already mostly populated |
| VDP Description | 31/32 | 31/32 | 1 vehicle has PENDING VIN (no VDP) |
| Highlights | 29/32 | 29/32 | — |
| Exterior Color | 31/32 | 31/32 | — |
| Transmission | 31/32 | 31/32 | — |

## What Was Fixed

### 1. Engine Column (NEW)
- Added `engine` TEXT column to `vehicles` table via `ALTER TABLE`
- Added `engine` field to `ScrapedVehicle` interface in `server/scraper.ts`
- Added engine mapping in `upsertVehicleByVin()` (both update & insert paths)
- Added engine mapping in `onVehicleSaved` callback (dealer listing → ScrapedVehicle)
- Engine is extracted from hidden input `vdp-engine` on dealer VDP pages
- Examples: "Intercooled Turbo Regular Unleaded I-4 1.6 L/98", "Electric", "Gas/Electric I-4 2.0 L/122"

### 2. Carfax Report URLs
- The dealer site (Olympic Hyundai) only has generic `carfax.ca/` homepage links — no VIN-specific report URLs
- Constructed Carfax Canada report URLs using standard format: `https://vhr.carfax.ca/?id=<VIN>`
- 31/32 vehicles now have Carfax URLs (1 vehicle has a PENDING VIN placeholder)

### 3. Schema Change
- `shared/schema.ts`: Added `engine: text("engine")` to vehicles table definition
- `server/scraper.ts`: Added `engine` to ScrapedVehicle interface, upsertVehicleByVin, and dealer listing mapping

### 4. Interior Color
- Site's `vdp-interiorcolor` hidden input is consistently empty for all vehicles
- "Black" default remains appropriate — no real interior color data available from this dealer's site

## Remaining Gap
- **Vehicle ID 38** (2025 Kia EV6): Has PENDING VIN — needs real VIN to generate Carfax URL. Will be resolved on next full scrape when inventory listing provides VIN.

## Files Modified
- `shared/schema.ts` — Added engine column to vehicles table
- `server/scraper.ts` — Added engine field to ScrapedVehicle, mapping in upsert and callback
