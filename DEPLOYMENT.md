# LotView Deployment Guide

## Production Truth

LotView production should deploy from `GitHub -> Render Blueprint`, with [`render.yaml`](render.yaml) as the single deployment source of truth.

The current production shape is:

- `lotview` web service on Render
- `lotview-worker` background worker on Render
- `lotview-db` Postgres on Render

This repo is configured for:

- paid always-on Render services
- deploys from `main`
- auto-deploy only after GitHub checks pass
- Node 20 runtime pinning
- separate web and worker processes
- `/ready` as the deploy health gate

The GitHub workflow at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds artifacts. It is not the canonical Render production deploy path.

## 1. Local Development

### Prerequisites

- Node.js 20
- PostgreSQL 16+
- npm

### Setup

```bash
git clone <repo-url> && cd lotview
npm ci
cp .env.example .env
# edit .env with PostgreSQL credentials and API keys
npm run db:push
npm run dev
```

### Chrome Extension

```bash
cd chrome-extension
npm ci
npm run build
npm test
```

Load `chrome-extension/dist/` as an unpacked extension in Chrome.

## 2. Health and Readiness

- `GET /health`: process liveness
- `GET /ready`: deployment readiness and dependency truth
- `GET /api/health`: alias for `/health`

On Render, treat `/ready` as the authoritative signal. A green build is not enough if the app is missing secrets, database access, or the built SPA bundle.

## 3. Production on Render

### Canonical Path

1. Push the reviewed production commit to GitHub `main`.
2. Connect the repo to Render as a Blueprint using [`render.yaml`](render.yaml).
3. Keep Render auto-deploy set to `After CI Checks Pass`.
4. Keep the paid instance types from [`render.yaml`](render.yaml):
   - web: `standard`
   - worker: `standard`
   - database: `basic-1gb`
5. Set required secrets in Render.
6. Confirm `/ready` is green after deploy.

### Why This Is the Production Path

- Render free services are not acceptable for an always-active SaaS. They spin down.
- The web and worker are separate services and should stay that way.
- `main` is the release branch. Protect it in GitHub and require CI before merge.
- The worker is the only scheduler-enabled process.

### Required Render Secrets

Render generates some secrets automatically from [`render.yaml`](render.yaml), but production still needs any feature-specific secrets you use, such as:

- `AI_INTEGRATIONS_OPENAI_API_KEY`
- `RESEND_API_KEY`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- any scraping provider credentials you rely on

### Schema Changes

LotView currently uses Drizzle push-based schema management:

```bash
npm run db:push
```

For Render production, run schema changes deliberately. Do not put `drizzle-kit push` back into the normal `buildCommand`.

Safe operator path:

1. Merge the schema-changing commit to `main`.
2. Open a Render shell on `lotview`, or run a one-off command in the same environment.
3. Run `npm run db:push`.
4. Let Render deploy the new web and worker build from GitHub.
5. Confirm `/ready` is green.

This is intentionally manual because automatic schema mutation during normal service deploys is too risky when web and worker deploy independently.

## 4. Docker Alternative

Docker remains useful for local staging or non-Render environments.

### Quick Start

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec app npx drizzle-kit push
docker compose logs -f app
```

### Services

| Service | Port | Description |
| --- | --- | --- |
| `app` | 5000 | Express API + built SPA |
| `db` | 5432 | PostgreSQL 16 |
| `redis` | 6379 | optional future caching |

## 5. Environment Variables

See `.env.example` for the full list. The critical production variables are:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | session signing secret |
| `JWT_SECRET` | Yes | JWT signing secret |
| `EXTENSION_HMAC_SECRET` | Yes | extension auth signing |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Feature-dependent | OpenAI integration |
| `RESEND_API_KEY` | Feature-dependent | email delivery |

Pin Node to version `20` in production. [`render.yaml`](render.yaml) now does this explicitly.

## 6. Database Review

Before running `db:push` in production:

```bash
npx drizzle-kit generate
# review the generated SQL
npx drizzle-kit push
```

Drizzle push is operationally acceptable for the first launch wave only if it remains a deliberate operator action.

## 7. Monitoring

Production logs should remain structured JSON for ingestion by your log system.

Recommended monitoring:

- uptime checks on `/health`
- readiness checks on `/ready`
- error aggregation with `SENTRY_DSN`
- proof artifacts for scrape, post, and AI decisions

## 8. Chrome Extension

See [`chrome-extension/PUBLISHING.md`](chrome-extension/PUBLISHING.md) for Chrome Web Store publishing.

The GitHub artifact workflow builds the extension zip on pushes to `main`. Download it from GitHub Actions artifacts.

## 9. Backup and Recovery

### Database

```bash
pg_dump "$DATABASE_URL" > backup-$(date +%Y%m%d).sql
```

### Restore

```bash
psql "$DATABASE_URL" < backup-20260402.sql
```

## 10. Troubleshooting

| Issue | Action |
| --- | --- |
| App passes build but fails after deploy | Check `/ready`, not just build logs |
| Render app cannot reach Postgres | Verify `DATABASE_URL` wiring from `lotview-db` |
| Worker duplicates jobs | Ensure only `lotview-worker` has `LOTVIEW_ENABLE_SCHEDULERS=true` |
| Puppeteer scraping crashes | Check worker memory headroom and Chromium runtime requirements |
| Schema mismatch after deploy | Run `npm run db:push` deliberately, then redeploy |
