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
| RBAC | Code Exists | Partial | Partial | No | No | No | engineering | Explicit SaaS permission matrix, permission/capability guard tests, tenant and super-admin user management plus dealership/settings route contracts, modular and legacy vehicle inventory-write route contracts, modular and legacy vehicle AI/scrape/Carfax/action route contracts, full inventory view read guard, dealership website-url and branding tenant route contracts, financing/fee settings billing read/write route contracts, GHL/API-key/webhook-secret integration route contracts, scrape-source and manual scraper diagnostic integrations read/write route contracts, email integration write and notification message-write route contracts, call scoring, call analysis, and call participant read/write route contracts, CRM lead/message route contracts, appointment/follow-up lead route contracts, automation runtime and sequence-definition lead/message route contracts, automation Facebook lead trigger auth contracts, modular and legacy Facebook posting message read/write route contracts, FB inbox message/AI-control route contracts, legacy conversation message read/write route contracts, scheduled-message route contracts, messenger management/AI-control route contracts, Marketplace Blast account/template/queue/AI-generation/photo route contracts, manager autopost queue read/write route contracts, manager notification email/outbox route contracts, external integration token route contracts, modular admin route contracts, super-admin scrape provider route contracts, super-admin impersonation, restart, ops dashboard, onboarding, and launch checklist route contracts, super-admin secret/API-key route contracts, super-admin Facebook Catalog and Facebook Marketplace route contracts, super-admin route guard regression coverage, super-admin filter group route contracts, and super-admin vehicle image upload route contracts exist. Full route migration, sensitive action audit proof, staging proof, and user-flow proof remain required. |
| Tenant Isolation | Code Exists | Partial | Partial | No | No | No | engineering | Tenant context boundary tests cover header spoofing, legacy tokens, explicit super-admin tenant selection, owner guard behavior, vehicle route tenant-context fail-closed behavior, legacy vehicle mutation dealership context, dealership website-url and branding context, financing/fee settings dealership context, scrape-source and manual scraper sync dealership context, email integration and notification dealership context, call scoring template/sheet/response dealership context, call analysis dealership context, call participant parent-record dealership context, AI runtime/settings dealership context, CRM lead/message route dealership context, appointment/follow-up route dealership context, automation runtime and sequence-definition route dealership context, automation Facebook lead trigger authenticated dealership context, FB inbox route dealership context, Marketplace Blast dealership context, manager autopost queue dealership context, manager notification email target-user dealership context, external integration token explicit dealership selection, super-admin vehicle image upload dealership-scoped selection/update, and legacy conversation/scheduled-message/messenger-management route dealership context. Full route/storage cross-tenant tests remain required. |
| Health Endpoint | Code Exists | No | Partial | No | Partial | Partial | TBD | Verify health, ready, and version endpoints. |
| Frontend Boot | Not Verified | No | No | No | No | No | TBD | Vite entrypoint must be proven. |
| Vehicle Inventory CRUD | Code Exists | No | Partial | No | Partial | No | engineering | Modular vehicle tenant/read-write route contracts, legacy vehicle mutation inventory-write route contracts, super-admin filter group inventory read/write route contracts, and super-admin vehicle image upload inventory-write/tenant update contracts exist. Still needs complete CRUD behavior tests, duplicate VIN/stock tests, UI flow proof, staging proof, and source-truth overwrite protection. |
| VIN Decode | Code Exists | Partial | Partial | No | Partial | No | engineering | VIN format and check-digit validation now have automated tests. Provider decode, batch/cache/rate-limit, and reconciliation proof remain required. |
| Scraper | Code Exists | Partial | Partial | No | Partial | No | engineering | Olympic Hyundai extraction no longer fabricates missing year/make/model in tested fixtures. Manual scraper sync/test badge routes require auth, explicit integration permissions, and dealership context; manual sync uses the resolved dealership instead of a body-selected dealership id. Super-admin Browserless, ZenRows, Zyte, Apify, and robust scrape provider status/test/trigger routes require explicit integration permissions. Prove pagination, quarantine, live source-truth reconciliation, and staging flow before launch. |
| Source Truth Reconciliation | Code Exists | No | Partial | No | Partial | No | TBD | Protect manually verified data. |
| Worker/Schedulers | Code Exists | No | No | No | Partial | No | TBD | Prove no duplicate jobs. |
| Facebook Posting | Code Exists | Partial | Partial | No | No | No | engineering | Modular and legacy Facebook Pages routes now require integrations read/write RBAC, including priority vehicle reads/writes, and tenant-scoped page updates; modular and legacy Facebook posting account/template/queue/schedule/OAuth/manual-post/config routes require messages read/write permissions and dealership context before storage; account/template/queue/AI-generation/manual-post/photo, manager autopost queue, super-admin Facebook Catalog config/test/sync, and super-admin Marketplace settings/account/queue/listing/activity/process surfaces require explicit permissions and dealership context; super-admin Marketplace auth/verify/process routes are sensitive-limited; salesperson-owned marketplace account/queue/listing routes require explicit permissions and dealership-scoped account ownership checks. Marketplace posting still must run in draft/review mode first. |
| GHL Sync | Code Exists | Partial | Partial | No | No | No | engineering | GHL/API-key integration routes require integrations read/write RBAC and dealership context, including webhook-secret reads/regeneration and test email sends; GHL mutation routes are restricted to master users until write flows are certified. Still prove OAuth, token refresh, webhook verification, sync logs, duplicate-contact prevention, staging, observability, rollback, and real user flow. |
| AI Lead Response | Code Exists | Partial | Partial | No | No | No | engineering | AI prompt management routes require explicit ai.configure RBAC and dealership context where dealership-scoped. AI runtime generation routes require explicit ai.use RBAC, AI settings and FB inbox auto-send controls require ai.configure RBAC, and public chat fails closed without dealership context. Must still pass guardrail, inventory-grounding, prompt-injection, escalation, human approval, observability, staging, and real user-flow proof. |
| Admin Dashboard | Code Exists | No | No | No | Partial | No | TBD | Test permissions and audit logs. |
| Billing/Plans | Not Started | No | No | No | No | No | TBD | Needed before self-serve SaaS. |
| Render Deploy | Not Verified | No | No | No | No | No | TBD | Workflow needs proof. |

## Launch Rule

No real dealership users until all critical features are CI verified, staging verified, observable, and user-flow verified.
