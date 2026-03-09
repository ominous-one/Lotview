# Workstream 1 — Craigslist Assisted Autopost (Extension)

## What it does
- Runs on Craigslist posting pages.
- Prefills core fields (best effort):
  - Title (`PostingTitle`)
  - Price (`price`)
  - Description (`PostingBody`)
- Attempts to upload images when the image upload step is present (`<input type=file>`).
- Validates required fields and shows clear errors.

## What it will NOT do (hard rule)
- **Will not click Continue / Publish / Submit.**

## Supported posting areas
A selector is exposed in the overlay for launch regions:
- Tri-Cities BC
- Surrey BC
- Whistler area

> Note: Craigslist’s posting flow is multi-step and varies by region. LotView deliberately does not auto-navigate steps. Start a post manually, then run Assist on the step you’re currently on.

## Dry-run behavior
- Craigslist assist currently uses `lvDryRun` (stored in `chrome.storage.local`).
- In dev builds, dry-run is ON by default.

## Operator instructions (manual)
1) Open `vancouver.craigslist.org` (Tri-Cities/Surrey) or `whistler.craigslist.org`.
2) Start a new post.
3) Navigate to the posting form step (title/price/description) and/or the image upload step.
4) In the LotView extension popup, choose **Craigslist (Assist)** and click **Fill**.
5) Review, then click the next/submit buttons yourself.

## Known limitations
- Image upload is best-effort: if image fetch fails (CORS/403), the overlay will instruct you to drag-and-drop manually.
