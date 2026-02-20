import type { Vehicle } from "@shared/schema";

export interface VehicleWithViews extends Vehicle {
  views: number;
}

export interface ApiError {
  error: string;
  code?: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export class ApiRequestError extends Error {
  status: number;
  body?: ApiError;
  
  constructor(message: string, status: number, body?: ApiError) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

function handleSessionExpiry(status: number): void {
  if (status === 401 || status === 419) {
    const currentPath = window.location.pathname;
    const publicPaths = ['/', '/login', '/privacy', '/terms', '/vehicles'];
    const isPublicPath = publicPaths.some(p => currentPath === p || currentPath.startsWith('/vehicles/'));
    
    if (!isPublicPath) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('token');
      sessionStorage.removeItem('auth_token');
      sessionStorage.removeItem('token');
      
      window.location.href = '/login?session=expired';
    }
  }
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = localStorage.getItem('auth_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function apiRequest<T = unknown>(
  endpoint: string, 
  options: RequestOptions = {}
): Promise<T> {
  const { body, headers: customHeaders, ...restOptions } = options;
  
  const headers: Record<string, string> = {
    ...getAuthHeaders(),
    ...(body !== undefined && { 'Content-Type': 'application/json' }),
    ...(customHeaders as Record<string, string>),
  };
  
  const response = await fetch(endpoint, {
    credentials: 'include',
    ...restOptions,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  
  if (!response.ok) {
    handleSessionExpiry(response.status);
    
    let errorBody: ApiError | undefined;
    try {
      errorBody = await response.json();
    } catch {
      // Response body wasn't JSON
    }
    throw new ApiRequestError(
      errorBody?.error || `Request failed: ${response.status} ${response.statusText}`,
      response.status,
      errorBody
    );
  }
  
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  
  return undefined as T;
}

export function apiGet<T = unknown>(endpoint: string, headers?: Record<string, string>): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'GET', headers });
}

export function apiPost<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'POST', body, headers });
}

export function apiPut<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'PUT', body, headers });
}

export function apiPatch<T = unknown>(endpoint: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'PATCH', body, headers });
}

export function apiDelete<T = unknown>(endpoint: string, headers?: Record<string, string>): Promise<T> {
  return apiRequest<T>(endpoint, { method: 'DELETE', headers });
}

// Financing Rules Types
export interface CreditTier {
  tierName: string;
  minScore: number;
  maxScore: number;
  interestRate: number; // As percentage (e.g., 5.99)
}

export interface ModelYearTerm {
  minModelYear: number;
  maxModelYear: number;
  availableTerms: number[]; // e.g., [36, 48, 60, 72, 84]
}

export interface FinancingRules {
  creditTiers: CreditTier[];
  modelYearTerms: ModelYearTerm[];
}

// Financing Rules API (Public, no auth required)
export function getFinancingRules(): Promise<FinancingRules> {
  return apiGet<FinancingRules>("/api/public/financing-rules");
}

// Vehicle API
export async function getVehicles(): Promise<Vehicle[]> {
  // Note: This is a PUBLIC endpoint - do not send auth headers
  // Dealership filtering is handled automatically by server-side tenant middleware
  // based on subdomain resolution - no need for authentication
  const response = await fetch("/api/vehicles", {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch vehicles: ${response.status}`);
  }
  return response.json();
}

export async function getVehicleById(id: number): Promise<VehicleWithViews> {
  // Note: This is a PUBLIC endpoint - do not send auth headers
  // to avoid 401 errors from stale tokens in localStorage
  const response = await fetch(`/api/vehicles/${id}`, {
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch vehicle: ${response.status}`);
  }
  return response.json();
}

export function trackVehicleView(vehicleId: number, sessionId: string): Promise<void> {
  return apiPost(`/api/vehicles/${vehicleId}/view`, { sessionId });
}

// NOTE: Facebook Pages management is handled via OAuth flow at /api/facebook/oauth/*
// The facebookPages table is populated automatically during OAuth callback.
// For direct API access, use authenticated routes with proper dealership context.

// Chat API
export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function sendChatMessage(
  messages: ChatMessage[],
  vehicleContext?: string,
  scenario?: string,
  dealershipId?: number
): Promise<string> {
  const data = await apiPost<{ message: string }>("/api/chat", { messages, vehicleContext, scenario, dealershipId });
  return data.message;
}

export function saveConversation(
  category: string,
  messages: ChatMessage[],
  sessionId: string,
  vehicleId?: number,
  vehicleName?: string,
  dealershipId?: number
): Promise<{ id: number } | undefined> {
  const headers: Record<string, string> = {};
  if (dealershipId) {
    headers["x-dealership-id"] = dealershipId.toString();
  }
  return apiPost<{ id: number }>("/api/conversations", { category, messages, sessionId, vehicleId, vehicleName }, headers);
}

// GoHighLevel CTA API
export function sendCTAToGHL(
  vehicleInfo: {
    year: number;
    make: string;
    model: string;
    price: number;
    vin?: string | null;
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
  return apiPost("/api/cta/send", { vehicleInfo, ctaType, contactInfo });
}
