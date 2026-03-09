import { db } from '../db';
import { appointments, appointmentAuditEvents } from '@shared/schema';
import { and, eq, sql } from 'drizzle-orm';
import type { Actor } from './appointment-service';

function hashToInt32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

export async function reassignAppointmentOwner(params: {
  dealershipId: number;
  appointmentId: string;
  newOwnerUserId: number | null;
  actor: Actor;
  reason: string;
  idempotencyKey?: string | null;
}) {
  return db.transaction(async (tx) => {
    const appt = await tx.query.appointments.findFirst({
      where: and(eq(appointments.id, params.appointmentId as any), eq(appointments.dealershipId, params.dealershipId)),
    });
    if (!appt) throw new Error('Appointment not found');

    const apptLock = hashToInt32(params.appointmentId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${params.dealershipId}, ${apptLock});`);

    if (params.idempotencyKey) {
      const prior = await tx.query.appointmentAuditEvents.findFirst({
        where: and(
          eq(appointmentAuditEvents.dealershipId, params.dealershipId),
          eq(appointmentAuditEvents.appointmentId, appt.id),
          eq(appointmentAuditEvents.idempotencyKey, params.idempotencyKey)
        ),
        columns: { id: true },
      });
      if (prior) return appt;
    }

    const updated = await tx
      .update(appointments)
      .set({ ownerUserId: params.newOwnerUserId, updatedAt: new Date() })
      .where(and(eq(appointments.id, appt.id), eq(appointments.dealershipId, params.dealershipId)))
      .returning();

    const next = updated[0];

    await tx.insert(appointmentAuditEvents).values({
      dealershipId: params.dealershipId,
      appointmentId: appt.id,
      kind: 'APPT_REASSIGNED',
      actorType: params.actor.actorType,
      actorUserId: params.actor.actorType === 'USER' ? params.actor.actorUserId : null,
      idempotencyKey: params.idempotencyKey ?? null,
      reasonCodes: ['USER_OVERRIDE'],
      details: {
        previousOwnerUserId: appt.ownerUserId,
        nextOwnerUserId: params.newOwnerUserId,
        reason: params.reason,
      },
      sourceThreadId: appt.threadId ?? null,
    });

    return next;
  });
}
