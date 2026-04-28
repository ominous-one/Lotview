# Lotview Agent Instructions

## Core Rule

No feature counts as working because code exists.

A feature only counts as working when it has CI proof, automated tests, staging proof, observability proof, real user-flow proof, and rollback proof.

If a feature lacks proof, it must be disabled, staging-only, or fail-closed.

## Required Workflow

Before changing code:

1. Inspect current branch.
2. Pull latest main.
3. Check GitHub Actions.
4. Identify the first real blocker.
5. Fix the smallest safe unit of work.
6. Add or update tests.
7. Update config/feature-registry.json if feature status or exposure changes.
8. Update docs/FEATURE_CERTIFICATION.md if proof changes.
9. Run relevant checks.
10. Open a PR.

## Required Checks

Run these whenever relevant:

npm run production:gates
npm run lint
npm run check
npm run test:frontend
npm run test:server
npm run test:smoke
npm run build

If package-lock.json exists, use npm ci --ignore-scripts.
If no package-lock.json exists, use npm install --ignore-scripts.

## Never Do This

- Do not use shell fallbacks that hide failure.
- Do not delete tests to pass CI.
- Do not mark a feature production-ready without proof.
- Do not expose fail-closed features in production.
- Do not log secrets.
- Do not use raw tokens pasted into chat.
- Do not merge speculative changes without tests.

## Highest Priority Areas

1. CI green
2. Deterministic dependencies
3. Tenant isolation
4. RBAC
5. API route contracts
6. Inventory and source truth
7. Worker idempotency
8. AI guardrails
9. GHL sync
10. Facebook draft mode
11. Render deploy proof
12. Observability
