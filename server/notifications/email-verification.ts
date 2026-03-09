import crypto from 'crypto';
import { db } from '../db';
import { emailVerificationTokens, users } from '@shared/schema';
import { and, eq, isNull, gt } from 'drizzle-orm';
import { sendEmail, getDashboardUrl } from '../email-service';
import { notificationsTestModeEnabled } from './notification-service';
import { writeMailSinkMessage } from './mail-sink';

export async function startNotificationEmailVerification(params: {
  userId: number;
  email: string;
}): Promise<{ token: string; testMode: boolean }> {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

  await db.insert(emailVerificationTokens).values({
    userId: params.userId,
    email: params.email,
    token,
    expiresAt,
  });

  const verifyUrl = `${getDashboardUrl()}/api/notifications/verify-email?token=${encodeURIComponent(token)}`;

  const subject = `Verify your LotView notification email`;
  const html = `
  <p>Click to verify your notification email for LotView appointment alerts:</p>
  <p><a href="${verifyUrl}">Verify email</a></p>
  <p>If you did not request this, you can ignore this message.</p>
  `;

  const testMode = notificationsTestModeEnabled();

  if (testMode) {
    writeMailSinkMessage({
      id: crypto.randomUUID(),
      to: params.email,
      subject: `[TEST MODE] ${subject}`,
      html,
      createdAt: new Date().toISOString(),
      meta: { kind: 'email_verification', verifyUrl, userId: params.userId },
    });
    return { token, testMode: true };
  }

  await sendEmail({
    to: params.email,
    subject,
    html,
    text: `Verify: ${verifyUrl}`,
  });

  return { token, testMode: false };
}

export async function verifyNotificationEmailToken(token: string): Promise<{ success: boolean; userId?: number }> {
  const now = new Date();

  const row = await db.query.emailVerificationTokens.findFirst({
    where: and(eq(emailVerificationTokens.token, token), isNull(emailVerificationTokens.usedAt), gt(emailVerificationTokens.expiresAt, now)),
  });

  if (!row) return { success: false };

  await db.transaction(async (tx) => {
    await tx
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, row.id));

    await tx
      .update(users)
      .set({
        notificationEmail: row.email,
        notificationEmailVerifiedAt: new Date(),
        notificationEmailHardBouncedAt: null,
        notificationEmailSpamComplaintAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, row.userId));
  });

  return { success: true, userId: row.userId };
}
