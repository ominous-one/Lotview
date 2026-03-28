# WORKING_BUFFER

Status: ACTIVE
Last Updated: 2026-03-28

Use this as the short-lived execution scratchpad for the current LotView run.

## Current context
- activeObjective: Drive LotView toward actual multi-tenant SaaS readiness on `*.lotview.ai`, not planning theater.
- currentState: Fresh evidence now confirms the production marketing site is live on `lotview.ai`, the Render service is still on `main`, and wildcard subdomain handling is only partially correct (`olympic.lotview.ai` responds, `olympichyundai.lotview.ai` fails closed).
- acceptanceTarget:
  - prove dealer subdomain behavior on `lotview.ai`
  - prove role-based access for GM / sales manager / salesperson
  - prove pricing-analysis and appraisal workflows are trustworthy enough for real dealers
  - keep web/worker topology coherent in repo and live deployment
  - pass typecheck/build after edits
  - return exact remaining live blockers

## Decisions
- Keep preferring fail-closed behavior over dealership 1 compatibility defaults.
- Treat tenant-scoped user management as a top-tier SaaS isolation surface, not admin-only cleanup.
- Reduce confidence inflation in pricing/appraisal outputs unless the comparable set quality supports it.
- Only claim what is evidenced in this run.

## Evidence produced
- Live browser snapshot of `https://lotview.ai/` showed the production marketing site, CTA flow, and explicit `yourdealership.lotview.ai` messaging.
- `Invoke-WebRequest` returned `200` for `https://lotview.ai`, `https://www.lotview.ai`, and `https://olympic.lotview.ai`; `https://olympichyundai.lotview.ai` returned `404`.
- Render dashboard browser evidence showed:
  - service `srv-d6etmao8tnhs73eme4lg`
  - repo `ominous-one / Lotview`
  - branch `main`
  - domain `*.lotview.ai`
  - latest live deploy `a04a120` (`Remove dealership default helper fallbacks`) on March 27, 2026 at 8:54 PM
- Browser snapshot of `https://olympichyundai.lotview.ai/` showed the fail-closed JSON response `{"error":"Dealership not found for subdomain: olympichyundai"}`.
- Patched `server/tenant-middleware.ts` to stop dev/preview fallback to dealership 1.
- Patched `client/src/contexts/TenantContext.tsx` so no-subdomain marketing flows stay marketing-only unless an explicit `dealershipId`/`subdomain` query override is present.
- Patched `server/routes.ts` user-management routes so tenant-scoped master users:
  - list users only inside the resolved dealership
  - create users inside the resolved dealership instead of creating null-dealership privileged users
  - update users only inside the resolved dealership instead of bypassing tenant filters
- Patched `server/enhanced-market-analysis.ts` so enhanced pricing/appraisal results now expose:
  - `zeroPriceFiltered`
  - `outlierPriceFiltered`
  - `analysisQuality.confidence`
  - `analysisQuality.notes`
  - confidence derived from sample quality / source diversity / trim match rate, not just raw count
- Patched `server/generate-fb-descriptions.ts` so missing Carfax data no longer becomes the fabricated claim `Clean history available`.
- Validation evidence from this run:
  - `npm run check` → exited 0
  - `npm run build` → exited 0
  - Vite production build completed, then esbuild emitted `dist/index.js` and `dist/index-worker.js`

## Open blockers
- No authenticated live tenant session available in-run to prove RBAC boundaries or authenticated dashboard behavior.
- No DB-backed validation available without valid DB env (`DATABASE_URL` or `PG*`).
- Intended production dealer subdomain mapping remains incomplete/inconsistent; `olympichyundai.lotview.ai` does not resolve to a dealership today.
- Scrape/import durability, onboarding completion, and autopost execution still lack fresh runtime proof against live accounts/data.

## Immediate next action
- Push the latest repo hardening, then verify authenticated role flows and the intended live dealership subdomain mappings against production data.
