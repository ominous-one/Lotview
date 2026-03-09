export type FbIntent =
  | "AVAILABILITY_CHECK"
  | "HOURS_LOCATION"
  | "SCHEDULING_BASIC"
  | "PRICE_NEGOTIATION"
  | "FINANCING"
  | "ACCIDENT_HISTORY"
  | "WARRANTY"
  | "OFF_PLATFORM"
  | "HOSTILE"
  | "DNC"
  | "UNKNOWN";

export interface IntentResult {
  intent: FbIntent;
  confidence: number; // 0..1
  signals: string[];
}

const DNC_PATTERNS: RegExp[] = [
  /\b(stop|dont|don't)\b.*\b(message|messages|messaging|text|contact)\b/i,
  /\bdo not contact\b/i,
  /\bunsubscribe\b/i,
  /\bleave me alone\b/i,
];

export function classifyIntent(textRaw: string): IntentResult {
  const text = (textRaw || "").trim();
  if (!text) return { intent: "UNKNOWN", confidence: 0, signals: ["empty"] };

  for (const re of DNC_PATTERNS) {
    if (re.test(text)) {
      return { intent: "DNC", confidence: 0.99, signals: ["dnc_phrase"] };
    }
  }

  const signals: string[] = [];

  const hostile = /\b(idiot|stupid|f\*\*k|fuck|asshole|racist|kill yourself)\b/i.test(text);
  if (hostile) {
    return { intent: "HOSTILE", confidence: 0.9, signals: ["hostile"] };
  }

  if (/\b(lowest|best)\s+price\b|\bwhat'?s\s+your\s+lowest\b|\b\$\d+\b.*\b(today|cash)\b/i.test(text)) {
    return { intent: "PRICE_NEGOTIATION", confidence: 0.85, signals: ["price"] };
  }

  if (/\bfinanc(ing|e)\b|\bapproved\b|\bno\s+credit\s+check\b|\bOAC\b/i.test(text)) {
    return { intent: "FINANCING", confidence: 0.85, signals: ["financing"] };
  }

  if (/\baccident\b|\bcarfax\b|\bclaims\b/i.test(text)) {
    return { intent: "ACCIDENT_HISTORY", confidence: 0.8, signals: ["accident_history"] };
  }

  if (/\bwarranty\b|\bpowertrain\b|\bbumper\b/i.test(text)) {
    return { intent: "WARRANTY", confidence: 0.8, signals: ["warranty"] };
  }

  if (/\bcall\s+me\b|\btext\s+me\b|\bemail\b|\bwhatsapp\b|\boff\s*platform\b/i.test(text)) {
    signals.push("off_platform");
    // Off-platform alone isn't always bad, but treat as higher-risk for auto-send.
    return { intent: "OFF_PLATFORM", confidence: 0.7, signals };
  }

  if (/\b(still\s+available|available\?|is\s+this\s+available)\b/i.test(text)) {
    return { intent: "AVAILABILITY_CHECK", confidence: 0.9, signals: ["availability"] };
  }

  if (/\b(where|located|address|hours|open|close)\b/i.test(text)) {
    return { intent: "HOURS_LOCATION", confidence: 0.85, signals: ["hours_location"] };
  }

  if (/\b(today|tomorrow|schedule|appointment|see\s+it|view\s+it|test\s*drive)\b/i.test(text)) {
    return { intent: "SCHEDULING_BASIC", confidence: 0.8, signals: ["scheduling"] };
  }

  return { intent: "UNKNOWN", confidence: 0.4, signals: ["fallback"] };
}

export interface SafetyEnvelopeConfig {
  // defaults per v1.2 addendum
  leadNameConfidenceMinForAutoSend: number;
  vehicleMappingConfidenceMinForAutoSend: number;
  intentConfidenceMinForAutoSend: number;

  maxAutoSendsPerMinute: number;
  maxAutoSendsPerHour: number;
  maxAutoSendsPerDay: number;

  maxAutoTurnsPerThread: number;
  minMinutesBetweenAutoSendsPerThread: number;

  businessHours: {
    // 0=Sun..6=Sat
    days: Array<{ day: number; start: string; end: string }>; // HH:MM
  };
}

export const DEFAULT_SAFETY_ENVELOPE: SafetyEnvelopeConfig = {
  leadNameConfidenceMinForAutoSend: 0.85,
  vehicleMappingConfidenceMinForAutoSend: 0.9,
  intentConfidenceMinForAutoSend: 0.8,

  maxAutoSendsPerMinute: 2,
  maxAutoSendsPerHour: 25,
  maxAutoSendsPerDay: 200,

  maxAutoTurnsPerThread: 3,
  minMinutesBetweenAutoSendsPerThread: 10,

  businessHours: {
    days: [
      { day: 1, start: "09:00", end: "18:00" },
      { day: 2, start: "09:00", end: "18:00" },
      { day: 3, start: "09:00", end: "18:00" },
      { day: 4, start: "09:00", end: "18:00" },
      { day: 5, start: "09:00", end: "18:00" },
      { day: 6, start: "09:00", end: "17:00" },
    ],
  },
};

export function isWithinBusinessHours(now: Date, cfg: SafetyEnvelopeConfig): boolean {
  const day = now.getDay();
  const rule = cfg.businessHours.days.find((d) => d.day === day);
  if (!rule) return false;

  const hhmm = (n: number) => String(n).padStart(2, "0");
  const cur = `${hhmm(now.getHours())}:${hhmm(now.getMinutes())}`;
  return cur >= rule.start && cur <= rule.end;
}
