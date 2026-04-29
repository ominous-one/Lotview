# Lotview Feature Certification

No feature counts as working because the code exists.

A feature only counts as working when CI, staging, logs, tests, and a real user flow prove it.

## Certification Levels

| Status | Meaning |
|---|---|
| Not Started | Code may or may not exist. No proof. |
| Code Exists | Feature has code but no verified proof. Not production-ready. |
| CI Verified | Lint, typecheck, build, and tests pass in CI. |
| Staging Verified | Feature works in staging with realistic dealer data. |
| Observable | Logs, errors, metrics, and recovery path exist. |
| User-Flow Verified | A real user can complete the workflow end-to-end. |
| Production Ready | All proof is complete. |

## Required Proof

Every production feature must have CI proof, automated tests, staging proof, logs or monitoring, real user-flow proof, failure or recovery behavior, an owner, and a last verified date.

## Feature Certification Matrix

| Feature | Status | CI Proof | Tests | Staging Proof | Logs/Monitoring | Real User Flow | Owner | Notes |
|---|---|---|---|---|---|---|---|---|
| Login/Auth | Code Exists | No | Partial | No | Partial | No | TBD | Verify sessions, JWT, failed login, password reset. |
| RBAC | Code Exists | Partial | Partial | No | No | No | engineering | Explicit SaaS permission matrix, permission guard tests, user management route contracts, modular vehicle inventory-write route contracts, full inventory view read guard, financing/fee settings billing read/write route contracts, CRM lead/message route contracts, appointment/follow-up lead route contracts, FB inbox message/AI-control route contracts, legacy conversation message read/write route contracts, scheduled-message route contracts, and messenger management/AI-control route contracts exist. Full route migration, sensitive action audit proof, staging proof, and user-flow proof remain required. |
| Tenant Isolation | Code Exists | Partial | Partial | No | No | No | engineering | Tenant context boundary tests cover header spoofing, legacy tokens, explicit super-admin tenant selection, owner guard behavior, vehicle route tenant-context fail-closed behavior, financing/fee settings dealership context, AI runtime/settings dealership context, CRM lead/message route dealership context, appointment/follow-up route dealership context, FB inbox route dealership context, and legacy conversation/scheduled-message/messenger-management route dealership context. Full route/storage cross-tenant tests remain required. |
| Health Endpoint | Code Exists | No | Partial | No | Partial | Partial | TBD | Verify health, ready, and version endpoints. |
| Frontend Boot | Not Verified | No | No | No | No | No | TBD | Vite entrypoint must be proven. |
| Vehicle Inventory CRUD | Code Exists | No | Partial | No | Partial | No | TBD | Test create, update, delete, and search. |
| VIN Decode | Code Exists | Partial | Partial | No | Partial | No | engineering | VIN format and check-digit validation now have automated tests. Provider decode, batch/cache/rate-limit, and reconciliation proof remain required. |
| Scraper | Code Exists | Partial | Partial | No | Partial | No | engineering | Olympic Hyundai extraction no longer fabricates missing year/make/model in tested fixtures. Prove pagination, quarantine, live source-truth reconciliation, and staging flow before launch. |
| Source Truth Reconciliation | Code Exists | No | Partial | No | Partial | No | TBD | Protect manually verified data. |
| Worker/Schedulers | Code Exists | No | No | No | Partial | No | TBD | Prove no duplicate jobs. |
| Facebook Posting | Code Exists | Partial | Partial | No | No | No | engineering | Modular and legacy Facebook Pages routes now require integrations read/write RBAC and tenant-scoped page updates; account/template/queue/post surfaces require dealership context. Marketplace posting still must run in draft/review mode first. |
| GHL Sync | Code Exists | Partial | Partial | No | No | No | engineering | GHL/API-key integration routes require integrations read/write RBAC and dealership context; GHL mutation routes are restricted to master users until write flows are certified. Still prove OAuth, token refresh, webhook verification, sync logs, duplicate-contact prevention, staging, observability, rollback, and real user flow. |
| AI Lead Response | Code Exists | Partial | Partial | No | No | No | engineering | AI prompt management routes require explicit ai.configure RBAC and dealership context where dealership-scoped. AI runtime generation routes require explicit ai.use RBAC, AI settings and FB inbox auto-send controls require ai.configure RBAC, and public chat fails closed without dealership context. Must still pass guardrail, inventory-grounding, prompt-injection, escalation, human approval, observability, staging, and real user-flow proof. |
| Admin Dashboard | Code Exists | No | No | No | Partial | No | TBD | Test permissions and audit logs. |
| Billing/Plans | Not Started | No | No | No | No | No | TBD | Needed before self-serve SaaS. |
| Render Deploy | Not Verified | No | No | No | No | No | TBD | Workflow needs proof. |

## Launch Rule

No real dealership users until all critical features are CI verified, staging verified, observable, and user-flow verified.
