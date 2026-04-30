/**
 * Calendar Sync Service
 * Syncs Lotview appointments with Google Calendar and Microsoft Outlook.
 * Two-way sync: changes in either system are reflected in the other.
 */

import { logInfo, logError, logWarn } from "../error-utils";
import { storage } from "../storage";
import { getRedisClient } from "./redis";

// ---- Types ----

export type CalendarProvider = "google" | "outlook";

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
  attendees: Array<{ email: string; name?: string }>;
  status: "confirmed" | "tentative" | "cancelled";
  provider: CalendarProvider;
  externalId?: string; // ID from Google/Outlook
}

export interface SyncConfig {
  dealershipId: number;
  provider: CalendarProvider;
  accessToken: string;
  refreshToken?: string;
  calendarId?: string; // Google calendar ID
  syncDirection?: "bidirectional" | "to_external" | "to_lotview";
  lastSyncAt?: Date;
}

// ---- Google Calendar ----

/**
 * Create or update a Google Calendar event.
 */
export async function syncToGoogleCalendar(
  config: SyncConfig,
  event: CalendarEvent
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  try {
    const url = event.externalId
      ? `https://www.googleapis.com/calendar/v3/calendars/${config.calendarId || "primary"}/events/${event.externalId}`
      : `https://www.googleapis.com/calendar/v3/calendars/${config.calendarId || "primary"}/events`;

    const method = event.externalId ? "PUT" : "POST";

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.description,
        start: { dateTime: event.startTime.toISOString() },
        end: { dateTime: event.endTime.toISOString() },
        location: event.location,
        attendees: event.attendees.map((a) => ({ email: a.email, displayName: a.name })),
        status: event.status === "cancelled" ? "cancelled" : "confirmed",
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 60 },
            { method: "popup", minutes: 15 },
          ],
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      // Token expired? Try refresh
      if (response.status === 401) {
        return { success: false, error: "Token expired, needs re-auth" };
      }
      return { success: false, error: `Google Calendar API error: ${error}` };
    }

    const data = await response.json();
    return { success: true, externalId: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Delete a Google Calendar event.
 */
export async function deleteGoogleCalendarEvent(
  config: SyncConfig,
  externalId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${config.calendarId || "primary"}/events/${externalId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${config.accessToken}` },
      }
    );

    if (!response.ok && response.status !== 410) {
      // 410 = already deleted, that's fine
      return { success: false, error: `Delete failed: ${response.statusText}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ---- Microsoft Outlook ----

/**
 * Create or update an Outlook event via Microsoft Graph API.
 */
export async function syncToOutlook(
  config: SyncConfig,
  event: CalendarEvent
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  try {
    const url = event.externalId
      ? `https://graph.microsoft.com/v1.0/me/events/${event.externalId}`
      : "https://graph.microsoft.com/v1.0/me/events";

    const method = event.externalId ? "PATCH" : "POST";

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: event.title,
        body: { contentType: "HTML", content: event.description || "" },
        start: { dateTime: event.startTime.toISOString(), timeZone: "UTC" },
        end: { dateTime: event.endTime.toISOString(), timeZone: "UTC" },
        location: { displayName: event.location || "" },
        attendees: event.attendees.map((a) => ({
          emailAddress: { address: a.email, name: a.name || "" },
          type: "required",
        })),
        isCancelled: event.status === "cancelled",
        reminderMinutesBeforeStart: 15,
      }),
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: "Token expired, needs re-auth" };
      }
      const error = await response.text();
      return { success: false, error: `Outlook API error: ${error}` };
    }

    const data = await response.json();
    return { success: true, externalId: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// ---- Generic Sync Interface ----

/**
 * Sync a Lotview appointment to the connected calendar.
 */
export async function syncAppointment(
  config: SyncConfig,
  appointment: any
): Promise<{ success: boolean; externalId?: string; error?: string }> {
  const event: CalendarEvent = {
    id: String(appointment.id),
    title: appointment.title,
    description: appointment.description,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    location: appointment.location,
    attendees: appointment.customerEmail
      ? [{ email: appointment.customerEmail, name: appointment.customerName }]
      : [],
    status: appointment.status || "confirmed",
    provider: config.provider,
  };

  // Get existing external ID if previously synced
  const existing = await getSyncMapping(appointment.id, config.provider);
  if (existing) {
    event.externalId = existing.externalId;
  }

  let result: { success: boolean; externalId?: string; error?: string };

  switch (config.provider) {
    case "google":
      result = await syncToGoogleCalendar(config, event);
      break;
    case "outlook":
      result = await syncToOutlook(config, event);
      break;
    default:
      return { success: false, error: `Unknown provider: ${config.provider}` };
  }

  // Store sync mapping
  if (result.success && result.externalId) {
    await storeSyncMapping(appointment.id, config.provider, result.externalId);
  }

  return result;
}

/**
 * Send calendar invite to customer.
 */
export async function sendCalendarInvite(
  config: SyncConfig,
  appointment: {
    title: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    location?: string;
    customerEmail: string;
    customerName?: string;
  }
): Promise<{ success: boolean; error?: string }> {
  // Add customer as attendee in the calendar event
  const event: CalendarEvent = {
    id: "invite",
    title: appointment.title,
    description: appointment.description,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    location: appointment.location,
    attendees: [{ email: appointment.customerEmail, name: appointment.customerName }],
    status: "confirmed",
    provider: config.provider,
  };

  switch (config.provider) {
    case "google":
      return syncToGoogleCalendar(config, event);
    case "outlook":
      return syncToOutlook(config, event);
    default:
      return { success: false, error: `Unknown provider: ${config.provider}` };
  }
}

// ---- Sync Mapping Store ----

interface SyncMapping {
  appointmentId: number;
  provider: CalendarProvider;
  externalId: string;
  lastSyncedAt: Date;
}

async function storeSyncMapping(
  appointmentId: number,
  provider: CalendarProvider,
  externalId: string
): Promise<void> {
  const redis = getRedisClient();
  await redis.setex(
    `calendar:sync:${appointmentId}:${provider}`,
    86400 * 365, // 1 year
    JSON.stringify({ externalId, lastSyncedAt: new Date().toISOString() })
  );
}

async function getSyncMapping(
  appointmentId: number,
  provider: CalendarProvider
): Promise<SyncMapping | null> {
  const redis = getRedisClient();
  const data = await redis.get(`calendar:sync:${appointmentId}:${provider}`);
  if (!data) return null;
  const parsed = JSON.parse(data);
  return {
    appointmentId,
    provider,
    externalId: parsed.externalId,
    lastSyncedAt: new Date(parsed.lastSyncedAt),
  };
}

/**
 * Delete sync mapping when appointment is deleted.
 */
export async function deleteSyncMapping(
  appointmentId: number,
  provider: CalendarProvider
): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`calendar:sync:${appointmentId}:${provider}`);
}

// ---- Appointment Reminders ----

/**
 * Check for upcoming appointments and send reminders.
 * Call from scheduler every 15 minutes.
 */
export async function sendAppointmentReminders(..._args: unknown[]): Promise<{
  sent: number;
  errors: number;
}> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 30 * 60000); // 30 minutes from now
  const windowEnd = new Date(now.getTime() + 45 * 60000); // 45 minutes from now

  // Get appointments in the reminder window
  const appointments = await storage.getUpcomingAppointments?.(windowStart, windowEnd) || [];

  let sent = 0;
  let errors = 0;

  for (const appt of appointments) {
    try {
      // Check if we already sent a reminder
      const redis = getRedisClient();
      const reminded = await redis.get(`appt:reminded:${appt.id}`);
      if (reminded) continue;

      // Send SMS reminder via GHL
      const { sendSMS } = await import("./ghl-notifications");
      await sendSMS(appt.dealershipId, {
        to: appt.customerPhone || appt.customerEmail,
        message: `Reminder: You have an appointment at ${appt.startTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} for ${appt.title}. Location: ${appt.location || "dealership"}. Reply CONFIRM to confirm or CANCEL to cancel.`,
      });

      await redis.setex(`appt:reminded:${appt.id}`, 3600, "1");
      sent++;
    } catch (error) {
      errors++;
      logError(`[Calendar] Reminder failed for appointment ${appt.id}: ${error}`, error);
    }
  }

  return { sent, errors };
}
