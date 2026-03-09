# LotView Automation Overhaul — Current State (Chrome Extension)

## Source of truth
- Repo path: `C:\Users\omino\projects\lotview\chrome-extension`
- Reviewed artifact: `chrome-extension/dist/background.js` (built output; corresponds to `chrome-extension/src/*`)
- Manifest: `chrome-extension/manifest.json`

## What works today (Facebook)
### High-level flow
1. User logs into LotView extension (email/password) via popup.
2. Extension stores:
   - `apiBaseUrl` in `chrome.storage.sync`
   - `authData` in `chrome.storage.local` with AES-GCM encrypted token and expiry timestamps.
3. User triggers **Fill** / **Auto-post** actions (from popup UI). Background service worker:
   - Fetches inventory/templates/limits from LotView server (`/api/extension/*`).
   - For form fill: navigates/activates a Facebook “create vehicle” tab and sends a message to `content-facebook.js` to populate fields.
   - For server-side auto-post: reads Facebook cookies and sends them to backend `/api/extension/auto-post`.

### Auth/session handling
- Token stored encrypted (AES-GCM) in `chrome.storage.local` as `authData.encryptedToken`.
- Expiry model:
  - `AUTH_EXPIRY_MS = 8h`
  - Refresh attempted near 7.5h via `/api/extension/refresh`.
- Requests signed with an extension-local HMAC key (`X-Timestamp`, `X-Nonce`, `X-Signature`), using `signingKey` stored in `chrome.storage.local`.

### Form fill mechanics (Facebook)
- Background driver (`facebookDriver.fillForm(job)`):
  - Ensures a tab at `https://www.facebook.com/marketplace/create/vehicle`.
  - Ensures `content-facebook.js` is injected (ping, then `chrome.scripting.executeScript`).
  - Sends message `type="LV_FILL_FACEBOOK"` with the `job` payload.

### Image handling
- The background supports multiple image strategies:
  - Download images via `chrome.downloads.download()` (saved to Downloads).
  - Fetch images as base64 data URLs (`FETCH_IMAGE_BLOB`, `FETCH_IMAGES_AS_BLOBS`).
  - Upload images to a page via Chrome Debugger protocol (`DEBUGGER_UPLOAD_IMAGES`) by:
    1) downloading to a temp folder
    2) `chrome.debugger.attach`
    3) `DOM.querySelector` for `input[type=file]`
    4) `DOM.setFileInputFiles`
    5) detach + cleanup downloads

## Platforms scaffolded but not implemented
Drivers exist for:
- `kijiji` — throws “coming soon”
- `craigslist` — throws “coming soon”

Implementation check:
- `isDriverImplemented(platform)` currently returns `platform === "facebook"`.
- `FILL_CONTENT` rejects other platforms with a “coming soon” error.

## Manifest coverage
Current host permissions include:
- Facebook
- LotView domains
- Specific dealer domains

Missing for Craigslist automation:
- No `host_permissions` for `https://*.craigslist.org/*`.
- No content script matches for Craigslist posting pages.

## Key constraints implied by current architecture
- Extension is MV3 with a service worker background.
- Form filling is content-script driven (DOM selectors) and susceptible to UI changes.
- Heavy-lift auto-posting can be done server-side (via cookies) **only** where ToS and technical feasibility allow; Facebook auto-post exists via `/api/extension/auto-post`.
- There is already a robust image upload technique (Debugger `DOM.setFileInputFiles`) that is likely reusable for Craigslist, if the user is on the correct step/page and there is a file input.

## Immediate implications for Craigslist
- Easiest, lowest-risk path is **assisted automation**:
  - User logs in to Craigslist in the browser.
  - User navigates to the correct “post” flow (or extension opens the first step).
  - Extension fills fields and attaches images.
  - User manually reviews and clicks Publish.
- Full “hands-off auto-posting” is high risk:
  - multi-step flows, anti-bot measures, CAPTCHAs
  - ToS/legal compliance concerns
  - frequent UI changes across locales
