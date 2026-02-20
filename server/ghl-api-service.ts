import { storage } from "./storage";
import type { GhlAccount, InsertGhlAccount, GhlConfig, InsertGhlApiLog } from "@shared/schema";

// GoHighLevel API Base URLs
const GHL_API_BASE = "https://services.leadconnectorhq.com";
const GHL_OAUTH_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";
const GHL_TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

// GHL API Response types
interface GhlApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

// GHL Contact type
interface GhlContact {
  id: string;
  locationId: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email?: string;
  phone?: string;
  companyName?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  tags?: string[];
  source?: string;
  dateAdded?: string;
  dateUpdated?: string;
  customFields?: Array<{ id: string; key: string; value: string }>;
}

// GHL Calendar Event type
interface GhlCalendarEvent {
  id: string;
  calendarId: string;
  locationId: string;
  contactId?: string;
  title: string;
  appointmentStatus: string;
  startTime: string;
  endTime: string;
  notes?: string;
  address?: string;
}

// GHL Opportunity type
interface GhlOpportunity {
  id: string;
  name: string;
  pipelineId: string;
  pipelineStageId: string;
  status: string;
  contactId: string;
  monetaryValue?: number;
  source?: string;
  dateAdded?: string;
  dateUpdated?: string;
}

// GHL Calendar type
interface GhlCalendar {
  id: string;
  locationId: string;
  name: string;
  description?: string;
  isActive: boolean;
}

// GHL Pipeline type
interface GhlPipeline {
  id: string;
  name: string;
  locationId: string;
  stages: Array<{
    id: string;
    name: string;
    position: number;
  }>;
}

// GHL Conversation type
interface GhlConversation {
  id: string;
  locationId: string;
  contactId: string;
  type: string; // 'TYPE_PHONE', 'TYPE_EMAIL', 'TYPE_SMS', 'TYPE_FB_MESSENGER', 'TYPE_LIVE_CHAT', etc.
  unreadCount: number;
  lastMessageDate: string;
  lastMessageBody: string;
  lastMessageDirection: 'inbound' | 'outbound';
  lastMessageType: string;
  fullName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
}

// GHL Message type
interface GhlMessage {
  id: string;
  conversationId: string;
  locationId: string;
  contactId: string;
  type: number; // 1 = email, 2 = sms, 3 = phone, 4 = fb, etc.
  direction: 'inbound' | 'outbound';
  body: string;
  status: string;
  dateAdded: string;
  attachments?: Array<{
    url: string;
    type: string;
  }>;
  userId?: string;
}

// OAuth token response
interface GhlTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  locationId: string;
  companyId?: string;
  userId?: string;
  userType?: string;
}

// Location info response
interface GhlLocationInfo {
  location: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    timezone?: string;
  };
}

// API key credentials from dealership settings (alternative to OAuth)
interface ApiKeyCredentials {
  apiKey: string;
  locationId: string;
}

export class GhlApiService {
  private dealershipId: number;
  private account: GhlAccount | null = null;
  private apiKeyCredentials: ApiKeyCredentials | null = null;
  private useApiKey: boolean = false;

  constructor(dealershipId: number) {
    this.dealershipId = dealershipId;
  }

  // Get OAuth authorization URL for connecting a GHL account
  static getAuthUrl(clientId: string, redirectUri: string, state: string): string {
    const scopes = [
      "contacts.readonly",
      "contacts.write",
      "calendars.readonly",
      "calendars.write",
      "calendars/events.readonly",
      "calendars/events.write",
      "opportunities.readonly",
      "opportunities.write",
      "locations.readonly",
      "users.readonly",
      "conversations.readonly",
      "conversations.write",
      "conversations/message.readonly",
      "conversations/message.write",
    ].join(" ");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: scopes,
      state: state,
    });

    return `${GHL_OAUTH_URL}?${params.toString()}`;
  }

  // Exchange authorization code for tokens
  static async exchangeCodeForTokens(
    code: string,
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ): Promise<GhlTokenResponse> {
    const response = await fetch(GHL_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to exchange code for tokens: ${error}`);
    }

    return response.json();
  }

  // Refresh access token
  async refreshAccessToken(): Promise<boolean> {
    const account = await this.getAccount();
    if (!account) {
      console.error(`[GHL] No account found for dealership ${this.dealershipId}`);
      return false;
    }

    const clientId = process.env.GHL_CLIENT_ID;
    const clientSecret = process.env.GHL_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error("[GHL] Missing GHL_CLIENT_ID or GHL_CLIENT_SECRET");
      return false;
    }

    try {
      const response = await fetch(GHL_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: account.refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[GHL] Token refresh failed: ${error}`);
        return false;
      }

      const tokens: GhlTokenResponse = await response.json();

      // Update account with new tokens
      await storage.updateGhlAccount(account.id, this.dealershipId, {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      });

      // Clear cached account
      this.account = null;

      console.log(`[GHL] Token refreshed for dealership ${this.dealershipId}`);
      return true;
    } catch (error) {
      console.error(`[GHL] Token refresh error:`, error);
      return false;
    }
  }

  // Get the GHL account for this dealership
  private async getAccount(): Promise<GhlAccount | null> {
    if (this.account) {
      return this.account;
    }
    const account = await storage.getGhlAccountByDealership(this.dealershipId);
    this.account = account || null;
    return this.account;
  }

  // Get API key credentials from dealership settings (fallback when no OAuth account)
  private async getApiKeyCredentials(): Promise<ApiKeyCredentials | null> {
    if (this.apiKeyCredentials) {
      return this.apiKeyCredentials;
    }
    
    const apiKeys = await storage.getDealershipApiKeys(this.dealershipId);
    if (apiKeys?.ghlApiKey && apiKeys?.ghlLocationId) {
      this.apiKeyCredentials = {
        apiKey: apiKeys.ghlApiKey,
        locationId: apiKeys.ghlLocationId
      };
      this.useApiKey = true;
      return this.apiKeyCredentials;
    }
    return null;
  }

  // Check if token needs refresh (expires in less than 5 minutes)
  private async ensureValidToken(): Promise<boolean> {
    // First check if we have API key credentials
    const apiKeyCreds = await this.getApiKeyCredentials();
    if (apiKeyCreds) {
      // API keys don't expire
      this.useApiKey = true;
      return true;
    }
    
    // Fall back to OAuth account
    const account = await this.getAccount();
    if (!account) {
      return false;
    }

    const expiresAt = new Date(account.expiresAt);
    const now = new Date();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiresAt.getTime() - now.getTime() < fiveMinutes) {
      return await this.refreshAccessToken();
    }

    return true;
  }

  // Get location ID from either API key credentials or OAuth account
  private async getLocationId(): Promise<string | null> {
    // First try API key credentials
    const apiKeyCreds = await this.getApiKeyCredentials();
    if (apiKeyCreds) {
      return apiKeyCreds.locationId;
    }
    
    // Fall back to OAuth account
    const account = await this.getAccount();
    return account?.locationId || null;
  }

  // Make authenticated API request
  private async apiRequest<T>(
    method: string,
    endpoint: string,
    body?: object,
    retryCount = 0
  ): Promise<GhlApiResponse<T>> {
    const startTime = Date.now();

    // Ensure valid token
    const tokenValid = await this.ensureValidToken();
    if (!tokenValid) {
      return { success: false, error: "No valid access token or API key", errorCode: "NO_TOKEN" };
    }

    // Determine authorization header based on whether we're using API key or OAuth
    let authHeader: string;
    let locationId: string;
    
    if (this.useApiKey && this.apiKeyCredentials) {
      // Using API key from dealership settings
      authHeader = `Bearer ${this.apiKeyCredentials.apiKey}`;
      locationId = this.apiKeyCredentials.locationId;
    } else {
      // Using OAuth account
      const account = await this.getAccount();
      if (!account) {
        return { success: false, error: "No GHL account configured", errorCode: "NO_ACCOUNT" };
      }
      authHeader = `Bearer ${account.accessToken}`;
      locationId = account.locationId;
    }

    const url = `${GHL_API_BASE}${endpoint}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Authorization": authHeader,
          "Content-Type": "application/json",
          "Version": "2021-07-28",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const durationMs = Date.now() - startTime;

      // Log API call
      await this.logApiCall(endpoint, method, body, response.status, null, durationMs);

      if (response.status === 401 && retryCount < 1) {
        // Token expired, refresh and retry
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          return this.apiRequest<T>(method, endpoint, body, retryCount + 1);
        }
        return { success: false, error: "Authentication failed", errorCode: "AUTH_FAILED" };
      }

      if (response.status === 429) {
        // Rate limited - wait and retry
        const retryAfter = parseInt(response.headers.get("Retry-After") || "5");
        if (retryCount < 3) {
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
          return this.apiRequest<T>(method, endpoint, body, retryCount + 1);
        }
        return { success: false, error: "Rate limited", errorCode: "RATE_LIMITED" };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: errorText, errorCode: `HTTP_${response.status}` };
      }

      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      await this.logApiCall(endpoint, method, body, null, errorMessage, durationMs);

      // Network error - retry with exponential backoff
      if (retryCount < 3) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
        return this.apiRequest<T>(method, endpoint, body, retryCount + 1);
      }

      return { success: false, error: errorMessage, errorCode: "NETWORK_ERROR" };
    }
  }

  // Log API calls for debugging
  private async logApiCall(
    endpoint: string,
    method: string,
    requestPayload: object | undefined,
    responseStatus: number | null,
    errorMessage: string | null,
    durationMs: number
  ): Promise<void> {
    try {
      await storage.createGhlApiLog({
        dealershipId: this.dealershipId,
        endpoint,
        method,
        requestPayload: requestPayload ? JSON.stringify(requestPayload).substring(0, 5000) : null,
        responseStatus,
        responsePayload: null,
        durationMs,
        errorMessage,
      });
    } catch (error) {
      console.error("[GHL] Failed to log API call:", error);
    }
  }

  // ===== CONTACTS API =====

  async getContact(contactId: string): Promise<GhlApiResponse<GhlContact>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }
    return this.apiRequest<GhlContact>("GET", `/contacts/${contactId}`);
  }

  async searchContacts(params: {
    query?: string;
    email?: string;
    phone?: string;
    limit?: number;
  }): Promise<GhlApiResponse<{ contacts: GhlContact[] }>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }

    // GHL API v2 uses POST /contacts/search with JSON body
    const searchBody: Record<string, any> = {
      locationId,
    };
    
    if (params.query) searchBody.query = params.query;
    if (params.email) searchBody.email = params.email;
    if (params.phone) searchBody.phone = params.phone;
    if (params.limit) searchBody.limit = params.limit;

    return this.apiRequest<{ contacts: GhlContact[] }>("POST", `/contacts/search`, searchBody);
  }

  async createContact(contact: Partial<GhlContact>): Promise<GhlApiResponse<GhlContact>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }

    return this.apiRequest<GhlContact>("POST", "/contacts/", {
      ...contact,
      locationId,
    });
  }

  async updateContact(contactId: string, updates: Partial<GhlContact>): Promise<GhlApiResponse<GhlContact>> {
    return this.apiRequest<GhlContact>("PUT", `/contacts/${contactId}`, updates);
  }

  async addTagsToContact(contactId: string, tags: string[]): Promise<GhlApiResponse<GhlContact>> {
    return this.apiRequest<GhlContact>("POST", `/contacts/${contactId}/tags`, { tags });
  }

  async removeTagsFromContact(contactId: string, tags: string[]): Promise<GhlApiResponse<GhlContact>> {
    return this.apiRequest<GhlContact>("DELETE", `/contacts/${contactId}/tags`, { tags });
  }

  // ===== CALENDARS API =====

  async getCalendars(): Promise<GhlApiResponse<{ calendars: GhlCalendar[] }>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }
    return this.apiRequest<{ calendars: GhlCalendar[] }>("GET", `/calendars/?locationId=${locationId}`);
  }

  async getCalendarEvents(
    calendarId: string,
    startTime: string,
    endTime: string
  ): Promise<GhlApiResponse<{ events: GhlCalendarEvent[] }>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }

    const params = new URLSearchParams({
      locationId,
      calendarId,
      startTime,
      endTime,
    });

    return this.apiRequest<{ events: GhlCalendarEvent[] }>("GET", `/calendars/events?${params.toString()}`);
  }

  async createCalendarEvent(event: Partial<GhlCalendarEvent>): Promise<GhlApiResponse<GhlCalendarEvent>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }

    return this.apiRequest<GhlCalendarEvent>("POST", "/calendars/events", {
      ...event,
      locationId,
    });
  }

  async updateCalendarEvent(eventId: string, updates: Partial<GhlCalendarEvent>): Promise<GhlApiResponse<GhlCalendarEvent>> {
    return this.apiRequest<GhlCalendarEvent>("PUT", `/calendars/events/${eventId}`, updates);
  }

  async deleteCalendarEvent(eventId: string): Promise<GhlApiResponse<void>> {
    return this.apiRequest<void>("DELETE", `/calendars/events/${eventId}`);
  }

  // ===== OPPORTUNITIES API =====

  async getOpportunities(pipelineId?: string): Promise<GhlApiResponse<{ opportunities: GhlOpportunity[] }>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }

    const params = new URLSearchParams({ locationId });
    if (pipelineId) params.set("pipelineId", pipelineId);

    return this.apiRequest<{ opportunities: GhlOpportunity[] }>("GET", `/opportunities/search?${params.toString()}`);
  }

  async getOpportunity(opportunityId: string): Promise<GhlApiResponse<GhlOpportunity>> {
    return this.apiRequest<GhlOpportunity>("GET", `/opportunities/${opportunityId}`);
  }

  async createOpportunity(opportunity: Partial<GhlOpportunity>): Promise<GhlApiResponse<GhlOpportunity>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }

    return this.apiRequest<GhlOpportunity>("POST", "/opportunities/", opportunity);
  }

  async updateOpportunity(opportunityId: string, updates: Partial<GhlOpportunity>): Promise<GhlApiResponse<GhlOpportunity>> {
    return this.apiRequest<GhlOpportunity>("PUT", `/opportunities/${opportunityId}`, updates);
  }

  async updateOpportunityStage(opportunityId: string, stageId: string): Promise<GhlApiResponse<GhlOpportunity>> {
    return this.apiRequest<GhlOpportunity>("PUT", `/opportunities/${opportunityId}/status`, {
      pipelineStageId: stageId,
    });
  }

  // ===== PIPELINES API =====

  async getPipelines(): Promise<GhlApiResponse<{ pipelines: GhlPipeline[] }>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }
    return this.apiRequest<{ pipelines: GhlPipeline[] }>("GET", `/opportunities/pipelines?locationId=${locationId}`);
  }

  // ===== LOCATION INFO =====

  async getLocationInfo(): Promise<GhlApiResponse<GhlLocationInfo>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }
    return this.apiRequest<GhlLocationInfo>("GET", `/locations/${locationId}`);
  }

  // ===== CONVERSATIONS API =====

  async getConversations(params?: {
    contactId?: string;
    type?: string;
    limit?: number;
    lastMessageAfter?: string;
  }): Promise<GhlApiResponse<{ conversations: GhlConversation[] }>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }

    const searchParams = new URLSearchParams();
    searchParams.set("locationId", locationId);
    if (params?.contactId) searchParams.set("contactId", params.contactId);
    if (params?.type) searchParams.set("type", params.type);
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.lastMessageAfter) searchParams.set("lastMessageAfter", params.lastMessageAfter);

    return this.apiRequest<{ conversations: GhlConversation[] }>("GET", `/conversations/search?${searchParams.toString()}`);
  }

  async getConversation(conversationId: string): Promise<GhlApiResponse<GhlConversation>> {
    return this.apiRequest<GhlConversation>("GET", `/conversations/${conversationId}`);
  }

  async getConversationMessages(conversationId: string, params?: {
    limit?: number;
    lastMessageId?: string;
  }): Promise<GhlApiResponse<{ messages: GhlMessage[] }>> {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set("limit", params.limit.toString());
    if (params?.lastMessageId) searchParams.set("lastMessageId", params.lastMessageId);

    const endpoint = searchParams.toString()
      ? `/conversations/${conversationId}/messages?${searchParams.toString()}`
      : `/conversations/${conversationId}/messages`;

    return this.apiRequest<{ messages: GhlMessage[] }>("GET", endpoint);
  }

  async sendMessage(conversationId: string, message: {
    type: 'SMS' | 'Email' | 'WhatsApp' | 'GMB' | 'IG' | 'FB' | 'Live_Chat';
    message?: string;
    html?: string;
    subject?: string;
    emailFrom?: string;
    emailTo?: string;
    emailCc?: string[];
    emailBcc?: string[];
    attachments?: string[];
    contactId?: string;
  }): Promise<GhlApiResponse<GhlMessage>> {
    // GHL API v2 uses POST /conversations/messages with contactId and locationId in body
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }

    const payload: Record<string, any> = {
      type: message.type,
      locationId,
    };
    
    // contactId is required by GHL API for sending messages
    if (message.contactId) {
      payload.contactId = message.contactId;
    }
    
    if (message.type === 'SMS') {
      // For SMS, need type, message, contactId, and locationId
      payload.message = message.message;
    } else if (message.type === 'Email') {
      // For Email, need more fields
      payload.message = message.message;
      payload.html = message.html;
      payload.subject = message.subject;
      if (message.emailTo) payload.emailTo = message.emailTo;
      if (message.emailFrom) payload.emailFrom = message.emailFrom;
      if (message.emailCc) payload.emailCc = message.emailCc;
      if (message.emailBcc) payload.emailBcc = message.emailBcc;
    } else {
      // For other channels
      payload.message = message.message;
    }
    
    if (message.attachments?.length) {
      payload.attachments = message.attachments;
    }
    
    console.log(`[GHL] Sending ${message.type} via /conversations/messages:`, payload);
    // GHL API v2 uses /conversations/messages endpoint (not /conversations/{id}/messages)
    return this.apiRequest<GhlMessage>("POST", `/conversations/messages`, payload);
  }

  async createConversation(params: {
    contactId: string;
    type?: string;
  }): Promise<GhlApiResponse<GhlConversation>> {
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, error: "No account", errorCode: "NO_ACCOUNT" };
    }

    const result = await this.apiRequest<any>("POST", "/conversations/", {
      locationId,
      contactId: params.contactId,
      type: params.type || "TYPE_SMS",
    });
    
    if (result.success && result.data) {
      // GHL API may return { conversation: {...} } or direct conversation object
      const conversation = result.data.conversation || result.data;
      console.log(`[GHL] Created conversation:`, JSON.stringify(conversation));
      return { success: true, data: conversation };
    }
    
    return result;
  }

  async getOrCreateConversation(contactId: string, type?: string): Promise<GhlApiResponse<GhlConversation>> {
    const existingResult = await this.getConversations({ contactId, type, limit: 1 });
    if (existingResult.success && existingResult.data?.conversations?.length) {
      console.log(`[GHL] Found existing conversation: ${existingResult.data.conversations[0].id}`);
      return { success: true, data: existingResult.data.conversations[0] };
    }
    console.log(`[GHL] No existing conversation found, creating new one for contact ${contactId}`);
    return this.createConversation({ contactId, type });
  }

  // ===== UTILITY METHODS =====

  async testConnection(): Promise<{ success: boolean; message: string; locationName?: string }> {
    // Check if we have any valid credentials (API key or OAuth)
    const locationId = await this.getLocationId();
    if (!locationId) {
      return { success: false, message: "No GoHighLevel account connected for this dealership" };
    }

    const result = await this.getLocationInfo();
    if (result.success && result.data) {
      return {
        success: true,
        message: this.useApiKey ? "Connected via API Key" : "Connected to GoHighLevel",
        locationName: result.data.location.name,
      };
    }

    return { success: false, message: result.error || "Failed to connect" };
  }

  async getApiLogs(limit = 100) {
    return storage.getGhlApiLogs(this.dealershipId, limit);
  }
}

// Factory function to create GHL API service
export function createGhlApiService(dealershipId: number): GhlApiService {
  return new GhlApiService(dealershipId);
}

// Export types for use in routes
export type {
  GhlContact,
  GhlCalendarEvent,
  GhlOpportunity,
  GhlCalendar,
  GhlPipeline,
  GhlConversation,
  GhlMessage,
  GhlTokenResponse,
  GhlApiResponse,
};
