# Extension Deep Audit Report

**Date:** 2026-02-24
**Auditor:** Claude Opus 4.6
**Extension:** Lotview Auto Poster v1.3.0
**Scope:** Full functional audit of all source files, manifest, build pipeline, and Chrome Marketplace readiness

---

## Executive Summary

The extension is **well-architected** with solid security foundations (HMAC signing, AES-GCM token encryption, input sanitization, runtime validators). The Facebook form-filling logic is thorough with multi-layered selector strategies and graceful fallbacks. **7 issues were found and fixed** during this audit, including 1 security issue, 2 build/manifest bugs, and 4 code correctness issues.

**Overall Rating: GOOD** - Ready for Chrome Web Store with the fixes applied.

---

## 1. MANIFEST.JSON

### Status: FIXED (2 issues)

**Valid MV3:** Yes, `manifest_version: 3` with correct structure.

**Permissions:**
- `storage` - Required for auth, settings, history
- `scripting` - Required for dynamic content script injection via `chrome.scripting.executeScript`
- `downloads` - Required for image download fallback
- `cookies` - Required for `chrome.cookies.getAll({domain: ".facebook.com"})`

**Permissions are minimal and justified.** No unnecessary permissions.

**Content Scripts:** Correctly scoped to:
- `https://www.facebook.com/marketplace/create/*` - Vehicle listing creation
- `https://www.facebook.com/marketplace/you/selling*` - Seller dashboard
- `https://lotview.ai/vehicle/*` and subdomains - Image extraction

**Background:** Service worker with `"type": "module"` - correct for MV3 ESM.

**CSP:** `"script-src 'self'; object-src 'none'"` - Tight, correct.

### Issues Found & Fixed

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | **host_permissions too narrow for cookies API** - Had only `marketplace/create/*` and `marketplace/you/selling*` patterns. `chrome.cookies.getAll({domain: ".facebook.com"})` requires a host permission matching the broad domain, not just specific paths. | HIGH | FIXED: Changed to `https://www.facebook.com/*` in both manifests |
| 2 | **manifest.dev.json referenced `.svg` icons that don't exist** - Icons are `.png` files, not `.svg`. Also missing `content-lotview.js` content_scripts entry. | MEDIUM | FIXED: Corrected to `.png` and added lotview content script |

---

## 2. BACKGROUND SCRIPT (background.ts + background-helpers.ts)

### Status: FIXED (2 issues)

**Auth Flow Trace:**
1. Popup sends `EXT_LOGIN` with email/password/serverUrl
2. Background validates serverUrl against allowlist (`ALLOWED_PROD_DOMAINS`)
3. Fetches `POST /api/extension/login`
4. Validates response with `isExtensionAuthState()` runtime type guard
5. Encrypts JWT with AES-GCM before storing in `chrome.storage.local`
6. On subsequent requests, decrypts token, checks expiry (8h), refreshes at 7.5h
7. All API calls signed with HMAC-SHA256 (method, endpoint, timestamp, nonce, token, body)

**Auth flow is SOLID.** Token encryption, HMAC signing, nonce replay protection, expiry management all correct.

**Message Handlers:** 17 actions properly registered in `ALLOWED_ACTIONS`. Sender ID verification (`sender.id !== chrome.runtime.id`), protocol version checking, and privacy consent gating all implemented correctly.

**API Retry:** Exponential backoff with structured error types. Correct timeout handling with `AbortController`.

### Issues Found & Fixed

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 3 | **Stack overflow on large images in FETCH_IMAGE_BLOB** - `btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))` uses spread operator which fails for images >~1MB (millions of function arguments). | HIGH | FIXED: Replaced with chunked 8KB encoding loop |
| 4 | **Redundant auth re-declaration in AUTO_POST_VEHICLE** - `const auth = await getStoredAuth()` at line 831 shadowed the already-validated `auth` from the outer scope. Redundant async call. | LOW | FIXED: Removed re-declaration, uses outer `auth` |

### Items Verified OK
- URL validation blocks non-HTTPS in production, allows localhost in dev
- Image host allowlist (`ALLOWED_IMAGE_HOSTS`) is comprehensive
- Token refresh happens silently at 7.5h mark
- 401 responses auto-clear stored auth
- Privacy consent gating works correctly
- `CONSENT_EXEMPT_ACTIONS` only contains `CHECK_CONSENT`

---

## 3. CONTENT SCRIPT - FACEBOOK (content-facebook.ts)

### Status: FIXED (2 issues)

This is the most critical and complex file (~3555 lines). It handles the actual Facebook Marketplace form filling.

**Selector Strategy (ROBUST):**
The extension uses a **6-layer fallback strategy** for finding form fields:
1. Direct CSS selectors (`input[name="title"]`, `[data-testid="marketplace-create-title"]`)
2. `aria-label` matching (case-insensitive)
3. Placeholder text matching
4. Nearby text/label proximity search
5. Role/name/id/class attribute scanning
6. Structural heuristics (form container detection, position-based scoring)

**This is the RIGHT approach.** Facebook uses obfuscated class names that change on every deploy. The selectors here avoid fragile class-based selectors entirely and use semantic attributes (`aria-label`, `role`, `placeholder`, `data-testid`), text content matching, and DOM structure heuristics.

**Form Container Detection:** Validates form areas by scoring input types (numeric inputs, textareas, comboboxes, file inputs) and checking for marketplace-related text. Filters out header/navigation areas. This is robust.

**React Compatibility:**
- Uses `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set` to bypass React's controlled input
- Full keyboard event sequence (keydown, keypress, input, keyup, change)
- `simulateRealClick()` dispatches mousedown/mouseup/click with coordinates
- `document.execCommand('insertText')` for contenteditable (deprecated but necessary for React)

**Vehicle Type Selection:** Comprehensive dropdown interaction with `role="option"`, `role="menuitem"`, `role="menuitemradio"` scanning. Recovery logic re-opens dropdowns if options aren't found.

**Image Upload Pipeline (4 methods):**
1. File input with `DataTransfer` and native setter
2. Clipboard paste event
3. Label click (opens native picker - user must select manually)
4. Drag-drop with full event sequence
5. **Fallback:** Downloads images to user's Downloads folder with visual instruction overlay

**Color/Fuel/Transmission Normalization:** Comprehensive synonym databases mapping dealer terminology to Facebook's fixed options. 150+ color synonyms, fuel type variants (gas/petrol/diesel/EV/hybrid/flex), transmission variants.

**Body Style Detection:** Maps vehicle make+model to Facebook body styles using a comprehensive vehicle database (SUV, Truck, Coupe, Convertible, Wagon, Van, Hatchback).

### Issues Found & Fixed

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 5 | **XSS risk in showPhotoUploadInstructions** - Used `innerHTML` with server-sourced folder name. Content script runs on facebook.com, so any XSS becomes a Facebook-context attack. | HIGH | FIXED: Replaced innerHTML with DOM creation methods (createElement/textContent/appendChild) |
| 6 | **Location field hardcoded "Vancouver"** - `fillLocationField()` always typed "Vancouver" regardless of the `locationValue` parameter passed in. | MEDIUM | FIXED: Extracts city name from `locationValue` parameter dynamically (splits on comma) |

### Items Verified OK
- `sanitizeFormData()` called on all form data before filling
- `sanitizeNotificationText()` used on all user-visible notifications
- `document.execCommand('insertText')` is deprecated but still the best approach for React contenteditable - no fix needed
- Perceptual image deduplication (dHash) prevents uploading duplicate/resized photos
- SHA-256 content hashing for exact duplicate detection
- Upload mutex (`uploadInProgress`) prevents concurrent uploads
- Adaptive timeouts with `MutationObserver` for dynamic page changes
- Search input exclusion logic prevents typing into Facebook's search bar
- Form container validation prevents filling fields in wrong page areas

---

## 4. CONTENT SCRIPT - LOTVIEW (content-lotview.ts)

### Status: OK - No issues

**Purpose:** Extracts vehicle images from LotView dealer pages when user has a vehicle page open.

**Image Extraction Strategy:**
1. Clicks all gallery thumbnails to force lazy-load
2. Scrolls gallery to trigger additional lazy-loading
3. Extracts from gallery containers (`[class*="gallery"]`, `.swiper-container`, `.carousel`)
4. Extracts from `<img>` tags and `background-image` styles
5. Extracts from inline `<script>` tags (JSON data, image URL patterns)
6. Fallback: all large images on page (>200px)

**URL Filtering:** Blocks logos, icons, badges, spinners, tracking pixels. Normalizes URLs for deduplication.

**Message Handler:** Responds to `LV_EXTRACT_IMAGES` and `PING` messages correctly with `return true` for async response.

---

## 5. POPUP (popup.tsx)

### Status: OK - No issues

**Login Flow:**
1. Loads saved email/serverUrl from `chrome.storage.local` (never stores passwords)
2. Clears any legacy password storage from older versions
3. Sends `EXT_LOGIN` to background, receives auth state
4. Stores `rememberedEmail` and `rememberedServerUrl` on success
5. Privacy consent gate shown first if not yet accepted

**Inventory & Templates:**
- Search with real-time query parameter
- Templates with `{year}`, `{make}`, `{model}`, `{trim}`, `{price}`, etc. placeholders
- Template output sanitized with `sanitizeTemplateOutput()`
- Posting limits displayed with daily remaining count
- Duplicate posting detection and warning

**Auto-Post Flow:**
1. Auto-navigates to `facebook.com/marketplace/create/vehicle` if not already there
2. Fills template with vehicle data
3. Tries local Object Storage images first (avoids CORS)
4. Falls back to Lotview page extraction
5. Sends `FILL_CONTENT` to background -> driver -> content script
6. Requests server-side posting token
7. Logs posting result

**Privacy & Data:**
- Consent banner with accept/decline
- Data export to JSON
- Clear all data option
- 30-day history retention with auto-cleanup
- Privacy policy link

**Error Handling:** Toast notifications for all error/success states. Loading spinners. Retry buttons on failures.

---

## 6. DRIVERS

### Status: OK

**Facebook Driver (facebook.ts):** Fully implemented.
- Navigates to vehicle create page (reuses existing FB tab if possible)
- Injects content script if not already loaded (PING check + fallback injection)
- Waits for page load with polling + timeout
- Sends fill job to content script via `chrome.tabs.sendMessage`

**Kijiji/Craigslist Drivers:** Stubs that throw "coming soon" errors. `isDriverImplemented()` only returns true for `"facebook"`. Popup disables these options in the UI. Correct behavior.

---

## 7. CRYPTO & SECURITY

### Status: FIXED (1 issue)

**Token Encryption (AES-GCM):**
- 256-bit AES key generated via `crypto.subtle.generateKey`
- 12-byte random IV per encryption
- IV prepended to ciphertext for storage
- Key stored in `chrome.storage.local` (per-extension, not accessible cross-extension)

**HMAC Request Signing:**
- SHA-256 HMAC with 32-byte random signing key
- Signature covers: method, endpoint, timestamp, nonce, token, body
- Nonce replay protection with 5-minute window
- Used nonces tracked and cleaned up

**Input Sanitization (sanitize.ts):**
- HTML entity escaping for form data
- DOMPurify for template output stripping
- HTTPS-only URL validation
- Comprehensive HTML sanitization with forbidden tags/attrs

### Issues Found & Fixed

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 7 | **DOMPurify missing from package.json dependencies** - `sanitize.ts` imports `dompurify` but it wasn't listed in dependencies. Would cause runtime errors in a fresh install. | HIGH | FIXED: Added `dompurify` and `@types/dompurify` to dependencies |

### Items Verified OK
- `isAllowedImageHost()` validates URL protocol AND hostname
- `isValidServerUrl()` restricts to known production domains (or localhost in dev)
- Nonce expiry cleanup prevents memory leaks
- HMAC signing key is per-installation (not hardcoded)

---

## 8. BUILD PIPELINE

### Status: OK

**Dev Build:** `node build.cjs` - Uses `manifest.dev.json`, includes sourcemaps, console.log preserved, `__DEV__=true`
**Prod Build:** `node build.cjs --prod` - Uses `manifest.json`, minified, console/debugger dropped, `__DEV__=false`
**Zip Build:** `node build.cjs --prod --zip` - Creates distributable .zip for Chrome Web Store

**Build Output (prod):**
| File | Size | Format |
|------|------|--------|
| background.js | 20KB | ESM (correct for service worker) |
| content-facebook.js | 70KB | IIFE (correct for content script) |
| content-lotview.js | 3KB | IIFE (correct for content script) |
| popup.js | 186KB | ESM |
| popup.html | 361B | Static |
| popup.css | 10KB | Static |
| manifest.json | 1.3KB | JSON |
| icons/ | 3 files | PNG 16/48/128 |

**All manifest-referenced files present in dist/.**

**Test Results:** 318/318 tests passing across 8 test suites.

---

## Summary of All Fixes

| # | File | Issue | Severity | Fix Applied |
|---|------|-------|----------|-------------|
| 1 | manifest.json, manifest.dev.json | host_permissions too narrow for cookies API | HIGH | Broadened to `https://www.facebook.com/*` |
| 2 | manifest.dev.json | SVG icon refs + missing lotview content script | MEDIUM | Fixed to .png, added content script entry |
| 3 | background.ts | Stack overflow encoding large images | HIGH | Chunked base64 encoding (8KB chunks) |
| 4 | background.ts | Redundant auth re-declaration in AUTO_POST_VEHICLE | LOW | Removed, uses outer scope auth |
| 5 | content-facebook.ts | XSS via innerHTML in photo upload overlay | HIGH | Replaced with DOM creation methods |
| 6 | content-facebook.ts | Location field hardcoded "Vancouver" | MEDIUM | Dynamic city extraction from locationValue |
| 7 | package.json | DOMPurify missing from dependencies | HIGH | Added dompurify + @types/dompurify |

---

## Recommendations (Not Fixed - For Future)

1. **Facebook DOM changes** - The selector strategy is robust, but Facebook updates their DOM weekly. Consider a quarterly manual test cycle on live Facebook to verify selectors still work.

2. **Image upload reliability** - The 4-method approach is good, but Facebook's security sandbox increasingly blocks programmatic file injection. The download-to-folder fallback is the most reliable path. Consider making it the primary approach with a "drag these files" UX.

3. **Content script size** - `content-facebook.ts` is 3555 lines. Consider splitting into modules: `fb-selectors.ts`, `fb-dropdowns.ts`, `fb-images.ts`, `fb-normalization.ts`. This won't affect the bundled output but improves maintainability.

4. **popup.js bundle size** - 186KB minified, mostly React. Consider Preact (~3KB) for extension popups where bundle size matters for load speed.

5. **Kijiji/Craigslist** - Stubs only. When implementing, each needs its own content script with platform-specific selectors.
