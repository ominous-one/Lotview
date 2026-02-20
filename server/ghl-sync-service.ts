import { db } from './db';
import { storage } from './storage';
import { createGhlApiService } from './ghl-api-service';
import { ghlContactSync, ghlAppointmentSync, ghlConfig } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { logError, logInfo } from './error-utils';

interface SyncResult {
  success: boolean;
  contactsSynced?: number;
  appointmentsSynced?: number;
  errors?: string[];
}

export function createGhlSyncService(dealershipId: number) {
  const ghlService = createGhlApiService(dealershipId);

  async function syncContactToGhl(pbsContactId: string, contactData: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    source?: string;
    tags?: string[];
  }): Promise<{ success: boolean; ghlContactId?: string; error?: string }> {
    try {
      const config = await storage.getGhlConfig(dealershipId);
      if (!config?.syncContacts) {
        return { success: false, error: 'Contact sync not enabled' };
      }

      const existingSync = await db.select()
        .from(ghlContactSync)
        .where(and(
          eq(ghlContactSync.dealershipId, dealershipId),
          eq(ghlContactSync.pbsContactId, pbsContactId)
        ))
        .limit(1);

      if (existingSync.length > 0 && existingSync[0].ghlContactId) {
        const response = await ghlService.updateContact(existingSync[0].ghlContactId, contactData);
        if (response.success) {
          await storage.updateGhlContactSync(existingSync[0].id, dealershipId, {
            syncStatus: 'synced',
            syncDirection: 'pbs_to_ghl'
          });
          return { success: true, ghlContactId: existingSync[0].ghlContactId };
        }
        return { success: false, error: response.error || 'Failed to update GHL contact' };
      }

      const response = await ghlService.createContact(contactData);
      if (response.success && response.data?.id) {
        await storage.createGhlContactSync({
          dealershipId,
          ghlContactId: response.data.id,
          pbsContactId,
          email: contactData.email,
          phone: contactData.phone,
          syncStatus: 'synced',
          syncDirection: 'pbs_to_ghl'
        });
        return { success: true, ghlContactId: response.data.id };
      }

      return { success: false, error: response.error || 'Failed to create GHL contact' };
    } catch (error) {
      logError(`Error syncing contact ${pbsContactId} to GHL`, error, { dealershipId, pbsContactId });
      return { success: false, error: String(error) };
    }
  }

  async function syncAppointmentToGhl(pbsAppointmentId: string, appointmentData: {
    calendarId: string;
    contactId: string;
    title: string;
    startTime: string;
    endTime?: string;
    status?: string;
    notes?: string;
  }): Promise<{ success: boolean; ghlAppointmentId?: string; error?: string }> {
    try {
      const config = await storage.getGhlConfig(dealershipId);
      if (!config?.syncAppointments) {
        return { success: false, error: 'Appointment sync not enabled' };
      }

      const existingSync = await db.select()
        .from(ghlAppointmentSync)
        .where(and(
          eq(ghlAppointmentSync.dealershipId, dealershipId),
          eq(ghlAppointmentSync.pbsAppointmentId, pbsAppointmentId)
        ))
        .limit(1);

      if (existingSync.length > 0 && existingSync[0].ghlAppointmentId) {
        const response = await ghlService.updateCalendarEvent(
          existingSync[0].ghlAppointmentId,
          {
            calendarId: appointmentData.calendarId,
            title: appointmentData.title,
            startTime: appointmentData.startTime,
            endTime: appointmentData.endTime,
            appointmentStatus: appointmentData.status
          }
        );
        if (response.success) {
          await storage.updateGhlAppointmentSync(existingSync[0].id, dealershipId, {
            syncStatus: 'synced',
            syncDirection: 'pbs_to_ghl',
            status: appointmentData.status
          });
          return { success: true, ghlAppointmentId: existingSync[0].ghlAppointmentId };
        }
        return { success: false, error: response.error || 'Failed to update GHL appointment' };
      }

      const response = await ghlService.createCalendarEvent({
        calendarId: appointmentData.calendarId,
        contactId: appointmentData.contactId,
        title: appointmentData.title,
        startTime: appointmentData.startTime,
        endTime: appointmentData.endTime,
        appointmentStatus: appointmentData.status || 'confirmed'
      });
      if (response.success && response.data?.id) {
        await storage.createGhlAppointmentSync({
          dealershipId,
          ghlAppointmentId: response.data.id,
          ghlCalendarId: appointmentData.calendarId,
          ghlContactId: appointmentData.contactId,
          pbsAppointmentId,
          scheduledStart: new Date(appointmentData.startTime),
          scheduledEnd: appointmentData.endTime ? new Date(appointmentData.endTime) : undefined,
          title: appointmentData.title,
          status: appointmentData.status,
          syncStatus: 'synced',
          syncDirection: 'pbs_to_ghl',
          appointmentType: 'sales'
        });
        return { success: true, ghlAppointmentId: response.data.id };
      }

      return { success: false, error: response.error || 'Failed to create GHL appointment' };
    } catch (error) {
      logError(`Error syncing appointment ${pbsAppointmentId} to GHL`, error, { dealershipId, pbsAppointmentId });
      return { success: false, error: String(error) };
    }
  }

  async function syncPendingContacts(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const pendingContacts = await db.select()
        .from(ghlContactSync)
        .where(and(
          eq(ghlContactSync.dealershipId, dealershipId),
          eq(ghlContactSync.syncStatus, 'pending_ghl')
        ))
        .limit(100);

      for (const sync of pendingContacts) {
        if (!sync.pbsContactId) continue;

        try {
          const result = await syncContactToGhl(sync.pbsContactId, {
            email: sync.email || undefined,
            phone: sync.phone || undefined
          });

          if (result.success) {
            synced++;
          } else {
            errors.push(`Contact ${sync.pbsContactId}: ${result.error}`);
            await storage.updateGhlContactSync(sync.id, dealershipId, {
              syncStatus: 'error',
              syncError: result.error
            });
          }
        } catch (error) {
          errors.push(`Contact ${sync.pbsContactId}: ${String(error)}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to fetch pending contacts: ${String(error)}`);
    }

    return { synced, errors };
  }

  async function syncPendingAppointments(): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const pendingAppointments = await db.select()
        .from(ghlAppointmentSync)
        .where(and(
          eq(ghlAppointmentSync.dealershipId, dealershipId),
          eq(ghlAppointmentSync.syncStatus, 'pending_ghl')
        ))
        .limit(100);

      for (const sync of pendingAppointments) {
        if (!sync.pbsAppointmentId || !sync.ghlCalendarId || !sync.ghlContactId) continue;

        try {
          const result = await syncAppointmentToGhl(sync.pbsAppointmentId, {
            calendarId: sync.ghlCalendarId,
            contactId: sync.ghlContactId,
            title: sync.title || 'Appointment',
            startTime: sync.scheduledStart.toISOString(),
            endTime: sync.scheduledEnd?.toISOString(),
            status: sync.status || 'confirmed'
          });

          if (result.success) {
            synced++;
          } else {
            errors.push(`Appointment ${sync.pbsAppointmentId}: ${result.error}`);
            await storage.updateGhlAppointmentSync(sync.id, dealershipId, {
              syncStatus: 'error',
              syncError: result.error
            });
          }
        } catch (error) {
          errors.push(`Appointment ${sync.pbsAppointmentId}: ${String(error)}`);
        }
      }
    } catch (error) {
      errors.push(`Failed to fetch pending appointments: ${String(error)}`);
    }

    return { synced, errors };
  }

  async function createOpportunity(data: {
    contactId: string;
    pipelineId: string;
    stageId: string;
    name: string;
    value?: number;
    status?: string;
    vehicleInterest?: {
      make: string;
      model: string;
      year: number;
      vin?: string;
    };
  }): Promise<{ success: boolean; opportunityId?: string; error?: string }> {
    try {
      const config = await storage.getGhlConfig(dealershipId);
      if (!config?.syncOpportunities) {
        return { success: false, error: 'Opportunity sync not enabled' };
      }

      const response = await ghlService.createOpportunity({
        contactId: data.contactId,
        pipelineId: data.pipelineId,
        pipelineStageId: data.stageId,
        name: data.name,
        monetaryValue: data.value,
        status: data.status
      });

      if (response.success && response.data?.id) {
        return { success: true, opportunityId: response.data.id };
      }

      return { success: false, error: response.error || 'Failed to create opportunity' };
    } catch (error) {
      logError('Error creating GHL opportunity', error, { dealershipId });
      return { success: false, error: String(error) };
    }
  }

  async function runFullSync(): Promise<SyncResult> {
    const errors: string[] = [];
    let contactsSynced = 0;
    let appointmentsSynced = 0;

    try {
      const account = await storage.getGhlAccountByDealership(dealershipId);
      if (!account || !account.isActive) {
        return { success: false, errors: ['GHL account not connected or inactive'] };
      }

      const config = await storage.getGhlConfig(dealershipId);
      if (!config) {
        return { success: false, errors: ['GHL configuration not found'] };
      }

      if (config.syncContacts) {
        const contactResult = await syncPendingContacts();
        contactsSynced = contactResult.synced;
        errors.push(...contactResult.errors);
      }

      if (config.syncAppointments) {
        const appointmentResult = await syncPendingAppointments();
        appointmentsSynced = appointmentResult.synced;
        errors.push(...appointmentResult.errors);
      }

      return {
        success: errors.length === 0,
        contactsSynced,
        appointmentsSynced,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      logError('Error running GHL full sync', error, { dealershipId });
      return { success: false, errors: [String(error)] };
    }
  }

  async function queueContactForSync(pbsContactId: string, contactData: {
    email?: string;
    phone?: string;
  }): Promise<void> {
    const existingSync = await db.select()
      .from(ghlContactSync)
      .where(and(
        eq(ghlContactSync.dealershipId, dealershipId),
        eq(ghlContactSync.pbsContactId, pbsContactId)
      ))
      .limit(1);

    if (existingSync.length > 0) {
      await storage.updateGhlContactSync(existingSync[0].id, dealershipId, {
        syncStatus: 'pending_ghl',
        email: contactData.email,
        phone: contactData.phone
      });
    } else {
      await storage.createGhlContactSync({
        dealershipId,
        ghlContactId: '', 
        pbsContactId,
        email: contactData.email,
        phone: contactData.phone,
        syncStatus: 'pending_ghl',
        syncDirection: 'pbs_to_ghl'
      });
    }
  }

  async function queueAppointmentForSync(pbsAppointmentId: string, appointmentData: {
    calendarId: string;
    contactId: string;
    scheduledStart: Date;
    scheduledEnd?: Date;
    title?: string;
    status?: string;
  }): Promise<void> {
    const existingSync = await db.select()
      .from(ghlAppointmentSync)
      .where(and(
        eq(ghlAppointmentSync.dealershipId, dealershipId),
        eq(ghlAppointmentSync.pbsAppointmentId, pbsAppointmentId)
      ))
      .limit(1);

    if (existingSync.length > 0) {
      await storage.updateGhlAppointmentSync(existingSync[0].id, dealershipId, {
        syncStatus: 'pending_ghl',
        ghlCalendarId: appointmentData.calendarId,
        ghlContactId: appointmentData.contactId,
        scheduledStart: appointmentData.scheduledStart,
        scheduledEnd: appointmentData.scheduledEnd,
        title: appointmentData.title,
        status: appointmentData.status
      });
    } else {
      await storage.createGhlAppointmentSync({
        dealershipId,
        ghlAppointmentId: '',
        ghlCalendarId: appointmentData.calendarId,
        ghlContactId: appointmentData.contactId,
        pbsAppointmentId,
        scheduledStart: appointmentData.scheduledStart,
        scheduledEnd: appointmentData.scheduledEnd,
        title: appointmentData.title,
        status: appointmentData.status,
        syncStatus: 'pending_ghl',
        syncDirection: 'pbs_to_ghl',
        appointmentType: 'sales'
      });
    }
  }

  return {
    syncContactToGhl,
    syncAppointmentToGhl,
    syncPendingContacts,
    syncPendingAppointments,
    createOpportunity,
    runFullSync,
    queueContactForSync,
    queueAppointmentForSync
  };
}

export async function runGhlSyncForAllDealerships(): Promise<void> {
  try {
    const configs = await db.select()
      .from(ghlConfig)
      .where(eq(ghlConfig.bidirectionalSync, true));

    for (const config of configs) {
      try {
        const account = await storage.getGhlAccountByDealership(config.dealershipId);
        if (!account || !account.isActive) continue;

        if (!config.syncContacts && !config.syncAppointments) continue;

        const syncService = createGhlSyncService(config.dealershipId);
        const result = await syncService.runFullSync();

        logInfo(`GHL sync completed for dealership ${config.dealershipId}`, {
          dealershipId: config.dealershipId,
          contactsSynced: result.contactsSynced,
          appointmentsSynced: result.appointmentsSynced,
          errorCount: result.errors?.length || 0
        });
      } catch (error) {
        logError(`GHL sync error for dealership ${config.dealershipId}`, error, { dealershipId: config.dealershipId });
      }
    }
  } catch (error) {
    logError('Error running GHL sync for all dealerships', error);
  }
}
