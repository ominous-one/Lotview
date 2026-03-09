import { runTest, assert, printTestResults, seedTestDealership, seedTestUser, loginAs, authenticatedFetch, BASE_URL } from "../../../server/tests/test-helpers";
import { storage } from "../../../server/storage";
import { db } from "../../../server/db";
import { appointments, notificationEvents, notifications, emailOutbox, users } from "../../../shared/schema";
import { and, desc, eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";
import { processEmailOutboxBatch } from "../../../server/notifications/email-outbox-worker";
import bcrypt from "bcryptjs";

function mailSinkDir(): string {
  return path.resolve(process.cwd(), "artifacts", "mail-sink");
}

function listMailSinkFiles(): string[] {
  const dir = mailSinkDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(dir, f))
    .sort();
}

async function ensureDealershipTimezone(dealershipId: number, tz: string) {
  await storage.updateDealership(dealershipId, { timezone: tz } as any);
}

async function ensureVerifiedSalesManager(dealershipId: number, email: string) {
  const u = await seedTestUser(dealershipId, email, "sales_manager", "WS4E Sales Manager");

  // Ensure deterministic login across runs (reset password hash).
  const passwordPlain = "TestPassword123!";
  const passwordHash = await bcrypt.hash(passwordPlain, 10);

  // Ensure role + verified notification email.
  await db
    .update(users)
    .set({
      role: "sales_manager",
      passwordHash,
      notificationEmailVerifiedAt: new Date(),
      notificationEmail: u.email,
      isActive: true,
    } as any)
    .where(eq(users.id, u.id));

  return { ...u, password: passwordPlain };
}

async function main() {
  const results: any[] = [];

  const runId = Date.now();
  const dealership = await seedTestDealership("WS4E E2E", `ws4e-e2e-${runId}`);
  await ensureDealershipTimezone(dealership.id, "America/Vancouver");

  const mgr = await ensureVerifiedSalesManager(dealership.id, `ws4e_sales_manager_${runId}@test.com`);

  const auth = await loginAs(mgr.email, mgr.password);
  if (!auth) throw new Error("Failed to login test user");

  const startAt = new Date(Date.now() + 60 * 60 * 1000);
  const endAt = new Date(startAt.getTime() + 60 * 60 * 1000);

  let appointmentId: string | null = null;

  results.push(
    await runTest("WS4E: create appointment via API (BOOKED)", async () => {
      const r = await authenticatedFetch(`${BASE_URL}/api/appointments`, auth, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "IN_PERSON_VISIT",
          status: "BOOKED",
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          timezone: "America/Vancouver",
          ownerUserId: mgr.id,
          leadName: "Pat Buyer",
          leadEmail: "pat.buyer@example.com",
          sourceChannel: "qa-e2e",
          location: "Lot",
          notes: "E2E test appointment",
          idempotencyKey: `ws4e-e2e:${Date.now()}`,
        }),
      });

      assert(r.status === 200, `expected 200, got ${r.status} body=${r.body}`);
      const data = JSON.parse(r.body);
      assert(!!data?.appointment?.id, `expected appointment.id, got ${r.body}`);
      appointmentId = data.appointment.id;
    })
  );

  results.push(
    await runTest("WS4E: conflict detection (overlapping appointment => 409)", async () => {
      assert(!!appointmentId, "expected appointmentId to be set");

      const r = await authenticatedFetch(`${BASE_URL}/api/appointments`, auth, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "IN_PERSON_VISIT",
          status: "BOOKED",
          // Overlap by 30 minutes.
          startAt: new Date(startAt.getTime() + 30 * 60 * 1000).toISOString(),
          endAt: new Date(endAt.getTime() + 30 * 60 * 1000).toISOString(),
          timezone: "America/Vancouver",
          ownerUserId: mgr.id,
          leadName: "Pat Buyer",
          leadEmail: "pat.buyer@example.com",
          sourceChannel: "qa-e2e",
          idempotencyKey: `ws4e-e2e-conflict:${Date.now()}`,
        }),
      });

      assert(r.status === 409, `expected 409 conflict, got ${r.status} body=${r.body}`);
      const data = JSON.parse(r.body);
      assert(data.code === "APPOINTMENT_CONFLICT", `expected APPOINTMENT_CONFLICT code, got ${r.body}`);
    })
  );

  results.push(
    await runTest("WS4E: in-app notification + email outbox created", async () => {
      assert(!!appointmentId, "expected appointmentId to be set");

      // Confirm appointment exists.
      const appt = await db.query.appointments.findFirst({
        where: and(eq(appointments.id, appointmentId as any), eq(appointments.dealershipId, dealership.id)),
      });
      assert(!!appt, "expected appointment row to exist");

      // Notification event exists for appointment.
      const ev = await db.query.notificationEvents.findFirst({
        where: and(eq(notificationEvents.dealershipId, dealership.id), eq(notificationEvents.appointmentId, appointmentId as any)),
        orderBy: desc(notificationEvents.occurredAt),
      });
      assert(!!ev, "expected notification_events row for appointment");

      // In-app notification exists.
      const notif = await db.query.notifications.findFirst({
        where: and(eq(notifications.dealershipId, dealership.id), eq(notifications.eventId, ev!.id as any)),
        orderBy: desc(notifications.createdAt),
      });
      assert(!!notif, "expected notifications row for event");

      // Email outbox row exists and is pending (since manager email was marked verified).
      const outbox = await db.query.emailOutbox.findFirst({
        where: and(eq(emailOutbox.dealershipId, dealership.id), eq(emailOutbox.notificationId, notif!.id as any)),
        orderBy: desc(emailOutbox.createdAt),
      });
      assert(!!outbox, "expected email_outbox row");
      assert(outbox!.status === "PENDING" || outbox!.status === "SUPPRESSED_TEST_MODE", `expected PENDING or SUPPRESSED_TEST_MODE, got ${outbox!.status}`);
    })
  );

  results.push(
    await runTest("WS4E: email outbox worker writes mail-sink output in test mode", async () => {
      // Ensure we're in test mode for notifications.
      assert(String(process.env.NOTIFICATIONS_TEST_MODE).toLowerCase() === "true", "expected NOTIFICATIONS_TEST_MODE=true");

      const before = listMailSinkFiles();
      const result = await processEmailOutboxBatch(25);
      console.log(`[EmailOutboxWorker] processed=${result.processed} sent=${result.sent} failed=${result.failed} suppressed=${result.suppressed}`);

      const after = listMailSinkFiles();
      assert(after.length > before.length, `expected mail-sink file count to increase (before=${before.length} after=${after.length})`);

      const newest = after[after.length - 1];
      const payload = JSON.parse(fs.readFileSync(newest, "utf8"));
      assert(String(payload.subject || "").includes("[TEST MODE]"), `expected subject to include [TEST MODE], got ${payload.subject}`);
    })
  );

  const summary = printTestResults(results);
  if (summary.failed > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error("WS4E E2E run failed:", err);
  process.exit(1);
});
