# LotView

LotView is being built as a **production-grade multi-tenant dealership SaaS** on `*.lotview.ai`.

The end goal is not "a dealer website." The end goal is a platform that can be sold to **hundreds of dealerships**, each with:
- its own tenant
- its own subdomain or custom domain
- its own staff accounts and permissions
- its own inventory, pricing intelligence, appraisal workflow, and posting automation
- hard tenant isolation and trustworthy operational behavior

This README is meant to help:
- future subagents resume accurately
- humans understand the real product target
- contributors avoid rebuilding the same fragile first-draft assumptions

---

## 1. Product Vision

LotView should become a system that helps dealerships:
- ingest and maintain current used inventory
- generate a VDP for every vehicle
- decode VINs accurately
- appraise vehicles with real market context
- compare current inventory against competitors
- keep pricing below or near market when appropriate
- preserve CARFAX/history details truthfully
- autopost inventory to channels like Facebook Marketplace and Craigslist
- manage leads, messaging, and follow-up workflows

The platform must be able to support:
- many dealerships
- many users per dealership
- multiple role types
- multiple domains per tenant
- high data integrity
- low risk of cross-tenant leakage
- explainable appraisal/pricing outputs

---

## 2. Core End Goal

The target state is a **sellable SaaS**, not just a working app.

That means LotView must be strong in these areas:

### Tenant isolation
- no hidden fallback to the wrong dealership
- no accidental cross-tenant data access
- no routing ambiguity between tenants

### Domain and tenant identity
- every dealer has a canonical tenant identity
- every dealer can have a primary system subdomain and optional aliases/custom domains
- hostname resolution is exact and auditable

### Vehicle data quality
- complete, trustworthy, fresh inventory data
- price history and status history
- VDP pages with real details
- truthful CARFAX/history data

### Appraisal and pricing trust
- comps are explainable
- trim/drivetrain/options matter
- confidence is shown honestly
- the system does not bluff certainty

### Role-based operations
- GM, sales manager, and salesperson each have the right access boundaries
- dangerous actions are capability-gated, not loosely implied by UI state

### Operational durability
- workers, scraping, imports, and posting queues behave predictably
- failures are visible and recoverable
- migrations and deploys are repeatable

---

## 3. Who the Product Serves

### 3.1 General Manager (GM)
The GM is the dealership-level administrator/operator.

#### GM needs
- view all inventory and all staff activity
- manage dealership settings
- manage user accounts
- manage integrations and posting configuration
- view pricing and appraisal insights
- override or review higher-risk workflows
- manage domains/branding/tenant presentation

#### GM functions
- create/edit/deactivate users
- assign roles and permissions
- configure dealership branding
- configure integrations (CARFAX-related sources, Facebook, AI, scraping, etc.)
- review pricing recommendations
- review appraisal logic and workflows
- monitor posting and lead activity
- view tenant-level analytics and operational health

---

### 3.2 Sales Manager
The sales manager is the inventory/pricing/appraisal operator.

#### Sales manager needs
- see market position of current used inventory
- compare dealership vehicles vs competitor listings
- appraise incoming trade-ins accurately
- understand why a recommendation exists
- manage or approve posting flows

#### Sales manager functions
- view inventory pricing analysis
- see which vehicles are above market / near market / below market
- run appraisal workflows
- decode VINs and confirm trim/drivetrain/options
- inspect competitor sets and adjust filters if allowed
- use posting queues and channel workflows where permitted
- review vehicle readiness before publishing

---

### 3.3 Salesperson
The salesperson is the frontline user.

#### Salesperson needs
- view assigned inventory or dealership inventory
- view VDP details
- use approved appraisal flows if allowed
- communicate with leads
- act inside a tightly scoped permission set

#### Salesperson functions
- view inventory and vehicle details
- view lead/customer data they are allowed to see
- send approved messages / follow-up actions
- create or update limited workflow records
- possibly run restricted appraisal or customer-facing tasks depending on permission model

Salespeople should **not** have broad tenant-admin, configuration, or cross-staff authority.

---

## 4. SaaS Functions

These are the cross-tenant platform functions LotView must support.

### 4.1 Tenant provisioning
- create a dealership tenant safely
- assign canonical tenant identity
- assign primary subdomain/domain
- create the first admin/GM/master account
- seed safe defaults

### 4.2 Tenant domain routing
- exact hostname → tenant resolution
- support for:
  - system subdomains (`dealer.lotview.ai`)
  - aliases
  - redirects
  - future custom domains
- fail closed for unknown or ambiguous hostnames

### 4.3 Identity and authorization
- stable tenant identity independent of mutable slug/subdomain
- explicit capability model on top of roles
- no null-tenant privilege drift except true platform super-admin behavior

### 4.4 Inventory ingestion
- scrape/import current used inventory
- detect new, changed, stale, sold, and deleted vehicles
- preserve dealer VDP URL
- preserve source provenance
- preserve CARFAX/history links and badges truthfully

### 4.5 Vehicle detail pages (VDPs)
Each vehicle needs its own VDP with:
- year / make / model / trim
- VIN
- stock number
- price
- odometer
- transmission
- drivetrain
- fuel type
- engine
- exterior/interior color
- images
- description
- dealer source VDP URL
- CARFAX/history details when available

### 4.6 Appraisal engine
The appraisal flow should:
- decode VIN accurately
- determine trim/drivetrain/options as well as possible
- compare with relevant competitor inventory
- explain confidence level
- avoid fake precision
- be trustworthy enough for actual used-car decision making

### 4.7 Pricing intelligence
The pricing system should:
- compare live inventory vs relevant competitor listings
- account for trim, drivetrain, mileage, freshness, source quality, and region
- highlight over-market / near-market / under-market situations
- provide confidence and caveats

### 4.8 Autoposting
The system should be able to:
- prepare vehicles for posting
- support Facebook Marketplace / Craigslist style workflows
- queue, claim, retry, and record outcomes safely
- avoid duplicate posting and silent failures

### 4.9 Leads, messaging, and follow-up
LotView is also expected to support:
- lead workflows
- messaging / inbox behavior
- reminders / follow-up automation
- future CRM-grade activity handling

---

## 5. Current Architecture Direction

LotView is moving away from first-draft tenant modeling and toward SaaS-native foundations.

### What used to be too weak
- treating `dealershipId` as conceptual identity
- treating one mutable `subdomain` field as the real tenant model
- fuzzy tenant routing as the main strategy
- dealership-specific assumptions hardcoded into routes/workflows

### What is being introduced now
- immutable tenant identity (`tenantKey`)
- first-class tenant domain mapping (`tenant_domains`)
- exact-hostname resolution before legacy subdomain fallback
- stronger fail-closed multi-tenant routing

---

## 6. Current Foundation Decisions

### 6.1 Tenant identity
Use three concepts distinctly:

1. **Internal row id**
   - `dealerships.id`
   - internal FK only
   - not the conceptual tenant identity

2. **Canonical tenant identity**
   - `dealerships.tenantKey`
   - immutable
   - used for cross-system identity and future-safe references

3. **Hostname/domain records**
   - `tenant_domains`
   - one tenant can own multiple hostnames
   - one hostname resolves exactly to one tenant

### 6.2 Hostname routing
Preferred order:
1. exact hostname lookup in `tenant_domains`
2. legacy subdomain parsing only as migration fallback
3. fail closed if unresolved/ambiguous

### 6.3 Vehicle identity
The current repo still needs stronger modeling here, but the intended direction is:
- VIN as canonical identity when valid
- dealership inventory row separated conceptually from canonical vehicle identity
- scrape/import observations preserved with provenance
- historical changes tracked, not just overwritten

---

## 7. Olympic Hyundai Vancouver: Current Known State

This tenant is the active live example being hardened.

### Intended canonical hostname
- `olympichyundai.lotview.ai`

### Current live mismatch historically observed
- `olympic.lotview.ai` was live and serving inventory/VDPs
- `olympichyundai.lotview.ai` was failing closed in production because live mapping still pointed to `olympic`

### Why this matters
That mismatch proves why mutable shorthand subdomain logic is not strong enough for long-term SaaS correctness.

### Verified live proof previously collected
On the live Olympic tenant, QA previously verified:
- real inventory visible
- real VDP present
- real CARFAX link present
- real vehicle data returned by API

But the canonical-host requirement was still not fully corrected in production at that point.

---

## 8. Current Features in the Repo

The repo already contains major building blocks, including:
- multi-tenant routing and dealership scoping
- inventory management
- vehicle VDP rendering
- VIN/pricing/appraisal surfaces
- Facebook Marketplace / posting queue surfaces
- CRM / messaging-related surfaces
- onboarding/provisioning flows
- audit and impersonation scaffolding
- scrape/source/run/queue tables
- CARFAX/history storage and related rendering paths

This means LotView is **not** a blank slate.
The work now is mostly:
- hardening
- clarifying identity boundaries
- removing ambiguity
- validating live runtime behavior
- making the platform trustworthy enough to sell

---

## 9. Known Architectural Risks

These are the big ones.

### 9.1 Tenant identity still too implicit
If code still depends on mutable `slug`/`subdomain` for too much behavior, future domain/custom-host support becomes brittle.

### 9.2 Role vocabulary inconsistency
Role naming is not yet clean enough.
Examples in the repo show mismatches like:
- `master`
- `manager`
- `salesperson`
- `admin`
- `super_admin`

That must be normalized.

### 9.3 Vehicle model overload
The current `vehicles` row carries too many responsibilities.
That risks:
- duplicate vehicles
- bad merge behavior
- overwritten edits
- weak provenance
- stale/sold confusion

### 9.4 Appraisal confidence risk
Appraisal/pricing outputs can become dangerous if they look more certain than the underlying data deserves.
Confidence/explainability must be first-class.

### 9.5 Runtime proof gap
A green build is not SaaS proof.
The platform still needs live proof around:
- tenant rendering
- role boundaries
- onboarding
- scrape/import durability
- autopost queue behavior
- appraisal/trust outputs

---

## 10. Security Principles

LotView should follow these principles consistently:

### Fail closed
If tenant context is missing or ambiguous:
- do not guess
- do not default to dealership 1
- do not silently route somewhere “close enough”

### Identity over presentation
- `tenantKey` is identity
- `hostname` is routing
- `slug` is presentation
- `id` is storage

### Capabilities over vague roles
Roles should be bundles.
Permissions should be explicit.

### Provenance over overwrite
When vehicle/scrape/history data changes, preserve the source and reason.

### Confidence over bluffing
For appraisal, pricing, and AI content:
- say what is known
- say what is inferred
- do not fabricate certainty

---

## 11. Practical Workflow for Future Contributors

If you are picking this project up mid-run, use this order:

1. Read:
   - `AGENTS.md`
   - `BOOTSTRAP.md`
   - `SOUL.md`
   - `USER.md`
   - `ACTIVE_SWARM_RUN.md`
   - `WORKING_BUFFER.md`
2. Check current live/runtime truth
3. Check git status and latest commits
4. Do not assume older progress notes are still true
5. Re-verify before claiming anything
6. Prefer evidence over optimism

---

## 12. What “Production Ready” Means Here

LotView is only truly production-ready SaaS when all of these are proven:

### Tenant layer
- exact tenant identity model is stable
- hostname/domain mapping is correct
- unknown hosts fail closed
- no cross-tenant leakage

### Live tenant rendering
- dealer tenant pages resolve correctly
- legal pages are tenant-correct
- inventory pages are tenant-correct
- VDP pages are tenant-correct

### Roles and auth
- GM / sales manager / salesperson access boundaries proven
- privileged actions are capability-gated
- no role ambiguity

### Vehicle database quality
- inventory is fresh
- prices update correctly
- stale/sold detection works
- VDPs preserve the right fields
- CARFAX data is truthful and current

### Appraisal and pricing
- comps are relevant
- trim/drivetrain sensitivity is real
- confidence and data age are surfaced honestly

### Operational workflows
- onboarding works
- scrape/import works
- autopost queue works
- failures are visible and recoverable

### Deployment/runtime
- web/worker topology is correct
- migrations are reliable
- deploy behavior is repeatable
- rollback is understood

Anything less is “progress toward production,” not “done.”

---

## 13. Current High-Leverage Roadmap

### Phase 1 — Tenant foundation
- add immutable `tenantKey`
- add `tenant_domains`
- prefer exact-host resolution
- keep legacy fallback only during migration

### Phase 2 — Domain/admin tooling
- manage tenant domains in onboarding/admin flows
- support canonical + alias hostnames
- remove tenant-specific hardcoded host assumptions

### Phase 3 — Role cleanup
- normalize role vocabulary
- move high-risk actions to capability checks

### Phase 4 — Vehicle identity/provenance
- strengthen canonical vehicle identity
- add source observation / merge provenance
- improve price/status/history tracking

### Phase 5 — Appraisal trust
- expose comp count, freshness, trim confidence, source breakdown
- avoid fake precision

### Phase 6 — Live workflow proof
- tenant rendering
- onboarding
- scrape/import
- VDP verification
- CARFAX verification
- autopost behavior
- role-boundary verification

---

## 14. Important Current Files

If you are continuing the work, these files matter a lot:

### Architecture / run-state
- `ACTIVE_SWARM_RUN.md`
- `WORKING_BUFFER.md`
- `LOTVIEW_EXECUTION_CONTRACT.md`
- `BOOTSTRAP.md`

### SaaS foundation
- `shared/schema.ts`
- `server/storage.ts`
- `server/tenant-middleware.ts`
- `server/routes.ts`
- `migrations/0013_tenant_identity_foundation.sql`

### Product logic / trust surfaces
- `client/src/contexts/TenantContext.tsx`
- `server/enhanced-market-analysis.ts`
- `server/generate-fb-descriptions.ts`
- scraper/import-related services and tests

---

## 15. Non-Negotiable Truth Rule

Do not say any of the following without direct evidence in the current run:
- it is production ready
- it is fully tenant safe
- the scraper works live
- the VDPs are correct
- CARFAX is working everywhere
- the appraisal engine is trustworthy
- the SaaS is ready to sell

This project should be advanced by:
- inspect
- prove
- fix
- validate
- commit
- report exact truth

Not by vibes.
