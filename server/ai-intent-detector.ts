/**
 * AI Intent Detector - Classifies customer messages using Ollama (free local) or falls back to Claude
 * 
 * Goals:
 * - Detect OBJECTION (use templated response, $0 cost)
 * - Detect SIMPLE_QUESTION (use pattern matching, $0 cost)
 * - Detect COMPLEX (call Claude Haiku, ~$0.0005 cost)
 * 
 * Ollama runs locally on port 11434 — production falls back to Claude.
 */

import Anthropic from "@anthropic-ai/sdk";

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
  bad_credit: /(\bbad\s+credit\b|\npoor\s+credit\b|\bcredit\s+issue\b|\credit\s+problem\b)/i,
  need_to_talk_to_spouse: /(\btalk\s+to\b|\bspouse\b|\bharder\b|\bwife\b|\bhusband\b|\bpartner\b|\bfamily\b|\bcheck\s+with\b)/i,
  found_cheaper: /(\bfound.*cheaper\b|\bseen.*cheaper\b|\bfound.*better\s+deal\b|\bcheaper\s+elsewhere\b)/i,
  not_ready: /(\bnot\s+ready\b|\bnot\s+in\s+the\s+market\b|\bnot\s+buying\s+now\b|\bjust\s+looking\b|\nnot\s+ready\s+yet\b)/i,
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
 * Detect intent using Ollama locally, with Claude fallback
 */
export async function detectIntent(message: string): Promise<IntentDetectionResult> {
  // First, try pattern matching locally (fastest, $0 cost)
  const patternResult = detectIntentByPattern(message);
  if (patternResult.confidence > 0.8) {
    return patternResult;
  }

  // Try Ollama if available (free, local)
  try {
    const ollamaResult = await detectIntentByOllama(message);
    return ollamaResult;
  } catch (error) {
    console.log("[Intent Detector] Ollama unavailable, falling back to Claude Haiku");
  }

  // Fall back to Claude Haiku for complex classification
  try {
    const claudeResult = await detectIntentByClaude(message);
    return claudeResult;
  } catch (error) {
    console.error("[Intent Detector] All methods failed:", error);
    // Default to complex when all else fails (safer to use API than deliver wrong answer)
    return {
      intent: "complex",
      confidence: 0.5,
      reason: "Error in intent detection, defaulting to complex",
    };
  }
}

/**
 * Pattern-based detection (fastest, $0 cost)
 */
function detectIntentByPattern(message: string): IntentDetectionResult {
  // Check objections first
  for (const [key, pattern] of Object.entries(OBJECTION_PATTERNS)) {
    if (pattern.test(message)) {
      return {
        intent: "objection",
        confidence: 0.85,
        reason: `Matched objection pattern: ${key}`,
      };
    }
  }

  // Check simple questions
  for (const [key, pattern] of Object.entries(SIMPLE_QUESTION_PATTERNS)) {
    if (pattern.test(message)) {
      return {
        intent: "simple_question",
        confidence: 0.85,
        reason: `Matched simple question pattern: ${key}`,
      };
    }
  }

  // Default to low confidence (will try other methods)
  return {
    intent: "complex",
    confidence: 0,
    reason: "No pattern matches",
  };
}

/**
 * Ollama-based detection (free, local-only)
 * Uses llama3.2:3b which is lightweight and fast
 */
async function detectIntentByOllama(message: string): Promise<IntentDetectionResult> {
  const ollamaUrl = process.env.OLLAMA_URL || "http://localhost:11434";

  // Build the prompt for Ollama
  const prompt = `Classify this customer message into ONE of these categories:
- OBJECTION: customer is expressing doubt, price concern, or hesitation (e.g., "too expensive", "I'll think about it", "bad credit", "need to talk to spouse")
- SIMPLE_QUESTION: customer is asking a factual question (e.g., "what's the price?", "what color?", "when are you open?", "do you take trades?")
- COMPLEX: everything else (requires a thoughtful, personalized response)

Message: "${message}"

Respond with ONLY the category name (OBJECTION, SIMPLE_QUESTION, or COMPLEX).`;

  const response = await fetch(`${ollamaUrl}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "llama3.2:3b",
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`);
  }

  const data = (await response.json()) as { response: string };
  const result = data.response.trim().toUpperCase();

  let intent: MessageIntent = "complex";
  if (result.includes("OBJECTION")) {
    intent = "objection";
  } else if (result.includes("SIMPLE_QUESTION")) {
    intent = "simple_question";
  }

  return {
    intent,
    confidence: 0.7,
    reason: `Ollama classification: ${result}`,
  };
}

/**
 * Claude-based detection (fallback, uses API)
 * Uses Claude Haiku for cost-efficiency (~$0.0005 per call)
 */
async function detectIntentByClaude(message: string): Promise<IntentDetectionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set for fallback intent detection");
  }

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 50,
    messages: [
      {
        role: "user",
        content: `Classify this customer message into ONE category: OBJECTION, SIMPLE_QUESTION, or COMPLEX.

OBJECTION = Customer expressing doubt, price concern, or hesitation (e.g., "too expensive", "I'll think about it", "bad credit")
SIMPLE_QUESTION = Customer asking a factual question (e.g., "what's the price?", "what color?", "when are you open?")
COMPLEX = Everything else requiring thoughtful, personalized response

Message: "${message}"

Respond with ONLY the category name.`,
      },
    ],
  });

  const result = (response.content[0]?.type === "text" ? response.content[0].text : "").trim().toUpperCase();

  let intent: MessageIntent = "complex";
  if (result.includes("OBJECTION")) {
    intent = "objection";
  } else if (result.includes("SIMPLE_QUESTION")) {
    intent = "simple_question";
  }

  return {
    intent,
    confidence: 0.9,
    reason: `Claude classification: ${result}`,
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
