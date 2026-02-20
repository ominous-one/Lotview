import { storage } from "./storage";
import { createGhlApiService, type GhlApiResponse } from "./ghl-api-service";
import { logInfo, logError, logWarn } from "./error-utils";
import type { 
  FollowUpSequence, 
  FollowUpQueue, 
  InsertFollowUpQueue,
  InsertAutomationLog,
  Dealership,
  AppointmentReminder,
  PbsAppointmentCache,
  PriceWatch,
  Vehicle
} from "@shared/schema";

interface SequenceStep {
  stepNumber: number;
  delayMinutes: number;
  messageType: 'sms' | 'email';
  templateText: string;
}

interface GhlSendMessageResponse {
  conversationId?: string;
  messageId?: string;
  message?: string;
}

export class AutomationService {
  private dealershipId: number;
  private ghlService: ReturnType<typeof createGhlApiService>;

  constructor(dealershipId: number) {
    this.dealershipId = dealershipId;
    this.ghlService = createGhlApiService(dealershipId);
  }

  async sendSMS(contactId: string, message: string): Promise<GhlApiResponse<GhlSendMessageResponse>> {
    const account = await storage.getGhlAccountByDealership(this.dealershipId);
    if (!account) {
      return { success: false, error: "No GHL account connected", errorCode: "NO_ACCOUNT" };
    }

    const tokenValid = await this.ensureValidToken();
    if (!tokenValid) {
      return { success: false, error: "Token refresh failed", errorCode: "TOKEN_EXPIRED" };
    }

    const refreshedAccount = await storage.getGhlAccountByDealership(this.dealershipId);
    if (!refreshedAccount) {
      return { success: false, error: "Account not found after refresh", errorCode: "NO_ACCOUNT" };
    }

    try {
      const response = await fetch("https://services.leadconnectorhq.com/conversations/messages", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${refreshedAccount.accessToken}`,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
        body: JSON.stringify({
          type: "SMS",
          contactId: contactId,
          message: message,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logError('[Automation] SMS send failed', null, { dealershipId: this.dealershipId, status: response.status, errorText });
        return { success: false, error: errorText, errorCode: `HTTP_${response.status}` };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logError('[Automation] SMS send error', error, { dealershipId: this.dealershipId });
      return { success: false, error: errorMessage, errorCode: "NETWORK_ERROR" };
    }
  }

  private async ensureValidToken(): Promise<boolean> {
    return await this.ghlService.refreshAccessToken();
  }

  async processDueFollowUps(): Promise<{ processed: number; successful: number; failed: number }> {
    logInfo('[Automation] Processing due follow-ups', { dealershipId: this.dealershipId });

    const dueItems = await storage.getDueFollowUpItems(this.dealershipId, 50);
    
    if (dueItems.length === 0) {
      return { processed: 0, successful: 0, failed: 0 };
    }

    logInfo('[Automation] Found due follow-ups', { dealershipId: this.dealershipId, count: dueItems.length });

    let successful = 0;
    let failed = 0;

    for (const item of dueItems) {
      try {
        await storage.updateFollowUpQueueItem(item.id, this.dealershipId, { status: 'processing' });

        const result = await this.processFollowUpItem(item);
        
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logError(`[Automation] Error processing item ${item.id}`, error, { dealershipId: this.dealershipId, itemId: item.id });
        
        await storage.updateFollowUpQueueItem(item.id, this.dealershipId, {
          status: 'failed',
          lastError: errorMessage,
        });

        await this.logAction({
          dealershipId: this.dealershipId,
          automationType: 'follow_up',
          actionType: 'failed',
          sourceTable: 'follow_up_queue',
          sourceId: item.id,
          contactId: item.contactId || undefined,
          contactName: item.contactName || undefined,
          contactPhone: item.contactPhone || undefined,
          success: false,
          errorMessage,
        });
      }
    }

    logInfo('[Automation] Follow-ups completed', { dealershipId: this.dealershipId, successful, failed });
    return { processed: dueItems.length, successful, failed };
  }

  private async processFollowUpItem(item: FollowUpQueue): Promise<{ success: boolean; error?: string }> {
    const sequence = await storage.getFollowUpSequenceById(item.sequenceId, this.dealershipId);
    if (!sequence) {
      await storage.updateFollowUpQueueItem(item.id, this.dealershipId, {
        status: 'cancelled',
        lastError: 'Sequence not found',
      });
      return { success: false, error: 'Sequence not found' };
    }

    let steps: SequenceStep[];
    try {
      steps = JSON.parse(sequence.steps);
    } catch {
      await storage.updateFollowUpQueueItem(item.id, this.dealershipId, {
        status: 'failed',
        lastError: 'Invalid sequence steps JSON',
      });
      return { success: false, error: 'Invalid sequence steps JSON' };
    }

    const currentStepData = steps.find(s => s.stepNumber === item.currentStep);
    if (!currentStepData) {
      await storage.updateFollowUpQueueItem(item.id, this.dealershipId, {
        status: 'failed',
        lastError: `Step ${item.currentStep} not found in sequence`,
      });
      return { success: false, error: `Step ${item.currentStep} not found` };
    }

    const personalizedMessage = this.personalizeMessage(currentStepData.templateText, item);

    let ghlContactId = item.contactId;

    if (!ghlContactId && item.contactPhone) {
      const searchResult = await this.ghlService.searchContacts({ phone: item.contactPhone });
      if (searchResult.success && searchResult.data?.contacts?.length) {
        ghlContactId = searchResult.data.contacts[0].id;
        await storage.updateFollowUpQueueItem(item.id, this.dealershipId, { contactId: ghlContactId });
      } else {
        const createResult = await this.ghlService.createContact({
          firstName: item.contactName?.split(' ')[0] || 'Customer',
          lastName: item.contactName?.split(' ').slice(1).join(' ') || '',
          phone: item.contactPhone,
          email: item.contactEmail || undefined,
          source: 'Lotview Automation',
        });
        
        if (createResult.success && createResult.data) {
          ghlContactId = createResult.data.id;
          await storage.updateFollowUpQueueItem(item.id, this.dealershipId, { contactId: ghlContactId });
        } else {
          await storage.updateFollowUpQueueItem(item.id, this.dealershipId, {
            status: 'failed',
            lastError: 'Failed to create GHL contact',
          });
          return { success: false, error: 'Failed to create GHL contact' };
        }
      }
    }

    if (!ghlContactId) {
      await storage.updateFollowUpQueueItem(item.id, this.dealershipId, {
        status: 'failed',
        lastError: 'No contact ID and no phone number to create contact',
      });
      return { success: false, error: 'No contact ID available' };
    }

    let sendResult: GhlApiResponse<GhlSendMessageResponse>;

    if (currentStepData.messageType === 'sms') {
      sendResult = await this.sendSMS(ghlContactId, personalizedMessage);
    } else {
      sendResult = { success: false, error: 'Email not yet implemented', errorCode: 'NOT_IMPLEMENTED' };
    }

    if (sendResult.success) {
      const isLastStep = item.currentStep >= item.totalSteps;
      
      if (isLastStep) {
        await storage.updateFollowUpQueueItem(item.id, this.dealershipId, {
          status: 'completed',
          lastSentAt: new Date(),
          ghlMessageId: sendResult.data?.messageId || undefined,
        });
      } else {
        const nextStep = steps.find(s => s.stepNumber === item.currentStep + 1);
        const delayMinutes = nextStep?.delayMinutes || 1440;
        const nextSendAt = new Date(Date.now() + delayMinutes * 60 * 1000);

        await storage.updateFollowUpQueueItem(item.id, this.dealershipId, {
          currentStep: item.currentStep + 1,
          nextSendAt,
          status: 'pending',
          lastSentAt: new Date(),
          ghlMessageId: sendResult.data?.messageId || undefined,
        });
      }

      await this.logAction({
        dealershipId: this.dealershipId,
        automationType: 'follow_up',
        actionType: 'sent',
        sourceTable: 'follow_up_queue',
        sourceId: item.id,
        contactId: ghlContactId,
        contactName: item.contactName || undefined,
        contactPhone: item.contactPhone || undefined,
        messageType: currentStepData.messageType,
        messageContent: personalizedMessage.substring(0, 500),
        success: true,
        externalId: sendResult.data?.messageId || undefined,
      });

      return { success: true };
    } else {
      await storage.updateFollowUpQueueItem(item.id, this.dealershipId, {
        status: 'failed',
        lastError: sendResult.error,
      });

      await this.logAction({
        dealershipId: this.dealershipId,
        automationType: 'follow_up',
        actionType: 'failed',
        sourceTable: 'follow_up_queue',
        sourceId: item.id,
        contactId: ghlContactId,
        contactName: item.contactName || undefined,
        contactPhone: item.contactPhone || undefined,
        messageType: currentStepData.messageType,
        messageContent: personalizedMessage.substring(0, 500),
        success: false,
        errorMessage: sendResult.error,
      });

      return { success: false, error: sendResult.error };
    }
  }

  private personalizeMessage(template: string, item: FollowUpQueue): string {
    let message = template;
    
    message = message.replace(/\{\{name\}\}/g, item.contactName || 'there');
    message = message.replace(/\{\{first_name\}\}/g, item.contactName?.split(' ')[0] || 'there');
    message = message.replace(/\{\{phone\}\}/g, item.contactPhone || '');
    message = message.replace(/\{\{email\}\}/g, item.contactEmail || '');

    if (item.metadata) {
      try {
        const metadata = JSON.parse(item.metadata);
        if (metadata.vehicleName) {
          message = message.replace(/\{\{vehicle\}\}/g, metadata.vehicleName);
          message = message.replace(/\{\{vehicle_name\}\}/g, metadata.vehicleName);
        }
        if (metadata.vehiclePrice) {
          message = message.replace(/\{\{price\}\}/g, `$${metadata.vehiclePrice.toLocaleString()}`);
        }
        if (metadata.dealershipName) {
          message = message.replace(/\{\{dealership\}\}/g, metadata.dealershipName);
        }
      } catch {
      }
    }

    return message;
  }

  async triggerFollowUp(params: {
    triggerType: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    sourceType: string;
    sourceId?: string;
    vehicleId?: number;
    metadata?: Record<string, unknown>;
  }): Promise<{ success: boolean; queueItemId?: number; error?: string }> {
    const activeSequences = await storage.getActiveFollowUpSequences(this.dealershipId);
    const matchingSequence = activeSequences.find(s => s.triggerType === params.triggerType);

    if (!matchingSequence) {
      logWarn('[Automation] No active sequence for trigger type', { dealershipId: this.dealershipId, triggerType: params.triggerType });
      return { success: false, error: 'No matching sequence found' };
    }

    if (params.contactPhone) {
      const existing = await storage.getPendingFollowUpsByContact(this.dealershipId, params.contactPhone);
      if (existing.length > 0) {
        return { success: false, error: 'Contact already in sequence' };
      }
    }

    let steps: SequenceStep[];
    try {
      steps = JSON.parse(matchingSequence.steps);
    } catch {
      return { success: false, error: 'Invalid sequence configuration' };
    }

    const firstStep = steps.find(s => s.stepNumber === 1);
    if (!firstStep) {
      return { success: false, error: 'No first step in sequence' };
    }

    const nextSendAt = new Date(Date.now() + firstStep.delayMinutes * 60 * 1000);

    const queueItem = await storage.createFollowUpQueueItem({
      dealershipId: this.dealershipId,
      sequenceId: matchingSequence.id,
      contactName: params.contactName || null,
      contactPhone: params.contactPhone || null,
      contactEmail: params.contactEmail || null,
      sourceType: params.sourceType,
      sourceId: params.sourceId || null,
      vehicleId: params.vehicleId || null,
      currentStep: 1,
      totalSteps: steps.length,
      nextSendAt,
      status: 'pending',
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });

    await this.logAction({
      dealershipId: this.dealershipId,
      automationType: 'follow_up',
      actionType: 'triggered',
      sourceTable: 'follow_up_queue',
      sourceId: queueItem.id,
      contactName: params.contactName || undefined,
      contactPhone: params.contactPhone || undefined,
      success: true,
      metadata: JSON.stringify({ triggerType: params.triggerType, sequenceId: matchingSequence.id }),
    });

    logInfo('[Automation] Created follow-up queue item', { dealershipId: this.dealershipId, queueItemId: queueItem.id, triggerType: params.triggerType });
    return { success: true, queueItemId: queueItem.id };
  }

  private async logAction(log: Omit<InsertAutomationLog, 'executedAt'>): Promise<void> {
    try {
      await storage.createAutomationLog(log as InsertAutomationLog);
    } catch (error) {
      logError('[Automation] Failed to log action', error, { dealershipId: this.dealershipId });
    }
  }

  async scanAndCreateAppointmentReminders(): Promise<{ created24h: number; created2h: number }> {
    logInfo('[Automation] Scanning PBS appointments for reminders', { dealershipId: this.dealershipId });

    const now = new Date();
    
    let created24h = 0;
    let created2h = 0;

    try {
      const upcomingAppointments = await storage.getUpcomingPbsAppointments(this.dealershipId, 48);
      
      if (upcomingAppointments.length === 0) {
        return { created24h: 0, created2h: 0 };
      }

      logInfo('[Automation] Found upcoming appointments', { dealershipId: this.dealershipId, count: upcomingAppointments.length });

      for (const appointment of upcomingAppointments) {
        if (!appointment.scheduledDate) continue;

        const appointmentTime = new Date(appointment.scheduledDate);

        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(appointment.payload);
        } catch {}

        const contactName = (payload.contactName as string) || (payload.firstName as string) || 'Customer';
        const rawPhone = (payload.contactPhone as string) || (payload.phone as string) || (payload.cellPhone as string);
        const contactPhone = this.normalizePhoneNumber(rawPhone);

        if (!contactPhone) {
          continue;
        }

        const existingReminders = await storage.getAppointmentRemindersByAppointment(
          this.dealershipId, 
          appointment.pbsAppointmentId
        );

        const has24hReminder = existingReminders.some(r => r.reminderType === '24h');
        const has2hReminder = existingReminders.some(r => r.reminderType === '2h');

        const scheduled24hSendAt = new Date(appointmentTime.getTime() - 24 * 60 * 60 * 1000);
        const scheduled2hSendAt = new Date(appointmentTime.getTime() - 2 * 60 * 60 * 1000);

        if (!has24hReminder && scheduled24hSendAt > now) {
          await storage.createAppointmentReminder({
            dealershipId: this.dealershipId,
            appointmentSource: 'pbs',
            appointmentId: appointment.pbsAppointmentId,
            appointmentType: appointment.appointmentType || 'other',
            appointmentTime: appointmentTime,
            contactId: appointment.pbsContactId || null,
            contactName: contactName,
            contactPhone: contactPhone,
            reminderType: '24h',
            reminderMinutesBefore: 24 * 60,
            scheduledSendAt: scheduled24hSendAt,
            status: 'pending',
          });
          created24h++;
        }

        if (!has2hReminder && scheduled2hSendAt > now) {
          await storage.createAppointmentReminder({
            dealershipId: this.dealershipId,
            appointmentSource: 'pbs',
            appointmentId: appointment.pbsAppointmentId,
            appointmentType: appointment.appointmentType || 'other',
            appointmentTime: appointmentTime,
            contactId: appointment.pbsContactId || null,
            contactName: contactName,
            contactPhone: contactPhone,
            reminderType: '2h',
            reminderMinutesBefore: 2 * 60,
            scheduledSendAt: scheduled2hSendAt,
            status: 'pending',
          });
          created2h++;
        }
      }

      logInfo('[Automation] Created appointment reminders', { dealershipId: this.dealershipId, created24h, created2h });
      return { created24h, created2h };

    } catch (error) {
      logError('[Automation] Error scanning appointments', error, { dealershipId: this.dealershipId });
      return { created24h, created2h };
    }
  }

  private normalizePhoneNumber(phone: string | undefined | null): string | null {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    } else if (digits.length > 10) {
      return `+${digits}`;
    }
    return null;
  }

  async processDueAppointmentReminders(): Promise<{ processed: number; successful: number; failed: number }> {
    logInfo('[Automation] Processing due appointment reminders', { dealershipId: this.dealershipId });

    const dueReminders = await storage.getDueAppointmentReminders(this.dealershipId, 50);
    
    if (dueReminders.length === 0) {
      return { processed: 0, successful: 0, failed: 0 };
    }

    logInfo('[Automation] Found due appointment reminders', { dealershipId: this.dealershipId, count: dueReminders.length });

    const dealership = await storage.getDealership(this.dealershipId);
    const dealershipName = dealership?.name || 'Your Dealership';

    let successful = 0;
    let failed = 0;

    for (const reminder of dueReminders) {
      try {
        const lockResult = await storage.lockAppointmentReminderForProcessing(reminder.id, this.dealershipId);
        
        if (!lockResult) {
          continue;
        }

        const result = await this.sendAppointmentReminder(reminder, dealershipName);
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logError('[Automation] Error processing reminder', error, { dealershipId: this.dealershipId, reminderId: reminder.id });
        
        try {
          await storage.updateAppointmentReminder(reminder.id, this.dealershipId, {
            status: 'failed',
            errorMessage,
          });
        } catch (e) {
          logError('[Automation] Failed to update reminder to failed', e, { dealershipId: this.dealershipId, reminderId: reminder.id });
        }
      }
    }

    logInfo('[Automation] Reminders completed', { dealershipId: this.dealershipId, successful, failed });
    return { processed: dueReminders.length, successful, failed };
  }

  private async sendAppointmentReminder(
    reminder: AppointmentReminder, 
    dealershipName: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!reminder.contactPhone) {
      try {
        await storage.updateAppointmentReminder(reminder.id, this.dealershipId, {
          status: 'failed',
          errorMessage: 'No phone number available',
        });
      } catch (e) {
        logError('[Automation] Failed to update reminder', e, { dealershipId: this.dealershipId, reminderId: reminder.id });
      }
      return { success: false, error: 'No phone number' };
    }

    let ghlContactId = reminder.contactId;

    if (!ghlContactId) {
      const searchResult = await this.ghlService.searchContacts({ phone: reminder.contactPhone });
      if (searchResult.success && searchResult.data?.contacts?.length) {
        ghlContactId = searchResult.data.contacts[0].id;
      } else {
        const createResult = await this.ghlService.createContact({
          firstName: reminder.contactName?.split(' ')[0] || 'Customer',
          lastName: reminder.contactName?.split(' ').slice(1).join(' ') || '',
          phone: reminder.contactPhone,
          source: 'Lotview Appointment Reminder',
        });
        
        if (createResult.success && createResult.data) {
          ghlContactId = createResult.data.id;
        } else {
          try {
            await storage.updateAppointmentReminder(reminder.id, this.dealershipId, {
              status: 'failed',
              errorMessage: 'Failed to create GHL contact',
            });
          } catch (e) {
            logError('[Automation] Failed to update reminder', e, { dealershipId: this.dealershipId, reminderId: reminder.id });
          }
          return { success: false, error: 'Failed to create GHL contact' };
        }
      }
    }

    const message = this.formatReminderMessage(reminder, dealershipName);

    const sendResult = await this.sendSMS(ghlContactId, message);

    if (sendResult.success) {
      try {
        await storage.updateAppointmentReminder(reminder.id, this.dealershipId, {
          status: 'sent',
          sentAt: new Date(),
          ghlMessageId: sendResult.data?.messageId || null,
          contactId: ghlContactId,
        });
      } catch (e) {
        logError('[Automation] Failed to update reminder to sent', e, { dealershipId: this.dealershipId, reminderId: reminder.id });
      }

      await this.logAction({
        dealershipId: this.dealershipId,
        automationType: 'appointment_reminder',
        actionType: 'sent',
        sourceTable: 'appointment_reminders',
        sourceId: reminder.id,
        contactId: ghlContactId,
        contactName: reminder.contactName || undefined,
        contactPhone: reminder.contactPhone || undefined,
        messageType: 'sms',
        messageContent: message.substring(0, 500),
        success: true,
        externalId: sendResult.data?.messageId || undefined,
      });

      return { success: true };
    } else {
      try {
        await storage.updateAppointmentReminder(reminder.id, this.dealershipId, {
          status: 'failed',
          errorMessage: sendResult.error,
        });
      } catch (e) {
        logError('[Automation] Failed to update reminder to failed', e, { dealershipId: this.dealershipId, reminderId: reminder.id });
      }

      await this.logAction({
        dealershipId: this.dealershipId,
        automationType: 'appointment_reminder',
        actionType: 'failed',
        sourceTable: 'appointment_reminders',
        sourceId: reminder.id,
        contactId: ghlContactId || undefined,
        contactName: reminder.contactName || undefined,
        contactPhone: reminder.contactPhone || undefined,
        messageType: 'sms',
        messageContent: message.substring(0, 500),
        success: false,
        errorMessage: sendResult.error,
      });

      return { success: false, error: sendResult.error };
    }
  }

  private formatReminderMessage(reminder: AppointmentReminder, dealershipName: string): string {
    const firstName = reminder.contactName?.split(' ')[0] || 'there';
    const appointmentTime = new Date(reminder.appointmentTime);
    
    const timeStr = appointmentTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    const dateStr = appointmentTime.toLocaleDateString('en-US', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric' 
    });

    const appointmentLabel = reminder.appointmentType === 'service' 
      ? 'service appointment' 
      : reminder.appointmentType === 'sales' 
        ? 'sales appointment'
        : 'appointment';

    if (reminder.reminderType === '24h') {
      return `Hi ${firstName}! This is a friendly reminder from ${dealershipName} about your ${appointmentLabel} tomorrow, ${dateStr} at ${timeStr}. We look forward to seeing you! Reply STOP to opt out.`;
    } else {
      return `Hi ${firstName}! Just a reminder that your ${appointmentLabel} at ${dealershipName} is coming up in about 2 hours (${timeStr}). See you soon! Reply STOP to opt out.`;
    }
  }

  async processPriceDropAlerts(): Promise<{ processed: number; successful: number; failed: number }> {
    logInfo('[Automation] Processing price drop alerts', { dealershipId: this.dealershipId });

    const priceDrops = await storage.getPriceWatchesWithPriceDrops(this.dealershipId);
    
    if (priceDrops.length === 0) {
      return { processed: 0, successful: 0, failed: 0 };
    }

    logInfo('[Automation] Found price drops to alert', { dealershipId: this.dealershipId, count: priceDrops.length });

    const dealership = await storage.getDealership(this.dealershipId);
    const dealershipName = dealership?.name || 'Your Dealership';

    let successful = 0;
    let failed = 0;

    for (const priceDropWatch of priceDrops) {
      try {
        const result = await this.sendPriceDropAlert(priceDropWatch, dealershipName);
        if (result.success) {
          successful++;
        } else {
          failed++;
        }
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logError('[Automation] Error processing price drop alert', error, { dealershipId: this.dealershipId, watchId: priceDropWatch.id });
        
        await this.logAction({
          dealershipId: this.dealershipId,
          automationType: 'price_drop',
          actionType: 'failed',
          sourceTable: 'price_watches',
          sourceId: priceDropWatch.id,
          contactName: priceDropWatch.contactName || undefined,
          contactPhone: priceDropWatch.contactPhone || undefined,
          success: false,
          errorMessage,
        });
      }
    }

    logInfo('[Automation] Price drop alerts completed', { dealershipId: this.dealershipId, successful, failed });
    return { processed: priceDrops.length, successful, failed };
  }

  private async sendPriceDropAlert(
    watchWithDrop: PriceWatch & { vehicle: Vehicle; dropPercent: number },
    dealershipName: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!watchWithDrop.contactPhone) {
      await this.logAction({
        dealershipId: this.dealershipId,
        automationType: 'price_drop',
        actionType: 'skipped',
        sourceTable: 'price_watches',
        sourceId: watchWithDrop.id,
        contactName: watchWithDrop.contactName || undefined,
        success: false,
        errorMessage: 'No phone number available',
      });
      return { success: false, error: 'No phone number' };
    }

    let ghlContactId = watchWithDrop.contactId;

    if (!ghlContactId) {
      const searchResult = await this.ghlService.searchContacts({ phone: watchWithDrop.contactPhone });
      if (searchResult.success && searchResult.data?.contacts?.length) {
        ghlContactId = searchResult.data.contacts[0].id;
      } else {
        const createResult = await this.ghlService.createContact({
          firstName: watchWithDrop.contactName?.split(' ')[0] || 'Customer',
          lastName: watchWithDrop.contactName?.split(' ').slice(1).join(' ') || '',
          phone: watchWithDrop.contactPhone,
          email: watchWithDrop.contactEmail || undefined,
          source: 'Lotview Price Drop Alert',
        });
        
        if (createResult.success && createResult.data) {
          ghlContactId = createResult.data.id;
        } else {
          await this.logAction({
            dealershipId: this.dealershipId,
            automationType: 'price_drop',
            actionType: 'failed',
            sourceTable: 'price_watches',
            sourceId: watchWithDrop.id,
            contactName: watchWithDrop.contactName || undefined,
            contactPhone: watchWithDrop.contactPhone || undefined,
            success: false,
            errorMessage: 'Failed to create GHL contact',
          });
          return { success: false, error: 'Failed to create GHL contact' };
        }
      }
    }

    const message = this.formatPriceDropMessage(watchWithDrop, dealershipName);

    const sendResult = await this.sendSMS(ghlContactId, message);

    if (sendResult.success) {
      await storage.updatePriceWatch(watchWithDrop.id, this.dealershipId, {
        lastNotifiedAt: new Date(),
        contactId: ghlContactId,
      });

      await this.logAction({
        dealershipId: this.dealershipId,
        automationType: 'price_drop',
        actionType: 'sent',
        sourceTable: 'price_watches',
        sourceId: watchWithDrop.id,
        contactId: ghlContactId,
        contactName: watchWithDrop.contactName || undefined,
        contactPhone: watchWithDrop.contactPhone || undefined,
        messageType: 'sms',
        messageContent: message.substring(0, 500),
        success: true,
        externalId: sendResult.data?.messageId || undefined,
        metadata: JSON.stringify({
          vehicleId: watchWithDrop.vehicleId,
          vehicleName: `${watchWithDrop.vehicle.year} ${watchWithDrop.vehicle.make} ${watchWithDrop.vehicle.model}`,
          originalPrice: watchWithDrop.priceWhenSubscribed,
          newPrice: watchWithDrop.vehicle.price,
          dropPercent: watchWithDrop.dropPercent,
        }),
      });

      return { success: true };
    } else {
      await this.logAction({
        dealershipId: this.dealershipId,
        automationType: 'price_drop',
        actionType: 'failed',
        sourceTable: 'price_watches',
        sourceId: watchWithDrop.id,
        contactId: ghlContactId || undefined,
        contactName: watchWithDrop.contactName || undefined,
        contactPhone: watchWithDrop.contactPhone || undefined,
        messageType: 'sms',
        messageContent: message.substring(0, 500),
        success: false,
        errorMessage: sendResult.error,
      });

      return { success: false, error: sendResult.error };
    }
  }

  private formatPriceDropMessage(
    watchWithDrop: PriceWatch & { vehicle: Vehicle; dropPercent: number },
    dealershipName: string
  ): string {
    const firstName = watchWithDrop.contactName?.split(' ')[0] || 'there';
    const vehicle = watchWithDrop.vehicle;
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const originalPrice = watchWithDrop.priceWhenSubscribed || 0;
    const newPrice = vehicle.price;
    const savings = originalPrice - newPrice;

    return `Hi ${firstName}! Great news from ${dealershipName}! The ${vehicleName} you were interested in just dropped in price by ${watchWithDrop.dropPercent}% - now $${newPrice.toLocaleString()} (save $${savings.toLocaleString()})! This won't last long. Reply to learn more or call us today! Reply STOP to opt out.`;
  }

  async autoSubscribePriceWatch(params: {
    vehicleId: number;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    sourceType: 'vehicle_view' | 'chat' | 'inquiry' | 'manual';
    sourceId?: string;
  }): Promise<{ success: boolean; watchId?: number; error?: string }> {
    if (!params.contactPhone && !params.contactEmail) {
      return { success: false, error: 'Contact phone or email required' };
    }

    const vehicle = await storage.getVehicleById(params.vehicleId, this.dealershipId);
    if (!vehicle) {
      return { success: false, error: 'Vehicle not found' };
    }

    if (params.contactPhone) {
      const normalizedPhone = this.normalizePhoneNumber(params.contactPhone);
      if (normalizedPhone) {
        const existing = await storage.getPriceWatchByContact(
          this.dealershipId,
          params.vehicleId,
          normalizedPhone
        );
        
        if (existing) {
          await storage.incrementPriceWatchViewCount(existing.id, this.dealershipId);
          logInfo('[Automation] Incremented view count for existing price watch', { dealershipId: this.dealershipId, watchId: existing.id });
          return { success: true, watchId: existing.id };
        }
      }
    }

    const watch = await storage.createPriceWatch({
      dealershipId: this.dealershipId,
      vehicleId: params.vehicleId,
      contactName: params.contactName || null,
      contactPhone: params.contactPhone ? this.normalizePhoneNumber(params.contactPhone) : null,
      contactEmail: params.contactEmail || null,
      sourceType: params.sourceType,
      sourceId: params.sourceId || null,
      viewCount: 1,
      notifyOnPriceDrop: true,
      notifyOnSold: true,
      minPriceDropPercent: 5,
      isActive: true,
      priceWhenSubscribed: vehicle.price,
    });

    logInfo('[Automation] Created price watch', { dealershipId: this.dealershipId, watchId: watch.id, vehicleId: params.vehicleId });

    await this.logAction({
      dealershipId: this.dealershipId,
      automationType: 'price_drop',
      actionType: 'subscribed',
      sourceTable: 'price_watches',
      sourceId: watch.id,
      contactName: params.contactName || undefined,
      contactPhone: params.contactPhone || undefined,
      success: true,
      metadata: JSON.stringify({
        vehicleId: params.vehicleId,
        vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        priceWhenSubscribed: vehicle.price,
        sourceType: params.sourceType,
      }),
    });

    return { success: true, watchId: watch.id };
  }
}

export async function processAllDealershipFollowUps(): Promise<void> {
  logInfo('[Automation] Starting automation processing for all dealerships');
  
  const dealerships = await storage.getAllDealerships();
  
  for (const dealership of dealerships) {
    if (!dealership.isActive) continue;

    try {
      const automation = new AutomationService(dealership.id);
      
      await automation.processDueFollowUps();
      
      await automation.scanAndCreateAppointmentReminders();
      await automation.processDueAppointmentReminders();
      
      await automation.processPriceDropAlerts();
      
    } catch (error) {
      logError('[Automation] Error processing dealership', error, { dealershipId: dealership.id });
    }
  }

  logInfo('[Automation] Completed automation processing for all dealerships');
}

export function createAutomationService(dealershipId: number): AutomationService {
  return new AutomationService(dealershipId);
}
