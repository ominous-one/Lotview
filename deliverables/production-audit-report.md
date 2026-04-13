# LotView production audit report

## Critical (deployment blockers)

1. **`.env.production.example` is missing env vars that production code actually requires.**
   - Code requires `JWT_SECRET` and `SESSION_SECRET` in production (`server/runtime-readiness.ts:22-25`, `server/auth.ts:9-14`, `server/tenant-middleware.ts:18-23`).
   - The example file defines `SESSION_SECRET` but does **not** define `JWT_SECRET` (`.env.production.example:17`).
   - Render injects `JWT_SECRET` separately (`render.yaml:29-31`, `render.yaml:52-54`), so operators using the example outside Render will boot into readiness failure.

2. **Worker health port is not wired in `render.yaml`, so the worker can bind to the wrong port and fail liveness expectations.**
   - Worker listens on `WORKER_PORT || PORT || 5001` (`server/index-worker.ts:19`).
   - `render.yaml` sets `PORT=5000` only for the web service and sets neither `PORT` nor `WORKER_PORT` for the worker (`render.yaml:13-31`, `render.yaml:33-54`).
   - That means worker health falls back to `5001`, which is implicit and undocumented in deploy config.

3. **There is no migration step in either Render service start/build path, despite the runtime expecting migrations to exist.**
   - Drizzle is configured to emit SQL into `./migrations` (`drizzle.config.ts:7-10`).
   - Both Render services build with `npm ci --include=dev && npm run build` and start directly (`render.yaml:13-15`, `render.yaml:38-40`) with no `drizzle-kit push`, migration runner, or schema apply step.
   - Docker likewise copies `migrations/` (`Dockerfile:48-49`) but never executes them before boot (`Dockerfile:64-66`).
   - This is a deploy blocker because new schema in `shared/schema.ts` can outrun the database state.

4. **`shared/schema.ts` has materially more tables than the migration chain suggests, so schema drift risk is high.**
   - The schema file is extremely large and defines many domains including CRM, call scoring, Facebook inbox, marketplace automation, appointments, notifications, and more (`shared/schema.ts:166-239`, `shared/schema.ts:1937-2059`, `shared/schema.ts:3031-3456`).
   - The migrations directory only contains numbered files up to `0014_vehicle_verification_status.sql` plus `meta` (`migrations/0000_lovely_colonel_america.sql` … `migrations/0014_vehicle_verification_status.sql`).
   - The breadth of schema additions strongly suggests the SQL migration history is not a reliable mirror of current TypeScript schema.

5. **Production dependency audit is red.**
   - `npm audit` reports **31 vulnerabilities**: **8 low, 7 moderate, 13 high, 3 critical**.
   - Critical advisory present in `qs` via `body-parser`; high advisories present in `rollup`, `undici`, and `vite`.
   - This is current evidence from local audit output, not a theoretical warning.

## High (production quality)

6. **The web process does not install `uncaughtException` / `unhandledRejection` handlers, unlike the worker.**
   - Worker has explicit handlers (`server/index-worker.ts:45-53`).
   - Web only installs signal-based graceful shutdown hooks (`server/index-prod.ts:127-131`) and lacks equivalent crash logging for uncaught process-level failures.
   - Result: less diagnosable crashes and no consistent fatal error handling symmetry between web and worker.

7. **CSP still allows `'unsafe-inline'` scripts in production.**
   - Helmet is configured in `server/app.ts:224-245`.
   - `scriptSrc` includes `"'unsafe-inline'"` (`server/app.ts:231`).
   - This materially weakens XSS protection on a multi-tenant SaaS surface.

8. **CSP allows arbitrary `http:` image sources in production.**
   - `imgSrc` includes `http:` and `https:` (`server/app.ts:234`).
   - That permits mixed-content remote images and weakens integrity/privacy guarantees for customer-facing pages.

9. **CORS configuration silently trusts same-origin when `CORS_ORIGIN` is unset, but the production example does not document `CORS_ORIGIN` at all.**
   - `parseConfiguredCorsOrigins()` reads `process.env.CORS_ORIGIN` (`server/app.ts:115-119`).
   - In production, if unset, origin validation falls back to same-origin host matching (`server/app.ts:132-139`).
   - `.env.production.example` does not include `CORS_ORIGIN` (`.env.production.example:1-84`).
   - This is survivable for single-origin setups, but it becomes a hidden deploy trap for admin apps, staging domains, or extension/browser clients.

10. **HMAC protection for extension requests is intentionally bypassed whenever a Bearer JWT is present.**
   - `extensionHmacMiddleware` short-circuits when `Authorization: Bearer ...` exists (`server/auth.ts:199-206`).
   - That removes request-signature validation on the exact path where the code comments claim HMAC prevents tampering.
   - If JWT theft occurs, request integrity and replay resistance from HMAC are gone.

11. **Authentication is purely JWT-based but session packages are still shipped.**
   - Auth middleware validates Bearer JWTs (`server/auth.ts:84-145`).
   - Yet `package.json` still ships `express-session`, `connect-pg-simple`, `passport`, and `passport-local` (`package.json:72`, `package.json:81`, `package.json:95-96`).
   - Search of `server/` found no real application usage of those packages beyond unrelated PBS/Facebook “session” terminology. This is production bloat and attack surface with no evidence of live value.

12. **Database bootstrap still carries Replit-era assumptions.**
   - `server/db.ts` literally says `Use Replit's built-in database environment variables` (`server/db.ts:13`).
   - It still supports `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE` fallback (`server/db.ts:14-19`) even though runtime readiness expects a `DATABASE_URL` deployment (`server/runtime-readiness.ts:22`, `server/runtime-readiness.ts:104-109`).
   - This split configuration model increases drift and deploy ambiguity.

13. **`package.json` still carries Replit-only Vite plugins that should not ship in a production SaaS repo.**
   - `@replit/vite-plugin-cartographer` (`package.json:120`)
   - `@replit/vite-plugin-dev-banner` (`package.json:121`)
   - `@replit/vite-plugin-runtime-error-modal` (`package.json:122`)
   - Even as devDependencies, they are legacy platform coupling and noise for a Render/Docker production stack.

14. **The production image installs production-only deps with `npm ci --omit=dev`, but Render builds with `NPM_CONFIG_PRODUCTION=false` and `npm ci --include=dev`; the repo is carrying two different production install models.**
   - Render web/worker both set `NPM_CONFIG_PRODUCTION=false` (`render.yaml:24-25`, `render.yaml:47-48`).
   - Docker production stage uses `npm ci --omit=dev` (`Dockerfile:44`).
   - This split increases “works in one deploy target, fails in another” risk, especially for build/runtime dependency classification mistakes.

15. **Readiness is stricter than health, but deployment docs/config do not make the operational difference explicit.**
   - App exposes `/health` and `/ready` separately (`server/routes.ts:274-288`).
   - Docker and Render health checks both target `/ready` (`Dockerfile:64-65`, `render.yaml:16`).
   - The repo still contains mixed references to both endpoints, and there is no migration step to satisfy readiness. Operationally, this is a common source of boot loops.

## Medium (hardening)

16. **JWT dev fallback secret is hardcoded in two files.**
   - `server/auth.ts:14`
   - `server/tenant-middleware.ts:23`
   - Production guards exist, but duplicate fallback secrets increase accidental non-prod exposure and signal config looseness.

17. **JWT lifetime is short for normal auth but there is no evidence of refresh-token rotation or revocation store.**
   - Access token expiry is fixed at `1h` (`server/auth.ts:15`, `server/auth.ts:54`).
   - The code refreshes user state from DB on each request (`server/auth.ts:124-141`), which is good, but there is no server-side token revocation list or rotation path in the inspected auth module.

18. **The tenant middleware still contains hosting-provider-specific heuristics for Replit, Render, and Railway.**
   - Replit detection: `server/tenant-middleware.ts:63-76`
   - Render detection: `server/tenant-middleware.ts:82-85`
   - Railway detection: `server/tenant-middleware.ts:87-90`
   - This is survivable, but it is brittle infrastructure logic embedded in request-path tenancy resolution.

19. **Tenant context can remain undefined for authenticated super_admin/master flows, pushing safety burden downstream.**
   - Header-based dealership override is only honored for privileged users (`server/tenant-middleware.ts:281-288`).
   - When no dealership is resolved, super_admin/master are still allowed through with `source = 'none'` (`server/tenant-middleware.ts:301-321`).
   - That is intentional, but it means every downstream route must correctly enforce dealership scoping or explicit selection.

20. **`tenantMiddleware` returns verbose hostname/subdomain failure details to clients on lookup errors.**
   - Hostname resolution error response includes `hostname` and `details` (`server/tenant-middleware.ts:243-248`).
   - Subdomain resolution error response includes `subdomain` and `details` (`server/tenant-middleware.ts:264-268`).
   - Helpful for debugging, but noisy for production information disclosure.

21. **The global API rate limit is coarse and IP-based only.**
   - `globalLimiter` allows 1000 requests per 15 minutes (`server/app.ts:278-289`).
   - `authLimiter` is stricter (`server/app.ts:292-299`), but multi-tenant/customer-facing APIs with automation flows usually need route- and actor-aware quotas, not only IP ceilings.

22. **The example environment file documents `SCHEDULER_ENABLED`, but runtime code actually uses `LOTVIEW_ENABLE_SCHEDULERS` and `LOTVIEW_SCHEDULER_PROCESS`.**
   - Example file: `SCHEDULER_ENABLED=true` (`.env.production.example:78`).
   - Actual runtime flags: `server/index-prod.ts:43-44`, `server/index-worker.ts:93-97`, `server/runtime-readiness.ts:58-85`.
   - This is a concrete env drift bug, not just naming preference.

23. **The example environment file omits env vars that code actively reads, and includes env naming that code no longer prioritizes.**
   - Missing from example but used in code: `CORS_ORIGIN` (`server/app.ts:116`), `WORKER_PORT` (`server/index-worker.ts:19`), `LOTVIEW_ENABLE_SCHEDULERS` / `LOTVIEW_SCHEDULER_PROCESS` (`server/index-prod.ts:43-44`, `server/index-worker.ts:93-97`).
   - Code also still accepts `OPENAI_API_KEY` fallback (`server/openai.ts:39-43`, `server/routes.ts:14768-14769`) while the example only advertises `AI_INTEGRATIONS_OPENAI_API_KEY` (`.env.production.example:22`).

## Low (nice-to-have)

24. **The server folder contains standalone test/utility scripts that are not part of either production entrypoint graph.**
   Evidence of direct-run/orphan script style:
   - `server/analyze-vdp.ts:1-80` ends by calling `analyzeVDP().catch(console.error)`.
   - `server/check-carfax-text.ts:1-27` ends by calling `checkCarfax().catch(console.error)`.
   - `server/generate-fb-descriptions.ts:1-80` is a batch utility script, not a route/worker entry module.
   - `server/run-manual-scrape.ts:1-31` calls `main()` directly for manual scraping.
   - `server/seed-super-admin.ts:1-60` is an operator seed script with explicit CLI usage.
   - `server/test-ai-sales-agent.ts:1-60` is a direct-run test harness.
   - Local code search found no imports of `analyze-vdp`, `check-carfax-text`, `generate-fb-descriptions`, or `run-manual-scrape` from `server/index-prod.ts` / `server/index-worker.ts` import graph.

25. **`server/tests/` ships inside the `server/` tree and contributes to the 116-file footprint, but none of it should be considered runtime code.**
   - Examples: `server/tests/runtime-readiness.test.ts`, `server/tests/openai-provider-selection.test.ts`, `server/tests/ws4e_email_outbox_worker.test.ts`.
   - Keeping tests under `server/` is fine, but it inflates operational code scans and makes dead-code audits noisier.

26. **The repo still contains manual/operator scripts that should probably move under `scripts/` or `tools/` instead of `server/`.**
   - `server/seed-super-admin.ts:1-60`
   - `server/run-manual-scrape.ts:1-31`
   - `server/test-ai-sales-agent.ts:1-60`
   - This is mostly a maintainability issue, but it obscures what actually ships as application runtime.

## Architecture notes

- **Entrypoints are cleanly split now:** web boot lives in `server/index-prod.ts`, worker boot lives in `server/index-worker.ts`.
- **Health model is actually decent:** `/health` is lightweight and `/ready` checks runtime posture plus a live DB query (`server/routes.ts:274-314`).
- **Security posture is improved vs typical internal apps:** Helmet, request IDs, auth rate limiting, JWT issuer/audience, fresh-user lookup, and a final global error handler are all present (`server/app.ts:224-245`, `server/app.ts:292-299`, `server/auth.ts:18-19`, `server/auth.ts:124-141`, `server/app.ts:387-425`).
- **Main production risk is operational drift, not lack of features.** The deployment config, env example, migration story, and leftover platform/tooling baggage are less mature than the application surface itself.
- **Dead-code surface is real in `server/`.** Production entrypoints import only a subset of the 116 files; the rest includes tests, one-off scripts, seeders, and investigation utilities. That should be pruned or relocated before calling the repo production-ready.
