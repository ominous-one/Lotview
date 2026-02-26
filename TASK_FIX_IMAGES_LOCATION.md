# TASK: Fix Image Upload + Location Field

## Two Critical Bugs

### Bug 1: Background Image Fetch Handler Missing
**File:** `chrome-extension/src/background.ts`
**Problem:** Content script `fetchImageAsFile()` (content-facebook.ts ~line 928) sends `chrome.runtime.sendMessage({ type: "FETCH_IMAGE_BLOB", payload: { url } })` but background.ts has NO handler for `"FETCH_IMAGE_BLOB"`. It only handles `"FETCH_IMAGES_AS_BLOBS"` (batch, line 779).

**Result:** Every per-image background fetch returns "Failed to fetch" (no response). All 20 images fail: direct (CORS blocked by facebook.com), background (no handler), proxy (404 — `/api/public/image-proxy` doesn't exist on Render).

**Fix:** Add a `FETCH_IMAGE_BLOB` handler in background.ts that fetches a single URL and returns `{ ok: true, base64, contentType }`. Model it after the batch handler's per-image logic (lines 793-843). The background script runs in extension context, NOT on facebook.com, so it bypasses CORS.

OR alternatively, change the content script to skip the per-image background fetch and go straight to the batch Method 6 (`FETCH_IMAGES_AS_BLOBS`) which already works. The batch approach at line 1639 uses the correct message type.

**Preferred approach:** Add the missing `FETCH_IMAGE_BLOB` handler AND ensure batch method 6 is used as primary approach (it's more efficient — one message for all 20 images instead of 20 separate messages).

### Bug 2: Location Field Gets Model Name Instead of "Vancouver, BC"
**File:** `chrome-extension/src/content-facebook.ts`
**Problem:** The Location field (aria="Location", role="combobox") gets the vehicle model typed into it (e.g., "Seltos EX AWD"). The model input detection heuristic is finding the Location input first.

**Evidence from logs:**
- Input field 1: `aria="Location" placeholder="" role="combobox" visible=true`
- The model text "Seltos EX AWD" ends up in the Location field (see screenshot)

**Fix:** 
1. Location must ALWAYS be set to "Vancouver, BC" (hardcode for now)
2. The model field detection must SKIP the Location input (check for aria="Location" or nearby "Location" label)
3. Set location BEFORE model to prevent spillover

### Additional Context
- Extension manifest has `"debugger"` permission
- Images are from `1s-photomanager-prd.autotradercdn.ca` (AutoTrader CDN)
- The image proxy endpoint `/api/public/image-proxy` returns 404 on production (lotview.ai) — it either doesn't exist in routes.ts or has no CORS headers. This is a secondary issue; fixing the background fetch is the primary fix.
- Form fill runs TWICE (VM120 + content-facebook.js duplicate injection) — this is a separate issue, don't worry about it now.

## Files to Edit
1. `chrome-extension/src/background.ts` — Add FETCH_IMAGE_BLOB handler
2. `chrome-extension/src/content-facebook.ts` — Fix location field, fix model field detection

## Test
After fixes, rebuild extension: `cd chrome-extension && npm run build`
The built extension is at `chrome-extension/dist/`

## DO NOT
- Change the batch FETCH_IMAGES_AS_BLOBS handler (it works)
- Touch server/routes.ts
- Remove any existing upload methods (keep all 6)
