# Lotview Production Readiness Checklist

This checklist is the production gate. Do not mark a feature complete until it has CI proof, staging proof, logs, tests, and a real user flow.

## Build and CI

- [ ] Fresh checkout installs dependencies.
- [ ] Lockfile exists and is committed, or every workflow consistently uses npm install.
- [ ] Lint passes.
- [ ] Typecheck passes.
- [ ] Server tests pass.
- [ ] Smoke tests pass.
- [ ] Production build passes.
- [ ] Docker build passes.
- [ ] No workflow hides failures with shell fallbacks.
- [ ] No workflow references missing files.
- [ ] Branch protection requires verification checks.

## Frontend

- [ ] Vite entrypoint exists.
- [ ] App boots locally.
- [ ] App builds to dist/public.
- [ ] Login page renders.
- [ ] Dashboard page renders.
- [ ] Error boundary exists.
- [ ] Loading states exist.
- [ ] Empty states exist.
- [ ] Smoke test covers app shell.

## Backend

- [ ] Health endpoint works.
- [ ] Ready endpoint checks database and Redis.
- [ ] Version endpoint returns version and build info.
- [ ] Auth routes are tested.
- [ ] Vehicle routes are tested.
- [ ] Admin routes are tested.
- [ ] Webhook routes are tested.
- [ ] Critical routes validate input.
- [ ] Critical routes enforce auth.
- [ ] Dealership-scoped routes enforce tenant isolation.

## Database

- [ ] Migrations run from an empty database.
- [ ] Production deploy uses migrations, not schema push.
- [ ] Backup script is tested.
- [ ] Restore is tested.
- [ ] Destructive migrations have rollback plans.
- [ ] Seed scripts are separated for dev, test, and production.

## Workers and Queues

- [ ] Worker boots separately from web.
- [ ] Web service does not run schedulers.
- [ ] Worker runs schedulers.
- [ ] Jobs are idempotent.
- [ ] Jobs retry safely.
- [ ] Failed jobs are visible.
- [ ] Dead-letter handling exists.
- [ ] Duplicate post, message, and sync protection exists.

## Inventory and Scraping

- [ ] Scraper handles failed source.
- [ ] Scraper handles bad HTML.
- [ ] Scraper validates VIN.
- [ ] Scraper validates price.
- [ ] Scraper validates mileage.
- [ ] Duplicate vehicles are handled.
- [ ] Sold vehicles are handled.
- [ ] Source truth history is stored.
- [ ] Manually verified data is protected.

## AI

- [ ] AI only answers from inventory truth.
- [ ] AI does not invent pricing.
- [ ] AI does not promise financing approval.
- [ ] AI escalates sensitive requests.
- [ ] Prompt injection tests pass.
- [ ] AI responses are logged.
- [ ] AI cost is tracked per dealer.

## GHL and CRM

- [ ] OAuth connection works.
- [ ] Token refresh works.
- [ ] Expired token is handled.
- [ ] Duplicate contacts are prevented.
- [ ] Sync logs exist.
- [ ] Failed sync retry exists.
- [ ] Admin can reconnect integration.

## Facebook and Marketplace

- [ ] Token connection works.
- [ ] Token expiry is handled.
- [ ] Draft posting works.
- [ ] Duplicate post protection exists.
- [ ] Image validation exists.
- [ ] Failed post is visible in admin.
- [ ] Human approval mode exists.

## Security

- [ ] Secrets are required in production.
- [ ] Tokens are encrypted at rest.
- [ ] Passwords are hashed.
- [ ] Rate limits exist.
- [ ] Webhooks are verified.
- [ ] Audit logs exist.
- [ ] Admin impersonation is logged.
- [ ] Dependency audit is clean or exceptions are documented.

## Observability

- [ ] Structured logs exist.
- [ ] Error tracking exists.
- [ ] Uptime monitoring exists.
- [ ] Queue metrics exist.
- [ ] Scraper success and failure metrics exist.
- [ ] AI cost metrics exist.
- [ ] Integration failure alerts exist.
- [ ] Deploy failure alerts exist.

## Staging

- [ ] Staging environment exists.
- [ ] Staging database exists.
- [ ] Staging Redis exists.
- [ ] Staging secrets are configured.
- [ ] Staging test dealer exists.
- [ ] Full user flow is verified.
- [ ] Staging deploy is stable for seven days.

## Production

- [ ] Production deploy is green.
- [ ] Health check passes.
- [ ] Ready check passes.
- [ ] Worker is online.
- [ ] Backups are enabled.
- [ ] Monitoring is enabled.
- [ ] Rollback is documented.
- [ ] Pilot dealer is approved.
