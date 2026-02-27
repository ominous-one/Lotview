import OpenAI from "openai";
import { db } from "./db";
import { storage } from "./storage";
import { vehicles, aiSettings } from "@shared/schema";
import { eq, and, gte, lte, ne, desc, sql } from "drizzle-orm";
import type { Vehicle, Dealership, CarfaxReport, MessengerConversation, MessengerMessage, AiSettings } from "@shared/schema";
import { buildSalesAgentSystemPrompt, buildVehicleContext, buildCarfaxContext, buildInventoryContext, buildFollowUpPrompt } from "./ai-prompts";
import { buildPaymentContext } from "./ai-payment-calculator";

// Re-use the existing OpenAI client factory pattern from openai.ts
async function getOpenAIClient(dealershipId: number): Promise<{ client: OpenAI; model: string }> {
  const apiKeys = await storage.getDealershipApiKeys(dealershipId);

  if (apiKeys?.openaiApiKey && apiKeys.openaiApiKey.length > 20) {
    return {
      client: new OpenAI({ apiKey: apiKeys.openaiApiKey }),
      model: "gpt-4o",
    };
  }

  return {
    client: new OpenAI({
      baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
    }),
    model: "gpt-4o",
  };
}

export interface AiSalesRequest {
  dealershipId: number;
  vehicleId?: number;
  conversationId?: number; // messenger conversation ID to pull history
  customerMessage: string;
  customerName?: string;
  messageHistory?: { role: "user" | "assistant"; content: string }[];
}

export interface AiSalesResponse {
  reply: string;
  vehicleId?: number;
  vehicleName?: string;
  paymentInfo?: string;
  suggestedAlternatives?: { id: number; name: string; price: number }[];
}

/**
 * Find similar vehicles in inventory for cross-sell recommendations.
 */
async function findSimilarVehicles(
  dealershipId: number,
  currentVehicle: Vehicle,
  budget?: number
): Promise<Vehicle[]> {
  const priceTarget = budget || currentVehicle.price;
  const priceMin = Math.floor(priceTarget * 0.7);
  const priceMax = Math.ceil(priceTarget * 1.3);

  const similar = await db
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.dealershipId, dealershipId),
        ne(vehicles.id, currentVehicle.id),
        gte(vehicles.price, priceMin),
        lte(vehicles.price, priceMax)
      )
    )
    .orderBy(
      // Prefer same type, then by price proximity
      sql`ABS(${vehicles.price} - ${priceTarget})`,
      desc(vehicles.createdAt)
    )
    .limit(5);

  return similar;
}

/**
 * Find vehicles matching a budget across the whole dealership inventory.
 */
async function findVehiclesByBudget(
  dealershipId: number,
  maxPrice: number
): Promise<Vehicle[]> {
  return await db
    .select()
    .from(vehicles)
    .where(
      and(
        eq(vehicles.dealershipId, dealershipId),
        lte(vehicles.price, maxPrice)
      )
    )
    .orderBy(desc(vehicles.price))
    .limit(6);
}

/**
 * Extract a budget number from a customer message.
 * e.g. "something under 30k" → 30000, "budget is 25000" → 25000
 */
function extractBudget(message: string): number | undefined {
  // Match patterns like "30k", "$30,000", "30000", "under 25k"
  const patterns = [
    /\$?([\d,]+)\s*k\b/i,           // "30k" or "$30k"
    /\$?([\d]{2,3}),?([\d]{3})/,     // "$30,000" or "30000"
    /budget.*?\$?([\d,]+)/i,          // "budget is 25000"
    /under\s+\$?([\d,]+)/i,          // "under 30000"
    /around\s+\$?([\d,]+)/i,         // "around 25000"
    /max.*?\$?([\d,]+)/i,            // "max 30000"
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) {
      const numStr = match[1].replace(/,/g, '');
      let num = parseInt(numStr);
      // If matched "k" pattern, the number is in thousands
      if (/k\b/i.test(match[0])) {
        num *= 1000;
      }
      // Sanity check: vehicle prices are typically 5k-200k
      if (num >= 5000 && num <= 200000) return num;
      // Handle numbers like "30" that likely mean 30k
      if (num >= 5 && num <= 200) return num * 1000;
    }
  }
  return undefined;
}

/**
 * Load conversation history from messenger messages.
 */
async function loadConversationHistory(
  dealershipId: number,
  conversationId: number
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const messages = await storage.getMessengerMessages(dealershipId, conversationId);

  return messages.map(msg => ({
    role: (msg.isFromCustomer ? "user" : "assistant") as "user" | "assistant",
    content: msg.content,
  }));
}

/**
 * The main AI sales agent function.
 * Takes a customer message + context and returns a sales-optimized reply.
 */
export async function generateSalesResponse(req: AiSalesRequest): Promise<AiSalesResponse> {
  const { dealershipId, vehicleId, conversationId, customerMessage, customerName } = req;

  // 1. Load dealership info
  const dealership = await storage.getDealership(dealershipId);
  if (!dealership) {
    throw new Error(`Dealership ${dealershipId} not found`);
  }

  // 2. Load vehicle data if we have a vehicleId
  let vehicle: Vehicle | undefined;
  if (vehicleId) {
    vehicle = await storage.getVehicleById(vehicleId, dealershipId);
  }

  // 3. Load Carfax report if vehicle has a VIN
  let carfaxReport: CarfaxReport | undefined;
  if (vehicle?.id) {
    carfaxReport = await storage.getCarfaxReport(vehicle.id);
  }

  // 4. Build conversation history
  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (req.messageHistory && req.messageHistory.length > 0) {
    history = req.messageHistory;
  } else if (conversationId) {
    history = await loadConversationHistory(dealershipId, conversationId);
  }
  const isFirstMessage = history.length === 0;

  // 5. Build payment context
  let paymentContext: string | undefined;
  if (vehicle) {
    paymentContext = await buildPaymentContext(dealershipId, vehicle.price, vehicle.year);
  }

  // 6. Build vehicle context
  let vehicleContext: string | undefined;
  if (vehicle) {
    vehicleContext = buildVehicleContext(vehicle);
  }

  // 7. Build Carfax context
  let carfaxContext: string | undefined;
  if (carfaxReport) {
    carfaxContext = buildCarfaxContext(carfaxReport);
  }

  // 8. Find similar vehicles / budget matches
  let inventoryContext = '';
  let suggestedAlternatives: { id: number; name: string; price: number }[] = [];

  const budget = extractBudget(customerMessage);
  if (budget) {
    // Customer mentioned a budget — find matching vehicles
    const budgetVehicles = await findVehiclesByBudget(dealershipId, budget);
    inventoryContext = buildInventoryContext(budgetVehicles, vehicle?.id);
    suggestedAlternatives = budgetVehicles
      .filter(v => v.id !== vehicle?.id)
      .slice(0, 3)
      .map(v => ({
        id: v.id,
        name: `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`,
        price: v.price,
      }));
  } else if (vehicle) {
    // Suggest similar vehicles
    const similar = await findSimilarVehicles(dealershipId, vehicle);
    inventoryContext = buildInventoryContext(similar, vehicle.id);
    suggestedAlternatives = similar.slice(0, 3).map(v => ({
      id: v.id,
      name: `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`,
      price: v.price,
    }));
  }

  // 8b. Load AI settings for this dealership (with defaults fallback)
  let dealerAiSettings: AiSettings | null = null;
  try {
    const [settings] = await db
      .select()
      .from(aiSettings)
      .where(eq(aiSettings.dealershipId, dealershipId))
      .limit(1);
    if (settings) {
      dealerAiSettings = settings;
    } else {
      // Use training defaults when no custom settings saved
      const defaults = await import("./ai-training-defaults");
      dealerAiSettings = {
        id: 0,
        dealershipId,
        salesPersonality: defaults.DEFAULT_SALES_PERSONALITY,
        greetingTemplate: defaults.DEFAULT_GREETING_TEMPLATE,
        tone: defaults.DEFAULT_TONE,
        responseLength: defaults.DEFAULT_RESPONSE_LENGTH,
        alwaysInclude: defaults.DEFAULT_ALWAYS_INCLUDE,
        neverSay: defaults.DEFAULT_NEVER_SAY,
        objectionHandling: defaults.DEFAULT_OBJECTION_HANDLING,
        businessHours: defaults.DEFAULT_BUSINESS_HOURS,
        escalationRules: defaults.DEFAULT_ESCALATION_RULES,
        customCtas: defaults.DEFAULT_CUSTOM_CTAS,
        sampleConversations: defaults.DEFAULT_SAMPLE_CONVERSATIONS,
        enabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as AiSettings;
    }
  } catch {
    // Table might not exist yet, fall back to defaults
  }

  // 9. Get current date/time in Pacific timezone
  const now = new Date();
  const currentDateTime = now.toLocaleString('en-US', {
    timeZone: dealership.timezone || 'America/Vancouver',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  // 10. Build the system prompt
  const systemPrompt = buildSalesAgentSystemPrompt({
    dealership,
    currentDateTime,
    vehicleContext,
    paymentContext,
    carfaxContext,
    inventoryContext,
    conversationMeta: {
      customerName,
      messageCount: history.length,
      isFirstMessage,
    },
    aiSettings: dealerAiSettings,
  });

  // 11. Build the messages array for OpenAI
  const openaiMessages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history (last 20 messages to stay within context)
  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    openaiMessages.push({ role: msg.role, content: msg.content });
  }

  // Add the current customer message
  openaiMessages.push({ role: "user", content: customerMessage });

  // 12. Call OpenAI
  const { client, model } = await getOpenAIClient(dealershipId);

  const response = await client.chat.completions.create({
    model,
    messages: openaiMessages,
    max_completion_tokens: 300, // Keep responses short for Messenger
    temperature: 0.8,
  });

  const reply = response.choices[0]?.message?.content?.trim() ||
    "Thanks for reaching out! Let me check on that and get back to you shortly.";

  const vehicleName = vehicle
    ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`
    : undefined;

  return {
    reply,
    vehicleId: vehicle?.id,
    vehicleName,
    paymentInfo: paymentContext,
    suggestedAlternatives: suggestedAlternatives.length > 0 ? suggestedAlternatives : undefined,
  };
}

/**
 * Generate a follow-up message for a cold conversation.
 */
export async function generateFollowUp(opts: {
  dealershipId: number;
  conversationId: number;
  customerName: string;
  vehicleName: string;
  lastMessagePreview: string;
  hoursSinceLastMessage: number;
}): Promise<string> {
  const { dealershipId } = opts;

  const prompt = buildFollowUpPrompt(opts);

  const { client, model } = await getOpenAIClient(dealershipId);

  const response = await client.chat.completions.create({
    model,
    messages: [
      {
        role: "system",
        content: "You are a friendly car sales consultant writing a follow-up message on Facebook Messenger. Keep it short, warm, and non-pushy. 1-2 sentences max.",
      },
      { role: "user", content: prompt },
    ],
    max_completion_tokens: 150,
    temperature: 0.9,
  });

  return response.choices[0]?.message?.content?.trim() ||
    `Hey${opts.customerName ? ` ${opts.customerName}` : ''}, just checking in — the ${opts.vehicleName} is still available if you're interested!`;
}
