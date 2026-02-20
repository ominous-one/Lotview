import { storage } from "./storage";
import type { PbsConfig, PbsSession, InsertPbsSession } from "@shared/schema";

const DEFAULT_SESSION_DURATION_HOURS = 8;
const CACHE_TTL_HOURS = 24;

interface PbsApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

interface PbsLoginResponse {
  sessionId: string;
  expiresIn?: number;
}

interface PbsContact {
  ContactID: string;
  FirstName?: string;
  LastName?: string;
  Email?: string;
  Phone?: string;
  CellPhone?: string;
  Address?: string;
  City?: string;
  Province?: string;
  PostalCode?: string;
  [key: string]: unknown;
}

interface PbsContactVehicle {
  ContactID: string;
  VehicleID: string;
  Year?: number;
  Make?: string;
  Model?: string;
  VIN?: string;
  [key: string]: unknown;
}

interface PbsWorkplanEvent {
  EventID: string;
  ContactID?: string;
  EventType?: string;
  EventDate?: string;
  Status?: string;
  Notes?: string;
  [key: string]: unknown;
}

interface PbsWorkplanAppointment {
  AppointmentID: string;
  ContactID?: string;
  AppointmentDate?: string;
  AppointmentTime?: string;
  Status?: string;
  Notes?: string;
  [key: string]: unknown;
}

interface PbsServiceAppointment {
  AppointmentID: string;
  ContactID?: string;
  VehicleID?: string;
  ScheduledDate?: string;
  ScheduledTime?: string;
  ServiceAdvisor?: string;
  Status?: string;
  [key: string]: unknown;
}

interface PbsRepairOrder {
  RepairOrderID: string;
  ContactID?: string;
  VehicleID?: string;
  OpenDate?: string;
  CloseDate?: string;
  Status?: string;
  TotalAmount?: number;
  [key: string]: unknown;
}

interface PbsPartsInventory {
  PartNumber: string;
  Description?: string;
  QuantityOnHand?: number;
  QuantityAvailable?: number;
  RetailPrice?: number;
  CostPrice?: number;
  [key: string]: unknown;
}

interface PbsTireStorage {
  StorageID: string;
  ContactID?: string;
  VehicleID?: string;
  VIN?: string;
  TireSize?: string;
  TireType?: string;
  StorageLocation?: string;
  StoredDate?: string;
  [key: string]: unknown;
}

interface PbsShop {
  ShopID: string;
  ShopName?: string;
  ShopType?: string;
  [key: string]: unknown;
}

export class PbsApiService {
  private dealershipId: number;
  private config: PbsConfig | null = null;
  private session: PbsSession | null = null;

  constructor(dealershipId: number) {
    this.dealershipId = dealershipId;
  }

  private async loadConfig(): Promise<PbsConfig> {
    if (!this.config) {
      const config = await storage.getPbsConfig(this.dealershipId);
      if (!config) {
        throw new Error(`PBS configuration not found for dealership ${this.dealershipId}`);
      }
      if (!config.isActive) {
        throw new Error("PBS integration is disabled for this dealership");
      }
      this.config = config;
    }
    return this.config;
  }

  private async getSession(): Promise<string> {
    const existingSession = await storage.getPbsSession(this.dealershipId);
    if (existingSession) {
      await storage.updatePbsSessionLastUsed(existingSession.id, this.dealershipId);
      this.session = existingSession;
      return existingSession.sessionToken;
    }
    const newSession = await this.login();
    return newSession.sessionToken;
  }

  private async login(): Promise<PbsSession> {
    const config = await this.loadConfig();
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${config.pbsApiUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Partner-Id": config.partnerId,
        },
        body: JSON.stringify({
          username: config.username,
          password: config.password,
        }),
      });

      const duration = Date.now() - startTime;
      
      if (!response.ok) {
        const errorText = await response.text();
        await this.logApiCall("Login", "POST", { username: config.username }, response.status, errorText, duration, errorText);
        throw new Error(`PBS login failed: ${response.status} ${errorText}`);
      }

      const data: PbsLoginResponse = await response.json();
      await this.logApiCall("Login", "POST", { username: config.username }, response.status, null, duration, null);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + (data.expiresIn ? data.expiresIn / 3600 : DEFAULT_SESSION_DURATION_HOURS));

      await storage.deleteExpiredPbsSessions(this.dealershipId);

      const session = await storage.createPbsSession({
        dealershipId: this.dealershipId,
        sessionToken: data.sessionId,
        sessionData: JSON.stringify({ loginTime: new Date().toISOString() }),
        expiresAt,
        isActive: true,
      });

      this.session = session;
      return session;
    } catch (error) {
      const duration = Date.now() - startTime;
      await this.logApiCall("Login", "POST", { username: config.username }, 0, null, duration, error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }

  private async request<T>(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    body?: Record<string, unknown>,
    retryCount: number = 0
  ): Promise<PbsApiResponse<T>> {
    const config = await this.loadConfig();
    const sessionToken = await this.getSession();
    const startTime = Date.now();
    const maxRetries = 3;

    try {
      const url = `${config.pbsApiUrl}/api/v1/${endpoint}`;
      const options: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionToken}`,
          "X-Partner-Id": config.partnerId,
        },
      };

      if (body && method === "POST") {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      const duration = Date.now() - startTime;

      if (response.status === 401 && retryCount < maxRetries) {
        if (this.session) {
          await storage.deletePbsSession(this.session.id, this.dealershipId);
          this.session = null;
        }
        return this.request<T>(endpoint, method, body, retryCount + 1);
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
        
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.request<T>(endpoint, method, body, retryCount + 1);
        }
        
        await this.logApiCall(endpoint, method, body || {}, response.status, null, duration, "Rate limit exceeded");
        return { success: false, error: "Rate limit exceeded", errorCode: "RATE_LIMIT" };
      }

      if (!response.ok) {
        const errorText = await response.text();
        await this.logApiCall(endpoint, method, body || {}, response.status, errorText, duration, errorText);
        return { success: false, error: errorText, errorCode: `HTTP_${response.status}` };
      }

      const data = await response.json();
      await this.logApiCall(endpoint, method, body || {}, response.status, JSON.stringify(data).slice(0, 1000), duration, null);
      
      return { success: true, data: data as T };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      
      if (retryCount < maxRetries && (errorMessage.includes("ECONNRESET") || errorMessage.includes("ETIMEDOUT"))) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.request<T>(endpoint, method, body, retryCount + 1);
      }
      
      await this.logApiCall(endpoint, method, body || {}, 0, null, duration, errorMessage);
      return { success: false, error: errorMessage, errorCode: "NETWORK_ERROR" };
    }
  }

  private async logApiCall(
    endpoint: string,
    method: string,
    requestPayload: Record<string, unknown>,
    responseStatus: number,
    responsePayload: string | null,
    durationMs: number,
    errorMessage: string | null
  ): Promise<void> {
    try {
      const sanitizedRequest = { ...requestPayload };
      if (sanitizedRequest.password) sanitizedRequest.password = "[REDACTED]";
      
      await storage.createPbsApiLog({
        dealershipId: this.dealershipId,
        endpoint,
        method,
        requestPayload: JSON.stringify(sanitizedRequest),
        responseStatus,
        responsePayload,
        durationMs,
        errorMessage,
      });
    } catch (err) {
      console.error("Failed to log PBS API call:", err);
    }
  }

  async contactGet(contactId: string): Promise<PbsApiResponse<PbsContact>> {
    const cached = await storage.getPbsContactByPbsId(this.dealershipId, contactId);
    if (cached) {
      return { success: true, data: JSON.parse(cached.payload) };
    }

    const result = await this.request<PbsContact>(`contacts/${contactId}`);
    
    if (result.success && result.data) {
      await this.cacheContact(result.data);
    }
    
    return result;
  }

  async contactSearch(params: { phone?: string; email?: string; firstName?: string; lastName?: string }): Promise<PbsApiResponse<PbsContact[]>> {
    if (params.phone) {
      const cached = await storage.getPbsContactByPhone(this.dealershipId, params.phone);
      if (cached) {
        return { success: true, data: [JSON.parse(cached.payload)] };
      }
    }
    
    if (params.email) {
      const cached = await storage.getPbsContactByEmail(this.dealershipId, params.email);
      if (cached) {
        return { success: true, data: [JSON.parse(cached.payload)] };
      }
    }

    const queryParams = new URLSearchParams();
    if (params.phone) queryParams.set("phone", params.phone);
    if (params.email) queryParams.set("email", params.email);
    if (params.firstName) queryParams.set("firstName", params.firstName);
    if (params.lastName) queryParams.set("lastName", params.lastName);

    const result = await this.request<PbsContact[]>(`contacts/search?${queryParams.toString()}`);
    
    if (result.success && result.data) {
      for (const contact of result.data) {
        await this.cacheContact(contact);
      }
    }
    
    return result;
  }

  async contactSave(contact: Partial<PbsContact>): Promise<PbsApiResponse<PbsContact>> {
    const result = await this.request<PbsContact>("contacts", "POST", contact as Record<string, unknown>);
    
    if (result.success && result.data) {
      await this.cacheContact(result.data);
    }
    
    return result;
  }

  async contactChange(contactId: string, updates: Partial<PbsContact>): Promise<PbsApiResponse<PbsContact>> {
    const result = await this.request<PbsContact>(`contacts/${contactId}`, "POST", updates as Record<string, unknown>);
    
    if (result.success && result.data) {
      await this.cacheContact(result.data);
    }
    
    return result;
  }

  async contactVehicleGet(contactId: string): Promise<PbsApiResponse<PbsContactVehicle[]>> {
    return this.request<PbsContactVehicle[]>(`contacts/${contactId}/vehicles`);
  }

  private async cacheContact(contact: PbsContact): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

    const existing = await storage.getPbsContactByPbsId(this.dealershipId, contact.ContactID);
    
    if (existing) {
      await storage.updatePbsContactCache(existing.id, this.dealershipId, {
        firstName: contact.FirstName || null,
        lastName: contact.LastName || null,
        email: contact.Email || null,
        phone: contact.Phone || null,
        cellPhone: contact.CellPhone || null,
        address: contact.Address || null,
        city: contact.City || null,
        province: contact.Province || null,
        postalCode: contact.PostalCode || null,
        payload: JSON.stringify(contact),
        expiresAt,
      });
    } else {
      await storage.createPbsContactCache({
        dealershipId: this.dealershipId,
        pbsContactId: contact.ContactID,
        firstName: contact.FirstName || null,
        lastName: contact.LastName || null,
        email: contact.Email || null,
        phone: contact.Phone || null,
        cellPhone: contact.CellPhone || null,
        address: contact.Address || null,
        city: contact.City || null,
        province: contact.Province || null,
        postalCode: contact.PostalCode || null,
        payload: JSON.stringify(contact),
        expiresAt,
      });
    }
  }

  async workplanEventGet(eventId: string): Promise<PbsApiResponse<PbsWorkplanEvent>> {
    return this.request<PbsWorkplanEvent>(`workplan/events/${eventId}`);
  }

  async workplanEventsByContact(contactId: string): Promise<PbsApiResponse<PbsWorkplanEvent[]>> {
    return this.request<PbsWorkplanEvent[]>(`workplan/events?contactId=${contactId}`);
  }

  async workplanEventChange(eventId: string, updates: Partial<PbsWorkplanEvent>): Promise<PbsApiResponse<PbsWorkplanEvent>> {
    return this.request<PbsWorkplanEvent>(`workplan/events/${eventId}`, "POST", updates as Record<string, unknown>);
  }

  async workplanAppointmentGet(appointmentId: string): Promise<PbsApiResponse<PbsWorkplanAppointment>> {
    return this.request<PbsWorkplanAppointment>(`workplan/appointments/${appointmentId}`);
  }

  async workplanAppointmentContactGet(contactId: string): Promise<PbsApiResponse<PbsWorkplanAppointment[]>> {
    return this.request<PbsWorkplanAppointment[]>(`workplan/appointments?contactId=${contactId}`);
  }

  async workplanAppointmentChange(appointmentId: string, updates: Partial<PbsWorkplanAppointment>): Promise<PbsApiResponse<PbsWorkplanAppointment>> {
    return this.request<PbsWorkplanAppointment>(`workplan/appointments/${appointmentId}`, "POST", updates as Record<string, unknown>);
  }

  async workplanAppointmentCreate(appointment: Partial<PbsWorkplanAppointment>): Promise<PbsApiResponse<PbsWorkplanAppointment>> {
    return this.request<PbsWorkplanAppointment>("workplan/appointments", "POST", appointment as Record<string, unknown>);
  }

  async workplanReminderGet(contactId: string): Promise<PbsApiResponse<PbsWorkplanEvent[]>> {
    return this.request<PbsWorkplanEvent[]>(`workplan/reminders?contactId=${contactId}`);
  }

  async appointmentBookingGet(date?: string): Promise<PbsApiResponse<PbsServiceAppointment[]>> {
    const query = date ? `?date=${date}` : "";
    return this.request<PbsServiceAppointment[]>(`service/appointments/booking${query}`);
  }

  async appointmentGet(appointmentId: string): Promise<PbsApiResponse<PbsServiceAppointment>> {
    const cached = await storage.getPbsAppointmentByPbsId(this.dealershipId, appointmentId);
    if (cached) {
      return { success: true, data: JSON.parse(cached.payload) };
    }

    const result = await this.request<PbsServiceAppointment>(`service/appointments/${appointmentId}`);
    
    if (result.success && result.data) {
      await this.cacheAppointment(result.data, "service");
    }
    
    return result;
  }

  async appointmentContactVehicleGet(contactId: string): Promise<PbsApiResponse<PbsServiceAppointment[]>> {
    return this.request<PbsServiceAppointment[]>(`service/appointments?contactId=${contactId}`);
  }

  async appointmentContactVehicleInfoGet(contactId: string, vehicleId: string): Promise<PbsApiResponse<PbsServiceAppointment[]>> {
    return this.request<PbsServiceAppointment[]>(`service/appointments?contactId=${contactId}&vehicleId=${vehicleId}`);
  }

  async appointmentChange(appointmentId: string, updates: Partial<PbsServiceAppointment>): Promise<PbsApiResponse<PbsServiceAppointment>> {
    const result = await this.request<PbsServiceAppointment>(`service/appointments/${appointmentId}`, "POST", updates as Record<string, unknown>);
    
    if (result.success && result.data) {
      await this.cacheAppointment(result.data, "service");
    }
    
    return result;
  }

  async appointmentContactVehicleChange(appointmentId: string, updates: { contactId?: string; vehicleId?: string }): Promise<PbsApiResponse<PbsServiceAppointment>> {
    return this.request<PbsServiceAppointment>(`service/appointments/${appointmentId}/vehicle`, "POST", updates);
  }

  async appointmentCreate(appointment: Partial<PbsServiceAppointment>): Promise<PbsApiResponse<PbsServiceAppointment>> {
    const result = await this.request<PbsServiceAppointment>("service/appointments", "POST", appointment as Record<string, unknown>);
    
    if (result.success && result.data) {
      await this.cacheAppointment(result.data, "service");
    }
    
    return result;
  }

  private async cacheAppointment(appointment: PbsServiceAppointment, type: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

    const existing = await storage.getPbsAppointmentByPbsId(this.dealershipId, appointment.AppointmentID);
    
    if (existing) {
      await storage.updatePbsAppointmentCache(existing.id, this.dealershipId, {
        appointmentType: type,
        pbsContactId: appointment.ContactID || null,
        scheduledDate: appointment.ScheduledDate ? new Date(appointment.ScheduledDate) : null,
        status: appointment.Status || null,
        payload: JSON.stringify(appointment),
        expiresAt,
      });
    } else {
      await storage.createPbsAppointmentCache({
        dealershipId: this.dealershipId,
        pbsAppointmentId: appointment.AppointmentID,
        appointmentType: type,
        pbsContactId: appointment.ContactID || null,
        scheduledDate: appointment.ScheduledDate ? new Date(appointment.ScheduledDate) : null,
        status: appointment.Status || null,
        payload: JSON.stringify(appointment),
        expiresAt,
      });
    }
  }

  async repairOrderGet(repairOrderId: string): Promise<PbsApiResponse<PbsRepairOrder>> {
    return this.request<PbsRepairOrder>(`service/repair-orders/${repairOrderId}`);
  }

  async repairOrderContactVehicleGet(contactId: string): Promise<PbsApiResponse<PbsRepairOrder[]>> {
    return this.request<PbsRepairOrder[]>(`service/repair-orders?contactId=${contactId}`);
  }

  async repairOrderChange(repairOrderId: string, updates: Partial<PbsRepairOrder>): Promise<PbsApiResponse<PbsRepairOrder>> {
    return this.request<PbsRepairOrder>(`service/repair-orders/${repairOrderId}`, "POST", updates as Record<string, unknown>);
  }

  async repairOrderContactVehicleChange(repairOrderId: string, updates: { contactId?: string; vehicleId?: string }): Promise<PbsApiResponse<PbsRepairOrder>> {
    return this.request<PbsRepairOrder>(`service/repair-orders/${repairOrderId}/vehicle`, "POST", updates);
  }

  async partsInventoryGet(partNumber: string): Promise<PbsApiResponse<PbsPartsInventory>> {
    const cached = await storage.getPbsPartByNumber(this.dealershipId, partNumber);
    if (cached) {
      return { success: true, data: JSON.parse(cached.payload) };
    }

    const result = await this.request<PbsPartsInventory>(`parts/inventory/${partNumber}`);
    
    if (result.success && result.data) {
      await this.cachePart(result.data);
    }
    
    return result;
  }

  async partsInventorySearch(query: string): Promise<PbsApiResponse<PbsPartsInventory[]>> {
    const cached = await storage.searchPbsParts(this.dealershipId, query);
    if (cached.length > 0) {
      return { success: true, data: cached.map(c => JSON.parse(c.payload)) };
    }

    const result = await this.request<PbsPartsInventory[]>(`parts/inventory/search?q=${encodeURIComponent(query)}`);
    
    if (result.success && result.data) {
      for (const part of result.data) {
        await this.cachePart(part);
      }
    }
    
    return result;
  }

  private async cachePart(part: PbsPartsInventory): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + CACHE_TTL_HOURS);

    const existing = await storage.getPbsPartByNumber(this.dealershipId, part.PartNumber);
    
    if (existing) {
      await storage.updatePbsPartsCache(existing.id, this.dealershipId, {
        description: part.Description || null,
        quantityOnHand: part.QuantityOnHand ?? null,
        quantityAvailable: part.QuantityAvailable ?? null,
        retailPrice: part.RetailPrice?.toString() || null,
        costPrice: part.CostPrice?.toString() || null,
        payload: JSON.stringify(part),
        expiresAt,
      });
    } else {
      await storage.createPbsPartsCache({
        dealershipId: this.dealershipId,
        partNumber: part.PartNumber,
        description: part.Description || null,
        quantityOnHand: part.QuantityOnHand ?? null,
        quantityAvailable: part.QuantityAvailable ?? null,
        retailPrice: part.RetailPrice?.toString() || null,
        costPrice: part.CostPrice?.toString() || null,
        payload: JSON.stringify(part),
        expiresAt,
      });
    }
  }

  async partsOrderGet(orderId: string): Promise<PbsApiResponse<unknown>> {
    return this.request<unknown>(`parts/orders/${orderId}`);
  }

  async purchaseOrderGet(purchaseOrderId: string): Promise<PbsApiResponse<unknown>> {
    return this.request<unknown>(`parts/purchase-orders/${purchaseOrderId}`);
  }

  async tireStorageGet(contactId?: string, vin?: string): Promise<PbsApiResponse<PbsTireStorage[]>> {
    const params = new URLSearchParams();
    if (contactId) params.set("contactId", contactId);
    if (vin) params.set("vin", vin);
    
    return this.request<PbsTireStorage[]>(`parts/tire-storage?${params.toString()}`);
  }

  async shopGet(): Promise<PbsApiResponse<PbsShop[]>> {
    return this.request<PbsShop[]>("service/shops");
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      await this.loadConfig();
      const session = await this.login();
      
      if (session) {
        return { success: true, message: "Successfully connected to PBS Partner Hub" };
      }
      
      return { success: false, message: "Failed to establish session with PBS" };
    } catch (error) {
      return { 
        success: false, 
        message: error instanceof Error ? error.message : "Unknown error connecting to PBS" 
      };
    }
  }

  async clearSession(): Promise<void> {
    if (this.session) {
      await storage.deletePbsSession(this.session.id, this.dealershipId);
      this.session = null;
    }
    await storage.deleteExpiredPbsSessions(this.dealershipId);
  }

  async clearCache(): Promise<{ contacts: number; appointments: number; parts: number }> {
    const contacts = await storage.deleteExpiredPbsContactCache(this.dealershipId);
    const appointments = await storage.deleteExpiredPbsAppointmentCache(this.dealershipId);
    const parts = await storage.deleteExpiredPbsPartsCache(this.dealershipId);
    
    return { contacts, appointments, parts };
  }

  async getApiLogs(limit: number = 100): Promise<unknown[]> {
    return storage.getPbsApiLogs(this.dealershipId, limit);
  }
}

export function createPbsApiService(dealershipId: number): PbsApiService {
  return new PbsApiService(dealershipId);
}
