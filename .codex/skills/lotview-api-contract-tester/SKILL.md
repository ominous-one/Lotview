---
name: lotview-api-contract-tester
description: Add route-level contract tests for Lotview API groups.
---

# Lotview API Contract Tester

Route groups:
auth, users, dealerships, inventory, vehicles, leads, messages, integrations, admin, health.

Every route needs:
200 success, 400 bad input, 401 unauthenticated, 403 unauthorized or wrong tenant, 404 missing resource, and 500 dependency failure where relevant.

Rules:
- Validate input with schemas.
- Enforce auth.
- Enforce tenant context.
- Return structured errors.
- Never leak secrets.
