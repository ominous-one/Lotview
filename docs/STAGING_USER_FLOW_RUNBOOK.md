# Lotview Staging User-Flow Runbook

This runbook proves that a feature works in staging. Code existence is not proof.

## Required Staging Environment

- Staging web service deployed.
- Staging worker deployed.
- Staging Postgres database deployed.
- Staging Redis deployed.
- Staging secrets configured from `.env.template`.
- At least one staging dealership exists.
- At least one admin user exists.
- At least one dealer manager user exists.
- Synthetic inventory data exists.
- All external integrations are in sandbox, test, draft, or read-only mode unless explicitly approved.

## Global Pass Criteria

A staging run passes only when all of these are true:

1. The user can complete the flow from start to finish.
2. The API returns expected responses.
3. The database state is correct after the flow.
4. Logs contain enough detail to diagnose failures.
5. No unrelated errors appear in the web or worker logs.
6. Re-running the flow does not create duplicate side effects.
7. Failure states are visible and recoverable.

## Core User Flow 1: Login and Dashboard

1. Open the staging app URL.
2. Log in as a dealer manager.
3. Confirm the dashboard loads.
4. Confirm the dealership context is correct.
5. Confirm no other dealership data is visible.
6. Log out.
7. Confirm protected routes require login.

Proof required:

- Screenshot or recording of successful login.
- API logs for auth and dashboard requests.
- No 500 errors in logs.
- Tenant ID in logs matches the expected dealership.

## Core User Flow 2: Inventory Review

1. Log in as dealer manager.
2. Open inventory list.
3. Search by VIN, stock number, make, model, and trim.
4. Open a vehicle detail page.
5. Confirm price, mileage, photos, VIN, stock number, and status display correctly.
6. Confirm sold or unavailable units are not incorrectly shown as active.

Proof required:

- Inventory count matches database/source-truth snapshot.
- Vehicle detail fields match database record.
- No cross-tenant data is visible.

## Core User Flow 3: Scraper and Source Truth

1. Trigger a staging scraper run for the test dealership.
2. Confirm the run starts in worker logs.
3. Confirm scraped records are validated before write.
4. Confirm changed vehicles are recorded in source-truth/reconciliation output.
5. Confirm manually verified fields are not overwritten by lower-confidence scrape data.
6. Confirm failure states are visible if the source is unreachable.

Proof required:

- Scrape run ID.
- Worker logs.
- Reconciliation report.
- Database before/after snapshot.

## Core User Flow 4: AI Lead Response Draft

1. Create or open a staging lead conversation.
2. Ask an inventory question.
3. Generate an AI response draft.
4. Confirm the draft references only verified inventory data.
5. Confirm the AI does not promise financing approval, fake payments, accident history, warranty, or availability beyond verified source truth.
6. Approve or reject the draft.

Proof required:

- Conversation ID.
- AI draft output.
- Guardrail decision logs.
- Human approval/rejection event.

## Core User Flow 5: GHL Sync

1. Connect or use staging GHL credentials.
2. Create a staging lead.
3. Sync lead to GHL.
4. Re-run sync.
5. Confirm no duplicate GHL contacts are created.
6. Expire or revoke credentials in staging and confirm the integration shows reconnect required.

Proof required:

- Lotview lead ID.
- GHL contact ID.
- Sync log.
- Duplicate prevention proof.

## Core User Flow 6: Facebook Draft Listing

1. Use staging/test Facebook credentials or mock mode.
2. Select one staging vehicle.
3. Generate listing draft.
4. Confirm title, price, mileage, photos, VIN/stock mapping, and description are correct.
5. Confirm no listing posts automatically unless human-approved mode is enabled.
6. Confirm duplicate protection prevents a second draft/post for the same active VIN.

Proof required:

- Vehicle ID.
- Draft listing payload.
- Approval event or blocked duplicate event.

## Core User Flow 7: Worker Restart Safety

1. Queue a staging job.
2. Restart the worker during or before job processing.
3. Confirm the job retries or resumes safely.
4. Confirm no duplicate messages, posts, syncs, or vehicle writes are created.
5. Confirm failures are visible in admin or logs.

Proof required:

- Job ID.
- Worker restart timestamp.
- Retry log.
- Idempotency proof.

## Core User Flow 8: Admin Visibility

1. Log in as super admin.
2. View dealerships.
3. View integration status.
4. View worker/job status.
5. View failed jobs.
6. View audit logs.
7. Confirm admin actions are logged.

Proof required:

- Admin user ID.
- Audit log IDs.
- Failed/retried job IDs if applicable.

## Certification Output

Every staging certification run must update `docs/FEATURE_CERTIFICATION.md` with:

- Date.
- Environment.
- Commit SHA.
- Tester.
- Feature status.
- Proof links or IDs.
- Known issues.

## Launch Rule

If a critical flow cannot be proven in staging, it cannot be launched to real dealership users.
