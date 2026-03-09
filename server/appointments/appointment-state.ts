export type AppointmentStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'PENDING_CONFIRMATION'
  | 'BOOKED'
  | 'RESCHEDULE_REQUESTED'
  | 'RESCHEDULED'
  | 'CANCELLED_BY_BUYER'
  | 'CANCELLED_BY_DEALER'
  | 'NO_SHOW'
  | 'COMPLETED';

export type AppointmentType = 'IN_PERSON_VISIT' | 'TEST_DRIVE' | 'PHONE_CALL';

export type AppointmentAuditKind =
  | 'APPT_CREATED'
  | 'APPT_PROPOSED'
  | 'APPT_PENDING_CONFIRMATION'
  | 'APPT_BOOKED_AUTO'
  | 'APPT_BOOKED_MANUAL_CONFIRM'
  | 'APPT_RESCHEDULE_REQUESTED'
  | 'APPT_RESCHEDULED'
  | 'APPT_CANCELLED_BUYER'
  | 'APPT_CANCELLED_DEALER'
  | 'APPT_NO_SHOW'
  | 'APPT_COMPLETED'
  | 'APPT_REASSIGNED'
  | 'CALENDAR_SYNC_FAILED';

export type NotificationEventType =
  | 'APPOINTMENT_BOOKED_AUTO'
  | 'APPOINTMENT_BOOKED_MANUAL'
  | 'APPOINTMENT_PENDING_CONFIRMATION'
  | 'APPOINTMENT_RESCHEDULE_REQUESTED'
  | 'APPOINTMENT_RESCHEDULED'
  | 'APPOINTMENT_CANCELLED_BY_BUYER'
  | 'APPOINTMENT_CANCELLED_BY_DEALER'
  | 'APPOINTMENT_NO_SHOW'
  | 'APPOINTMENT_COMPLETED'
  | 'CALENDAR_SYNC_FAILED'
  | 'OPS_MANAGER_EMAIL_MISSING';

export function isTerminalStatus(s: AppointmentStatus): boolean {
  return (
    s === 'CANCELLED_BY_BUYER' ||
    s === 'CANCELLED_BY_DEALER' ||
    s === 'NO_SHOW' ||
    s === 'COMPLETED'
  );
}

export function assertAllowedTransition(from: AppointmentStatus, to: AppointmentStatus): void {
  const allowed: Record<AppointmentStatus, AppointmentStatus[]> = {
    DRAFT: ['PROPOSED'],
    PROPOSED: ['BOOKED', 'PENDING_CONFIRMATION'],
    PENDING_CONFIRMATION: ['BOOKED'],
    BOOKED: ['RESCHEDULE_REQUESTED', 'RESCHEDULED', 'CANCELLED_BY_BUYER', 'CANCELLED_BY_DEALER', 'NO_SHOW', 'COMPLETED'],
    RESCHEDULE_REQUESTED: ['RESCHEDULED', 'CANCELLED_BY_BUYER', 'CANCELLED_BY_DEALER'],
    RESCHEDULED: ['RESCHEDULE_REQUESTED', 'CANCELLED_BY_BUYER', 'CANCELLED_BY_DEALER', 'NO_SHOW', 'COMPLETED'],
    CANCELLED_BY_BUYER: [],
    CANCELLED_BY_DEALER: [],
    NO_SHOW: [],
    COMPLETED: [],
  };

  if (!allowed[from]?.includes(to)) {
    throw new Error(`Invalid appointment transition: ${from} -> ${to}`);
  }
}
