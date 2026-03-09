import { db } from '../db';
import { emailOutbox } from '@shared/schema';
import { and, eq, lte, or, sql } from 'drizzle-orm';
import { sendEmail } from '../email-service';
import { notificationsTestModeEnabled } from './notification-service';
import { writeMailSinkMessage } from './mail-sink';
import crypto from 'crypto';

function computeNextAttempt(attemptCount: number): Date {
  // Exponential backoff with jitter.
  const baseSeconds = Math.min(60 * 60, Math.pow(2, Math.min(10, attemptCount)) * 30); // 30s, 60s, 120s, ... capped at 1h
  const jitter = Math.floor(Math.random() * 15);
  return new Date(Date.now() + (baseSeconds + jitter) * 1000);
}

export async function processEmailOutboxBatch(limit = 25): Promise<{ processed: number; sent: number; failed: number; suppressed: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    // Select rows ready to send.
    const rows = await tx
      .select()
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.status, 'PENDING'),
          lte(emailOutbox.nextAttemptAt, now),
          sql`${emailOutbox.attemptCount} < ${emailOutbox.maxAttempts}`
        )
      )
      .limit(limit)
      .for('update', { skipLocked: true });

    let sent = 0;
    let failed = 0;
    let suppressed = 0;

    for (const row of rows) {
      const testMode = notificationsTestModeEnabled();

      const attemptCount = row.attemptCount + 1;
      await tx
        .update(emailOutbox)
        .set({
          attemptCount,
          updatedAt: new Date(),
        })
        .where(eq(emailOutbox.id, row.id));

      if (testMode) {
        const id = crypto.randomUUID();
        writeMailSinkMessage({
          id,
          to: row.toEmail,
          subject: `[TEST MODE] ${row.subject}`,
          html: row.html,
          text: row.text || undefined,
          meta: { dealershipId: row.dealershipId, outboxId: row.id, sendKey: row.sendKey },
          createdAt: new Date().toISOString(),
        });

        await tx
          .update(emailOutbox)
          .set({
            status: 'SUPPRESSED_TEST_MODE',
            lastError: null,
            providerMessageId: null,
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailOutbox.id, row.id));

        suppressed++;
        continue;
      }

      const result = await sendEmail({
        to: row.toEmail,
        subject: row.subject,
        html: row.html,
        text: row.text || undefined,
      });

      if (result.success) {
        await tx
          .update(emailOutbox)
          .set({
            status: 'SENT',
            providerMessageId: result.id || null,
            lastError: null,
            sentAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(emailOutbox.id, row.id));
        sent++;
        continue;
      }

      const nextAttemptAt = attemptCount >= row.maxAttempts ? null : computeNextAttempt(attemptCount);

      await tx
        .update(emailOutbox)
        .set({
          status: attemptCount >= row.maxAttempts ? 'FAILED' : 'PENDING',
          nextAttemptAt: nextAttemptAt ?? row.nextAttemptAt,
          lastError: result.error || 'UNKNOWN',
          updatedAt: new Date(),
        })
        .where(eq(emailOutbox.id, row.id));

      failed++;
    }

    return { processed: rows.length, sent, failed, suppressed };
  });
}
