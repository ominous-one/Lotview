import cron from 'node-cron';
import { processEmailOutboxBatch } from './notifications/email-outbox-worker';

let notificationsSchedulerInitialized = false;

export function startNotificationsScheduler() {
  if (notificationsSchedulerInitialized) {
    console.log('Notifications scheduler already running');
    return;
  }

  // Every minute: process email outbox (idempotent; skip locked in DB).
  cron.schedule('*/1 * * * *', async () => {
    try {
      const result = await processEmailOutboxBatch(25);
      if (result.processed > 0) {
        console.log(`[Notifications] Email outbox processed=${result.processed} sent=${result.sent} failed=${result.failed} suppressed=${result.suppressed}`);
      }
    } catch (e) {
      console.error('[Notifications] Email outbox processing failed:', e);
    }
  });

  notificationsSchedulerInitialized = true;
  console.log('✓ Notifications scheduler started (email outbox every 1 min)');
}
