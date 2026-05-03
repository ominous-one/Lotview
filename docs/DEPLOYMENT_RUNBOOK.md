# Lotview Deployment and Rollback Runbook

This runbook defines the minimum proof required before and after deploying Lotview.

## Deployment Principle

A deploy is not successful because code was merged. A deploy is successful only when CI passes, the service starts, health/readiness checks pass, logs are clean, and the critical user flow works in staging or production.

## Pre-Deploy Checklist

- [ ] Pull request merged into `main`.
- [ ] CI verification passed.
- [ ] Production build passed.
- [ ] Docker build passed.
- [ ] Database migrations reviewed.
- [ ] Rollback path identified.
- [ ] Required environment variables are configured.
- [ ] `LOTVIEW_ENABLE_SCHEDULERS=false` on web service.
- [ ] `LOTVIEW_ENABLE_SCHEDULERS=true` on worker service.
- [ ] External integrations are in safe mode unless intentionally launching.

## Required Environment Variables

Minimum production web variables:

- `NODE_ENV=production`
- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `PUBLIC_APP_URL`
- `PUBLIC_API_URL`
- `CORS_ORIGIN`
- `LOG_FORMAT=json`
- `LOG_LEVEL=info`

Minimum production worker variables:

- `NODE_ENV=production`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `SESSION_SECRET`
- `ENCRYPTION_KEY`
- `LOTVIEW_ENABLE_SCHEDULERS=true`
- `LOTVIEW_SCHEDULER_PROCESS=worker`
- `LOG_FORMAT=json`
- `LOG_LEVEL=info`

## Deploy Procedure

1. Confirm CI passes on `main`.
2. Confirm Render is building from the latest `main` commit.
3. Deploy web service.
4. Deploy worker service.
5. Check web logs for boot errors.
6. Check worker logs for boot errors.
7. Confirm `/api/health` returns HTTP 200.
8. Confirm `/api/ready` reports database and Redis status.
9. Confirm the worker process is online.
10. Run the staging or production smoke flow.

## GitHub Actions Render Proof

The `Lotview SaaS - CI/CD` workflow includes a `Render Staging Proof` job. It is intentionally disabled until Render staging proof is configured with repository variables, because a placeholder green deploy does not prove the app is live.

Required GitHub repository variables:

- `RENDER_STAGING_ENABLED=true`
- `RENDER_STAGING_BASE_URL=https://<staging-host>`

Optional GitHub environment secret:

- `RENDER_DEPLOY_HOOK_URL`

Configure them with the GitHub CLI:

```bash
gh variable set RENDER_STAGING_ENABLED --body true
gh variable set RENDER_STAGING_BASE_URL --body https://<staging-host>
gh secret set RENDER_DEPLOY_HOOK_URL
```

When enabled, the job triggers the Render deploy hook if configured. If no hook is configured, it relies on Render GitHub auto-deploy and still requires proof by polling:

- `/api/health`
- `/api/ready`
- `/api/version`

The `/api/version` response must report the same commit SHA as the GitHub Actions run. Render exposes `RENDER_GIT_COMMIT` at runtime, and Lotview includes that value in the version endpoint for deploy proof.

If the job is skipped, Render staging is not certified for that commit.

Do not use hard-coded example hosts as proof. The staging base URL must be the actual Render service serving the current commit.

## Post-Deploy Smoke Flow

- Login page loads.
- User can log in.
- Dashboard loads.
- Inventory list loads.
- Vehicle detail page opens.
- Health endpoint passes.
- Ready endpoint passes.
- Worker logs show no crash loop.
- No unhandled errors appear in logs.

## Rollback Triggers

Rollback immediately if any critical condition occurs:

- Web service fails to boot.
- Worker fails to boot.
- Health check fails repeatedly.
- Ready check fails due to database or Redis connection.
- Authentication breaks.
- Tenant isolation issue is observed.
- Inventory data is corrupted.
- Worker creates duplicate posts, messages, syncs, or vehicle writes.
- External integration sends incorrect customer-facing data.

## Rollback Procedure

1. Identify last known good commit.
2. Redeploy last known good commit or use Render rollback if available.
3. Disable schedulers if worker behavior is unsafe.
4. Pause risky external integrations.
5. Check database for partial writes.
6. Run health and ready checks.
7. Run the post-deploy smoke flow.
8. Record incident notes and follow-up fixes.

## Incident Record Template

- Date:
- Commit SHA:
- Environment:
- Service affected:
- Impact:
- Detection method:
- Rollback action:
- Data repair needed:
- Owner:
- Follow-up issue:

## Launch Rule

If rollback cannot be performed safely, the feature is not production-ready.
