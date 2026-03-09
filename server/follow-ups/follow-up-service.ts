import { and, eq, isNull, sql } from 'drizzle-orm';
import { followUpTasks, appointments } from '@shared/schema';
import type { NotificationEventType } from '../appointments/appointment-state';

export type FollowUpTaskKind =
  | 'CONFIRM_APPOINTMENT'
  | 'DAY_OF_REMINDER'
  | 'NO_SHOW_FOLLOW_UP'
  | 'POST_VISIT_FOLLOW_UP'
  | 'CANCELLED_FOLLOW_UP'
  | 'NO_RESPONSE_FOLLOW_UP';

function hoursFrom(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}

function daysFrom(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

async function taskExists(tx: any, params: { dealershipId: number; appointmentId: string; kind: FollowUpTaskKind; dueAt: Date | null }): Promise<boolean> {
  const row = await tx.query.followUpTasks.findFirst({
    where: and(
      eq(followUpTasks.dealershipId, params.dealershipId),
      eq(followUpTasks.appointmentId, params.appointmentId as any),
      eq(followUpTasks.kind, params.kind),
      // If dueAt is null, match null; else match exact timestamp
      params.dueAt ? eq(followUpTasks.dueAt, params.dueAt) : isNull(followUpTasks.dueAt)
    ),
    columns: { id: true },
  });
  return !!row;
}

export async function createFollowUpTasksForAppointmentEvent(
  tx: any,
  params: {
    dealershipId: number;
    appointmentId: string;
    createdByType: 'SYSTEM' | 'USER';
    createdByUserId: number | null;
    eventType: NotificationEventType | 'APPOINTMENT_CANCELLED' | 'APPOINTMENT_NO_RESPONSE';
  }
): Promise<void> {
  const appt = await tx.query.appointments.findFirst({
    where: and(eq(appointments.id, params.appointmentId as any), eq(appointments.dealershipId, params.dealershipId)),
  });
  if (!appt) throw new Error('Appointment not found');

  const startAt = new Date(appt.startAt as any);
  const ownerUserId = appt.ownerUserId ?? null;

  const tasks: Array<{
    kind: FollowUpTaskKind;
    title: string;
    description: string;
    dueAt: Date | null;
  }> = [];

  if (params.eventType === 'APPOINTMENT_BOOKED_AUTO' || params.eventType === 'APPOINTMENT_BOOKED_MANUAL' || params.eventType === 'APPOINTMENT_RESCHEDULED') {
    // Spec: confirm 24h prior; day-of reminder 2h prior.
    tasks.push({
      kind: 'CONFIRM_APPOINTMENT',
      title: 'Confirm appointment',
      description: 'Confirm the appointment with the customer (call/text) and reconfirm details.',
      dueAt: hoursFrom(startAt, -24),
    });
    tasks.push({
      kind: 'DAY_OF_REMINDER',
      title: 'Day-of reminder',
      description: 'Send a reminder message on the day of the appointment.',
      dueAt: hoursFrom(startAt, -2),
    });
  }

  if (params.eventType === 'APPOINTMENT_NO_SHOW') {
    tasks.push({
      kind: 'NO_SHOW_FOLLOW_UP',
      title: 'No-show follow-up',
      description: 'Customer did not show. Follow up and attempt to reschedule.',
      dueAt: hoursFrom(new Date(), 2),
    });
  }

  if (params.eventType === 'APPOINTMENT_COMPLETED') {
    tasks.push({
      kind: 'POST_VISIT_FOLLOW_UP',
      title: 'Post-visit follow-up',
      description: 'Follow up after the visit (next business day) to move the deal forward.',
      dueAt: daysFrom(new Date(), 1),
    });
  }

  if (params.eventType === 'APPOINTMENT_CANCELLED' || params.eventType === 'APPOINTMENT_CANCELLED_BY_BUYER' || params.eventType === 'APPOINTMENT_CANCELLED_BY_DEALER') {
    tasks.push({
      kind: 'CANCELLED_FOLLOW_UP',
      title: 'Cancelled appointment follow-up',
      description: 'Appointment was cancelled. Follow up to preserve the lead and propose new options.',
      dueAt: hoursFrom(new Date(), 2),
    });
  }

  if (params.eventType === 'APPOINTMENT_NO_RESPONSE') {
    tasks.push({
      kind: 'NO_RESPONSE_FOLLOW_UP',
      title: 'No response follow-up',
      description: 'Customer has not responded. Follow up with a helpful message and next steps.',
      dueAt: hoursFrom(new Date(), 2),
    });
  }

  for (const t of tasks) {
    if (await taskExists(tx, { dealershipId: params.dealershipId, appointmentId: appt.id, kind: t.kind, dueAt: t.dueAt })) {
      continue;
    }

    await tx.insert(followUpTasks).values({
      dealershipId: params.dealershipId,
      appointmentId: appt.id,
      ownerUserId,
      kind: t.kind,
      status: 'OPEN',
      title: t.title,
      description: t.description,
      dueAt: t.dueAt,
      createdByType: params.createdByType,
      createdByUserId: params.createdByUserId,
      updatedAt: new Date(),
    });
  }
}
