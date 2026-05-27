# LotView — Production-Readiness Completion Runbook

This is the executable path from the current state (internally certified) to
**live production-ready**. Everything below is gated on credentials/infrastructure
that must be supplied by an operator — each item lists exactly what to provide and
how to verify it. Status of every feature lives in `config/feature-registry.json`;
proof detail in `docs/FEATURE_CERTIFICATION.md`.

## Done (no action needed) — internally certified, gate-verified

- Multi-tenant **isolation**: all 293 tenant-scoped storage methods (194 reads + 99
  writes) provably scoped; CI guard (`server/tests/storage-tenant-write-scoping.test.ts`).
- **Auth, RBAC, super-admin boundary, password reset** — runtime certified.
- **API guards** (auth/permission/role/tenant) certified for `/api/vehicles`,
  `/api/facebook`, `/api/admin`, auth.
- **Data layers** certified (isolation + CRUD): inventory, CRM, filter groups, scrape
  sources, GHL accounts, follow-up sequences, re-engagement campaigns.
- 7 real correctness bugs fixed. **542 unit + 88 integration tests green; gates 503.**

## Remaining to production — do in this order

### 1. Provision the database + run migrations (BLOCKER for everything)
- Provide: a managed Postgres (Neon) → set `DATABASE_URL` in the deploy env.
- Verify: `npm run db:migrate` (or apply schema), then `npm run db:seed` for a tenant.

### 2. Deploy to Render (staging first)
- Provide: a Render account; set service env from `.env.template`; connect the repo.
- Verify: the CI **Render Staging Proof** job goes green (see `.github/workflows`);
  the live `/api/health` + `/api/ready` endpoints return healthy. This certifies
  `render.staging_deploy`.

### 3. Wire live third-party integrations (each independently certifiable)
For each, set the env vars, flip its feature flag on, run a live smoke test against a
staging tenant, confirm observability/logs, then mark the registry entry's
`staging`/`realUserFlow` proof true.

| Feature (registry id) | Env vars to set | Verify (staging) |
|---|---|---|
| GHL CRM sync (`ghl.crm_sync`) | `GHL_CLIENT_ID`, `GHL_CLIENT_SECRET`, `GHL_API_KEY`, `GHL_WEBHOOK_SECRET` | OAuth-connect a real GHL sub-account; push a test contact; confirm it lands in GHL + webhook round-trips |
| Facebook Marketplace (`facebook.marketplace`) | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Connect a real FB account in **draft mode**; queue + post one listing behind manual approval |
| Scrapers (`scraper.robust`) | `BROWSERLESS_API_KEY`/`BROWSERLESS_TOKEN`, optional `APIFY_TOKEN`, `ZENROWS_*` | Run one real dealership scrape; confirm source-truth reconciliation + dedup against live inventory |
| AI lead response (`ai.lead_response`) | `ANTHROPIC_API_KEY` (and/or `OPENAI_API_KEY`, Gemini) | Trigger an AI reply on a seeded lead; confirm grounded output + cost tracking |
| Email/SMS notifications | (provider keys per `.env.template`) | Send one test email/SMS; confirm delivery + logging |

### 4. Real-user-flow + rollback proof (per feature)
- Provide: a staging tenant with realistic data.
- Verify: walk each flow end-to-end as a real user; document a rollback path
  (feature-flag off / revert). Then set `realUserFlow` + `rollback` true in the
  registry. `npm run production:gates` enforces honesty of these flags.

### 5. Final gate before "production-ready today"
- `npm run ci:verify` green (gates + typecheck + tests + frontend).
- Every exposed production feature in `config/feature-registry.json` has all six proof
  flags true (ci, tests, staging, observability, realUserFlow, rollback).

## Throughput note
To let an autonomous agent execute steps 3–4 continuously (instead of one unit per
session under the Claude Pro usage cap), provide an `ANTHROPIC_API_KEY` for the build
agent — separate from the app's runtime AI key.
