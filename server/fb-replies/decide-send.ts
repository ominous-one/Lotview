import type { FbInboxThread, FbReplySettings } from "@shared/schema";
import type { IStorage } from "../storage";

export type FbReplyDecision = "ALLOW" | "DENY";

export interface DecideSendInput {
  dealershipId: number;
  fbThreadId: string;

  participantName?: string | null;
  leadNameConfidence?: number | null;

  listingUrl?: string | null;
  listingTitle?: string | null;
  vehicleId?: number | null;
  vehicleDisplayName?: string | null;
  vehicleMappingConfidence?: number | null;

  /** Recent thread messages observed by the extension (optional; server will rely on DB where possible). */
  recentMessages?: Array<{
    direction: "INBOUND" | "OUTBOUND";
    senderRole: "BUYER" | "DEALER_USER" | "SYSTEM";
    sentAt?: string | null;
    text: string;
  }>;

  /** Draft reply the extension intends to send (already personalized if possible). */
  candidateReply: string;

  /** Client-side intent classification signal (best-effort). */
  intent?: { intent: string; confidence: number } | null;

  /** Optional local safety signals (e.g., actionBlockDetected). */
  localSignals?: Record<string, any> | null;
}

export interface DecideSendOutput {
  decision: FbReplyDecision;
  allow: boolean;
  reasonCodes: string[];

  /** Echo state flags so the extension can disable itself quickly. */
  dnc: boolean;
  globalKillSwitch: boolean;
  threadPaused: boolean;
  threadAutoSendEnabled: boolean;

  /** Server-enforced outbound behavior */
  dryRun: boolean;
  typingSim: Record<string, any>;

  /** Suggest escalation to human queue. */
  escalate: boolean;

  /** Rate-limit counters (for UI/debug) */
  counters?: Record<string, number>;
}

const DEFAULT_THRESHOLDS = {
  intentConfidenceMinForAutoSend: 0.8,
  leadNameConfidenceMinForAutoSend: 0.85,
  vehicleMappingConfidenceMinForAutoSend: 0.9,

  maxConsecutiveAutoSendsWithoutInbound: 1,
  maxAutoTurnsPerThread: 3,
  minMinutesBetweenAutoSendsPerThread: 10,
  inboundFreshnessMaxMinutes: 180,
};

const DEFAULT_RATE_LIMITS = {
  maxAutoSendsPerMinute: 2,
  maxAutoSendsPerHour: 25,
  maxAutoSendsPerDay: 200,
  maxTotalSendsPerDay: 300,
};

const DEFAULT_TYPING_SIM = {
  msPerCharMin: 35,
  msPerCharMax: 95,
  minTotalTypingMs: 700,
  maxTotalTypingMs: 12000,
  chunkSizeCharsMin: 1,
  chunkSizeCharsMax: 4,
  pauseEveryNChars: 40,
  pauseDurationMsMin: 250,
  pauseDurationMsMax: 900,
  jitterPct: 0.2,
  sendAfterTypingDoneDelayMsMin: 120,
  sendAfterTypingDoneDelayMsMax: 450,
};

/**
 * businessHours JSON schema (lenient):
 * {
 *   schedule?: { mon?: { open: '09:00', close: '18:00' }, ... },
 *   default?: { open: '09:00', close: '18:00' },
 *   quietHours?: { start: '18:00', end: '09:00' }
 * }
 */
function isWithinBusinessHours(now: Date, timeZone: string | undefined, businessHours: any): { ok: boolean; reason?: string } {
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Default conservative window if unset.
  const def = (businessHours?.default && typeof businessHours.default === "object") ? businessHours.default : { open: "09:00", close: "18:00" };
  const schedule = (businessHours?.schedule && typeof businessHours.schedule === "object") ? businessHours.schedule : {};

  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(now).toLowerCase();
  const dayKey = weekday.slice(0, 3); // mon,tue,...
  const day = schedule[dayKey] || schedule[weekday] || def;

  const open = typeof day?.open === "string" ? day.open : def.open;
  const close = typeof day?.close === "string" ? day.close : def.close;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  const minutes = hh * 60 + mm;

  const parseHm = (s: string): number | null => {
    const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(s);
    if (!m) return null;
    const H = Number(m[1]);
    const M = Number(m[2]);
    if (!Number.isFinite(H) || !Number.isFinite(M)) return null;
    return H * 60 + M;
  };

  const o = parseHm(open);
  const c = parseHm(close);
  if (o == null || c == null) return { ok: false, reason: "business_hours_invalid" };

  // Optional quiet hours (deny auto-send during quiet hours)
  if (businessHours?.quietHours && typeof businessHours.quietHours === "object") {
    const qs = parseHm(String(businessHours.quietHours.start || ""));
    const qe = parseHm(String(businessHours.quietHours.end || ""));
    if (qs != null && qe != null) {
      // quiet can wrap midnight.
      const inQuiet = qs <= qe ? (minutes >= qs && minutes < qe) : (minutes >= qs || minutes < qe);
      if (inQuiet) return { ok: false, reason: "quiet_hours" };
    }
  }

  // Business hours can wrap midnight.
  const inHours = o <= c ? (minutes >= o && minutes < c) : (minutes >= o || minutes < c);
  return { ok: inHours, reason: inHours ? undefined : "outside_business_hours" };
}

function mergeJsonDefaults<T extends Record<string, any>>(defaults: T, value: any): T {
  if (!value || typeof value !== "object") return { ...defaults };
  return { ...defaults, ...value };
}

function containsWord(haystack: string, needle: string): boolean {
  const n = needle.trim();
  if (!n) return false;
  const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|\\[\\]\\\\]/g, "\\$&")}\\b`, "i");
  return re.test(haystack);
}

function computePersonalizationOk(input: DecideSendInput): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const text = (input.candidateReply || "").trim();
  if (!text) reasons.push("candidate_empty");

  const lead = (input.participantName || "").trim().split(/\s+/)[0];
  const vehicle = (input.vehicleDisplayName || input.listingTitle || "").trim();

  if (!lead) reasons.push("lead_name_missing");
  if (!vehicle) reasons.push("vehicle_identity_missing");

  if (lead && !containsWord(text, lead) && !/^hey\b/i.test(text)) reasons.push("lead_name_not_in_text");
  if (vehicle && !text.toLowerCase().includes(vehicle.toLowerCase())) reasons.push("vehicle_not_in_text");

  return { ok: reasons.length === 0, reasons };
}

export async function decideSendFbMarketplaceReply(storage: IStorage, params: DecideSendInput): Promise<DecideSendOutput> {
  const reasonCodes: string[] = [];

  const [settings, dealership, thread] = await Promise.all([
    storage.getFbReplySettings(params.dealershipId),
    storage.getDealership(params.dealershipId),
    storage.getFbInboxThreadByFbThreadId(params.dealershipId, params.fbThreadId),
  ]);

  const thresholds = mergeJsonDefaults(DEFAULT_THRESHOLDS, (settings as any).thresholds);
  const rateLimits = mergeJsonDefaults(DEFAULT_RATE_LIMITS, (settings as any).rateLimits);
  const typingSim = mergeJsonDefaults(DEFAULT_TYPING_SIM, (settings as any).typingSim);

  const globalKillSwitch = !!(settings as any).globalKillSwitch;
  const dealershipAutoSendEnabled = (settings as any).autoSendEnabled !== false;
  const dryRun = !!(settings as any).dryRun;

  const threadPaused = !!thread?.isPaused;
  const threadAutoSendEnabled = thread?.autoSendEnabled !== false;

  const dnc = !!thread?.doNotContact;
  const escalated = !!thread?.escalated;

  // 1) Global + per-thread kill switches
  if (globalKillSwitch) reasonCodes.push("global_kill_switch");
  if (!dealershipAutoSendEnabled) reasonCodes.push("dealership_auto_send_disabled");
  if (threadPaused) reasonCodes.push("thread_paused");
  if (!threadAutoSendEnabled) reasonCodes.push("thread_auto_send_disabled");

  // 2) DNC absolute + escalation
  if (dnc) reasonCodes.push("dnc");
  if (escalated) reasonCodes.push("escalated");

  // 3) Local health signals
  if (params.localSignals?.actionBlockDetected) reasonCodes.push("action_block");

  // 4) Business hours (default-hard)
  const bh = isWithinBusinessHours(new Date(), dealership?.timezone || undefined, (settings as any).businessHours);
  if (!bh.ok) reasonCodes.push(bh.reason || "outside_business_hours");

  // 5) Intent allowlist/denylist (from client signal)
  const intent = params.intent?.intent || "UNKNOWN";
  const intentConf = typeof params.intent?.confidence === "number" ? params.intent!.confidence : 0;
  const allowlisted = intent === "AVAILABILITY_CHECK" || intent === "HOURS_LOCATION" || intent === "SCHEDULING_BASIC";
  const denylisted = intent === "PRICE_NEGOTIATION" || intent === "FINANCING" || intent === "ACCIDENT_HISTORY" || intent === "WARRANTY" || intent === "OFF_PLATFORM" || intent === "HOSTILE";

  if (intent === "DNC") reasonCodes.push("dnc_phrase");
  if (denylisted) reasonCodes.push("intent_denylisted");
  if (!allowlisted) reasonCodes.push("intent_not_allowlisted");
  if (intentConf < thresholds.intentConfidenceMinForAutoSend) reasonCodes.push("intent_conf_low");

  // 6) Confidence gating
  const leadNameConf = typeof params.leadNameConfidence === "number" ? params.leadNameConfidence : (typeof thread?.leadNameConfidence === "number" ? thread.leadNameConfidence : 0);
  const vehicleConf = typeof params.vehicleMappingConfidence === "number" ? params.vehicleMappingConfidence : (typeof thread?.vehicleMappingConfidence === "number" ? thread.vehicleMappingConfidence : 0);

  if (leadNameConf < thresholds.leadNameConfidenceMinForAutoSend) reasonCodes.push("lead_name_conf_low");
  if (vehicleConf < thresholds.vehicleMappingConfidenceMinForAutoSend) reasonCodes.push("vehicle_conf_low");

  // 7) Personalization requirement
  const personalization = computePersonalizationOk(params);
  if (!personalization.ok) reasonCodes.push(...personalization.reasons.map((r) => `personalization:${r}`));

  // 8) Anti-loop and freshness guards (based on DB)
  // If we don't have a thread row yet, create it so we can attach messages/audits later.
  const ensuredThread: FbInboxThread = thread || await storage.upsertFbInboxThread({
    dealershipId: params.dealershipId,
    fbThreadId: params.fbThreadId,
    participantName: params.participantName ?? null,
    leadNameConfidence: typeof params.leadNameConfidence === "number" ? params.leadNameConfidence : null,
    listingUrl: params.listingUrl ?? null,
    listingTitle: params.listingTitle ?? null,
    lastMessageAt: new Date(),
  });

  // inbound freshness
  if (ensuredThread.lastInboundAt) {
    const ageMin = (Date.now() - new Date(ensuredThread.lastInboundAt).getTime()) / 60000;
    if (ageMin > thresholds.inboundFreshnessMaxMinutes) reasonCodes.push("inbound_stale");
  }

  // min spacing between auto sends per thread
  if (ensuredThread.lastOutboundAt) {
    const ageMin = (Date.now() - new Date(ensuredThread.lastOutboundAt).getTime()) / 60000;
    if (ageMin < thresholds.minMinutesBetweenAutoSendsPerThread) reasonCodes.push("thread_cooldown");
  }

  // consecutive auto-sends without inbound: if last message is outbound SYSTEM and lastInboundAt <= lastOutboundAt
  if (ensuredThread.lastOutboundAt && ensuredThread.lastInboundAt) {
    const out = new Date(ensuredThread.lastOutboundAt).getTime();
    const inn = new Date(ensuredThread.lastInboundAt).getTime();
    if (out >= inn) {
      reasonCodes.push("no_new_inbound_since_last_outbound");
    }
  }

  // cap auto turns per thread (count SYSTEM outbound messages)
  const now = new Date();
  const sinceThreadStart = new Date(now.getTime() - 3650 * 24 * 60 * 60 * 1000); // ~10y
  const autoTurns = await storage.countFbInboxMessages(params.dealershipId, {
    threadId: ensuredThread.id,
    direction: "OUTBOUND",
    senderRole: "SYSTEM",
    since: sinceThreadStart,
  });
  if (autoTurns >= thresholds.maxAutoTurnsPerThread) reasonCodes.push("max_auto_turns");

  // 9) Rate limits (dealership-wide)
  const minuteAgo = new Date(Date.now() - 60_000);
  const hourAgo = new Date(Date.now() - 60 * 60_000);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);

  const [autoMin, autoHour, autoDay, totalDay] = await Promise.all([
    storage.countFbInboxMessages(params.dealershipId, { direction: "OUTBOUND", senderRole: "SYSTEM", since: minuteAgo }),
    storage.countFbInboxMessages(params.dealershipId, { direction: "OUTBOUND", senderRole: "SYSTEM", since: hourAgo }),
    storage.countFbInboxMessages(params.dealershipId, { direction: "OUTBOUND", senderRole: "SYSTEM", since: dayAgo }),
    storage.countFbInboxMessages(params.dealershipId, { direction: "OUTBOUND", since: dayAgo }),
  ]);

  if (autoMin >= rateLimits.maxAutoSendsPerMinute) reasonCodes.push("rate_limit:auto_per_minute");
  if (autoHour >= rateLimits.maxAutoSendsPerHour) reasonCodes.push("rate_limit:auto_per_hour");
  if (autoDay >= rateLimits.maxAutoSendsPerDay) reasonCodes.push("rate_limit:auto_per_day");
  if (totalDay >= rateLimits.maxTotalSendsPerDay) reasonCodes.push("rate_limit:total_per_day");

  // Deny if any hard reason
  const hardDeny = reasonCodes.length > 0;

  // Escalate suggestion
  const escalate =
    reasonCodes.some((r) => r === "action_block" || r === "escalated" || r.startsWith("intent_denylisted") || r.startsWith("rate_limit")) ||
    intent === "HOSTILE" || intent === "FINANCING" || intent === "PRICE_NEGOTIATION";

  const counters = { autoMin, autoHour, autoDay, totalDay, autoTurns };

  return {
    decision: hardDeny ? "DENY" : "ALLOW",
    allow: !hardDeny,
    reasonCodes,

    dnc: dnc || intent === "DNC",
    globalKillSwitch,
    threadPaused,
    threadAutoSendEnabled,

    dryRun,
    typingSim,

    escalate,
    counters,
  };
}
