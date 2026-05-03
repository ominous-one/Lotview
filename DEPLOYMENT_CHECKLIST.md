# Lotview Deployment Checklist

This checklist records deployment proof. It does not certify production readiness by itself.

## Certification Boundary

- GitHub CI must pass on `main`.
- Docker build must pass in GitHub Actions.
- Render staging is not certified until the `Render Staging Proof` job runs green against the configured staging URL.
- A service is not live proof because Render is connected to GitHub.
- A feature is not production-ready because its route, worker, or UI exists.

## Required Pre-Deploy Proof

- [ ] Pull request merged into `main`.
- [ ] `Production Gates` workflow passed.
- [ ] `Lotview SaaS Verification` workflow passed.
- [ ] `Frontend Verification` workflow passed.
- [ ] `Lotview SaaS - CI/CD` workflow passed.
- [ ] CI `Docker Build` job passed for the same commit.
- [ ] Render is building from the same `main` commit.
- [ ] Render web service has required environment variables.
- [ ] Render worker service has required environment variables.
- [ ] Web service has `LOTVIEW_ENABLE_SCHEDULERS=false`.
- [ ] Worker service has `LOTVIEW_ENABLE_SCHEDULERS=true`.
- [ ] External integrations remain disabled, staging-only, or fail-closed unless certified.
- [ ] Rollback target commit is identified.

## Render Blueprint

`render.yaml` defines the intended Render stack:

| Service | Type | Purpose |
|---|---|---|
| `lotview-api` | Web | Express API and static frontend |
| `lotview-worker` | Worker | Background jobs and schedulers |
| `lotview-db` | PostgreSQL | Main database |
| `lotview-redis` | Redis | Cache, sessions, queues |

The committed Docker build path is `./Dockerfile`.

## GitHub Actions Render Proof

Set these repository variables before expecting Render staging proof:

```bash
gh variable set RENDER_STAGING_ENABLED --body true
gh variable set RENDER_STAGING_BASE_URL --body https://<your-render-staging-service>
```

If using a deploy hook, set it as a secret:

```bash
gh secret set RENDER_DEPLOY_HOOK_URL
```

The `Render Staging Proof` job must verify:

- `/api/health`
- `/api/ready`
- `/api/version`

The `/api/version` response must report the same commit SHA as the GitHub Actions run.

## Manual Smoke Verification

Use the actual Render staging or production URL:

```bash
BASE_URL=https://<your-render-service>
curl -fsS "$BASE_URL/api/health"
curl -fsS "$BASE_URL/api/ready"
curl -fsS "$BASE_URL/api/version"
```

Then verify the app flow:

- [ ] Login page loads.
- [ ] User can log in.
- [ ] Dashboard loads for the correct dealership.
- [ ] Inventory list loads from authenticated API data.
- [ ] Vehicle detail opens from real inventory data.
- [ ] User can log out.
- [ ] Web logs show no boot errors.
- [ ] Worker logs show no crash loop.
- [ ] Failed integrations remain visible or fail-closed.

## Do Not Count As Proof

- A hard-coded example URL.
- A skipped Render staging proof job.
- A Render service connected to GitHub but serving a different commit.
- A successful Docker build without a live health/readiness check.
- A scraper route that exists but lacks source-truth certification.
- A frontend shell without staging user-flow proof.

## Launch Rule

If any required proof is missing, keep the affected feature disabled, staging-only, or fail-closed.
