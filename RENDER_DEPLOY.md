# Lotview Render Deployment Guide

This guide explains how to connect Lotview to Render without treating connection as certification.

## Prerequisites

- GitHub repository: `ominous-one/Lotview`
- `main` branch protected by required CI checks
- Render account with access to create Blueprint services
- Required provider credentials stored only in Render or GitHub secrets

## Render Blueprint Setup

1. Open `https://dashboard.render.com/blueprints`.
2. Create a new Blueprint instance from `ominous-one/Lotview`.
3. Render reads `render.yaml`.
4. Confirm the web and worker services use the committed `./Dockerfile`.
5. Confirm the web service health check path is `/api/health`.
6. Confirm the worker service command is `node dist/index-worker.js`.

Expected services:

| Service | Type | Purpose |
|---|---|---|
| `lotview-api` | Web | API and static frontend |
| `lotview-worker` | Worker | Queues, schedulers, background jobs |
| `lotview-db` | PostgreSQL | Application database |
| `lotview-redis` | Redis | Sessions, cache, queues |

## Required Render Environment

Minimum web service variables:

```text
NODE_ENV=production
PORT=10000
DATABASE_URL=<from Render database>
REDIS_URL=<from Render redis>
JWT_SECRET=<generated secret>
SESSION_SECRET=<generated secret>
ENCRYPTION_KEY=<generated secret>
PUBLIC_APP_URL=https://<your-app-host>
PUBLIC_API_URL=https://<your-api-host>
CORS_ORIGIN=https://<your-app-host>
LOTVIEW_ENABLE_SCHEDULERS=false
LOTVIEW_SCHEDULER_PROCESS=web
LOG_FORMAT=json
LOG_LEVEL=info
```

Minimum worker service variables:

```text
NODE_ENV=production
DATABASE_URL=<from Render database>
REDIS_URL=<from Render redis>
JWT_SECRET=<same as web>
SESSION_SECRET=<same as web>
ENCRYPTION_KEY=<same as web>
LOTVIEW_ENABLE_SCHEDULERS=true
LOTVIEW_SCHEDULER_PROCESS=worker
LOG_FORMAT=json
LOG_LEVEL=info
```

Keep external integrations disabled, staging-only, or fail-closed until their certification rows have proof.

## GitHub Actions Render Proof

The active Render proof job lives in `.github/workflows/ci.yml` under `Render Staging Proof`.

Configure repository variables:

```bash
gh variable set RENDER_STAGING_ENABLED --body true
gh variable set RENDER_STAGING_BASE_URL --body https://<your-render-staging-service>
```

If Render auto-deploy is not enough for your service, add the deploy hook as a secret:

```bash
gh secret set RENDER_DEPLOY_HOOK_URL
```

The proof job polls the configured staging URL and requires:

- `/api/health` returns success.
- `/api/ready` returns success.
- `/api/version` returns JSON with `commit` equal to the GitHub Actions commit SHA.

If the job is skipped, Render staging is not certified for that commit.

## Manual Verification

Use the actual service URL configured in GitHub Actions:

```bash
BASE_URL=https://<your-render-staging-service>
curl -fsS "$BASE_URL/api/health"
curl -fsS "$BASE_URL/api/ready"
curl -fsS "$BASE_URL/api/version"
```

The version response must match the commit you intend to certify.

## Troubleshooting

### Build failed

- Confirm `package-lock.json` is committed.
- Confirm Render is using `./Dockerfile`.
- Confirm Render build filters include `package-lock.json`.
- Compare the failing Render commit to the latest green GitHub Actions commit.

### Health check failed

- Confirm the web service starts `node dist/index.js`.
- Confirm `/api/health` is registered by the production server.
- Check web logs for boot errors.

### Readiness failed

- Confirm `DATABASE_URL` and `REDIS_URL` are set.
- Confirm the database and Redis services are reachable from the web service.
- Check whether readiness is failing closed because a dependency is unavailable.

### Version proof failed

- Confirm Render is serving the same commit SHA as GitHub Actions.
- Confirm `RENDER_GIT_COMMIT` is available at runtime.
- Redeploy the expected commit or update the certification record to the actual deployed commit.

## Certification Rule

Do not mark Render deployment production-ready until CI, Docker build, Render health/readiness/version proof, logs, rollback path, and staging user-flow proof are recorded.
