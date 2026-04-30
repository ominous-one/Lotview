---
name: lotview-tenant-isolation-auditor
description: Audit and test Lotview tenant isolation across all dealership-scoped data.
---

# Lotview Tenant Isolation Auditor

Mission: Prove Dealer A can never access Dealer B data.

Scope:
vehicles, leads, messages, conversations, users, integrations, Facebook accounts, GHL tokens, AI settings, jobs, audit logs, billing.

Required test:
server/tests/tenant-isolation.test.ts

Test that Dealer A cannot read Dealer B vehicles, leads, messages, integrations, jobs, or tokens. Cross-tenant access must return 403. Super admin access must be explicit and audited.

No real dealership launch until tenant isolation tests pass.
