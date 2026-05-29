# Day-1 Onboarding Runbook — First Dealership

This runbook gets you from "fresh production deploy" to "first dealership onboarded with inventory scraped and visible" in roughly 30–45 minutes once Render auto-deploy is healthy.

## Prerequisites

- You have access to the Render dashboard for `lotview-api` and `lotview-worker`.
- You have access to `https://app.lotview.ai`.
- The Olympic Hyundai TAdvantage scraper is the proven path for the first dealership; this runbook assumes that target.

---

## Step 1 — Unblock Render auto-deploy (5 min)

The deployed commit is currently older than the `main` HEAD on GitHub. Render has not been picking up pushes.

1. Open https://dashboard.render.com → `lotview-api` service.
2. Click the **Events** tab. Look at the most recent few build attempts.
3. Common causes of stalled deploys:
   - **Auto-deploy paused.** Look for a yellow banner or paused badge. Click `Resume deploys`.
   - **Last build failed.** The Events tab will show a red `Build failed` entry. Click into it for the error. Most common: missing env var, build script change. Restart the service to retry.
   - **Webhook disconnected.** Go to **Settings → Build & Deploy**. The GitHub connection should show your repo. If it shows "Disconnected," click `Reconnect`.
4. Repeat the same check on the `lotview-worker` service.
5. Trigger a manual deploy from the latest commit on `main` to confirm both services build cleanly.

**Confirm the new deploy is live:**

```bash
curl -s https://app.lotview.ai/api/version | grep -o '"commit":"[a-f0-9]*"'
```

The `commit` value should match the most recent commit on `main`. If it still shows `14702be...`, Render hasn't redeployed yet — the previous step didn't take.

---

## Step 2 — Confirm required production env vars (5 min)

In the Render dashboard for `lotview-api`, **Environment** tab, make sure these are set (most are already in `render.yaml`):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Auto-wired from `lotview-db` |
| `REDIS_URL` | Auto-wired from `lotview-redis` |
| `JWT_SECRET` | Auto-generated |
| `SESSION_SECRET` | Auto-generated |
| `BROWSERLESS_API_KEY` | **You need to add this.** Get from https://browserless.io. Required for the cloud scraper and Patchright tier. |
| `LOTVIEW_USE_PATCHRIGHT` | Set to `true` to enable the stealth tier shipped this session. |
| `NODE_ENV` | `production` |

Same env vars on `lotview-worker` (the worker uses them too).

**Optional but recommended:**

| Variable | When |
|---|---|
| `API_NINJAS_KEY` | If you sign up for the free API Ninjas VIN endpoint as a third fallback. |
| `RESEND_API_KEY` | If you want password-reset emails to actually send. |

Click `Save Changes`. Render redeploys automatically.

---

## Step 3 — Bootstrap your super admin account (5 min)

The bootstrap script is committed to the repo. Run it from inside the Render network so it can reach the private Postgres.

1. In the Render dashboard for `lotview-api`, click **Shell** (top-right area).
2. Once the shell connects, run:

   ```bash
   LOTVIEW_BOOTSTRAP_EMAIL=rileyabreo@gmail.com \
   LOTVIEW_BOOTSTRAP_PASSWORD='Nissan2026!!' \
   LOTVIEW_BOOTSTRAP_NAME='Riley Abreo' \
   npx tsx scripts/bootstrap-super-admin.ts
   ```

3. You should see:

   ```
   Lotview Super Admin Bootstrap
   ==============================
   Email: rileyabreo@gmail.com
   Name:  Riley Abreo

   OK — Created super_admin id=<N>
   ```

4. Re-running the same command later is safe — the script is idempotent and will report `Super admin already exists`. It will **never** silently overwrite a user.

---

## Step 4 — Log in and verify (2 min)

1. Open https://app.lotview.ai.
2. Log in with `rileyabreo@gmail.com` / `Nissan2026!!`.
3. You should land in the super-admin dashboard with no dealerships listed yet.

If login fails with `401 Invalid email or password`, the bootstrap didn't run cleanly — check the Render shell output and retry step 3.

---

## Step 5 — Create your first dealership (5 min)

Two paths:

**Path A: Self-service signup form** (visible to the public).
Navigate to `https://app.lotview.ai/onboarding/signup` (or the route the UI exposes). Fill in:

- Dealership name: `Olympic Hyundai`
- Website URL: `https://olympichyundaivancouver.com`
- Manager email: a real email you control (this becomes the dealership's "master" user — not the super admin)
- Manager password: 12+ characters
- Optional: phone, address

The form auto-detects the website platform (TAdvantage for Olympic Hyundai → confidence 0.5 with the generic script; the dedicated scraper takes over once a scrape source is registered).

**Path B: Super-admin create** (logged in as super admin).
Use `POST /api/super-admin/dealerships` with body:

```json
{
  "name": "Olympic Hyundai",
  "slug": "olympic-hyundai",
  "subdomain": "olympic",
  "masterAdminEmail": "owner@olympichyundai.example",
  "masterAdminName": "Owner",
  "masterAdminPassword": "very-strong-pass-1234"
}
```

Both paths create:
- One `dealerships` row
- One `master` user (the dealer's GM-equivalent)
- An audit log entry

---

## Step 6 — Register the Olympic Hyundai scrape source (3 min)

The scraper needs a `scrape_sources` row that pairs the dealership with the URL.

Quickest path via Render shell:

```bash
# Replace 1 with your dealership id from step 5
psql "$DATABASE_URL" <<'SQL'
INSERT INTO scrape_sources (dealership_id, source_name, source_url, is_active, priority, schedule)
VALUES (1, 'Olympic Hyundai Used', 'https://olympichyundaivancouver.com/vehicles/?sale_class=used', true, 1, 'daily')
ON CONFLICT DO NOTHING;
SQL
```

Add a second row for new inventory if desired (`?sale_class=new`).

---

## Step 7 — Run the first scrape (5 min)

The scraper runs on the worker. Trigger a one-shot scrape:

```bash
# From the lotview-worker Render shell (or via the super-admin UI if exposed)
npx tsx server/scripts/run-daily-scrape.ts --dealership-id=1 --trigger=manual
```

Expected output:
- `Browserless Robust] Starting inventory scrape`
- `Browserless Robust] Connection test passed`
- Per-vehicle log lines as VINs are validated and inserted
- A summary with `vehiclesInserted` count

If browserless connection fails and `LOTVIEW_USE_PATCHRIGHT=true` is set, you'll see `Attempting Patchright CDP stealth fallback` — that's the stealth tier kicking in.

**Verify the scrape stuck**:

```sql
SELECT COUNT(*) AS vehicle_count,
       COUNT(*) FILTER (WHERE trim IS NOT NULL AND trim != '') AS with_trim
  FROM vehicles
 WHERE dealership_id = 1;
```

You should see ~30 vehicles for Olympic Hyundai with a high trim-fill rate (Series-fallback patch ships in this commit, so 2024+ Hyundai VINs return trim from NHTSA's `Series` field).

---

## Step 8 — Verify VIN decoder + trim (2 min)

Pick a VIN from the scrape output and decode it:

```bash
curl -s "https://app.lotview.ai/api/vin/decode/5XYZUDLA8PG123456" -H "Authorization: Bearer <your-jwt>"
```

You should see year, make, model, **and trim** populated. The trim source will be `Series` for most Hyundais — log line: `[VIN Trim Extractor] Source: Series`.

If trim is missing on most VINs, you're hitting NHTSA's known data gap for that brand-year. The dedicated extractor improves coverage materially but doesn't guarantee 100% — a paid MarketCheck key is the only way to lock that down.

---

## Step 9 — Smoke-test the sales-consultant view (3 min)

1. Log out of the super-admin.
2. Log in as the master user you created in step 5.
3. Confirm:
   - The inventory list shows all scraped vehicles.
   - Clicking a vehicle shows its VDP with year/make/model/trim/price/photos.
   - Inventory edit works (price change, add note).
4. Invite a sales consultant: **Users → Invite → Role: salesperson**.
5. Open the invite link in an incognito window. Accept it. Log in as the consultant.
6. Confirm: consultant sees the same inventory list, but the edit pencil is missing on the VDP (read-only inventory by design).

---

## What's NOT in this Day-1 deploy

These are explicit follow-ups, surfaced so you can plan against them rather than discover them mid-flight:

| Feature | Status | Next session |
|---|---|---|
| Market price comparison | Stubbed (every service returns empty). Needs a data source. | Wire up MarketCheck market-pricing endpoint, or build CarGurus + AutoTrader scrapers as the comp source. |
| Camoufox deep stealth tier | Not installed. Patchright shipped this session is the new top fallback. | Add Camoufox if you encounter sites that defeat Patchright + Browserless + ScrapingBee + Scrapling. Requires a Dockerfile glibc base change. |
| HomeNet VDX feed ingest | Not built. Dealers already on HomeNet have an XML/CSV feed available. | A half-day to add `homenet-vdx-ingest.ts` and a scheduled puller. |
| CDK / Reynolds / Dealertrack DMS feeds | Only PBS is wired. | Each is a separate integration with its own API contract. |
| TLS-fingerprint fast-path (curl_cffi style) | Not built. Browserless handles JA3 spoofing today via stealth_proxy. | Add a JA3-spoofing HTTP fetcher to skip the cloud browser on permissive sites — saves money. |
| Real password-reset email delivery | Resend SDK present, key not configured. | Set `RESEND_API_KEY` env var. |

---

## If something breaks

- **Login 503**: dependency issue. Hit `/api/ready` and check which sub-check is red.
- **Scrape produces 0 vehicles**: check Browserless quota and the `LOTVIEW_USE_PATCHRIGHT` env var; check the dealer site is up.
- **Trim is empty on most VINs**: confirm the new build is live (`/api/version` should show the commit with the trim-extractor patch). NHTSA simply doesn't return trim for some brand-year combinations — paid sources are the only fix.
- **Bootstrap script fails with `already exists with role "master"`**: the email you chose was already taken by a non-super-admin. Pick a different email or promote that user manually via the database.

---

## Rollback

The Patchright tier is opt-in via `LOTVIEW_USE_PATCHRIGHT=true`. If anything goes sideways, set it to `false` (or unset it) and the chain reverts immediately — no redeploy needed.
