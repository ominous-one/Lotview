/**
 * AI Intent Detector - Classifies customer messages using pattern matching or OpenAI GPT
 * 
 * Goals:
 * - Detect OBJECTION (use pattern matching, $0 cost)
 * - Detect SIMPLE_QUESTION (use pattern matching, $0 cost)
 * - Detect COMPLEX (call OpenAI GPT-4o-mini, ~$0.0001 cost)
 * 
 * Primary: OpenAI GPT-4o-mini (fast, cheap, accurate)
 * Fallback: Ollama local (free)
 */

import OpenAI from "openai";

export type MessageIntent = "objection" | "simple_question" | "complex";

interface IntentDetectionResult {
  intent: MessageIntent;
  confidence: number;
  reason: string;
}

// Objection patterns
const OBJECTION_PATTERNS = {
  too_expensive: /(\btoo\s+expensive\b|\bpriced\s+high\b|\bcost\s+too\s+much\b|\bcan't\s+afford\b|\boutside\s+budget\b|out\s+of\s+budget\b|\boverpriced\b)/i,
  ill_think_about_it: /(\bthink\s+about\s+it\b|\blet\s+me\s+think\b|\bthink\s+it\s+over\b|\bmulling\s+it\s+over\b|\bconsider\s+it\b|\bconsidering\b)/i,
  bad_credit: /(\bbad\s+credit\b|\bpoor\s+credit\b|\bcredit\s+issue\b|\bcredit\s+problem\b)/i,
  need_to_talk_to_spouse: /(\btalk\s+to\b|\bspouse\b|\bharder\b|\bwife\b|\bhusband\b|\bpartner\b|\bfamily\b|\bcheck\s+with\b)/i,
  found_cheaper: /(\bfound.*cheaper\b|\bseen.*cheaper\b|\bfound.*better\s+deal\b|\bcheaper\s+elsewhere\b)/i,
  not_ready: /(\bnot\s+ready\b|\bnot\s+in\s+the\s+market\b|\bnot\s+buying\s+now\b|\bjust\s+looking\b|\bnot\s+ready\s+yet\b)/i,
  need_to_sell_car_first: /(\bneed\s+to\s+sell\b|\bsell\s+my\s+car\b|\bneed\s+to\s+trade\b)/i,
};

// Simple question patterns
const SIMPLE_QUESTION_PATTERNS = {
  price: /(\bwhat[\s\w]*price\b|\bhow\s+much\b|\bwhat\s+does\s+it\s+cost\b|\bprice\b)/i,
  color: /(\bwhat[\s\w]*color\b|\bwhat\s+color\b|\bexterior\b|\binterior\b)/i,
  features: /(\bwhat[\s\w]*features\b|\bwhat[\s\w]*specs\b|\bwhat\s+comes\s+with\b|\bequipped\s+with\b)/i,
  hours: /(\bwhen[\s\w]*open\b|\bwhat\s+are\s+your\s+hours\b|\bbusiness\s+hours\b)/i,
  trades: /(\bdo\s+you\s+take\s+trades\b|\btrade\s+in\b|\btrade\-in\b)/i,
  warranty: /(\bwarranty\b|\bwarranties\b)/i,
  financing: /(\bfinancing\b|\bfinance\b|\bcan\s+I\s+finance\b)/i,
  mileage: /(\bmileage\b|\bhow\s+many\s+miles\b)/i,
  condition: /(\bcondition\b|\b(clean|good|poor)\s+condition\b)/i,
};

/**
 * Get OpenAI client using API key hierarchy
 */
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not set for intent detection");
  }
  return new OpenAI({ apiKey });
}

/**
 * Detect intent using pattern matching + OpenAI GPT-4o-mini
 */
export async function detectIntent(message: string): Promise<IntentDetectionResult> {
  // First, try pattern matching locally (fastest, $0 cost)
  const patternResult = detectIntentByPattern(message);
  if (patternResult.confidence > 0.8) {
    return patternResult;
  }

  // Fall back to OpenAI GPT-4o-mini for complex classification
  try {
    const openaiResult = await detectIntentByOpenAI(message);
    return openaiResult;
  } catch (error) {
    console.error("[Intent Detector] OpenAI failed:", error);
    // Default to complex when all else fails (safer to use API than deliver wrong answer)
    return {
      intent: "complex",
      confidence: 0.5,
      reason: "Error in intent detection, defaulting to complex",
    };
  }
}

/**
 * OpenAI GPT-4o-mini based detection (~$0.0001 per call)
 */
async function detectIntentByOpenAI(message: string): Promise<IntentDetectionResult> {
  const client = getOpenAIClient();

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 50,
    temperature: 0.1, // Low temp for consistent classification
    messages: [
      {
        role: "system",
        content: `You are an intent classifier. Classify customer messages into ONE category:

OBJECTION = Customer expressing doubt, price concern, or hesitation
SIMPLE_QUESTION = Customer asking a factual question
COMPLEX = Everything else requiring thoughtful, personalized response

Respond with ONLY the category name.`,
      },
      {
        role: "user",
        content: `Classify this customer message into ONE category: OBJECTION, SIMPLE_QUESTION, or COMPLEX.

Message: "${message}"

Respond with ONLY the category name.`,
      },
    ],
  });

  const result = (response.choices[0]?.message?.content || "").trim().toUpperCase();

  let intent: MessageIntent = "complex";
  if (result.includes("OBJECTION")) {
    intent = "objection";
  } else if (result.includes("SIMPLE_QUESTION") || result.includes("SIMPLE")) {
    intent = "simple_question";
  }

  return {
    intent,
    confidence: 0.9,
    reason: `GPT-4o-mini classification: ${result}`,
  };
}

// Try Ollama if available (free, local) - kept as optional fallback
async function detectIntentByOllama(message: string): Promise<IntentDetectionResult> {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.2:1b",
      prompt: `Classify this customer message into ONE category: OBJECTION, SIMPLE_QUESTION, or COMPLEX.\n\nMessage: "${message}"\n\nRespond with ONLY the category name.`,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`);
  }

  const data = await response.json() as { response: string };
  const result = (data.response || "").trim().toUpperCase();

  let intent: MessageIntent = "complex";
  if (result.includes("OBJECTION")) {
    intent = "objection";
  } else if (result.includes("SIMPLE")) {
    intent = "simple_question";
  }

  return {
    intent,
    confidence: 0.75,
    reason: `Ollama classification: ${result}`,
  };
}

/**
 * Pattern-based detection (fastest, $0 cost)
 */
function detectIntentByPattern(message: string): IntentDetectionResult {
  const lowerMessage = message.toLowerCase();

  // Check objections first (highest priority)
  for (const [key, pattern] of Object.entries(OBJECTION_PATTERNS)) {
    if (pattern.test(message)) {
      return {
        intent: "objection",
        confidence: 0.9,
        reason: `Pattern match: ${key}`,
      };
    }
  }

  // Check simple questions
  for (const [key, pattern] of Object.entries(SIMPLE_QUESTION_PATTERNS)) {
    if (pattern.test(message)) {
      return {
        intent: "simple_question",
        confidence: 0.85,
        reason: `Pattern match: ${key}`,
      };
    }
  }

  // Default: uncertain, needs AI
  return {
    intent: "complex",
    confidence: 0.3,
    reason: "No pattern match",
  };
}

/**
 * Match a customer message against objection patterns
 * Returns the matched objection key if found, undefined otherwise
 */
export function matchObjectionPattern(message: string): string | undefined {
  for (const [key, pattern] of Object.entries(OBJECTION_PATTERNS)) {
    if (pattern.test(message)) {
      return key;
    }
  }
  return undefined;
}

/**
 * Match a customer message against simple question patterns
 * Returns the matched question key if found, undefined otherwise
 */
export function matchQuestionPattern(message: string): string | undefined {
  for (const [key, pattern] of Object.entries(SIMPLE_QUESTION_PATTERNS)) {
    if (pattern.test(message)) {
      return key;
    }
  }
  return undefined;
}
