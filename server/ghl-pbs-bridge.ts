import { db } from './db';
import { storage } from './storage';
import { createGhlApiService } from './ghl-api-service';
import { createGhlSyncService } from './ghl-sync-service';
import { ghlContactSync, ghlAppointmentSync } from '@shared/schema';
import { eq, and, isNull } from 'drizzle-orm';

interface PbsContact {
  contactId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

interface PbsAppointment {
  appointmentId: string;
  contactId: string;
  title?: string;
  startTime: string;
  endTime?: string;
  type: 'sales' | 'service' | 'test_drive';
  status?: string;
  notes?: string;
}

interface SyncResult {
  success: boolean;
  synced: number;
  errors: string[];
}

export function createGhlPbsBridge(dealershipId: number) {
  const ghlService = createGhlApiService(dealershipId);
  const syncService = createGhlSyncService(dealershipId);

  async function syncPbsContactToGhl(pbsContact: PbsContact): Promise<{ success: boolean; ghlContactId?: string; error?: string }> {
    try {
      const config = await storage.getGhlConfig(dealershipId);
      if (!config?.syncContacts || !config.bidirectionalSync) {
        return { success: false, error: 'Bidirectional contact sync not enabled' };
      }

      const existingSync = await db.select()
        .from(ghlContactSync)
        .where(and(
          eq(ghlContactSync.dealershipId, dealershipId),
          eq(ghlContactSync.pbsContactId, pbsContact.contactId)
        ))
        .limit(1);

      if (existingSync.length > 0 && existingSync[0].ghlContactId) {
        const response = await ghlService.updateContact(existingSync[0].ghlContactId, {
          firstName: pbsContact.firstName,
          lastName: pbsContact.lastName,
          email: pbsContact.email,
          phone: pbsContact.phone,
          address1: pbsContact.address1,
          city: pbsContact.city,
          state: pbsContact.state,
          postalCode: pbsContact.postalCode,
          source: 'PBS DMS',
          tags: ['pbs-synced']
        });

        if (response.success) {
          await storage.updateGhlContactSync(existingSync[0].id, dealershipId, {
            syncStatus: 'synced',
            syncDirection: 'pbs_to_ghl'
          });
          return { success: true, ghlContactId: existingSync[0].ghlContactId };
        }
        return { success: false, error: response.error || 'Failed to update GHL contact' };
      }

      const response = await ghlService.createContact({
        firstName: pbsContact.firstName,
        lastName: pbsContact.lastName,
        email: pbsContact.email,
        phone: pbsContact.phone,
        address1: pbsContact.address1,
        city: pbsContact.city,
        state: pbsContact.state,
        postalCode: pbsContact.postalCode,
        source: 'PBS DMS',
        tags: ['pbs-synced']
      });

      if (response.success && response.data?.id) {
        await storage.createGhlContactSync({
          dealershipId,
          ghlContactId: response.data.id,
          pbsContactId: pbsContact.contactId,
          email: pbsContact.email,
          phone: pbsContact.phone,
          syncStatus: 'synced',
          syncDirection: 'pbs_to_ghl'
        });
        return { success: true, ghlContactId: response.data.id };
      }

      return { success: false, error: response.error || 'Failed to create GHL contact' };
    } catch (error) {
      console.error('Error syncing PBS contact to GHL:', error);
      return { success: false, error: String(error) };
    }
  }

  async function syncGhlContactToPbs(ghlContactId: string, ghlContact: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    address1?: string;
    city?: string;
    state?: string;
    postalCode?: string;
  }): Promise<{ success: boolean; pbsContactId?: string; error?: string }> {
    try {
      const config = await storage.getGhlConfig(dealershipId);
      if (!config?.syncContacts || !config.bidirectionalSync) {
        return { success: false, error: 'Bidirectional contact sync not enabled' };
      }

      const pbsConfig = await storage.getPbsConfig(dealershipId);
      if (!pbsConfig || !pbsConfig.isActive) {
        return { success: false, error: 'PBS DMS not configured or inactive' };
      }

      const existingSync = await db.select()
        .from(ghlContactSync)
        .where(and(
          eq(ghlContactSync.dealershipId, dealershipId),
          eq(ghlContactSync.ghlContactId, ghlContactId)
        ))
        .limit(1);

      if (existingSync.length > 0 && existingSync[0].pbsContactId) {
        const { createPbsApiService } = await import('./pbs-api-service');
        const pbsService = createPbsApiService(dealershipId);
        
        const result = await pbsService.contactChange(existingSync[0].pbsContactId, {
          FirstName: ghlContact.firstName,
          LastName: ghlContact.lastName,
          Email: ghlContact.email,
          Phone: ghlContact.phone,
          Address: ghlContact.address1,
          City: ghlContact.city,
          Province: ghlContact.state,
          PostalCode: ghlContact.postalCode
        });

        if (result.success) {
          await storage.updateGhlContactSync(existingSync[0].id, dealershipId, {
            syncStatus: 'synced',
            syncDirection: 'ghl_to_pbs'
          });
          return { success: true, pbsContactId: existingSync[0].pbsContactId };
        }
        return { success: false, error: result.error || 'Failed to update PBS contact' };
      }

      const { createPbsApiService } = await import('./pbs-api-service');
      const pbsService = createPbsApiService(dealershipId);
      
      const result = await pbsService.contactSave({
        FirstName: ghlContact.firstName,
        LastName: ghlContact.lastName,
        Email: ghlContact.email,
        Phone: ghlContact.phone,
        Address: ghlContact.address1,
        City: ghlContact.city,
        Province: ghlContact.state,
        PostalCode: ghlContact.postalCode
      });

      if (result.success && result.data?.ContactID) {
        await storage.createGhlContactSync({
          dealershipId,
          ghlContactId,
          pbsContactId: result.data.ContactID,
          email: ghlContact.email,
          phone: ghlContact.phone,
          syncStatus: 'synced',
          syncDirection: 'ghl_to_pbs'
        });
        return { success: true, pbsContactId: result.data.ContactID };
      }

      return { success: false, error: result.error || 'Failed to create PBS contact' };
    } catch (error) {
      console.error('Error syncing GHL contact to PBS:', error);
      return { success: false, error: String(error) };
    }
  }

  async function syncPbsAppointmentToGhl(pbsAppointment: PbsAppointment): Promise<{ success: boolean; ghlAppointmentId?: string; error?: string }> {
    try {
      const config = await storage.getGhlConfig(dealershipId);
      if (!config?.syncAppointments || !config.bidirectionalSync) {
        return { success: false, error: 'Bidirectional appointment sync not enabled' };
      }

      const calendarId = pbsAppointment.type === 'service' 
        ? config.serviceCalendarId 
        : config.salesCalendarId;

      if (!calendarId) {
        return { success: false, error: `No ${pbsAppointment.type} calendar configured` };
      }

      const contactSync = await db.select()
        .from(ghlContactSync)
        .where(and(
          eq(ghlContactSync.dealershipId, dealershipId),
          eq(ghlContactSync.pbsContactId, pbsAppointment.contactId)
        ))
        .limit(1);

      if (!contactSync.length || !contactSync[0].ghlContactId) {
        return { success: false, error: 'Contact not synced to GHL yet' };
      }

      const ghlContactId = contactSync[0].ghlContactId;

      const existingSync = await db.select()
        .from(ghlAppointmentSync)
        .where(and(
          eq(ghlAppointmentSync.dealershipId, dealershipId),
          eq(ghlAppointmentSync.pbsAppointmentId, pbsAppointment.appointmentId)
        ))
        .limit(1);

      if (existingSync.length > 0 && existingSync[0].ghlAppointmentId) {
        const response = await ghlService.updateCalendarEvent(existingSync[0].ghlAppointmentId, {
          title: pbsAppointment.title,
          startTime: pbsAppointment.startTime,
          endTime: pbsAppointment.endTime,
          appointmentStatus: pbsAppointment.status
        });

        if (response.success) {
          await storage.updateGhlAppointmentSync(existingSync[0].id, dealershipId, {
            syncStatus: 'synced',
            syncDirection: 'pbs_to_ghl',
            status: pbsAppointment.status
          });
          return { success: true, ghlAppointmentId: existingSync[0].ghlAppointmentId };
        }
        return { success: false, error: response.error || 'Failed to update GHL appointment' };
      }

      const response = await ghlService.createCalendarEvent({
        calendarId,
        contactId: ghlContactId,
        title: pbsAppointment.title || `${pbsAppointment.type} Appointment`,
        startTime: pbsAppointment.startTime,
        endTime: pbsAppointment.endTime,
        appointmentStatus: pbsAppointment.status || 'confirmed'
      });

      if (response.success && response.data?.id) {
        await storage.createGhlAppointmentSync({
          dealershipId,
          ghlAppointmentId: response.data.id,
          ghlCalendarId: calendarId,
          ghlContactId,
          pbsAppointmentId: pbsAppointment.appointmentId,
          pbsContactId: pbsAppointment.contactId,
          scheduledStart: new Date(pbsAppointment.startTime),
          scheduledEnd: pbsAppointment.endTime ? new Date(pbsAppointment.endTime) : undefined,
          title: pbsAppointment.title,
          status: pbsAppointment.status,
          appointmentType: pbsAppointment.type,
          syncStatus: 'synced',
          syncDirection: 'pbs_to_ghl'
        });
        return { success: true, ghlAppointmentId: response.data.id };
      }

      return { success: false, error: response.error || 'Failed to create GHL appointment' };
    } catch (error) {
      console.error('Error syncing PBS appointment to GHL:', error);
      return { success: false, error: String(error) };
    }
  }

  async function syncGhlAppointmentToPbs(ghlAppointmentId: string, ghlAppointment: {
    calendarId: string;
    contactId: string;
    title?: string;
    startTime: string;
    endTime?: string;
    status?: string;
  }): Promise<{ success: boolean; pbsAppointmentId?: string; error?: string }> {
    try {
      const config = await storage.getGhlConfig(dealershipId);
      if (!config?.syncAppointments || !config.bidirectionalSync) {
        return { success: false, error: 'Bidirectional appointment sync not enabled' };
      }

      const pbsConfig = await storage.getPbsConfig(dealershipId);
      if (!pbsConfig || !pbsConfig.isActive) {
        return { success: false, error: 'PBS DMS not configured or inactive' };
      }

      const contactSync = await db.select()
        .from(ghlContactSync)
        .where(and(
          eq(ghlContactSync.dealershipId, dealershipId),
          eq(ghlContactSync.ghlContactId, ghlAppointment.contactId)
        ))
        .limit(1);

      if (!contactSync.length || !contactSync[0].pbsContactId) {
        return { success: false, error: 'Contact not synced to PBS yet' };
      }

      const pbsContactId = contactSync[0].pbsContactId;
      const appointmentType = ghlAppointment.calendarId === config.serviceCalendarId ? 'service' : 'sales';

      const existingSync = await db.select()
        .from(ghlAppointmentSync)
        .where(and(
          eq(ghlAppointmentSync.dealershipId, dealershipId),
          eq(ghlAppointmentSync.ghlAppointmentId, ghlAppointmentId)
        ))
        .limit(1);

      const { createPbsApiService } = await import('./pbs-api-service');
      const pbsService = createPbsApiService(dealershipId);

      if (existingSync.length > 0 && existingSync[0].pbsAppointmentId) {
        const pbsApptId = existingSync[0].pbsAppointmentId;
        const result = appointmentType === 'service'
          ? await pbsService.appointmentChange(pbsApptId, {
              AppointmentDate: ghlAppointment.startTime,
              Status: ghlAppointment.status
            })
          : await pbsService.workplanAppointmentChange(pbsApptId, {
              AppointmentDate: ghlAppointment.startTime,
              AppointmentTime: ghlAppointment.startTime,
              Status: ghlAppointment.status
            });

        if (result.success) {
          await storage.updateGhlAppointmentSync(existingSync[0].id, dealershipId, {
            syncStatus: 'synced',
            syncDirection: 'ghl_to_pbs',
            status: ghlAppointment.status
          });
          return { success: true, pbsAppointmentId: pbsApptId };
        }
        return { success: false, error: result.error || 'Failed to update PBS appointment' };
      }

      const result = appointmentType === 'service'
        ? await pbsService.appointmentCreate({
            ContactID: pbsContactId,
            AppointmentDate: ghlAppointment.startTime,
            Notes: ghlAppointment.title
          })
        : await pbsService.workplanAppointmentCreate({
            ContactID: pbsContactId,
            AppointmentDate: ghlAppointment.startTime,
            AppointmentTime: ghlAppointment.startTime,
            Notes: ghlAppointment.title
          });

      const newApptId = result.data?.AppointmentID;
      if (result.success && newApptId) {
        await storage.createGhlAppointmentSync({
          dealershipId,
          ghlAppointmentId,
          ghlCalendarId: ghlAppointment.calendarId,
          ghlContactId: ghlAppointment.contactId,
          pbsAppointmentId: newApptId,
          pbsContactId,
          scheduledStart: new Date(ghlAppointment.startTime),
          scheduledEnd: ghlAppointment.endTime ? new Date(ghlAppointment.endTime) : undefined,
          title: ghlAppointment.title,
          status: ghlAppointment.status,
          appointmentType,
          syncStatus: 'synced',
          syncDirection: 'ghl_to_pbs'
        });
        return { success: true, pbsAppointmentId: newApptId };
      }

      return { success: false, error: result.error || 'Failed to create PBS appointment' };
    } catch (error) {
      console.error('Error syncing GHL appointment to PBS:', error);
      return { success: false, error: String(error) };
    }
  }

  async function processPendingPbsSyncs(): Promise<SyncResult> {
    const errors: string[] = [];
    let synced = 0;

    try {
      const pendingContacts = await db.select()
        .from(ghlContactSync)
        .where(and(
          eq(ghlContactSync.dealershipId, dealershipId),
          eq(ghlContactSync.syncStatus, 'pending_pbs')
        ))
        .limit(50);

      for (const sync of pendingContacts) {
        if (!sync.ghlContactId) continue;

        try {
          const ghlContact = await ghlService.getContact(sync.ghlContactId);
          if (ghlContact.success && ghlContact.data) {
            const result = await syncGhlContactToPbs(sync.ghlContactId, {
              firstName: ghlContact.data.firstName,
              lastName: ghlContact.data.lastName,
              email: ghlContact.data.email,
              phone: ghlContact.data.phone,
              address1: ghlContact.data.address1,
              city: ghlContact.data.city,
              state: ghlContact.data.state,
              postalCode: ghlContact.data.postalCode
            });

            if (result.success) {
              synced++;
            } else {
              errors.push(`Contact ${sync.ghlContactId}: ${result.error}`);
            }
          }
        } catch (error) {
          errors.push(`Contact ${sync.ghlContactId}: ${String(error)}`);
        }
      }

      const pendingAppointments = await db.select()
        .from(ghlAppointmentSync)
        .where(and(
          eq(ghlAppointmentSync.dealershipId, dealershipId),
          eq(ghlAppointmentSync.syncStatus, 'pending_pbs')
        ))
        .limit(50);

      for (const sync of pendingAppointments) {
        if (!sync.ghlAppointmentId || !sync.ghlCalendarId || !sync.ghlContactId) continue;

        try {
          const result = await syncGhlAppointmentToPbs(sync.ghlAppointmentId, {
            calendarId: sync.ghlCalendarId,
            contactId: sync.ghlContactId,
            title: sync.title || undefined,
            startTime: sync.scheduledStart.toISOString(),
            endTime: sync.scheduledEnd?.toISOString(),
            status: sync.status || undefined
          });

          if (result.success) {
            synced++;
          } else {
            errors.push(`Appointment ${sync.ghlAppointmentId}: ${result.error}`);
          }
        } catch (error) {
          errors.push(`Appointment ${sync.ghlAppointmentId}: ${String(error)}`);
        }
      }
    } catch (error) {
      errors.push(`Batch processing error: ${String(error)}`);
    }

    return { success: errors.length === 0, synced, errors };
  }

  async function getContactMapping(identifier: { ghlContactId?: string; pbsContactId?: string }): Promise<{
    ghlContactId?: string;
    pbsContactId?: string;
    lotviewLeadId?: number;
  } | null> {
    try {
      let sync;
      if (identifier.ghlContactId) {
        [sync] = await db.select()
          .from(ghlContactSync)
          .where(and(
            eq(ghlContactSync.dealershipId, dealershipId),
            eq(ghlContactSync.ghlContactId, identifier.ghlContactId)
          ))
          .limit(1);
      } else if (identifier.pbsContactId) {
        [sync] = await db.select()
          .from(ghlContactSync)
          .where(and(
            eq(ghlContactSync.dealershipId, dealershipId),
            eq(ghlContactSync.pbsContactId, identifier.pbsContactId)
          ))
          .limit(1);
      }

      if (!sync) return null;

      return {
        ghlContactId: sync.ghlContactId,
        pbsContactId: sync.pbsContactId || undefined,
        lotviewLeadId: sync.lotviewLeadId || undefined
      };
    } catch (error) {
      console.error('Error getting contact mapping:', error);
      return null;
    }
  }

  return {
    syncPbsContactToGhl,
    syncGhlContactToPbs,
    syncPbsAppointmentToGhl,
    syncGhlAppointmentToPbs,
    processPendingPbsSyncs,
    getContactMapping
  };
}
