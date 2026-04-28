/**
 * GHL API Service - fail-closed compatibility layer.
 * Full implementation would integrate with GoHighLevel OAuth and REST APIs.
 */

export type GhlApiResponse<T = any> =
  | {
      success: true;
      data: T;
      error?: never;
      errorCode?: never;
      statusCode?: number;
      contactId?: string;
      [key: string]: any;
    }
  | {
      success: false;
      data?: T;
      error: string;
      errorCode?: string;
      statusCode?: number;
      contactId?: string;
      [key: string]: any;
    };

export interface GhlConfig {
  clientId: string;
  clientSecret: string;
  apiKey?: string;
  baseUrl?: string;
}

type GhlApiServiceInput = GhlConfig | number;

type ContactSearchResult = {
  contacts: Array<{ id: string; [key: string]: unknown }>;
};

type ContactResult = {
  id: string;
  [key: string]: unknown;
};

function normalizeConfig(input: GhlApiServiceInput): GhlConfig {
  if (typeof input === "number") {
    return {
      clientId: "",
      clientSecret: "",
      baseUrl: "https://rest.gohighlevel.com/v1",
    };
  }

  return input;
}

function disabledResponse<T>(operation: string): GhlApiResponse<T> {
  return {
    success: false,
    error: `GHL ${operation} is not configured`,
    errorCode: "GHL_NOT_CONFIGURED",
  };
}

export function createGhlApiService(input: GhlApiServiceInput) {
  const config = normalizeConfig(input);
  const baseUrl = config.baseUrl || "https://rest.gohighlevel.com/v1";
  const hasCredentials = Boolean(config.apiKey || (config.clientId && config.clientSecret));

  return {
    async get<T>(path: string, token?: string): Promise<GhlApiResponse<T>> {
      if (!token && !config.apiKey) {
        return disabledResponse<T>("GET request");
      }

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        else if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

        const response = await fetch(`${baseUrl}${path}`, { headers });
        const data = await response.json().catch(() => ({} as T));
        if (!response.ok) {
          return {
            success: false,
            data,
            error: `GHL request failed with ${response.status}`,
            errorCode: `HTTP_${response.status}`,
            statusCode: response.status,
          };
        }

        return { success: true, data, statusCode: response.status };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          errorCode: "NETWORK_ERROR",
        };
      }
    },

    async post<T>(path: string, body: any, token?: string): Promise<GhlApiResponse<T>> {
      if (!token && !config.apiKey) {
        return disabledResponse<T>("POST request");
      }

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        else if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

        const response = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({} as T));
        if (!response.ok) {
          return {
            success: false,
            data,
            error: `GHL request failed with ${response.status}`,
            errorCode: `HTTP_${response.status}`,
            statusCode: response.status,
          };
        }

        return { success: true, data, statusCode: response.status };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
          errorCode: "NETWORK_ERROR",
        };
      }
    },

    async sendEmail(params: { to: string; subject: string; body: string; dealershipId?: number }): Promise<GhlApiResponse> {
      void params;
      return disabledResponse("email send");
    },

    async sendSms(params: { to: string; message: string; contactId?: string }): Promise<GhlApiResponse> {
      void params;
      return disabledResponse("SMS send");
    },

    async getConversations(locationId: string, token: string): Promise<GhlApiResponse> {
      void locationId;
      return this.get("/conversations/search", token);
    },

    async sendMessage(conversationId: string, payload: any, token?: string): Promise<GhlApiResponse> {
      return this.post(`/conversations/${conversationId}/messages`, payload, token);
    },

    async refreshAccessToken(): Promise<boolean> {
      return hasCredentials;
    },

    async searchContacts(_params: Record<string, unknown>): Promise<GhlApiResponse<ContactSearchResult>> {
      return disabledResponse<ContactSearchResult>("contact search");
    },

    async getContact(_contactId: string): Promise<GhlApiResponse<ContactResult>> {
      return disabledResponse<ContactResult>("contact lookup");
    },

    async createContact(_params: Record<string, unknown>): Promise<GhlApiResponse<ContactResult>> {
      return disabledResponse<ContactResult>("contact create");
    },

    async updateContact(_contactId: string, _params: Record<string, unknown>): Promise<GhlApiResponse<ContactResult>> {
      return disabledResponse<ContactResult>("contact update");
    },

    async getOrCreateConversation(
      _contactId: string,
      _conversationType?: string,
      _locationId?: string,
    ): Promise<GhlApiResponse<{ id: string }>> {
      return disabledResponse<{ id: string }>("conversation create");
    },

    async getCalendarEvents(
      _calendarId?: string,
      _startDate?: string,
      _endDate?: string,
    ): Promise<GhlApiResponse<{ events: unknown[] }>> {
      return disabledResponse<{ events: unknown[] }>("calendar events lookup");
    },

    async createCalendarEvent(_params: Record<string, unknown>): Promise<GhlApiResponse<{ id: string }>> {
      return disabledResponse<{ id: string }>("calendar event create");
    },

    async getPipelines(): Promise<GhlApiResponse<{ pipelines: unknown[] }>> {
      return disabledResponse<{ pipelines: unknown[] }>("pipeline lookup");
    },

    async getCalendars(): Promise<GhlApiResponse<{ calendars: unknown[] }>> {
      return disabledResponse<{ calendars: unknown[] }>("calendar lookup");
    },

    async getOpportunities(_pipelineId?: string): Promise<GhlApiResponse<{ opportunities: unknown[] }>> {
      return disabledResponse<{ opportunities: unknown[] }>("opportunity lookup");
    },

    async createOpportunity(_params: Record<string, unknown>): Promise<GhlApiResponse<{ id: string }>> {
      return disabledResponse<{ id: string }>("opportunity create");
    },

    async testConnection(): Promise<any> {
      return { ...disabledResponse<{ ok: boolean }>("connection test"), message: "GHL connection test is not configured" };
    },
  };
}
