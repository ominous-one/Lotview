import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';
import { dealerships, users, emailOutbox, notifications, notificationEvents, appointments } from '@shared/schema';
import { db } from '../../../../server/db';
import {
  assert,
  authenticatedFetch,
  loginAs,
  seedTestDealership,
  seedTestUser,
  BASE_URL,
} from '../../../../server/tests/test-helpers';
import { processEmailOutboxBatch } from '../../../../server/notifications/email-outbox-worker';

function mailSinkDir(): string {
  return path.resolve(process.cwd(), 'artifacts', 'mail-sink');
}

async function main() {
  console.log(`# WS4E runtime E2E (NOTIFICATIONS_TEST_MODE=true)`);
  console.log(`# BASE_URL=${BASE_URL}`);

  // Ensure clean sink
  const sink = mailSinkDir();
  fs.rmSync(sink, { recursive: true, force: true });
  fs.mkdirSync(sink, { recursive: true });

  const dealership = await seedTestDealership('WS4E Appt E2E', 'ws4e-appt-e2e');

  // Dealership timezone required by appointment-service.
  await db.update(dealerships).set({ timezone: 'America/Vancouver' as any }).where(eq(dealerships.id, dealership.id));

  // Cleanup prior runs for determinism.
  await db.delete(emailOutbox).where(eq(emailOutbox.dealershipId, dealership.id));
  await db.delete(notifications).where(eq(notifications.dealershipId, dealership.id));
  await db.delete(notificationEvents).where(eq(notificationEvents.dealershipId, dealership.id));
  await db.delete(appointments).where(eq(appointments.dealershipId, dealership.id));

  const mgr = await seedTestUser(dealership.id, 'ws4e_mgr@test.com', 'sales_manager', 'WS4E Sales Manager');

  // Mark manager notification email verified so email outbox rows are created as PENDING.
  await db
    .update(users)
    .set({
      isActive: true as any,
      notificationEmail: mgr.email as any,
      notificationEmailVerifiedAt: new Date() as any,
      notificationEmailHardBouncedAt: null as any,
      notificationEmailSpamComplaintAt: null as any,
    })
    .where(eq(users.id, mgr.id));

  const auth = await loginAs(mgr.email, mgr.password);
  if (!auth) throw new Error('Failed to login');

  const start1 = new Date(Date.now() + 60 * 60 * 1000);
  const start2 = new Date(start1.getTime() + 24 * 60 * 60 * 1000);

  // 1) Create appointment (BOOKED)
  const createRes = await authenticatedFetch(`${BASE_URL}/api/appointments`, auth, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'SALES',
      status: 'BOOKED',
      startAt: start1.toISOString(),
      endAt: new Date(start1.getTime() + 30 * 60 * 1000).toISOString(),
      timezone: 'America/Vancouver',
      ownerUserId: mgr.id,
      leadName: 'Test Buyer',
      leadPhone: '555-555-5555',
      leadEmail: 'buyer@test.com',
      sourceChannel: 'web',
      notes: 'WS4E E2E create',
      idempotencyKey: `ws4e-create-${Date.now()}`,
    }),
  });
  assert(createRes.status === 200, `create appointment expected 200 got ${createRes.status} body=${createRes.body}`);
  const created = JSON.parse(createRes.body);
  const apptId = created.appointment?.id;
  assert(!!apptId, `expected appointment.id in response body=${createRes.body}`);
  console.log(`Created appointment id=${apptId}`);

  // 2) Reschedule appointment
  // Expected behavior (per WS4E spec): reschedule should be supported.
  // Observed runtime: /reschedule attempts BOOKED -> RESCHEDULED, but the state machine rejects that transition
  // (requires BOOKED -> RESCHEDULE_REQUESTED -> RESCHEDULED).
  const reschedRes = await authenticatedFetch(`${BASE_URL}/api/appointments/${apptId}/reschedule`, auth, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startAt: start2.toISOString(),
      endAt: new Date(start2.getTime() + 30 * 60 * 1000).toISOString(),
      reason: 'Customer requested different time',
      idempotencyKey: `ws4e-resched-${Date.now()}`,
    }),
  });

  const rescheduleOk = reschedRes.status === 200;
  if (rescheduleOk) {
    console.log('Rescheduled appointment');
  } else {
    console.log(`Reschedule FAILED as observed (status=${reschedRes.status}) body=${reschedRes.body}`);
  }

  // 3) Cancel appointment (buyer)
  const cancelRes = await authenticatedFetch(`${BASE_URL}/api/appointments/${apptId}/cancel`, auth, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cancelledBy: 'BUYER',
      reason: 'Buyer no longer interested',
      idempotencyKey: `ws4e-cancel-${Date.now()}`,
    }),
  });
  assert(cancelRes.status === 200, `cancel expected 200 got ${cancelRes.status} body=${cancelRes.body}`);
  console.log('Cancelled appointment');

  // Verify DB rows: appointment exists
  const appt = await db.query.appointments.findFirst({ where: eq(appointments.id, apptId) });
  assert(!!appt, 'expected appointment row in DB');
  console.log(`DB appointment status=${appt!.status}`);
  const cancelBuyerOk = appt!.status === 'CANCELLED_BY_BUYER';
  if (!cancelBuyerOk) {
    console.log(`Cancel status mismatch: expected CANCELLED_BY_BUYER (cancelledBy=BUYER), got ${appt!.status}`);
  }

  // Verify notifications and email outbox rows exist
  const notifRows = await db.select().from(notifications).where(eq(notifications.dealershipId, dealership.id));
  const outboxRows = await db.select().from(emailOutbox).where(eq(emailOutbox.dealershipId, dealership.id));

  console.log(`DB notifications rows=${notifRows.length}`);
  console.log(`DB email_outbox rows=${outboxRows.length}`);
  const expectedMinOutbox = rescheduleOk ? 3 : 2;
  assert(outboxRows.length >= expectedMinOutbox, `expected >=${expectedMinOutbox} email outbox rows, got ${outboxRows.length}`);

  // Process outbox (writes mail-sink in test mode)
  const batchResult = await processEmailOutboxBatch(25);
  console.log(`processEmailOutboxBatch => ${JSON.stringify(batchResult)}`);

  // Verify mail-sink output
  const files = fs.readdirSync(sink).filter((f) => f.endsWith('.json'));
  console.log(`mail-sink files=${files.length}`);
  assert(files.length >= 1, 'expected at least one mail-sink json file');

  // Print a sample
  const samplePath = path.join(sink, files[0]);
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));
  console.log(`sample mail-sink subject=${sample.subject}`);

  if (!rescheduleOk || !cancelBuyerOk) {
    console.log('WS4E runtime E2E: FAIL');
    if (!rescheduleOk) console.log(' - reschedule endpoint/state-machine mismatch');
    if (!cancelBuyerOk) console.log(' - cancel endpoint did not set CANCELLED_BY_BUYER when cancelledBy=BUYER');
    process.exit(1);
  }

  console.log('WS4E runtime E2E: PASS');
}

main().catch((err) => {
  console.error('WS4E runtime E2E: FAIL', err);
  process.exit(1);
});
