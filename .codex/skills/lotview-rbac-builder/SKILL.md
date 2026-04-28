---
name: lotview-rbac-builder
description: Build explicit Lotview roles, permissions, guards, and RBAC tests.
---

# Lotview RBAC Builder

Roles:
super_admin, dealer_owner, dealer_manager, sales_manager, sales_rep, bdc_agent, service_manager, read_only.

Permissions:
inventory.read, inventory.write, leads.read, leads.write, messages.read, messages.write, ai.use, ai.configure, integrations.read, integrations.write, billing.read, billing.write, users.invite, users.manage, admin.audit, admin.impersonate.

Required test:
server/tests/rbac.test.ts

Test that sales reps cannot access billing, read-only users cannot write inventory, dealer managers cannot impersonate users, super admins can access admin routes, and sensitive admin actions are audited.
