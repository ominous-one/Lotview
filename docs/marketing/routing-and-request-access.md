# Marketing routing + request-access leads

## Goals

- Root marketing domains show the marketing landing page.
- Dealership subdomains show inventory.
- `/request-access` is a public marketing route that stores inbound requests in Postgres.

## Routing behavior (client)

Tenant resolution happens in `client/src/contexts/TenantContext.tsx`.

### Marketing domains

The following hostnames are treated as **marketing** and will render `MarketingRouter` (landing page, request-access, login, etc.):

- `lotview.ai`
- `www.lotview.ai`
- `lotview.onrender.com` (Render root deployment)

This ensures **`https://lotview.onrender.com/` always shows the marketing landing page**, rather than attempting to resolve a default dealership tenant.

### Dealership subdomains

If the hostname matches `*.lotview.ai`, the subdomain is extracted and resolved via the tenancy resolver. When resolved, the app renders `DealershipRouter` (inventory + VDP + app routes).

## Request access flow

### UI route

- `GET /request-access` → `client/src/pages/RequestAccessPage.tsx`

Form fields:

- name (required)
- email (required)
- dealership (required)
- phone (optional)

### API route

- `POST /api/public/request-access`

Implementation:

- `server/routes.ts`
- Rate limit: uses `sensitiveLimiter` (5 requests/hour per IP)
- Anti-spam:
  - Honeypot field `website` (hidden in UI). If populated, the server returns `{ ok: true }` but **does not store**.

### Database storage

Table:

- `request_access_leads`

Schema source:

- `shared/schema.ts` (`requestAccessLeads`)

Migration:

- `migrations/0011_request_access_leads.sql`

Stored columns:

- `name`, `email`, `dealership`, `phone`
- `source_hostname`, `ip_address`, `user_agent`
- `created_at`

### Querying leads

Example SQL:

```sql
select *
from request_access_leads
order by created_at desc
limit 50;
```
