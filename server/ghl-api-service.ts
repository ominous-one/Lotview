/**
 * GHL API Service — Stub for compilation
 * Full implementation would integrate with GoHighLevel OAuth + REST API.
 */

export interface GhlApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export interface GhlConfig {
  clientId: string;
  clientSecret: string;
  apiKey?: string;
  baseUrl?: string;
}

export function createGhlApiService(config: GhlConfig) {
  const baseUrl = config.baseUrl || "https://rest.gohighlevel.com/v1";

  return {
    async get<T>(path: string, token?: string): Promise<GhlApiResponse<T>> {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        else if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

        const response = await fetch(`${baseUrl}${path}`, { headers });
        const data = await response.json().catch(() => ({}));
        return { success: response.ok, data, statusCode: response.status };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    async post<T>(path: string, body: any, token?: string): Promise<GhlApiResponse<T>> {
      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        else if (config.apiKey) headers["Authorization"] = `Bearer ${config.apiKey}`;

        const response = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        const data = await response.json().catch(() => ({}));
        return { success: response.ok, data, statusCode: response.status };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
      }
    },

    async sendEmail(params: { to: string; subject: string; body: string; dealershipId?: number }): Promise<GhlApiResponse> {
      console.log(`[GHL Stub] Email to ${params.to}: ${params.subject}`);
      return { success: true, data: { messageId: `ghl_email_${Date.now()}` } };
    },

    async sendSms(params: { to: string; message: string; contactId?: string }): Promise<GhlApiResponse> {
      console.log(`[GHL Stub] SMS to ${params.to}: ${params.message.slice(0, 50)}`);
      return { success: true, data: { messageId: `ghl_sms_${Date.now()}` } };
    },

    async getConversations(locationId: string, token: string): Promise<GhlApiResponse> {
      return this.get(`/conversations/search`, token);
    },

    async sendMessage(conversationId: string, payload: any, token: string): Promise<GhlApiResponse> {
      return this.post(`/conversations/${conversationId}/messages`, payload, token);
    },
  };
}

export type { GhlApiResponse };
