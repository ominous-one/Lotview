# TASK: Permanent Image Caching Solution

## Problem
Vehicle images are stored as AutoTrader CDN URLs that expire/rotate, causing 404s when the Chrome extension tries to upload them to Facebook Marketplace. Need a permanent solution.

## Solution: Download & Serve Images from LotView Server

### Step 1: Image Download During Scraping
**File:** `server/dealer-listing-scraper.ts`

After extracting image URLs from a VDP page, download each image and store it locally on the server. Save to a path like `/public-objects/vehicles/{dealershipId}/{vehicleId}/{index}.jpg`.

- Download each image URL using fetch with appropriate headers (Referer: autotrader.ca)
- Save to `public-objects/vehicles/{dealershipId}/{vin or id}/` directory
- Store the LOCAL path (not CDN URL) in the `images` column
- Format: `["/public-objects/vehicles/1/5NMSG13D98H106001/0.jpg", "/public-objects/vehicles/1/5NMSG13D98H106001/1.jpg", ...]`
- Keep original CDN URLs in a separate field or as a comment for debugging
- Handle failures gracefully — if an image download fails, skip it, don't fail the whole vehicle

### Step 2: Serve Images via Existing Public Objects Route
**File:** `server/routes.ts` (line ~158)

There's already a route: `app.get("/public-objects/:filePath(*)")` — verify this serves files from a `public-objects/` directory. If it uses object storage (S3, etc.), we may need a local file approach for Render free tier.

**Alternative:** If Render free tier doesn't have persistent disk, store images as base64 in a new `vehicle_images` table in PostgreSQL:
- `id`, `vehicle_id`, `dealership_id`, `index`, `data` (bytea), `content_type`, `filename`
- Serve via a route like `/api/public/vehicle-image/:vehicleId/:index`
- Set CORS headers: `Access-Control-Allow-Origin: *`

### Step 3: Update Extension Image Fetching
**File:** `chrome-extension/src/content-facebook.ts`

When images are served from lotview.ai (same-ish origin or with CORS headers), the direct fetch should work. But the background script fetch (FETCH_IMAGE_BLOB) should also work as a fallback since it bypasses CORS entirely.

Update `proxyBaseUrl` usage so it constructs correct URLs for locally-served images.

### Step 4: Re-scrape with Image Caching
After implementing, re-scrape all 32 vehicles for Olympic Hyundai to download and cache all images.

## Constraints
- Render free tier: 512MB RAM, no persistent disk beyond the app itself
- PostgreSQL free tier: 1GB storage
- Each vehicle has 16-48 images, average ~100KB each = ~2-5MB per vehicle
- 32 vehicles × ~3MB avg = ~96MB total — fits in 1GB DB easily
- Images should be served with `Cache-Control: public, max-age=604800` (1 week)
- CORS header `Access-Control-Allow-Origin: *` required for FB extension

## Recommended Approach (PostgreSQL storage)
Since Render free tier has no persistent filesystem, store images in PostgreSQL:

1. Create `vehicle_images` table:
```sql
CREATE TABLE vehicle_images (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  dealership_id INTEGER NOT NULL,
  image_index INTEGER NOT NULL,
  data BYTEA NOT NULL,
  content_type VARCHAR(50) DEFAULT 'image/jpeg',
  original_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(vehicle_id, image_index)
);
```

2. Add route: `GET /api/public/vehicle-image/:vehicleId/:index`
   - Query vehicle_images, return data with content_type
   - Set CORS and cache headers
   - No auth required (public)

3. During scraping, after extracting image URLs:
   - Download each image
   - INSERT into vehicle_images
   - Update vehicles.images with local URLs: `["/api/public/vehicle-image/{id}/0", ...]`

4. Extension uses these URLs which are served with CORS headers

## Files to Modify
- `shared/schema.ts` — Add vehicle_images table schema
- `server/routes.ts` — Add vehicle-image serving route
- `server/dealer-listing-scraper.ts` — Download & store images during scrape
- `chrome-extension/src/content-facebook.ts` — Ensure image URLs work with new format

## After Implementation
- Run re-scrape of Olympic Hyundai (both local and production)
- Verify images serve correctly: `curl https://lotview.ai/api/public/vehicle-image/19/0`
- Test FB posting with new image URLs
- Rebuild extension: `cd chrome-extension && npm run build`

## DO NOT
- Remove existing image proxy routes (keep as fallback)
- Change the FETCH_IMAGE_BLOB or FETCH_IMAGES_AS_BLOBS handlers
- Break any existing functionality
