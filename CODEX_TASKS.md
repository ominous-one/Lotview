# Lotview Codex Task Queue

## Rule

Work top-down. Do not skip ahead while an earlier blocker is red.

## Phase 1 - CI Truth

$lotview-ci-doctor inspect latest failing GitHub Actions run, identify first real blocker, fix smallest safe PR, add tests, and do not hide failures.

## Phase 2 - Feature Truth

$lotview-feature-certifier audit config/feature-registry.json and docs/FEATURE_CERTIFICATION.md. Downgrade, disable, or fail-close any feature that lacks proof.

## Phase 3 - Tenant Isolation

$lotview-tenant-isolation-auditor inspect every dealership-scoped route and storage query. Add tests proving Dealer A cannot access Dealer B data.

## Phase 4 - RBAC

$lotview-rbac-builder implement explicit roles and permissions. Add route guards and tests for unauthorized access.

## Phase 5 - API Contracts

$lotview-api-contract-tester create route-level tests for auth, users, dealerships, inventory, vehicles, leads, messages, integrations, admin, and health.
