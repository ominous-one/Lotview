import { storage } from './storage';
import { facebookService } from './facebook-service';
import { createGhlApiService, GhlApiService } from './ghl-api-service';
import type { CrmContact, CrmMessage, InsertCrmMessage, InsertCrmActivity } from '@shared/schema';

interface SendMessageParams {
  dealershipId: number;
  contactId: number;
  channel: 'email' | 'sms' | 'facebook';
  content: string;
  subject?: string;
  sentById?: number;
  aiGenerated?: boolean;
  aiPromptUsed?: string;
}

interface SendMessageResult {
  success: boolean;
  messageId?: number;
  externalMessageId?: string;
  error?: string;
}

interface AIMessageSuggestionParams {
  dealershipId: number;
  contactId: number;
  channel: 'email' | 'sms' | 'facebook';
  context?: string;
}

export function createContactMessagingService(dealershipId: number) {
  const ghlService = createGhlApiService(dealershipId);
  
  /**
   * Ensure a Lotview CRM contact exists in GoHighLevel
   * Searches by email and phone, creates if not found
   * Updates the CRM contact with the GHL ID for future use
   * Logs all sync attempts (success and failure) as CRM activities
   */
  async function ensureGhlContact(contact: CrmContact): Promise<{ 
    success: boolean; 
    ghlContactId?: string; 
    error?: string 
  }> {
    const logContext = `Contact #${contact.id} (${contact.firstName} ${contact.lastName || ''})`;
    
    try {
      // If we already have a GHL contact ID, verify it still exists
      if (contact.ghlContactId) {
        const verifyResult = await ghlService.getContact(contact.ghlContactId);
        if (verifyResult.success && verifyResult.data) {
          // Existing GHL contact verified - log the verification
          console.log(`[ContactMessaging] GHL contact verified: ${contact.ghlContactId}`);
          
          await storage.createCrmActivity({
            dealershipId,
            contactId: contact.id,
            userId: null,
            activityType: 'system',
            direction: 'outbound',
            subject: 'GHL contact verified',
            content: `Existing GHL contact ID verified. GHL ID: ${contact.ghlContactId}. ${logContext}`,
            status: 'completed',
          });
          
          return { success: true, ghlContactId: contact.ghlContactId };
        }
        
        // GHL contact no longer exists - clear the stale ID and re-sync
        console.warn(`[ContactMessaging] Stale GHL contact ${contact.ghlContactId} - clearing and re-syncing`);
        await storage.updateCrmContact(contact.id, dealershipId, { 
          ghlContactId: null 
        });
        contact.ghlContactId = null;
        
        // Log the stale ID detection
        await storage.createCrmActivity({
          dealershipId,
          contactId: contact.id,
          userId: null,
          activityType: 'system',
          direction: 'outbound',
          subject: 'GHL contact stale - re-syncing',
          content: `Previous GHL ID no longer exists, attempting re-sync. ${logContext}`,
          status: 'completed',
        });
      }
      
      // Search for existing contact in GHL by email
      let foundGhlContact: { id: string } | null = null;
      let searchMethod = '';
      
      if (contact.email) {
        const searchResult = await ghlService.searchContacts({ email: contact.email });
        if (searchResult.success && searchResult.data?.contacts?.length) {
          foundGhlContact = searchResult.data.contacts[0];
          searchMethod = 'email';
        }
      }
      
      // If not found by email, try phone
      if (!foundGhlContact && contact.phone) {
        const searchResult = await ghlService.searchContacts({ phone: contact.phone });
        if (searchResult.success && searchResult.data?.contacts?.length) {
          foundGhlContact = searchResult.data.contacts[0];
          searchMethod = 'phone';
        }
      }
      
      // If found, link and log
      if (foundGhlContact) {
        await storage.updateCrmContact(contact.id, dealershipId, { 
          ghlContactId: foundGhlContact.id 
        });
        
        // Log successful lookup
        await storage.createCrmActivity({
          dealershipId,
          contactId: contact.id,
          userId: null,
          activityType: 'system',
          direction: 'outbound',
          subject: 'GHL contact linked',
          content: `Found existing GHL contact by ${searchMethod}. GHL ID: ${foundGhlContact.id}. ${logContext}`,
          status: 'completed',
        });
        
        console.log(`[ContactMessaging] Found GHL contact by ${searchMethod}: ${foundGhlContact.id}`);
        return { success: true, ghlContactId: foundGhlContact.id };
      }
      
      // Contact not found in GHL - create a new one
      if (!contact.email && !contact.phone) {
        const errorMsg = 'Contact has no email or phone to sync with GHL';
        
        await storage.createCrmActivity({
          dealershipId,
          contactId: contact.id,
          userId: null,
          activityType: 'system',
          direction: 'outbound',
          subject: 'GHL sync failed - no identifiers',
          content: `${errorMsg}. ${logContext}`,
          status: 'failed',
        });
        
        return { success: false, error: errorMsg };
      }
      
      const createResult = await ghlService.createContact({
        firstName: contact.firstName,
        lastName: contact.lastName || undefined,
        email: contact.email || undefined,
        phone: contact.phone || undefined,
        source: 'Lotview CRM',
        tags: contact.leadSource ? [contact.leadSource] : undefined,
      });
      
      if (createResult.success && createResult.data) {
        await storage.updateCrmContact(contact.id, dealershipId, { 
          ghlContactId: createResult.data.id 
        });
        
        // Log successful creation
        await storage.createCrmActivity({
          dealershipId,
          contactId: contact.id,
          userId: null,
          activityType: 'system',
          direction: 'outbound',
          subject: 'GHL contact created',
          content: `New contact created in GHL. GHL ID: ${createResult.data.id}. ${logContext}`,
          status: 'completed',
        });
        
        console.log(`[ContactMessaging] Created GHL contact: ${createResult.data.id}`);
        return { success: true, ghlContactId: createResult.data.id };
      } else {
        const errorMsg = createResult.error || 'Unknown error';
        const errorCode = createResult.errorCode || 'UNKNOWN';
        
        console.error(`[ContactMessaging] Failed to create GHL contact: ${errorMsg} (${errorCode})`);
        
        // Log the failed sync with GHL error details
        await storage.createCrmActivity({
          dealershipId,
          contactId: contact.id,
          userId: null,
          activityType: 'system',
          direction: 'outbound',
          subject: 'GHL sync failed',
          content: `Failed to create contact in GHL. Error: ${errorMsg}. Code: ${errorCode}. ${logContext}`,
          status: 'failed',
        });
        
        return { success: false, error: `GHL error (${errorCode}): ${errorMsg}` };
      }
    } catch (error: any) {
      console.error('[ContactMessaging] ensureGhlContact error:', error);
      
      // Log unexpected errors
      await storage.createCrmActivity({
        dealershipId,
        contactId: contact.id,
        userId: null,
        activityType: 'system',
        direction: 'outbound',
        subject: 'GHL sync exception',
        content: `Unexpected error during GHL sync: ${error.message}. ${logContext}`,
        status: 'failed',
      });
      
      return { success: false, error: error.message };
    }
  }
  
  async function sendMessage(params: SendMessageParams): Promise<SendMessageResult> {
    const { contactId, channel, content, subject, sentById, aiGenerated, aiPromptUsed } = params;
    
    const contact = await storage.getCrmContactById(contactId, dealershipId);
    if (!contact) {
      return { success: false, error: 'Contact not found' };
    }
    
    let recipientEmail: string | undefined;
    let recipientPhone: string | undefined;
    let recipientFacebookId: string | undefined;
    
    if (channel === 'email') {
      if (!contact.email) {
        return { success: false, error: 'Contact has no email address' };
      }
      if (!contact.optInEmail) {
        return { success: false, error: 'Contact has opted out of email communications' };
      }
      recipientEmail = contact.email;
    } else if (channel === 'sms') {
      if (!contact.phone) {
        return { success: false, error: 'Contact has no phone number' };
      }
      if (!contact.optInSms) {
        return { success: false, error: 'Contact has opted out of SMS communications' };
      }
      recipientPhone = contact.phone;
    } else if (channel === 'facebook') {
      if (!contact.facebookId) {
        return { success: false, error: 'Contact has no Facebook ID' };
      }
      if (!contact.optInFacebook) {
        return { success: false, error: 'Contact has opted out of Facebook messages' };
      }
      recipientFacebookId = contact.facebookId;
    }
    
    const messageData: InsertCrmMessage = {
      dealershipId,
      contactId,
      sentById: sentById || null,
      channel,
      subject: subject || null,
      content,
      recipientEmail: recipientEmail || null,
      recipientPhone: recipientPhone || null,
      recipientFacebookId: recipientFacebookId || null,
      status: 'pending',
      aiGenerated: aiGenerated || false,
      aiPromptUsed: aiPromptUsed || null,
    };
    
    const message = await storage.createCrmMessage(messageData);
    
    let externalMessageId: string | undefined;
    let sendError: string | undefined;
    
    try {
      if (channel === 'email') {
        const result = await sendEmailViaGhl(contact, subject || '', content);
        if (result.success) {
          externalMessageId = result.messageId;
        } else {
          sendError = result.error;
        }
      } else if (channel === 'sms') {
        const result = await sendSmsViaGhl(contact, content);
        if (result.success) {
          externalMessageId = result.messageId;
        } else {
          sendError = result.error;
        }
      } else if (channel === 'facebook') {
        const result = await sendFacebookMessage(dealershipId, contact, content);
        if (result.success) {
          externalMessageId = result.messageId;
        } else {
          sendError = result.error;
        }
      }
      
      if (externalMessageId) {
        await storage.updateCrmMessage(message.id, dealershipId, {
          status: 'sent',
          externalMessageId,
          sentAt: new Date(),
        });
        
        const activityData: InsertCrmActivity = {
          dealershipId,
          contactId,
          userId: sentById || null,
          activityType: channel,
          direction: 'outbound',
          subject: subject || null,
          content,
          status: 'completed',
          deliveryStatus: 'sent',
          messageId: externalMessageId,
        };
        await storage.createCrmActivity(activityData);
        
        await storage.updateCrmContact(contactId, dealershipId, {
          lastContactedAt: new Date(),
          totalMessagesSent: (contact.totalMessagesSent || 0) + 1,
        });
        
        return { success: true, messageId: message.id, externalMessageId };
      } else {
        await storage.updateCrmMessage(message.id, dealershipId, {
          status: 'failed',
          errorMessage: sendError || 'Unknown error',
        });
        
        // Log failed message activity
        await storage.createCrmActivity({
          dealershipId,
          contactId,
          userId: sentById || null,
          activityType: channel,
          direction: 'outbound',
          subject: subject || null,
          content: `Failed to send: ${sendError}`,
          status: 'failed',
          deliveryStatus: 'failed',
        });
        
        return { success: false, messageId: message.id, error: sendError };
      }
    } catch (error: any) {
      console.error(`[ContactMessaging] Error sending ${channel} message:`, error);
      
      await storage.updateCrmMessage(message.id, dealershipId, {
        status: 'failed',
        errorMessage: error.message || 'Unexpected error',
      });
      
      return { success: false, messageId: message.id, error: error.message };
    }
  }
  
  /**
   * Send email through GoHighLevel's Conversations API
   * Uses shared ensureGhlContact to sync contact first
   */
  async function sendEmailViaGhl(
    contact: CrmContact,
    subject: string,
    content: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Ensure contact exists in GHL using shared helper
      const syncResult = await ensureGhlContact(contact);
      if (!syncResult.success || !syncResult.ghlContactId) {
        return { 
          success: false, 
          error: `Cannot send email - GHL sync failed: ${syncResult.error}` 
        };
      }
      
      // Get or create an email conversation for this contact
      const conversationResult = await ghlService.getOrCreateConversation(
        syncResult.ghlContactId, 
        'TYPE_EMAIL'
      );
      
      if (!conversationResult.success || !conversationResult.data) {
        return { 
          success: false, 
          error: `Failed to get GHL email conversation: ${conversationResult.error}` 
        };
      }
      
      const conversation = conversationResult.data;
      
      // Send the email through GHL
      const sendResult = await ghlService.sendMessage(conversation.id, {
        type: 'Email',
        subject: subject || 'Message from our team',
        html: `<p>${content.replace(/\n/g, '<br>')}</p>`,
        emailTo: contact.email!,
      });
      
      if (sendResult.success && sendResult.data) {
        console.log('[ContactMessaging] Email sent via GHL:', sendResult.data.id);
        return { success: true, messageId: sendResult.data.id };
      } else {
        console.error('[ContactMessaging] GHL email send failed:', sendResult.error);
        return { 
          success: false, 
          error: `GHL email failed: ${sendResult.error || 'Unknown error'}` 
        };
      }
    } catch (error: any) {
      console.error('[ContactMessaging] Email send error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send SMS through GoHighLevel's Conversations API
   * Uses shared ensureGhlContact to sync contact first
   */
  async function sendSmsViaGhl(
    contact: CrmContact,
    content: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Ensure contact exists in GHL using shared helper
      const syncResult = await ensureGhlContact(contact);
      if (!syncResult.success || !syncResult.ghlContactId) {
        return { 
          success: false, 
          error: `Cannot send SMS - GHL sync failed: ${syncResult.error}` 
        };
      }
      
      // Get or create an SMS conversation for this contact
      const conversationResult = await ghlService.getOrCreateConversation(
        syncResult.ghlContactId, 
        'TYPE_SMS'
      );
      
      if (!conversationResult.success || !conversationResult.data) {
        return { 
          success: false, 
          error: `Failed to get GHL SMS conversation: ${conversationResult.error}` 
        };
      }
      
      const conversation = conversationResult.data;
      
      // Send the SMS through GHL
      const sendResult = await ghlService.sendMessage(conversation.id, {
        type: 'SMS',
        message: content,
      });
      
      if (sendResult.success && sendResult.data) {
        console.log('[ContactMessaging] SMS sent via GHL:', sendResult.data.id);
        return { success: true, messageId: sendResult.data.id };
      } else {
        console.error('[ContactMessaging] GHL SMS send failed:', sendResult.error);
        return { 
          success: false, 
          error: `GHL SMS failed: ${sendResult.error || 'Unknown error'}` 
        };
      }
    } catch (error: any) {
      console.error('[ContactMessaging] SMS send error:', error);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send Facebook Messenger message (still uses Facebook API directly)
   * GHL doesn't have direct Facebook Messenger integration for outbound
   */
  async function sendFacebookMessage(
    dealershipId: number,
    contact: CrmContact,
    content: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      if (!contact.facebookId) {
        return { success: false, error: 'Contact has no Facebook ID' };
      }
      
      const conversations = await storage.getMessengerConversationsByContactFacebookId(
        dealershipId,
        contact.facebookId
      );
      
      if (!conversations || conversations.length === 0) {
        return { success: false, error: 'No Facebook Messenger conversation found for this contact' };
      }
      
      const conversation = conversations[0];
      
      // Get the Facebook account to get the page access token
      const facebookAccount = await storage.getFacebookAccountByIdDirect(conversation.facebookAccountId, dealershipId);
      if (!facebookAccount || !facebookAccount.accessToken) {
        return { success: false, error: 'Facebook page access token not available' };
      }
      
      const result = await facebookService.sendMessengerMessage(
        facebookAccount.accessToken,
        contact.facebookId,
        content
      );
      
      if (result.messageId) {
        await storage.updateMessengerConversation(conversation.id, dealershipId, {
          lastMessage: `You: ${content.substring(0, 200)}`,
          lastMessageAt: new Date(),
        });
        
        return { success: true, messageId: result.messageId };
      } else {
        return { success: false, error: 'Failed to send Facebook message' };
      }
    } catch (error: any) {
      console.error('[ContactMessaging] Facebook send error:', error);
      return { success: false, error: error.message };
    }
  }
  
  async function generateAiMessageSuggestion(
    params: AIMessageSuggestionParams
  ): Promise<{ success: boolean; suggestion?: string; error?: string }> {
    const { contactId, channel, context } = params;
    
    try {
      const contact = await storage.getCrmContactById(contactId, dealershipId);
      if (!contact) {
        return { success: false, error: 'Contact not found' };
      }
      
      const activities = await storage.getCrmActivities(contactId, dealershipId, 5);
      
      const dealership = await storage.getDealershipById(dealershipId);
      const dealershipName = dealership?.name || 'our dealership';
      
      let vehicleContext = '';
      if (contact.interestedVehicleIds) {
        try {
          const vehicleIds = JSON.parse(contact.interestedVehicleIds);
          if (vehicleIds.length > 0) {
            const vehicle = await storage.getVehicleById(vehicleIds[0], dealershipId);
            if (vehicle) {
              vehicleContext = `\nThey were interested in a ${vehicle.year} ${vehicle.make} ${vehicle.model} priced at $${vehicle.price.toLocaleString()}.`;
            }
          }
        } catch (e) {
        }
      }
      
      const recentActivitySummary = activities.slice(0, 3).map(a => 
        `${a.activityType} (${a.direction || 'n/a'}) - ${a.content?.substring(0, 50) || 'no content'}`
      ).join('\n');
      
      const prompt = `You are a professional automotive sales assistant for ${dealershipName}. Write a personalized ${channel} message for a customer.

Customer: ${contact.firstName} ${contact.lastName || ''}
Status: ${contact.status}
Lead Source: ${contact.leadSource || 'unknown'}
Preferred Contact: ${contact.preferredContactMethod || 'any'}
${vehicleContext}

Recent interactions:
${recentActivitySummary || 'No recent activity'}

${context ? `Additional context: ${context}` : ''}

Write a warm, professional message appropriate for ${channel}. Keep it:
- ${channel === 'sms' ? 'Under 160 characters, casual but professional' : ''}
- ${channel === 'email' ? 'Professional with a clear subject line implied' : ''}
- ${channel === 'facebook' ? 'Friendly and conversational' : ''}

Only output the message content, nothing else.`;

      const { generateChatResponse } = await import('./openai');
      const messages = [{ role: 'user' as const, content: prompt }];
      
      const response = await generateChatResponse(messages, dealershipId);
      
      if (response && typeof response === 'object' && 'content' in response) {
        return { success: true, suggestion: (response as any).content?.trim() || '' };
      } else if (typeof response === 'string') {
        return { success: true, suggestion: response.trim() };
      } else {
        return { success: false, error: 'AI did not generate a response' };
      }
    } catch (error: any) {
      console.error('[ContactMessaging] AI suggestion error:', error);
      return { success: false, error: error.message };
    }
  }
  
  return {
    sendMessage,
    generateAiMessageSuggestion,
    ensureGhlContact,
  };
}
