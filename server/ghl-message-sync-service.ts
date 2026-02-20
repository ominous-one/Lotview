import { storage as defaultStorage } from "./storage";
import { createGhlApiService as defaultCreateGhlApiService } from "./ghl-api-service";
import { facebookService as defaultFacebookService } from "./facebook-service";
import type { MessengerConversation, MessengerMessage } from "@shared/schema";
import type { IStorage } from "./storage";

// Type for GHL API service methods used by this service
export interface IGhlApiService {
  searchContacts(params: { query: string; limit?: number }): Promise<{ success: boolean; data?: { contacts?: { id: string; name?: string; firstName?: string }[] }; error?: string }>;
  createContact(params: { name: string; firstName?: string; lastName?: string; source?: string; tags?: string[] }): Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  getOrCreateConversation(contactId: string, type: string): Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  sendMessage(conversationId: string, params: { type: string; message: string }): Promise<{ success: boolean; data?: { id: string }; error?: string }>;
  getContact(contactId: string): Promise<{ success: boolean; data?: { id: string; name?: string; firstName?: string }; error?: string }>;
  addTagsToContact(contactId: string, tags: string[]): Promise<{ success: boolean; error?: string }>;
  updateContact(contactId: string, updates: Record<string, any>): Promise<{ success: boolean; error?: string }>;
}

// Type for Facebook service methods used by this service
export interface IFacebookService {
  sendMessengerMessage(pageAccessToken: string, recipientId: string, message: string): Promise<{ messageId: string }>;
}

// Dependencies interface for constructor injection
export interface GhlMessageSyncServiceDeps {
  storage?: IStorage;
  createGhlApiService?: (dealershipId: number) => IGhlApiService;
  facebookService?: IFacebookService;
}

export class GhlMessageSyncService {
  private dealershipId: number;
  private storage: IStorage;
  private createGhlApiService: (dealershipId: number) => IGhlApiService;
  private facebookService: IFacebookService;

  constructor(dealershipId: number, deps?: GhlMessageSyncServiceDeps) {
    this.dealershipId = dealershipId;
    this.storage = deps?.storage ?? defaultStorage;
    this.createGhlApiService = deps?.createGhlApiService ?? (defaultCreateGhlApiService as any);
    this.facebookService = deps?.facebookService ?? (defaultFacebookService as any);
  }

  async syncMessageToGhl(
    conversation: MessengerConversation & { ghlConversationId?: string | null; ghlContactId?: string | null },
    message: string,
    senderName: string
  ): Promise<{ success: boolean; ghlMessageId?: string; error?: string }> {
    try {
      const ghlService = this.createGhlApiService(this.dealershipId);

      if (!conversation.ghlConversationId || !conversation.ghlContactId) {
        const linkResult = await this.linkConversationToGhl(conversation);
        if (!linkResult.success) {
          console.log(`[GHL Sync] Could not link conversation ${conversation.id} to GHL:`, linkResult.error);
          return { success: false, error: linkResult.error };
        }
        conversation.ghlConversationId = linkResult.ghlConversationId ?? null;
        conversation.ghlContactId = linkResult.ghlContactId ?? null;
      }

      const result = await ghlService.sendMessage(conversation.ghlConversationId!, {
        type: 'FB',
        message: message,
      });

      if (result.success && result.data) {
        console.log(`[GHL Sync] Message synced to GHL for conversation ${conversation.id}`);
        return { success: true, ghlMessageId: result.data.id };
      }

      console.error(`[GHL Sync] Failed to send message to GHL:`, result.error);
      return { success: false, error: result.error };
    } catch (error: any) {
      console.error(`[GHL Sync] Error syncing message to GHL:`, error);
      return { success: false, error: error.message };
    }
  }

  async linkConversationToGhl(
    conversation: MessengerConversation
  ): Promise<{ success: boolean; ghlConversationId?: string; ghlContactId?: string; error?: string }> {
    try {
      const ghlService = this.createGhlApiService(this.dealershipId);

      const searchResult = await ghlService.searchContacts({
        query: conversation.participantName,
        limit: 5,
      });

      let ghlContactId: string | undefined;

      if (searchResult.success && searchResult.data?.contacts?.length) {
        ghlContactId = searchResult.data.contacts[0].id;
      } else {
        const createResult = await ghlService.createContact({
          name: conversation.participantName,
          firstName: conversation.participantName.split(' ')[0],
          lastName: conversation.participantName.split(' ').slice(1).join(' ') || undefined,
          source: 'Facebook Messenger',
          tags: ['Facebook Lead', 'Lotview Sync'],
        });

        if (!createResult.success || !createResult.data) {
          return { success: false, error: createResult.error || 'Failed to create GHL contact' };
        }

        ghlContactId = createResult.data.id;
      }

      const conversationResult = await ghlService.getOrCreateConversation(ghlContactId, 'TYPE_FB_MESSENGER');

      if (!conversationResult.success || !conversationResult.data) {
        return { success: false, error: conversationResult.error || 'Failed to create GHL conversation' };
      }

      await this.storage.updateMessengerConversation(conversation.id, this.dealershipId, {
        ghlConversationId: conversationResult.data.id,
        ghlContactId: ghlContactId,
        lastGhlSyncAt: new Date(),
      } as any);

      console.log(`[GHL Sync] Linked conversation ${conversation.id} to GHL contact ${ghlContactId} and conversation ${conversationResult.data.id}`);

      return {
        success: true,
        ghlConversationId: conversationResult.data.id,
        ghlContactId: ghlContactId,
      };
    } catch (error: any) {
      console.error(`[GHL Sync] Error linking conversation to GHL:`, error);
      return { success: false, error: error.message };
    }
  }

  async syncToChatConversation(webhookData: {
    contactId: string;
    body: string;
    messageId: string;
    direction: 'inbound' | 'outbound';
    dateAdded: string;
    type: string;
  }): Promise<{ success: boolean; synced: boolean; error?: string }> {
    try {
      // Find chat conversation by GHL contact ID
      const chatConversation = await this.storage.getConversationByGhlContactId(
        this.dealershipId,
        webhookData.contactId
      );

      if (!chatConversation) {
        // No matching chat conversation, this is normal for pure Messenger conversations
        return { success: true, synced: false };
      }

      // Check if this message already exists (by ghlMessageId)
      const existingMessages = JSON.parse(chatConversation.messages || '[]');
      const messageExists = existingMessages.some((m: any) => m.ghlMessageId === webhookData.messageId);
      if (messageExists) {
        console.log(`[GHL Sync] Chat message ${webhookData.messageId} already exists, skipping`);
        return { success: true, synced: false };
      }

      // Map GHL direction to role
      const role = webhookData.direction === 'inbound' ? 'user' : 'assistant';
      const channel = webhookData.type === 'SMS' || webhookData.type === 'TYPE_SMS' ? 'sms' : 
                      webhookData.type === 'Email' || webhookData.type === 'TYPE_EMAIL' ? 'email' : 'sms';

      // Append the message to the conversation
      await this.storage.appendMessageToConversation(chatConversation.id, this.dealershipId, {
        role,
        content: webhookData.body,
        timestamp: webhookData.dateAdded || new Date().toISOString(),
        channel,
        direction: webhookData.direction,
        ghlMessageId: webhookData.messageId
      });

      console.log(`[GHL Sync] Synced ${webhookData.direction} message to chat conversation ${chatConversation.id}`);
      return { success: true, synced: true };
    } catch (error: any) {
      console.error(`[GHL Sync] Error syncing to chat conversation:`, error);
      return { success: false, synced: false, error: error.message };
    }
  }

  async handleInboundGhlMessage(webhookData: {
    conversationId: string;
    contactId: string;
    locationId: string;
    body: string;
    messageId: string;
    direction: 'inbound' | 'outbound';
    dateAdded: string;
    type: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const existingMessage = await this.storage.getMessengerMessageByGhlId(this.dealershipId, webhookData.messageId);
      if (existingMessage) {
        console.log(`[GHL Sync] Message ${webhookData.messageId} already exists, skipping`);
        return { success: true };
      }

      // First, try to sync to chat_conversations (website chats) if contactId matches
      if (webhookData.contactId) {
        await this.syncToChatConversation(webhookData);
      }

      // Get conversation with page access token for potential Facebook forwarding
      const conversationWithToken = await this.storage.getMessengerConversationWithTokenByGhlId(
        this.dealershipId,
        webhookData.conversationId
      );

      if (!conversationWithToken) {
        console.log(`[GHL Sync] No matching Messenger conversation for GHL conversation ${webhookData.conversationId}`);
        // Return success since we may have synced to chat_conversations above
        return { success: true };
      }

      const ghlService = this.createGhlApiService(this.dealershipId);
      let senderName = 'Unknown';

      if (webhookData.direction === 'inbound') {
        const contactResult = await ghlService.getContact(webhookData.contactId);
        if (contactResult.success && contactResult.data) {
          senderName = contactResult.data.name || contactResult.data.firstName || 'Customer';
        }
      } else {
        senderName = 'Sales Team';
        
        // For outbound messages from GHL, check if this message originated from Lotview
        // by looking for an existing message with this ghlMessageId (deterministic check)
        const existingByGhlId = await this.storage.getMessengerMessageByGhlId(this.dealershipId, webhookData.messageId);
        
        if (existingByGhlId) {
          console.log(`[GHL Sync] Skipping - message already exists with ghlMessageId ${webhookData.messageId}`);
          return { success: true }; // Already processed
        }
        
        // Forward outbound GHL messages to Facebook Messenger
        // This handles staff replies made directly in GHL (not from Lotview)
        if (conversationWithToken.pageAccessToken && conversationWithToken.participantId) {
          try {
            console.log(`[GHL Sync] Forwarding outbound GHL message to Facebook Messenger for conversation ${conversationWithToken.id}`);
            const fbResult = await this.facebookService.sendMessengerMessage(
              conversationWithToken.pageAccessToken,
              conversationWithToken.participantId,
              webhookData.body
            );
            console.log(`[GHL Sync] Successfully sent message to Facebook, messageId: ${fbResult.messageId}`);
          } catch (fbError: any) {
            console.error(`[GHL Sync] Failed to forward message to Facebook Messenger:`, fbError.message);
            // Don't fail the whole sync, just log the error
          }
        } else {
          console.log(`[GHL Sync] Cannot forward to Facebook - missing pageAccessToken or participantId`);
        }
      }

      const newMessage = await this.storage.createMessengerMessage({
        dealershipId: this.dealershipId,
        conversationId: conversationWithToken.id,
        facebookMessageId: `ghl_${webhookData.messageId}`,
        senderId: webhookData.direction === 'inbound' ? webhookData.contactId : 'dealership',
        senderName: senderName,
        isFromCustomer: webhookData.direction === 'inbound',
        content: webhookData.body,
        isRead: webhookData.direction === 'outbound',
        sentAt: new Date(webhookData.dateAdded),
        ghlMessageId: webhookData.messageId,
        syncSource: 'ghl',
      });

      await this.storage.updateMessengerConversation(conversationWithToken.id, this.dealershipId, {
        lastMessage: webhookData.direction === 'inbound'
          ? webhookData.body.substring(0, 200)
          : `You: ${webhookData.body.substring(0, 200)}`,
        lastMessageAt: new Date(webhookData.dateAdded),
        unreadCount: webhookData.direction === 'inbound' ? (conversationWithToken.unreadCount || 0) + 1 : conversationWithToken.unreadCount,
        lastGhlSyncAt: new Date(),
      } as any);

      console.log(`[GHL Sync] Created message from GHL webhook for conversation ${conversationWithToken.id}`);

      // Broadcast real-time update via WebSocket
      const broadcastNotification = (global as any).broadcastNotification;
      if (broadcastNotification) {
        broadcastNotification(this.dealershipId, {
          type: 'new_message',
          title: webhookData.direction === 'inbound' ? 'New Message' : 'Message Sent',
          message: webhookData.body.substring(0, 100),
          data: {
            conversationId: conversationWithToken.id,
            conversationType: 'messenger',
            direction: webhookData.direction,
            senderName: senderName,
            messagePreview: webhookData.body.substring(0, 100),
          },
          timestamp: new Date().toISOString(),
        });
      }

      return { success: true };
    } catch (error: any) {
      console.error(`[GHL Sync] Error handling inbound GHL message:`, error);
      return { success: false, error: error.message };
    }
  }

  async syncMetadataToGhl(
    conversation: MessengerConversation & { ghlContactId?: string | null }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (!conversation.ghlContactId) {
        console.log(`[GHL Sync] Cannot sync metadata - conversation ${conversation.id} has no GHL contact`);
        return { success: false, error: 'No GHL contact linked' };
      }

      const ghlService = this.createGhlApiService(this.dealershipId);

      // Sync tags to GHL contact
      if (conversation.tags && conversation.tags.length > 0) {
        const tagResult = await ghlService.addTagsToContact(conversation.ghlContactId, conversation.tags);
        if (!tagResult.success) {
          console.warn(`[GHL Sync] Failed to sync tags to GHL contact:`, tagResult.error);
        } else {
          console.log(`[GHL Sync] Synced tags ${conversation.tags.join(', ')} to GHL contact ${conversation.ghlContactId}`);
        }
      }

      // Sync contact info if available
      const contactUpdates: Record<string, any> = {};
      if (conversation.customerPhone) {
        contactUpdates.phone = conversation.customerPhone;
      }
      if (conversation.customerEmail) {
        contactUpdates.email = conversation.customerEmail;
      }
      if (conversation.vehicleOfInterest) {
        contactUpdates.customFields = [
          { key: 'vehicle_of_interest', value: conversation.vehicleOfInterest }
        ];
      }

      if (Object.keys(contactUpdates).length > 0) {
        const updateResult = await ghlService.updateContact(conversation.ghlContactId, contactUpdates);
        if (!updateResult.success) {
          console.warn(`[GHL Sync] Failed to update contact info in GHL:`, updateResult.error);
        } else {
          console.log(`[GHL Sync] Synced contact info to GHL contact ${conversation.ghlContactId}`);
        }
      }

      // Update last sync timestamp
      await this.storage.updateMessengerConversation(conversation.id, this.dealershipId, {
        lastGhlSyncAt: new Date(),
      } as any);

      return { success: true };
    } catch (error: any) {
      console.error(`[GHL Sync] Error syncing metadata to GHL:`, error);
      return { success: false, error: error.message };
    }
  }

  async handleGhlContactUpdate(webhookData: {
    contactId: string;
    locationId: string;
    tags?: string[];
    phone?: string;
    email?: string;
    customFields?: Array<{ id: string; key: string; value: string }>;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Find conversation by GHL contact ID
      const conversation = await this.storage.getMessengerConversationByGhlContactId(
        this.dealershipId,
        webhookData.contactId
      );

      if (!conversation) {
        console.log(`[GHL Sync] No conversation found for GHL contact ${webhookData.contactId}`);
        return { success: true };
      }

      const updates: Record<string, any> = {};

      // Sync tags from GHL to Lotview - Replace completely to handle tag removals
      // GHL is treated as source of truth for bidirectional sync
      if (webhookData.tags !== undefined) {
        updates.tags = webhookData.tags;
      }

      // Sync phone and email - Overwrite to keep in sync (bidirectional)
      if (webhookData.phone && webhookData.phone !== conversation.customerPhone) {
        updates.customerPhone = webhookData.phone;
      }
      if (webhookData.email && webhookData.email !== conversation.customerEmail) {
        updates.customerEmail = webhookData.email;
      }

      // Sync vehicle of interest from custom fields
      if (webhookData.customFields) {
        const vehicleField = webhookData.customFields.find(f => 
          f.key === 'vehicle_of_interest' || f.key === 'vehicleOfInterest'
        );
        if (vehicleField && vehicleField.value) {
          updates.vehicleOfInterest = vehicleField.value;
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.lastGhlSyncAt = new Date();
        await this.storage.updateMessengerConversation(conversation.id, this.dealershipId, updates as any);
        console.log(`[GHL Sync] Updated conversation ${conversation.id} from GHL contact update`);
      }

      return { success: true };
    } catch (error: any) {
      console.error(`[GHL Sync] Error handling GHL contact update:`, error);
      return { success: false, error: error.message };
    }
  }

  async handleGhlOpportunityUpdate(webhookData: {
    opportunityId: string;
    contactId: string;
    locationId: string;
    pipelineStageId?: string;
    pipelineStageName?: string;
    status?: string;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      // Find conversation by GHL contact ID
      const conversation = await this.storage.getMessengerConversationByGhlContactId(
        this.dealershipId,
        webhookData.contactId
      );

      if (!conversation) {
        console.log(`[GHL Sync] No conversation found for GHL contact ${webhookData.contactId}`);
        return { success: true };
      }

      const updates: Record<string, any> = {};

      // Map GHL pipeline stage to Lotview pipeline stage
      if (webhookData.pipelineStageName) {
        const stageName = webhookData.pipelineStageName.toLowerCase();
        if (stageName.includes('inquiry') || stageName.includes('new')) {
          updates.pipelineStage = 'inquiry';
        } else if (stageName.includes('qualified') || stageName.includes('contacted')) {
          updates.pipelineStage = 'qualified';
        } else if (stageName.includes('test') || stageName.includes('demo')) {
          updates.pipelineStage = 'test_drive';
        } else if (stageName.includes('negotiat') || stageName.includes('proposal')) {
          updates.pipelineStage = 'negotiation';
        } else if (stageName.includes('closed') || stageName.includes('won') || stageName.includes('sold')) {
          updates.pipelineStage = 'closed';
          updates.leadStatus = 'sold';
        } else if (stageName.includes('lost') || stageName.includes('dead')) {
          updates.leadStatus = 'lost';
        }
      }

      // Map GHL opportunity status to lead status
      if (webhookData.status) {
        const status = webhookData.status.toLowerCase();
        if (status === 'won' || status === 'closed_won') {
          updates.leadStatus = 'sold';
        } else if (status === 'lost' || status === 'closed_lost') {
          updates.leadStatus = 'lost';
        } else if (status === 'open' || status === 'active') {
          if (!updates.leadStatus) {
            updates.leadStatus = 'hot';
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        updates.lastGhlSyncAt = new Date();
        await this.storage.updateMessengerConversation(conversation.id, this.dealershipId, updates as any);
        console.log(`[GHL Sync] Updated conversation ${conversation.id} from GHL opportunity update`);
      }

      return { success: true };
    } catch (error: any) {
      console.error(`[GHL Sync] Error handling GHL opportunity update:`, error);
      return { success: false, error: error.message };
    }
  }
}

export function createGhlMessageSyncService(dealershipId: number): GhlMessageSyncService {
  return new GhlMessageSyncService(dealershipId);
}
