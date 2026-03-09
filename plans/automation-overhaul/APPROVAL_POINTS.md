# LotView Automation Overhaul — Approval Points (External Side Effects)

## Policy
No actions that:
- spend money (paid APIs)
- log into external accounts
- scrape third-party sites at scale
- publish listings
- send external messages/emails

…may be performed without explicit user approval.

---

## Approval points by workstream

### A) Craigslist automation
**Approval required for:**
- Any attempt to fully automate Craigslist posting beyond local DOM fill (e.g., auto-navigation through all steps, auto-publish).
- Any attempt to bypass anti-bot measures (CAPTCHA solving, stealth plugins, etc.) — *not recommended*.

**No approval required for (safe):**
- Building extension code that fills fields client-side when the user is on a Craigslist posting page.
- Implementing a “manual review required” stop before publish.

### B) Competitive report
**Approval required for:**
- Purchasing and integrating a paid market data API (e.g., MarketCheck/DataOne/etc.).
- Scraping third-party marketplaces or competitor dealer sites beyond minimal testing.

**No approval required for (safe):**
- Building the report schema, computations, and UI scaffolding.
- Using internal LotView inventory data.

### C) VIN decode + comps engine
**Approval required for:**
- Paying for VIN decode APIs.
- Pulling comps from third-party sources that disallow automated access.

**No approval required for (safe):**
- Implementing NHTSA vPIC decode fallback.
- Building normalization, scoring, and UI scaffolding using mocked comps.

---

## Audit/controls (recommended)
- Feature flags: enable Craigslist automation per dealership.
- Per-attempt audit log (vehicleId, userId, platform, timestamps, outcome).
- Kill switch: remotely disable Craigslist driver if selectors break or ToS risk changes.
