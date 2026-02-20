import { db } from "./db";
import { ghlConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-04-15";

interface GHLContact {
  id: string;
  locationId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

interface GHLConversation {
  id: string;
  locationId: string;
  contactId: string;
}

// Cache for GHL clients per dealership
const clientCache = new Map<number, GHLClient>();

export class GHLClient {
  private apiKey: string;
  private locationId: string;

  constructor(apiKey: string, locationId: string) {
    this.apiKey = apiKey;
    this.locationId = locationId;
  }

  /**
   * Get GHL client for a specific dealership
   * Fetches API key from database, caches instance for performance
   */
  static async getInstanceForDealership(dealershipId: number): Promise<GHLClient | null> {
    // Check cache first
    if (clientCache.has(dealershipId)) {
      return clientCache.get(dealershipId)!;
    }
    
    try {
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      if (apiKeys?.ghlApiKey && apiKeys?.ghlLocationId) {
        const client = new GHLClient(apiKeys.ghlApiKey, apiKeys.ghlLocationId);
        clientCache.set(dealershipId, client);
        console.log(`[GHL] Client initialized for dealership ${dealershipId}`);
        return client;
      } else {
        console.warn(`[GHL] API key or Location ID not configured for dealership ${dealershipId}`);
        return null;
      }
    } catch (error) {
      console.error(`[GHL] Error loading configuration for dealership ${dealershipId}:`, error);
      return null;
    }
  }

  /**
   * Clear cached client instance (use when API key is updated)
   */
  static clearCache(dealershipId?: number) {
    if (dealershipId) {
      clientCache.delete(dealershipId);
    } else {
      clientCache.clear();
    }
  }

  // Legacy method for backwards compatibility (uses old ghlConfig table)
  static async getInstance(): Promise<GHLClient | null> {
    try {
      const config = await db.query.ghlConfig.findFirst({
        where: eq(ghlConfig.isActive, true),
      });

      if (!config) {
        console.warn("No active GHL configuration found - use getInstanceForDealership() instead");
        return null;
      }

      return new GHLClient(config.apiKey, config.locationId);
    } catch (error) {
      console.error("Error loading GHL configuration:", error);
      return null;
    }
  }

  private async makeRequest(endpoint: string, method: string = "GET", body?: any) {
    const url = `${GHL_BASE_URL}${endpoint}`;
    
    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "Version": GHL_API_VERSION,
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`GHL API error (${response.status}): ${errorText}`);
    }

    return response.json();
  }

  async createOrUpdateContact(data: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    source?: string;
    tags?: string[];
    customFields?: { key: string; field_value: string }[];
  }): Promise<GHLContact> {
    const payload = {
      locationId: this.locationId,
      ...data,
    };

    const result = await this.makeRequest("/contacts/", "POST", payload);
    return result.contact;
  }

  async updateContact(contactId: string, data: {
    source?: string;
    tags?: string[];
    customFields?: { key: string; field_value: string }[];
  }): Promise<GHLContact> {
    const payload = {
      ...data,
    };

    const result = await this.makeRequest(`/contacts/${contactId}`, "PUT", payload);
    return result.contact;
  }

  async getContactByEmail(email: string): Promise<GHLContact | null> {
    try {
      const result = await this.makeRequest(`/contacts/?email=${encodeURIComponent(email)}`);
      return result.contacts?.[0] || null;
    } catch (error) {
      console.error("Error fetching contact by email:", error);
      return null;
    }
  }

  async getContactByPhone(phone: string): Promise<GHLContact | null> {
    try {
      const result = await this.makeRequest(`/contacts/?phone=${encodeURIComponent(phone)}`);
      return result.contacts?.[0] || null;
    } catch (error) {
      console.error("Error fetching contact by phone:", error);
      return null;
    }
  }

  async createConversation(contactId: string, initialMessage: string): Promise<GHLConversation> {
    const payload = {
      locationId: this.locationId,
      contactId,
      lastMessageBody: initialMessage,
      lastMessageType: "TYPE_SMS",
      type: "TYPE_SMS",
    };

    const result = await this.makeRequest("/conversations/", "POST", payload);
    return result.conversation;
  }

  async sendMessage(contactId: string, message: string, conversationId?: string): Promise<void> {
    const payload: any = {
      locationId: this.locationId,
      contactId,
      type: "SMS",
      message,
    };

    if (conversationId) {
      payload.conversationId = conversationId;
    }

    await this.makeRequest("/conversations/messages", "POST", payload);
  }

  async handleCTAAction(
    vehicleInfo: {
      year: number;
      make: string;
      model: string;
      price: number;
      vin?: string;
      dealership: string;
    },
    ctaType: 'test-drive' | 'reserve' | 'get-approved' | 'value-trade',
    contactInfo?: {
      firstName?: string;
      lastName?: string;
      email?: string;
      phone?: string;
    }
  ): Promise<{ success: boolean; contactId?: string; error?: string }> {
    try {
      const vehicleName = `${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model}`;
      
      const ctaMessages: Record<typeof ctaType, string> = {
        'test-drive': `🚗 New Test Drive Request\n\nVehicle: ${vehicleName}\nPrice: $${vehicleInfo.price.toLocaleString()}\nDealership: ${vehicleInfo.dealership}\n${vehicleInfo.vin ? `VIN: ${vehicleInfo.vin}` : ''}\n\nCustomer is interested in booking a test drive.`,
        'reserve': `⭐ New Vehicle Reservation Request\n\nVehicle: ${vehicleName}\nPrice: $${vehicleInfo.price.toLocaleString()}\nDealership: ${vehicleInfo.dealership}\n${vehicleInfo.vin ? `VIN: ${vehicleInfo.vin}` : ''}\n\nCustomer wants to reserve this vehicle.`,
        'get-approved': `💳 New Financing Pre-Approval Request\n\nVehicle: ${vehicleName}\nPrice: $${vehicleInfo.price.toLocaleString()}\nDealership: ${vehicleInfo.dealership}\n${vehicleInfo.vin ? `VIN: ${vehicleInfo.vin}` : ''}\n\nCustomer is interested in getting pre-approved for financing.`,
        'value-trade': `🔄 New Trade-In Valuation Request\n\nInterested Vehicle: ${vehicleName}\nPrice: $${vehicleInfo.price.toLocaleString()}\nDealership: ${vehicleInfo.dealership}\n${vehicleInfo.vin ? `VIN: ${vehicleInfo.vin}` : ''}\n\nCustomer wants to get a trade-in value for their current vehicle.`,
      };

      const message = ctaMessages[ctaType];
      const tags = [`cta-${ctaType}`, 'website-lead', vehicleInfo.dealership.toLowerCase().replace(/\s+/g, '-')];

      let contact: GHLContact;
      
      if (contactInfo?.email || contactInfo?.phone) {
        const existingContact = contactInfo.email 
          ? await this.getContactByEmail(contactInfo.email)
          : contactInfo.phone 
          ? await this.getContactByPhone(contactInfo.phone)
          : null;

        if (existingContact) {
          contact = existingContact;
        } else {
          contact = await this.createOrUpdateContact({
            ...contactInfo,
            tags,
            customFields: [
              { key: "year_make_model", field_value: vehicleName },
              { key: "what_is_your_desired_vehicle", field_value: vehicleName },
            ],
          });
        }
      } else {
        contact = await this.createOrUpdateContact({
          firstName: "Website",
          lastName: "Visitor",
          tags,
          customFields: [
            { key: "year_make_model", field_value: vehicleName },
            { key: "what_is_your_desired_vehicle", field_value: vehicleName },
          ],
        });
      }

      await this.sendMessage(contact.id, message);

      return { success: true, contactId: contact.id };
    } catch (error) {
      console.error("Error handling CTA action:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  /**
   * Sync a chat conversation to GHL as a contact + conversation thread
   * Called when user requests SMS handoff
   */
  async syncChatConversation(data: {
    phone: string;
    sessionId: string;
    category: 'test-drive' | 'get-approved' | 'value-trade' | 'reserve' | 'general';
    vehicleName?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    dealershipName?: string;
  }): Promise<{ success: boolean; contactId?: string; conversationId?: string; error?: string }> {
    try {
      const { phone, category, vehicleName, messages, dealershipName } = data;
      
      const categoryLabels: Record<string, string> = {
        'test-drive': 'Test Drive Request',
        'get-approved': 'Financing Pre-Approval',
        'value-trade': 'Trade-In Valuation',
        'reserve': 'Vehicle Reservation',
        'general': 'General Inquiry'
      };
      
      const categoryLabel = categoryLabels[category] || 'General Inquiry';
      const tags = [
        `chat-${category}`,
        'chatbot-lead',
        'website-lead',
        dealershipName?.toLowerCase().replace(/\s+/g, '-') || 'dealership'
      ].filter(Boolean);

      let contact = await this.getContactByPhone(phone);
      
      if (!contact) {
        contact = await this.createOrUpdateContact({
          phone,
          source: "AI Chatbot",
          tags,
          customFields: [
            { key: "chat_category", field_value: categoryLabel },
            { key: "year_make_model", field_value: vehicleName || "Not specified" },
            { key: "what_is_your_desired_vehicle", field_value: vehicleName || "Not specified" }
          ]
        });
      }

      const chatSummary = messages
        .map((m, i) => `${m.role === 'user' ? '👤 Customer' : '🤖 AI'}: ${m.content}`)
        .join('\n\n');

      const initialMessage = 
`🔔 New AI Chat Lead - ${categoryLabel}
${vehicleName ? `📋 Interested in: ${vehicleName}` : ''}

📱 Chat Summary:
${chatSummary}

---
Customer requested SMS follow-up.`;

      const conversation = await this.createConversation(contact.id, initialMessage);

      console.log(`[GHL] Chat conversation synced - Contact: ${contact.id}, Conversation: ${conversation.id}`);

      return { 
        success: true, 
        contactId: contact.id, 
        conversationId: conversation.id 
      };
    } catch (error) {
      console.error("[GHL] Error syncing chat conversation:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  /**
   * Create or update a lead in GHL from chat handoff
   */
  async createLeadFromChat(data: {
    phone: string;
    name?: string;
    email?: string;
    category: string;
    vehicleName?: string;
    vehicleId?: number;
    notes?: string;
  }): Promise<{ success: boolean; contactId?: string; error?: string }> {
    try {
      const tags = [
        'chatbot-lead',
        'website-lead',
        `interest-${data.category}`,
      ];

      let existingContact = await this.getContactByPhone(data.phone);
      
      if (!existingContact && data.email) {
        existingContact = await this.getContactByEmail(data.email);
      }

      const customFields: { key: string; field_value: string }[] = [
        { key: "chat_category", field_value: data.category },
      ];

      if (data.vehicleName) {
        customFields.push({ key: "year_make_model", field_value: data.vehicleName });
        customFields.push({ key: "what_is_your_desired_vehicle", field_value: data.vehicleName });
      }

      let contact: GHLContact;

      if (existingContact) {
        contact = existingContact;
      } else {
        const nameParts = data.name?.split(' ') || [];
        contact = await this.createOrUpdateContact({
          firstName: nameParts[0] || 'Chat',
          lastName: nameParts.slice(1).join(' ') || 'Lead',
          phone: data.phone,
          email: data.email,
          source: "AI Chatbot",
          tags,
          customFields,
        });
      }

      if (data.notes) {
        await this.sendMessage(contact.id, `📝 Lead Notes:\n${data.notes}`);
      }

      console.log(`[GHL] Lead created from chat - Contact: ${contact.id}`);
      return { success: true, contactId: contact.id };
    } catch (error) {
      console.error("[GHL] Error creating lead from chat:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  /**
   * Detect intent category from USER messages only using keyword matching
   * Only analyzes user-authored messages to avoid false positives from AI responses
   */
  private detectCategoryFromMessages(messages: Array<{ role: string; content: string }>): string {
    // Only analyze user messages to avoid AI greeting triggering false positives
    const userText = messages
      .filter(m => m.role === 'user')
      .map(m => m.content.toLowerCase())
      .join(' ');
    
    // Test Drive keywords - user explicitly asks for test drive
    if (/test\s*drive|book\s*(a\s*)?drive|schedule\s*(a\s*)?drive|come\s*(in|by)\s+and\s+(see|look|check)|want\s+to\s+see\s+it/i.test(userText)) {
      return 'test-drive';
    }
    
    // Financing keywords - user asks about financing
    if (/financ|pre-?approv|credit\s*(score|check|application)|loan|monthly\s*payment|what.*payment|can\s*i\s*afford|qualify/i.test(userText)) {
      return 'get-approved';
    }
    
    // Trade-in keywords - user asks about trading their current vehicle
    if (/trade|trade-?in|my\s*(current\s*)?(car|vehicle|suv|truck)|sell\s*my|apprais|what.*worth/i.test(userText)) {
      return 'value-trade';
    }
    
    // Reservation keywords - user wants to reserve or buy
    if (/reserve|put\s*(a\s*)?hold|deposit|secure|want\s*to\s*buy|ready\s*to\s*buy|purchase/i.test(userText)) {
      return 'reserve';
    }
    
    return 'general';
  }

  /**
   * Extract vehicle name from AI's greeting message (it usually mentions the vehicle)
   * Handles hyphenated makes like Mercedes-Benz, Rolls-Royce, etc.
   */
  private extractVehicleFromMessages(messages: Array<{ role: string; content: string }>): string | undefined {
    // Look for vehicle patterns in assistant messages (AI usually greets with vehicle name)
    // Pattern handles: "2024 Mercedes-Benz GLE 350", "2023 Ford F-150 Raptor", etc.
    const vehiclePattern = /(?:looking at|interested in|about|for)\s+(?:the\s+)?(\d{4}\s+[\w-]+(?:\s+[\w-]+){1,4})/i;
    
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        const match = msg.content.match(vehiclePattern);
        if (match && match[1]) {
          // Clean up the vehicle name - remove trailing punctuation and extra text
          return match[1].replace(/[.,!?].*$/, '').trim();
        }
      }
    }
    
    // Fallback: Look for year + make + model pattern anywhere in messages
    // Handles hyphenated makes and multi-word models
    const altPattern = /(\d{4}\s+[\w-]+(?:\s+[\w-]+){1,3})/i;
    for (const msg of messages) {
      if (msg.role === 'assistant') {
        const match = msg.content.match(altPattern);
        if (match && match[1]) {
          return match[1].replace(/[.,!?].*$/, '').trim();
        }
      }
    }
    
    return undefined;
  }

  /**
   * Format full transcript for GHL custom field (respects character limits)
   */
  private formatTranscriptForField(messages: Array<{ role: string; content: string }>, maxChars: number = 2000): string {
    // Build transcript with full messages, newest last
    let transcript = '';
    
    for (const msg of messages) {
      const prefix = msg.role === 'user' ? '👤 ' : '🤖 ';
      const line = `${prefix}${msg.content}\n\n`;
      
      if ((transcript + line).length <= maxChars) {
        transcript += line;
      } else {
        // If we're running out of space, truncate remaining messages
        const remaining = maxChars - transcript.length - 50;
        if (remaining > 0) {
          transcript += `${prefix}${msg.content.slice(0, remaining)}...`;
        }
        break;
      }
    }
    
    return transcript.trim();
  }

  /**
   * Auto-sync chat lead to GHL when contact info is captured
   * Supports both phone and email, with source tagging
   * Automatically detects intent and vehicle from conversation
   */
  async autoSyncChatLead(data: {
    phone?: string;
    email?: string;
    name?: string;
    category: string;
    vehicleName?: string;
    vehicleId?: number;
    source: 'website_chat' | 'facebook_marketplace' | 'messenger';
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    dealershipName?: string;
  }): Promise<{ success: boolean; contactId?: string; conversationId?: string; error?: string }> {
    try {
      const { phone, email, name, source, messages, dealershipName } = data;
      let { category, vehicleName } = data;
      
      if (!phone && !email) {
        return { success: false, error: "Phone or email required" };
      }

      // Auto-detect category from conversation if not explicitly set or is 'general'
      if (!category || category === 'general') {
        category = this.detectCategoryFromMessages(messages);
        console.log(`[GHL] Auto-detected category: ${category}`);
      }

      // Auto-extract vehicle name from conversation if not provided
      if (!vehicleName) {
        vehicleName = this.extractVehicleFromMessages(messages);
        if (vehicleName) {
          console.log(`[GHL] Auto-extracted vehicle: ${vehicleName}`);
        }
      }

      const sourceLabels: Record<string, string> = {
        'website_chat': 'Website Chat',
        'facebook_marketplace': 'Facebook Marketplace',
        'messenger': 'Facebook Messenger'
      };

      const categoryLabels: Record<string, string> = {
        'test-drive': 'Test Drive Request',
        'get-approved': 'Financing Pre-Approval',
        'value-trade': 'Trade-In Valuation',
        'reserve': 'Vehicle Reservation',
        'general': 'General Inquiry'
      };

      const sourceLabel = sourceLabels[source] || 'Website Chat';
      const categoryLabel = categoryLabels[category] || 'General Inquiry';
      
      const tags = [
        `chat-${category}`,
        'chatbot-lead',
        source === 'facebook_marketplace' ? 'fb-marketplace-lead' : 
        source === 'messenger' ? 'fb-messenger-lead' : 'website-lead',
        'auto-captured',
        dealershipName?.toLowerCase().replace(/\s+/g, '-') || 'dealership'
      ].filter(Boolean);

      let existingContact = phone ? await this.getContactByPhone(phone) : null;
      if (!existingContact && email) {
        existingContact = await this.getContactByEmail(email);
      }

      // Create full transcript for comments field (max 2000 chars for GHL)
      const fullTranscript = this.formatTranscriptForField(messages, 2000);

      // Map to user's existing GHL custom fields using field keys
      const customFields: { key: string; field_value: string }[] = [
        // chat_category - requires user to create this field in GHL
        { key: "chat_category", field_value: categoryLabel },
        // any_comments_or_concerns - existing field for full transcript
        { key: "any_comments_or_concerns", field_value: `[${categoryLabel}]\n${fullTranscript}` },
      ];

      // Vehicle interested in - use year_make_model for inventory vehicle
      if (vehicleName) {
        customFields.push({ key: "year_make_model", field_value: vehicleName });
        customFields.push({ key: "what_is_your_desired_vehicle", field_value: vehicleName });
      }

      let contact: GHLContact;

      if (existingContact) {
        // Update existing contact with the new field values
        contact = await this.updateContact(existingContact.id, {
          source: `AI Chatbot - ${sourceLabel}`,
          tags,
          customFields,
        });
        console.log(`[GHL] Updated existing contact: ${contact.id}`);
      } else {
        const nameParts = name?.split(' ') || [];
        contact = await this.createOrUpdateContact({
          firstName: nameParts[0] || 'Chat',
          lastName: nameParts.slice(1).join(' ') || 'Lead',
          phone: phone,
          email: email,
          source: `AI Chatbot - ${sourceLabel}`, // Use top-level source field
          tags,
          customFields,
        });
        console.log(`[GHL] Created new contact: ${contact.id}`);
      }

      const chatSummary = messages
        .map((m) => `${m.role === 'user' ? '👤 Customer' : '🤖 AI'}: ${m.content}`)
        .join('\n\n');

      const transcriptNote = 
`🔔 Auto-Captured Lead - ${sourceLabel}
📋 Category: ${categoryLabel}
${vehicleName ? `🚗 Interested in: ${vehicleName}` : ''}
${name ? `👤 Name: ${name}` : ''}
${phone ? `📱 Phone: ${phone}` : ''}
${email ? `📧 Email: ${email}` : ''}

📝 Chat Transcript:
${chatSummary}

---
Lead automatically captured from ${sourceLabel}.`;

      const conversation = await this.createConversation(contact.id, transcriptNote);

      console.log(`[GHL] Auto-synced chat lead - Contact: ${contact.id}, Conversation: ${conversation.id}, Source: ${source}`);

      return { 
        success: true, 
        contactId: contact.id, 
        conversationId: conversation.id 
      };
    } catch (error) {
      console.error("[GHL] Error auto-syncing chat lead:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }
}
