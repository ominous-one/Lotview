import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { notificationEvents, notifications, emailOutbox, appointments, dealerships, users, vehicles } from '@shared/schema';
import type { NotificationEventType } from '../appointments/appointment-state';
import { getDashboardUrl } from '../email-service';

export function notificationsTestModeEnabled(): boolean {
  return String(process.env.NOTIFICATIONS_TEST_MODE || '').toLowerCase() === 'true';
}

function requiredManagerEmailEvents(): Set<NotificationEventType> {
  return new Set([
    'APPOINTMENT_BOOKED_AUTO',
    'APPOINTMENT_BOOKED_MANUAL',
    'APPOINTMENT_RESCHEDULED',
    'APPOINTMENT_CANCELLED_BY_BUYER',
    'APPOINTMENT_CANCELLED_BY_DEALER',
  ]);
}

function buildNotificationKey(params: {
  dealerId: number;
  eventType: string;
  appointmentId: string;
  recipientUserId: number;
  eventId: string;
}): string {
  return `${params.dealerId}:${params.eventType}:${params.appointmentId}:${params.recipientUserId}:${params.eventId}`;
}

function buildSendKey(notificationKey: string, channel: 'EMAIL'): string {
  return `${notificationKey}:${channel}`;
}

export async function createAppointmentNotifications(
  tx: any,
  params: {
    dealershipId: number;
    appointmentId: string;
    eventType?: NotificationEventType;
    eventKey?: string | null;
    context?: {
      previousStartAt?: Date | string | null;
      previousEndAt?: Date | string | null;
      cancelledStartAt?: Date | string | null;
    } | null;
    escalationEmail?: string | null;
  }
): Promise<void> {
  if (!params.eventType) return;

  const eventType = params.eventType;

  const dealer = await tx.query.dealerships.findFirst({
    where: eq(dealerships.id, params.dealershipId),
    columns: { id: true, name: true, timezone: true },
  });
  if (!dealer) throw new Error('Dealership not found');

  const appt = await tx.query.appointments.findFirst({
    where: and(eq(appointments.id, params.appointmentId as any), eq(appointments.dealershipId, params.dealershipId)),
  });
  if (!appt) throw new Error('Appointment not found');

  const vehicle = appt.vehicleId
    ? await tx.query.vehicles.findFirst({
        where: eq(vehicles.id, appt.vehicleId),
        columns: { year: true, make: true, model: true, trim: true },
      })
    : null;

  const owner = appt.ownerUserId
    ? await tx.query.users.findFirst({
        where: eq(users.id, appt.ownerUserId),
        columns: { id: true, name: true },
      })
    : null;

  const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}` : 'No vehicle';
  const buyerName = appt.leadName || 'Unknown buyer';

  const startAt = new Date(appt.startAt as any);
  const tz = appt.timezone || dealer.timezone || 'UTC';
  const when = startAt.toLocaleString('en-US', {
    timeZone: tz,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const deepLink = `${getDashboardUrl()}/manager/appointments/${appt.id}`;

  const titleBase =
    eventType === 'APPOINTMENT_RESCHEDULED'
      ? 'Appointment changed'
      : eventType === 'APPOINTMENT_CANCELLED_BY_BUYER' || eventType === 'APPOINTMENT_CANCELLED_BY_DEALER'
      ? 'Appointment cancelled'
      : eventType === 'APPOINTMENT_PENDING_CONFIRMATION'
      ? 'Appointment needs confirmation'
      : 'Appointment booked';

  const title = `${titleBase}: ${buyerName} — ${vehicleLabel}`;
  let body = `Time: ${when}\nOwner: ${owner?.name || 'Unassigned'}\nSource: ${appt.sourceChannel || 'unknown'}\n\nView appointment: ${deepLink}`;

  if (eventType === 'APPOINTMENT_RESCHEDULED') {
    const prev = params.context?.previousStartAt ? new Date(params.context.previousStartAt as any) : null;
    const prevWhen = prev
      ? prev.toLocaleString('en-US', {
          timeZone: tz,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        })
      : null;
    if (prevWhen) {
      body = `Previous: ${prevWhen}\nNew: ${when}\nOwner: ${owner?.name || 'Unassigned'}\nSource: ${appt.sourceChannel || 'unknown'}\n\nView appointment: ${deepLink}`;
    }
  }

  if (eventType === 'APPOINTMENT_CANCELLED_BY_BUYER' || eventType === 'APPOINTMENT_CANCELLED_BY_DEALER') {
    const cancelled = params.context?.cancelledStartAt ? new Date(params.context.cancelledStartAt as any) : null;
    const cancelledWhen = cancelled
      ? cancelled.toLocaleString('en-US', {
          timeZone: tz,
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        })
      : when;
    body = `Cancelled time: ${cancelledWhen}\nOwner: ${owner?.name || 'Unassigned'}\nSource: ${appt.sourceChannel || 'unknown'}\n\nView appointment: ${deepLink}`;
  }

  const eventKey = params.eventKey || `${eventType}:${params.appointmentId}:${new Date(appt.startAt as any).toISOString()}`;

  let existingEvent = await tx.query.notificationEvents.findFirst({
    where: and(eq(notificationEvents.dealershipId, params.dealershipId), eq(notificationEvents.eventKey, eventKey)),
    columns: { id: true },
  });

  const ev = existingEvent
    ? [{ id: existingEvent.id }]
    : await tx
        .insert(notificationEvents)
        .values({
          dealershipId: params.dealershipId,
          eventType,
          eventKey,
          appointmentId: appt.id,
          threadId: appt.threadId ?? null,
          vehicleId: appt.vehicleId ?? null,
          ownerUserId: appt.ownerUserId ?? null,
          summary: title,
          details: {
            appointmentId: appt.id,
            status: appt.status,
            type: appt.type,
            startAt: appt.startAt,
            endAt: appt.endAt,
            timezone: tz,
            ownerUserId: appt.ownerUserId,
            ownerName: owner?.name ?? null,
            buyerName,
            vehicleLabel,
            deepLink,
            previousStartAt: params.context?.previousStartAt ?? null,
          },
        })
        .returning();

  const eventId = ev[0].id as string;

  // Manager recipients: role=sales_manager (SalesManager). GM (role=master) receives ops escalations.
  const mgrs = await tx.query.users.findMany({
    where: and(eq(users.dealershipId, params.dealershipId), eq(users.role, 'sales_manager'), eq(users.isActive, true)),
    columns: {
      id: true,
      email: true,
      notificationEmail: true,
      notificationEmailVerifiedAt: true,
      notificationEmailHardBouncedAt: true,
      notificationEmailSpamComplaintAt: true,
      name: true,
    },
  });

  const requiredEmail = requiredManagerEmailEvents().has(eventType);

  const verifiedMgrs = mgrs.filter((u: any) => {
    const addr = u.notificationEmail || u.email;
    if (!addr) return false;
    if (!u.notificationEmailVerifiedAt) return false;
    if (u.notificationEmailHardBouncedAt) return false;
    if (u.notificationEmailSpamComplaintAt) return false;
    return true;
  });

  // Always create in-app notifications for managers.
  for (const mgr of mgrs) {
    const notificationKey = buildNotificationKey({
      dealerId: params.dealershipId,
      eventType,
      appointmentId: appt.id,
      recipientUserId: mgr.id,
      eventId,
    });

    const insertedNotif = await tx
      .insert(notifications)
      .values({
        dealershipId: params.dealershipId,
        eventId,
        recipientUserId: mgr.id,
        notificationKey,
        title,
        body,
        deepLink,
      })
      .onConflictDoNothing()
      .returning();

    const notifId = insertedNotif[0]?.id as string | undefined;

    if (!requiredEmail || !notifId) continue;

    const toEmail = mgr.notificationEmail || mgr.email;

    // If recipient isn't verified, record a failed outbox entry (audit) and create an ops alert for GM.
    const verified = verifiedMgrs.some((x: any) => x.id === mgr.id);

    const sendKey = buildSendKey(notificationKey, 'EMAIL');

    if (!toEmail || !verified) {
      await tx
        .insert(emailOutbox)
        .values({
          dealershipId: params.dealershipId,
          notificationId: notifId,
          sendKey,
          toEmail: toEmail || 'missing',
          toUserId: mgr.id,
          subject: `[FAILED: EMAIL_UNVERIFIED] ${dealer.name} — ${title}`,
          html: `<pre>${body}</pre>`,
          text: body,
          status: 'FAILED',
          attemptCount: 1,
          maxAttempts: 1,
          nextAttemptAt: new Date(),
          lastError: !toEmail ? 'EMAIL_MISSING' : 'EMAIL_UNVERIFIED',
          updatedAt: new Date(),
        })
        .onConflictDoNothing();

      await createOpsAlert(tx, {
        dealershipId: params.dealershipId,
        eventId,
        appointmentId: appt.id,
        summary: `Manager email not verified — required for appointment notifications`,
        body: `Required manager email could not be sent for: ${title}\nMissing/Unverified: ${mgr.name} (${toEmail || 'no email'})\n\nFix this in Settings → Manager emails.`,
        deepLink: `${getDashboardUrl()}/manager/notifications/settings`,
      });

      continue;
    }

    await tx
      .insert(emailOutbox)
      .values({
        dealershipId: params.dealershipId,
        notificationId: notifId,
        sendKey,
        toEmail,
        toUserId: mgr.id,
        subject: `${dealer.name} — ${title}`,
        html: buildAppointmentEmailHtml({
          dealerName: dealer.name,
          title,
          body,
          deepLink,
        }),
        text: body,
        status: 'PENDING',
        nextAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }

  // Policy: if no verified manager email exists, allow booking but require escalation email.
  if (requiredEmail && verifiedMgrs.length === 0) {
    if (!params.escalationEmail) {
      // Nothing else we can do besides in-app + ops alert (already created above).
      return;
    }

    // Create a best-effort email to the provided escalation address.
    const notificationKey = `${params.dealershipId}:${eventType}:${appt.id}:ESCALATION:${eventId}`;

    const insertedEscNotif = await tx
      .insert(notifications)
      .values({
        dealershipId: params.dealershipId,
        eventId,
        recipientUserId: mgrs[0]?.id ?? (await getDealerMasterUserId(tx, params.dealershipId)) ?? 0,
        notificationKey,
        title: `ESCALATION: ${title}`,
        body: `No verified manager email exists. Escalation email requested to: ${params.escalationEmail}\n\n${body}`,
        deepLink,
      })
      .onConflictDoNothing()
      .returning();

    const escNotifId = insertedEscNotif[0]?.id as string | undefined;
    if (!escNotifId) return;

    const sendKey = buildSendKey(notificationKey, 'EMAIL');
    await tx
      .insert(emailOutbox)
      .values({
        dealershipId: params.dealershipId,
        notificationId: escNotifId,
        sendKey,
        toEmail: params.escalationEmail,
        toUserId: null,
        subject: `${dealer.name} — ${title} [ESCALATION]`,
        html: buildAppointmentEmailHtml({
          dealerName: dealer.name,
          title: `${title} [ESCALATION]`,
          body,
          deepLink,
        }),
        text: body,
        status: 'PENDING',
        nextAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing();
  }
}

async function getDealerMasterUserId(tx: any, dealershipId: number): Promise<number | null> {
  const master = await tx.query.users.findFirst({
    where: and(eq(users.dealershipId, dealershipId), eq(users.role, 'master'), eq(users.isActive, true)),
    columns: { id: true },
  });
  return master?.id ?? null;
}

async function createOpsAlert(
  tx: any,
  params: { dealershipId: number; eventId: string; appointmentId: string; summary: string; body: string; deepLink: string }
) {
  const masters = await tx.query.users.findMany({
    where: and(eq(users.dealershipId, params.dealershipId), inArray(users.role, ['master', 'sales_manager']), eq(users.isActive, true)),
    columns: { id: true },
  });

  for (const u of masters) {
    const notificationKey = `${params.dealershipId}:OPS:${params.eventId}:${u.id}:${params.appointmentId}`;
    await tx
      .insert(notifications)
      .values({
        dealershipId: params.dealershipId,
        eventId: params.eventId,
        recipientUserId: u.id,
        notificationKey,
        title: params.summary,
        body: params.body,
        deepLink: params.deepLink,
      })
      .onConflictDoNothing();
  }
}

function buildAppointmentEmailHtml(params: { dealerName: string; title: string; body: string; deepLink: string }): string {
  const escaped = params.body
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

  return `<!doctype html>
<html>
<head><meta charset="utf-8" /></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f6f7f9; padding:24px;">
  <div style="max-width:640px;margin:0 auto;background:white;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
    <div style="padding:18px 20px;background:#111827;color:#fff;">
      <div style="font-size:12px;opacity:.9;">${params.dealerName}</div>
      <div style="font-size:18px;font-weight:700;">${params.title}</div>
    </div>
    <div style="padding:20px;color:#111827;">
      <pre style="white-space:pre-wrap;font-family:inherit;line-height:1.4;margin:0;">${escaped}</pre>
      <div style="margin-top:18px;">
        <a href="${params.deepLink}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:600;">View appointment</a>
      </div>
    </div>
    <div style="padding:14px 20px;background:#f9fafb;color:#6b7280;font-size:12px;">
      This is a transactional notification from LotView.
    </div>
  </div>
</body>
</html>`;
}
