import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { storage } from "./storage";
import { vehicles, aiSettings } from "@shared/schema";
import { eq, and, gte, lte, ne, desc, sql, ilike, or } from "drizzle-orm";
import type { Vehicle, Dealership, CarfaxReport, MessengerConversation, MessengerMessage, AiSettings } from "@shared/schema";
import { buildSalesAgentSystemPrompt, buildVehicleContext, buildCarfaxContext, buildInventoryContext, buildFollowUpPrompt } from "./ai-prompts";
import { buildPaymentContext } from "./ai-payment-calculator";
import { detectIntent, matchObjectionPattern, matchQuestionPattern } from "./ai-intent-detector";

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  }
  return new Anthropic({ apiKey });
}

const SALES_MODEL = "claude-3-5-haiku-20241022";

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
 * Common vehicle makes for matching against customer messages.
 */
const COMMON_MAKES = [
  'toyota', 'honda', 'ford', 'chevrolet', 'chevy', 'nissan', 'hyundai', 'kia',
  'bmw', 'mercedes', 'audi', 'lexus', 'mazda', 'subaru', 'volkswagen', 'vw',
  'jeep', 'dodge', 'ram', 'gmc', 'buick', 'cadillac', 'chrysler', 'lincoln',
  'acura', 'infiniti', 'volvo', 'porsche', 'land rover', 'jaguar', 'tesla',
  'mitsubishi', 'genesis', 'alfa romeo', 'fiat', 'mini', 'polestar', 'rivian',
];

/**
 * Try to match a customer message against dealership inventory.
 * Extracts make, model, and year from the message and searches the vehicles table.
 */
export async function searchInventoryFromMessage(
  dealershipId: number,
  message: string
): Promise<{ matchedVehicle: Vehicle | null; similarVehicles: Vehicle[]; searchedFor: string | null }> {
  const lower = message.toLowerCase();

  // Extract year (4-digit number that looks like a car year)
  const yearMatch = lower.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0]) : undefined;

  // Extract make
  let detectedMake: string | undefined;
  for (const make of COMMON_MAKES) {
    if (lower.includes(make)) {
      // Normalize aliases
      detectedMake = make === 'chevy' ? 'chevrolet' : make === 'vw' ? 'volkswagen' : make;
      break;
    }
  }

  if (!detectedMake && !year) {
    return { matchedVehicle: null, similarVehicles: [], searchedFor: null };
  }

  // Build search description for context
  const searchParts: string[] = [];
  if (year) searchParts.push(String(year));
  if (detectedMake) searchParts.push(detectedMake);
  const searchedFor = searchParts.join(' ');

  // Build query conditions
  const conditions = [eq(vehicles.dealershipId, dealershipId)];
  if (year) conditions.push(eq(vehicles.year, year));
  if (detectedMake) conditions.push(ilike(vehicles.make, `%${detectedMake}%`));

  // Try to find exact matches
  const matches = await db
    .select()
    .from(vehicles)
    .where(and(...conditions))
    .orderBy(desc(vehicles.createdAt))
    .limit(6);

  if (matches.length > 0) {
    return { matchedVehicle: matches[0], similarVehicles: matches.slice(1), searchedFor };
  }

  // No exact match — find similar vehicles (same make or same year range)
  const similarConditions = [eq(vehicles.dealershipId, dealershipId)];
  if (detectedMake) {
    similarConditions.push(ilike(vehicles.make, `%${detectedMake}%`));
  } else if (year) {
    similarConditions.push(gte(vehicles.year, year - 2));
    similarConditions.push(lte(vehicles.year, year + 2));
  }

  const similar = await db
    .select()
    .from(vehicles)
    .where(and(...similarConditions))
    .orderBy(desc(vehicles.createdAt))
    .limit(5);

  return { matchedVehicle: null, similarVehicles: similar, searchedFor };
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
 * 
 * HYBRID COST REDUCTION:
 * 1. Detect intent (free: local patterns, Ollama, or Claude fallback)
 * 2. If OBJECTION → use templated response ($0 cost)
 * 3. If SIMPLE_QUESTION → use pattern matching ($0 cost)
 * 4. If COMPLEX → call Claude Haiku (~$0.0005 cost)
 */
export async function generateSalesResponse(req: AiSalesRequest): Promise<AiSalesResponse> {
  const { dealershipId, vehicleId, conversationId, customerMessage, customerName } = req;

  // 1. Load dealership info
  const dealership = await storage.getDealership(dealershipId);
  if (!dealership) {
    throw new Error(`Dealership ${dealershipId} not found`);
  }

  // 1a. INTENT DETECTION - Fast, cheap, or free
  console.log(`[AI Intent] Detecting intent for message: "${customerMessage.substring(0, 50)}..."`);
  const intentResult = await detectIntent(customerMessage);
  console.log(`[AI Intent] Detected: ${intentResult.intent} (confidence: ${intentResult.confidence}, reason: ${intentResult.reason})`);

  // 1b. If it's an objection, return templated response ($0 cost)
  if (intentResult.intent === "objection") {
    console.log("[AI Intent] → Using templated objection response (cost: $0)");
    const objectionKey = matchObjectionPattern(customerMessage);
    const defaults = await import("./ai-training-defaults");
    const templates = defaults.DEFAULT_OBJECTION_HANDLING;
    
    if (objectionKey && templates[objectionKey as keyof typeof templates]) {
      let reply = templates[objectionKey as keyof typeof templates];
      
      // Simple variable substitution from context
      if (vehicleId || conversationId) {
        let vehicle: Vehicle | undefined;
        if (vehicleId) {
          vehicle = await storage.getVehicleById(vehicleId, dealershipId);
        } else {
          const searchResult = await searchInventoryFromMessage(dealershipId, customerMessage);
          if (searchResult.matchedVehicle) {
            vehicle = searchResult.matchedVehicle;
          }
        }
        
        if (vehicle) {
          reply = reply
            .replace(/\{\{vehicleModel\}\}/g, vehicle.model)
            .replace(/\{\{vehicleYear\}\}/g, String(vehicle.year))
            .replace(/\{\{vehicleFact\}\}/g, vehicle.highlights || vehicle.model);
        }
      }
      
      reply = reply
        .replace(/\{\{customerName\}\}/g, customerName || "there")
        .replace(/\{\{dealershipName\}\}/g, dealership.name || "us");
      
      let vehicleName: string | undefined;
      if (vehicleId) {
        const v = await storage.getVehicleById(vehicleId, dealershipId);
        if (v) {
          vehicleName = `${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`;
        }
      }

      return {
        reply,
        vehicleId,
        vehicleName,
      };
    }
    
    // Fallback if no matching template (shouldn't happen)
    console.log("[AI Intent] ⚠️ No template found for objection, falling back to Claude Haiku");
  }

  // 1c. If it's a simple question, use pattern matching ($0 cost)
  if (intentResult.intent === "simple_question") {
    console.log("[AI Intent] → Using pattern-matched simple answer (cost: $0)");
    const questionKey = matchQuestionPattern(customerMessage);
    
    if (questionKey) {
      // Load vehicle data if needed
      let vehicle: Vehicle | undefined;
      if (vehicleId) {
        vehicle = await storage.getVehicleById(vehicleId, dealershipId);
      } else {
        const searchResult = await searchInventoryFromMessage(dealershipId, customerMessage);
        if (searchResult.matchedVehicle) {
          vehicle = searchResult.matchedVehicle;
        }
      }

      // Generate simple pattern-matched answer
      let reply = "";
      
      switch (questionKey) {
        case "price":
          reply = vehicle 
            ? `The price on this ${vehicle.year} ${vehicle.make} ${vehicle.model} is $${vehicle.price.toLocaleString()}. Any questions about financing or trade-ins?`
            : `Great question! We have several options in different price ranges. What's your budget?`;
          break;
        
        case "color":
          reply = vehicle
            ? `This one has ${vehicle.exteriorColor || "a beautiful finish"} on the outside and ${vehicle.interiorColor || "nice interior"} on the inside. Want to come see it in person?`
            : `We have a range of colors available. What color were you thinking?`;
          break;
        
        case "features":
        case "specs":
          reply = vehicle
            ? `This ${vehicle.year} ${vehicle.make} comes with ${vehicle.highlights || "great features"}. I'd love to walk you through all the details in person — when could you stop by?`
            : `We have vehicles with lots of great features! What's most important to you?`;
          break;
        
        case "hours":
          reply = `We're open Monday–Saturday 9am–7pm and Sunday 11am–5pm. What day works best for you to come check out our inventory?`;
          break;
        
        case "trades":
          reply = `Yes! We absolutely take trade-ins. Bring your vehicle and we'll get you a fair offer on the spot. When could you come by?`;
          break;
        
        case "warranty":
          reply = `Great question about warranties! Let me get you all the details — can you stop by this week so we can go over all the options?`;
          break;
        
        case "financing":
          reply = `We offer several financing options to fit your situation. Let's find something that works for you! When are you available to discuss options?`;
          break;
        
        case "mileage":
          reply = vehicle
            ? `This vehicle has ${vehicle.odometer?.toLocaleString() || "low mileage"} miles. Full service history is available if you'd like to review it!`
            : `Mileage varies by vehicle. What range are you looking for?`;
          break;
        
        case "condition":
          reply = vehicle
            ? `This vehicle is in excellent condition — you'll see for yourself when you come check it out! When works for you?`
            : `All our vehicles are in great shape. Want to see one?`;
          break;
        
        default:
          reply = `That's a great question! I'd love to tell you more — when can you come by so we can go over everything?`;
      }

      const vehicleName = vehicle
        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`
        : undefined;

      return {
        reply,
        vehicleId: vehicle?.id,
        vehicleName,
      };
    }
  }

  // 1d. Complex messages — use Claude Haiku (cheap, ~$0.0005)
  console.log("[AI Intent] → Routing to Claude Haiku for complex response (cost: ~$0.0005)");

  // 2. Load vehicle data if we have a vehicleId, or search inventory from message
  let vehicle: Vehicle | undefined;
  let inventorySearchContext = '';
  if (vehicleId) {
    vehicle = await storage.getVehicleById(vehicleId, dealershipId);
  } else {
    // Try to match the customer message against inventory
    const searchResult = await searchInventoryFromMessage(dealershipId, customerMessage);
    if (searchResult.searchedFor) {
      if (searchResult.matchedVehicle) {
        vehicle = searchResult.matchedVehicle;
      } else {
        // Vehicle not in stock — build context telling the AI
        inventorySearchContext = `\n\n⚠️ INVENTORY CHECK: The customer asked about a "${searchResult.searchedFor}" but we do NOT currently have that vehicle in stock. Acknowledge this honestly — say something like "We don't currently have that one in stock" — then suggest these similar vehicles we DO have:\n`;
        if (searchResult.similarVehicles.length > 0) {
          for (const v of searchResult.similarVehicles) {
            inventorySearchContext += `- ${v.year} ${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''} — $${v.price.toLocaleString()}\n`;
          }
        } else {
          inventorySearchContext += '(No similar vehicles found in current inventory)\n';
        }
      }
    }
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

  // 8a. Append inventory search context if vehicle wasn't found
  if (inventorySearchContext) {
    inventoryContext = inventorySearchContext + (inventoryContext ? '\n' + inventoryContext : '');
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

  // 11. Build the messages array for Anthropic
  const anthropicMessages: { role: "user" | "assistant"; content: string }[] = [];

  // Add conversation history (last 20 messages to stay within context)
  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    anthropicMessages.push({ role: msg.role, content: msg.content });
  }

  // Add the current customer message
  anthropicMessages.push({ role: "user", content: customerMessage });

  // 12. Call Anthropic Claude
  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: SALES_MODEL,
    system: systemPrompt,
    messages: anthropicMessages,
    max_tokens: 300, // Keep responses short for Messenger
    temperature: 0.8,
  });

  const reply = (response.content[0]?.type === 'text' ? response.content[0].text : '').trim() ||
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

  const client = getAnthropicClient();

  const response = await client.messages.create({
    model: SALES_MODEL,
    system: "You are a friendly car sales consultant writing a follow-up message on Facebook Messenger. Keep it short, warm, and non-pushy. 1-2 sentences max.",
    messages: [
      { role: "user", content: prompt },
    ],
    max_tokens: 150,
    temperature: 0.9,
  });

  return (response.content[0]?.type === 'text' ? response.content[0].text : '').trim() ||
    `Hey${opts.customerName ? ` ${opts.customerName}` : ''}, just checking in — the ${opts.vehicleName} is still available if you're interested!`;
}
