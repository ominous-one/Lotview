import { db } from '../db';
import { appointments, appointmentAuditEvents, dealerships, users, vehicles } from '@shared/schema';
import { and, eq, inArray, isNull, lt, gt, sql, or } from 'drizzle-orm';
import type { AppointmentStatus, AppointmentType, AppointmentAuditKind } from './appointment-state';
import { assertAllowedTransition } from './appointment-state';
import { createAppointmentNotifications } from '../notifications/notification-service';
import { createFollowUpTasksForAppointmentEvent } from '../follow-ups/follow-up-service';

export type Actor =
  | { actorType: 'SYSTEM' }
  | { actorType: 'USER'; actorUserId: number };

export interface CreateAppointmentInput {
  dealershipId: number;
  type: AppointmentType;
  status: AppointmentStatus; // typically BOOKED or PENDING_CONFIRMATION
  startAt: Date;
  endAt?: Date;
  timezone: string;
  ownerUserId?: number | null;
  vehicleId?: number | null;
  threadId?: number | null;
  leadName?: string | null;
  leadPhone?: string | null;
  leadEmail?: string | null;
  sourceChannel?: string;
  location?: string | null;
  notes?: string | null;
  idempotencyKey?: string | null;
  escalationEmail?: string | null; // required when no verified manager emails exist
}

function toIsoMinute(d: Date): string {
  const x = new Date(d);
  x.setSeconds(0, 0);
  return x.toISOString();
}

function hashToInt32(s: string): number {
  // Deterministic 32-bit hash for advisory locks.
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

export async function createAppointment(input: CreateAppointmentInput, actor: Actor) {
  if (!input.dealershipId) throw new Error('dealershipId required');
  if (!input.type) throw new Error('type required');
  if (!input.status) throw new Error('status required');
  if (!input.startAt) throw new Error('startAt required');
  if (!input.timezone) throw new Error('timezone required');

  // Ensure dealer timezone is configured (spec envelope).
  const dealer = await db.query.dealerships.findFirst({
    where: eq(dealerships.id, input.dealershipId),
    columns: { id: true, timezone: true, name: true },
  });
  if (!dealer) throw new Error('Dealership not found');
  if (!dealer.timezone) throw new Error('Dealership timezone not configured');

  const ownerUserId = input.ownerUserId ?? null;

  return db.transaction(async (tx) => {
    // Concurrency: prevent double-booking for same owner/time slot.
    // Use advisory xact locks keyed by (dealershipId, ownerUserId, startAtMinute).
    const lockKey1 = input.dealershipId;
    const lockKey2 = ownerUserId ? ownerUserId : 0;
    // pg_advisory_xact_lock(int,int) requires int4 keys. Use a deterministic int32 hash for the start minute.
    const lockKey3 = hashToInt32(`${input.dealershipId}:${toIsoMinute(input.startAt)}`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey1}, ${lockKey2});`);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey1}, ${lockKey3});`);

    // Idempotency: return existing appt if dealership+idempotencyKey already exists.
    if (input.idempotencyKey) {
      const existing = await tx.query.appointments.findFirst({
        where: and(eq(appointments.dealershipId, input.dealershipId), eq(appointments.idempotencyKey, input.idempotencyKey)),
      });
      if (existing) {
        return { appointment: existing, deduped: true };
      }
    }

    // Conflict detection (canonical calendar).
    // Overlap condition: start < otherEnd AND end > otherStart.
    // If end is null, assume 60 minutes.
    const startAt = input.startAt;
    const endAt = input.endAt ?? new Date(startAt.getTime() + 60 * 60 * 1000);

    if (ownerUserId) {
      const conflictRows = await tx
        .select({ id: appointments.id })
        .from(appointments)
        .where(
          and(
            eq(appointments.dealershipId, input.dealershipId),
            eq(appointments.ownerUserId, ownerUserId),
            sql`${appointments.status} NOT IN ('CANCELLED_BY_BUYER','CANCELLED_BY_DEALER','NO_SHOW','COMPLETED')`,
            lt(appointments.startAt, endAt),
            sql`COALESCE(${appointments.endAt}, ${appointments.startAt} + interval '60 minutes') > ${startAt}`
          )
        )
        .limit(1);

      if (conflictRows.length) {
        const err = new Error('Appointment conflict detected');
        (err as any).code = 'APPOINTMENT_CONFLICT';
        throw err;
      }
    }

    const inserted = await tx
      .insert(appointments)
      .values({
        dealershipId: input.dealershipId,
        type: input.type,
        status: input.status,
        startAt,
        endAt: input.endAt ?? null,
        timezone: input.timezone,
        ownerUserId,
        vehicleId: input.vehicleId ?? null,
        threadId: input.threadId ?? null,
        leadName: input.leadName ?? null,
        leadPhone: input.leadPhone ?? null,
        leadEmail: input.leadEmail ?? null,
        sourceChannel: input.sourceChannel ?? 'unknown',
        location: input.location ?? null,
        notes: input.notes ?? null,
        createdByType: actor.actorType,
        createdByUserId: actor.actorType === 'USER' ? actor.actorUserId : null,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .returning();

    const appointment = inserted[0];

    await tx.insert(appointmentAuditEvents).values({
      dealershipId: input.dealershipId,
      appointmentId: appointment.id,
      kind: 'APPT_CREATED' satisfies AppointmentAuditKind,
      actorType: actor.actorType,
      actorUserId: actor.actorType === 'USER' ? actor.actorUserId : null,
      reasonCodes: null,
      details: {
        status: appointment.status,
        type: appointment.type,
        startAt: appointment.startAt,
        endAt: appointment.endAt,
      },
      sourceThreadId: input.threadId ?? null,
    });

    // Create notifications / email outbox entries depending on status.
    const eventType =
      input.status === 'BOOKED'
        ? actor.actorType === 'SYSTEM'
          ? 'APPOINTMENT_BOOKED_AUTO'
          : 'APPOINTMENT_BOOKED_MANUAL'
        : input.status === 'PENDING_CONFIRMATION'
        ? 'APPOINTMENT_PENDING_CONFIRMATION'
        : undefined;

    await createAppointmentNotifications(tx, {
      dealershipId: input.dealershipId,
      appointmentId: appointment.id,
      eventType,
      eventKey: eventType ? `${eventType}:${appointment.id}:${input.idempotencyKey || toIsoMinute(startAt)}` : null,
      escalationEmail: input.escalationEmail ?? null,
    });

    if (eventType) {
      await createFollowUpTasksForAppointmentEvent(tx, {
        dealershipId: input.dealershipId,
        appointmentId: appointment.id,
        createdByType: actor.actorType,
        createdByUserId: actor.actorType === 'USER' ? actor.actorUserId : null,
        eventType,
      });
    }

    return { appointment, deduped: false };
  });
}

export async function transitionAppointment(params: {
  dealershipId: number;
  appointmentId: string;
  from: AppointmentStatus;
  to: AppointmentStatus;
  auditKind: AppointmentAuditKind;
  actor: Actor;
  idempotencyKey?: string | null;
  reasonCodes?: string[] | null;
  details?: any;
  targetStartAt?: Date | null; // for reschedules
  targetEndAt?: Date | null;
  escalationEmail?: string | null;
}) {
  return db.transaction(async (tx) => {
    const appt = await tx.query.appointments.findFirst({
      where: and(eq(appointments.id, params.appointmentId as any), eq(appointments.dealershipId, params.dealershipId)),
    });
    if (!appt) throw new Error('Appointment not found');

    assertAllowedTransition(appt.status as AppointmentStatus, params.to);

    // Lock appointment row (coarse) to avoid concurrent transitions.
    const apptLock = hashToInt32(params.appointmentId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${params.dealershipId}, ${apptLock});`);

    // Idempotency: if the same transition is retried, return current appointment.
    if (params.idempotencyKey) {
      const prior = await tx.query.appointmentAuditEvents.findFirst({
        where: and(
          eq(appointmentAuditEvents.dealershipId, params.dealershipId),
          eq(appointmentAuditEvents.appointmentId, appt.id),
          eq(appointmentAuditEvents.idempotencyKey, params.idempotencyKey)
        ),
        columns: { id: true },
      });
      if (prior) {
        const current = await tx.query.appointments.findFirst({
          where: and(eq(appointments.id, appt.id), eq(appointments.dealershipId, params.dealershipId)),
        });
        return current;
      }
    }

    const previousStartAt = appt.startAt as any as Date;
    const previousEndAt = (appt.endAt as any as Date | null) ?? null;

    let startAt = appt.startAt as any as Date;
    let endAt = appt.endAt as any as Date | null;

    if (params.to === 'RESCHEDULED') {
      if (!params.targetStartAt) throw new Error('targetStartAt required');
      startAt = params.targetStartAt;
      endAt = params.targetEndAt ?? null;

      if (appt.ownerUserId) {
        const proposedEnd = endAt ?? new Date(startAt.getTime() + 60 * 60 * 1000);

        const conflictRows = await tx
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.dealershipId, params.dealershipId),
              eq(appointments.ownerUserId, appt.ownerUserId),
              sql`${appointments.id} <> ${appt.id}`,
              sql`${appointments.status} NOT IN ('CANCELLED_BY_BUYER','CANCELLED_BY_DEALER','NO_SHOW','COMPLETED')`,
              lt(appointments.startAt, proposedEnd),
              sql`COALESCE(${appointments.endAt}, ${appointments.startAt} + interval '60 minutes') > ${startAt}`
            )
          )
          .limit(1);

        if (conflictRows.length) {
          const err = new Error('Appointment conflict detected');
          (err as any).code = 'APPOINTMENT_CONFLICT';
          throw err;
        }
      }
    }

    const updated = await tx
      .update(appointments)
      .set({
        status: params.to,
        startAt,
        endAt,
        updatedAt: new Date(),
      })
      .where(and(eq(appointments.id, appt.id), eq(appointments.dealershipId, params.dealershipId)))
      .returning();

    const next = updated[0];

    await tx.insert(appointmentAuditEvents).values({
      dealershipId: params.dealershipId,
      appointmentId: appt.id,
      kind: params.auditKind,
      actorType: params.actor.actorType,
      actorUserId: params.actor.actorType === 'USER' ? params.actor.actorUserId : null,
      idempotencyKey: params.idempotencyKey ?? null,
      reasonCodes: params.reasonCodes ?? null,
      details: {
        ...(params.details ?? {}),
        previousStatus: appt.status,
        nextStatus: params.to,
        previousStartAt,
        previousEndAt,
        nextStartAt: startAt,
        nextEndAt: endAt,
      },
      sourceThreadId: appt.threadId ?? null,
    });

    // Notifications per state transition.
    const eventType =
      params.to === 'RESCHEDULE_REQUESTED'
        ? 'APPOINTMENT_RESCHEDULE_REQUESTED'
        : params.to === 'RESCHEDULED'
        ? 'APPOINTMENT_RESCHEDULED'
        : params.to === 'CANCELLED_BY_BUYER'
        ? 'APPOINTMENT_CANCELLED_BY_BUYER'
        : params.to === 'CANCELLED_BY_DEALER'
        ? 'APPOINTMENT_CANCELLED_BY_DEALER'
        : params.to === 'NO_SHOW'
        ? 'APPOINTMENT_NO_SHOW'
        : params.to === 'COMPLETED'
        ? 'APPOINTMENT_COMPLETED'
        : params.to === 'BOOKED'
        ? params.actor.actorType === 'SYSTEM'
          ? 'APPOINTMENT_BOOKED_AUTO'
          : 'APPOINTMENT_BOOKED_MANUAL'
        : undefined;

    await createAppointmentNotifications(tx, {
      dealershipId: params.dealershipId,
      appointmentId: appt.id,
      eventType,
      eventKey: eventType ? `${eventType}:${appt.id}:${params.idempotencyKey || toIsoMinute(startAt)}` : null,
      context:
        eventType === 'APPOINTMENT_RESCHEDULED'
          ? { previousStartAt, previousEndAt }
          : eventType === 'APPOINTMENT_CANCELLED_BY_BUYER' || eventType === 'APPOINTMENT_CANCELLED_BY_DEALER'
          ? { cancelledStartAt: previousStartAt }
          : null,
      escalationEmail: params.escalationEmail ?? null,
    });

    if (eventType) {
      await createFollowUpTasksForAppointmentEvent(tx, {
        dealershipId: params.dealershipId,
        appointmentId: appt.id,
        createdByType: params.actor.actorType,
        createdByUserId: params.actor.actorType === 'USER' ? params.actor.actorUserId : null,
        eventType:
          eventType === 'APPOINTMENT_CANCELLED_BY_BUYER' || eventType === 'APPOINTMENT_CANCELLED_BY_DEALER'
            ? 'APPOINTMENT_CANCELLED'
            : (eventType as any),
      });
    }

    return next;
  });
}
