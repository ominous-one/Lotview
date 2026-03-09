/*
 * LotView — FB Marketplace Replies (v1.2 semantics)
 *
 * IMPORTANT:
 * - AUTO-SEND is enabled by default (popup toggle).
 * - Auto-send is still constrained by a strict Safety Envelope.
 * - In development builds (__DEV__=true), the script runs in DRY-RUN by default:
 *   it will NOT click Send.
 */

import { classifyIntent, DEFAULT_SAFETY_ENVELOPE, isWithinBusinessHours, type IntentResult } from "./automation/fbPolicy";
import { DEFAULT_TYPING_SIM, sanitizeForComposer, typeIntoContentEditable } from "./automation/typing";
import { sleep } from "./automation/retry";

declare const __DEV__: boolean;

const STORAGE_KEY_ENABLED = "aiAutoReplyEnabled";
const STORAGE_KEY_DRY_RUN = "lvDryRun";
const STORAGE_KEY_LISTING_MAP = "lvFbListingMap"; // { [listingUrl: string]: { vehicleId: number; savedAt: number } }
const STORAGE_KEY_THREAD_STATE = "lvFbThreadState"; // { [threadId: string]: ThreadState }
const STORAGE_KEY_AUDIT = "lvFbReplyAudit"; // ReplyAuditRecord[]

const MESSAGE_CHECK_INTERVAL_MS = 2500;
const MAX_HISTORY_PER_THREAD = 20;

interface ThreadState {
  threadId: string;
  doNotContact: boolean;
  escalated: boolean;
  lastInboundMessageId?: string;
  lastAutoSentAt?: number;
  autoTurns: number;
}

interface ReplyAuditRecord {
  at: number;
  threadId: string;
  decision: "AUTO_SENT" | "BLOCKED" | "ESCALATED" | "DNC_SET" | "THROTTLED" | "DRY_RUN";
  reasonCodes: string[];
  intent: IntentResult;
  leadName?: { value: string; confidence: number };
  vehicle?: { listingUrl?: string; vehicleId?: number; label?: string; confidence: number; method: string };
  textPreview?: string;
  typingMs?: number;
}

let enabled = true;
let dryRun = __DEV__;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function log(...args: unknown[]) {
  // eslint-disable-next-line no-console
  console.log("[LV-FB-Reply]", ...args);
}

function hashTiny(input: string): string {
  // Not cryptographic; stable enough for at-most-once keys.
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

async function bgCall<T = any>(type: string, payload?: any): Promise<T | null> {
  try {
    const res = await new Promise<any>((resolve) => {
      chrome.runtime.sendMessage({ type, payload }, (r) => resolve(r));
    });
    if (res?.ok) return (res.data ?? res.result ?? res) as T;
  } catch {
    // ignore
  }
  return null;
}

function getThreadId(): string | null {
  const url = window.location.href;
  let match = url.match(/\/marketplace\/(?:inbox|t)\/(\d+)/);
  if (match) return match[1];
  match = url.match(/\/messages\/t\/(\d+)/);
  if (match) return match[1];
  return null;
}

function getLeadName(): { value: string; confidence: number } | null {
  const candidates: Array<{ sel: string; conf: number }> = [
    { sel: '[role="main"] h1', conf: 0.92 },
    { sel: '[role="main"] h2', conf: 0.9 },
    { sel: '[role="main"] [role="heading"]', conf: 0.88 },
  ];

  for (const c of candidates) {
    const el = document.querySelector(c.sel);
    const text = el?.textContent?.trim();
    if (text && text.length > 1 && text.length < 60 && !/marketplace/i.test(text)) {
      return { value: text.split(" ")[0], confidence: c.conf };
    }
  }

  return null;
}

function getListingContext(): { listingUrl?: string; listingLabel?: string } {
  const a = document.querySelector<HTMLAnchorElement>('a[href*="/marketplace/item/"]');
  const href = a?.href || a?.getAttribute("href") || undefined;
  const label = a?.textContent?.trim() || undefined;
  return { listingUrl: href, listingLabel: label };
}

function findComposer(): HTMLElement | null {
  const sels = [
    '[role="main"] [contenteditable="true"][role="textbox"]',
    '[role="main"] [aria-label*="Message" i][contenteditable="true"]',
    '[role="main"] [aria-label*="Type a message" i][contenteditable="true"]',
    '[role="main"] p[contenteditable="true"]',
  ];

  for (const s of sels) {
    const el = document.querySelector<HTMLElement>(s);
    if (el) return el;
  }
  return null;
}

function findSendButton(): HTMLElement | null {
  const sels = [
    '[role="main"] [aria-label="Press Enter to send"]',
    '[role="main"] [aria-label*="Send" i]',
    '[role="main"] div[role="button"][aria-label*="Send" i]',
    '[role="main"] button[aria-label*="Send" i]',
  ];
  for (const s of sels) {
    const el = document.querySelector<HTMLElement>(s);
    if (el) return el;
  }

  // fallback by text
  const btns = Array.from(document.querySelectorAll<HTMLElement>('[role="main"] div[role="button"], [role="main"] button'));
  return btns.find((b) => (b.textContent || "").trim().toLowerCase() === "send") || null;
}

function detectActionBlock(): boolean {
  const text = document.body?.textContent || "";
  return /you can\'?t send messages right now|checkpoint|suspended|temporarily blocked/i.test(text);
}

function getVisibleMessages(): { incoming: Element[]; outgoing: Element[] } {
  // Best-effort: messenger DOM is volatile.
  const nodes = Array.from(document.querySelectorAll('[role="main"] [dir="auto"]'));
  const incoming: Element[] = [];
  const outgoing: Element[] = [];

  for (const n of nodes) {
    const t = n.textContent?.trim();
    if (!t) continue;
    const r = n.getBoundingClientRect();
    if (r.width < 20 || r.height < 10) continue;

    const main = n.closest('[role="main"]')?.getBoundingClientRect();
    if (!main) continue;

    const centerX = r.left + r.width / 2;
    const mainCenter = main.left + main.width / 2;

    if (centerX > mainCenter + 50) outgoing.push(n);
    else if (centerX < mainCenter - 50) incoming.push(n);
  }

  return { incoming, outgoing };
}

function messageIdFromEl(el: Element): string {
  const text = el.textContent?.trim() || "";
  const r = el.getBoundingClientRect();
  const pos = `${Math.round(r.left)}:${Math.round(r.top)}:${Math.round(r.width)}:${Math.round(r.height)}`;
  return hashTiny(`${pos}:${text.slice(0, 200)}`);
}

async function loadFlags() {
  const stored = await chrome.storage.local.get([STORAGE_KEY_ENABLED, STORAGE_KEY_DRY_RUN]);
  // Local toggle remains for quick user control, but server is source of truth for policy envelope + global kill.
  enabled = stored[STORAGE_KEY_ENABLED] !== false; // v1.2 default ON
  dryRun = stored[STORAGE_KEY_DRY_RUN] ?? __DEV__;

  const serverSettings = await bgCall<any>("FB_REPLIES_SETTINGS_GET");
  if (serverSettings) {
    if (serverSettings.globalKillSwitch === true) enabled = false;
    if (serverSettings.autoSendEnabled === false) enabled = false;
    if (typeof serverSettings.dryRun === "boolean") dryRun = serverSettings.dryRun || dryRun;
  }
}

async function loadThreadState(threadId: string): Promise<ThreadState> {
  const stored = await chrome.storage.local.get([STORAGE_KEY_THREAD_STATE]);
  const all = (stored[STORAGE_KEY_THREAD_STATE] || {}) as Record<string, ThreadState>;
  return (
    all[threadId] || {
      threadId,
      doNotContact: false,
      escalated: false,
      autoTurns: 0,
    }
  );
}

async function saveThreadState(state: ThreadState): Promise<void> {
  const stored = await chrome.storage.local.get([STORAGE_KEY_THREAD_STATE]);
  const all = (stored[STORAGE_KEY_THREAD_STATE] || {}) as Record<string, ThreadState>;
  all[state.threadId] = state;
  await chrome.storage.local.set({ [STORAGE_KEY_THREAD_STATE]: all });
}

async function audit(rec: ReplyAuditRecord): Promise<void> {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEY_AUDIT]);
    const arr = (stored[STORAGE_KEY_AUDIT] || []) as ReplyAuditRecord[];
    arr.unshift(rec);
    await chrome.storage.local.set({ [STORAGE_KEY_AUDIT]: arr.slice(0, 500) });
  } catch {
    // ignore
  }

  // Also ship to server audit log (idempotent)
  try {
    const eventKey = hashTiny(`${rec.threadId}:${rec.at}:${rec.decision}:${(rec.textPreview || "").slice(0, 80)}`);
    await bgCall("FB_REPLIES_INGEST_AUDIT", {
      fbThreadId: rec.threadId,
      eventKey,
      kind: rec.decision,
      details: rec,
    });
  } catch {
    // ignore
  }
}

async function lookupVehicleByListing(listingUrl?: string): Promise<{ vehicleId?: number; confidence: number; method: string }>{
  if (!listingUrl) return { confidence: 0, method: "none" };
  const stored = await chrome.storage.local.get([STORAGE_KEY_LISTING_MAP]);
  const map = (stored[STORAGE_KEY_LISTING_MAP] || {}) as Record<string, { vehicleId: number; savedAt: number }>;
  const entry = map[listingUrl];
  if (!entry?.vehicleId) return { confidence: 0.3, method: "listingUrl_unmapped" };
  return { vehicleId: entry.vehicleId, confidence: 1.0, method: "listingUrl_localMap" };
}

async function getAiReply(params: {
  vehicleId?: number;
  customerName?: string;
  customerMessage: string;
  messageHistory: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{ reply: string; vehicleName?: string } | null> {
  const response = await new Promise<any>((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "AI_AUTO_REPLY",
        payload: {
          vehicleId: params.vehicleId,
          customerMessage: params.customerMessage,
          customerName: params.customerName,
          messageHistory: params.messageHistory.slice(-MAX_HISTORY_PER_THREAD),
        },
      },
      (res) => resolve(res)
    );
  });

  if (response?.ok && typeof response.reply === "string") {
    return { reply: response.reply, vehicleName: response.vehicleName };
  }

  log("AI_AUTO_REPLY failed", response?.error);
  return null;
}

function ensurePersonalized(text: string, leadName?: string, vehicleLabel?: string): string {
  let out = text.trim();
  if (leadName && !new RegExp(`\\b${leadName}\\b`, "i").test(out)) {
    out = `Hey ${leadName} — ${out}`;
  }
  if (vehicleLabel && !new RegExp(vehicleLabel.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i").test(out)) {
    // append a short mention if missing
    out = `${out} (re: ${vehicleLabel})`;
  }
  return out;
}

function shouldAllowAutoSend(params: {
  intent: IntentResult;
  leadNameConf: number;
  vehicleConf: number;
  state: ThreadState;
  now: Date;
}): { ok: boolean; reasonCodes: string[] } {
  const reasons: string[] = [];
  const cfg = DEFAULT_SAFETY_ENVELOPE;

  if (!isWithinBusinessHours(params.now, cfg)) reasons.push("outside_business_hours");
  if (params.state.doNotContact) reasons.push("dnc");
  if (params.state.escalated) reasons.push("escalated");
  if (params.state.autoTurns >= cfg.maxAutoTurnsPerThread) reasons.push("max_auto_turns");

  if (params.intent.intent === "DNC") reasons.push("dnc_phrase");
  if (params.intent.intent === "HOSTILE") reasons.push("hostile");

  const allowlisted =
    params.intent.intent === "AVAILABILITY_CHECK" ||
    params.intent.intent === "HOURS_LOCATION" ||
    params.intent.intent === "SCHEDULING_BASIC";

  const denylisted =
    params.intent.intent === "PRICE_NEGOTIATION" ||
    params.intent.intent === "FINANCING" ||
    params.intent.intent === "ACCIDENT_HISTORY" ||
    params.intent.intent === "WARRANTY" ||
    params.intent.intent === "OFF_PLATFORM";

  if (!allowlisted) reasons.push("intent_not_allowlisted");
  if (denylisted) reasons.push("intent_denylisted");

  if (params.intent.confidence < cfg.intentConfidenceMinForAutoSend) reasons.push("intent_conf_low");
  if (params.leadNameConf < cfg.leadNameConfidenceMinForAutoSend) reasons.push("lead_name_conf_low");
  if (params.vehicleConf < cfg.vehicleMappingConfidenceMinForAutoSend) reasons.push("vehicle_conf_low");

  // Min spacing between auto sends per thread
  if (params.state.lastAutoSentAt) {
    const minutes = (Date.now() - params.state.lastAutoSentAt) / 60000;
    if (minutes < cfg.minMinutesBetweenAutoSendsPerThread) reasons.push("thread_cooldown");
  }

  return { ok: reasons.length === 0, reasonCodes: reasons };
}

async function typeAndSend(
  text: string,
  opts: { abortIf: () => boolean; typingSim?: typeof DEFAULT_TYPING_SIM }
): Promise<{ typingMs: number; sent: boolean }> {
  const composer = findComposer();
  if (!composer) throw new Error("Composer not found");

  composer.scrollIntoView({ block: "center" });
  composer.focus();
  await sleep(150);

  const sanitized = sanitizeForComposer(text);
  if (!sanitized.trim()) throw new Error("Empty reply");

  // clear existing draft
  try {
    document.execCommand("selectAll", false);
    document.execCommand("delete", false);
  } catch {
    composer.textContent = "";
  }
  composer.dispatchEvent(new Event("input", { bubbles: true }));

  const { totalMs } = await typeIntoContentEditable(composer, sanitized, opts.typingSim ?? DEFAULT_TYPING_SIM, {
    shouldAbort: opts.abortIf,
  });

  if (opts.abortIf()) {
    throw new Error("ABORT_AFTER_TYPING");
  }

  if (dryRun) {
    return { typingMs: totalMs, sent: false };
  }

  if (detectActionBlock()) {
    throw new Error("ACTION_BLOCK_DETECTED");
  }

  const sendBtn = findSendButton();
  if (sendBtn) {
    sendBtn.click();
  } else {
    // fallback: press Enter
    composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    composer.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
  }

  return { typingMs: totalMs, sent: true };
}

async function processNewInbound(inboundEl: Element) {
  const threadId = getThreadId();
  if (!threadId) return;

  await loadFlags();
  if (!enabled) return;

  const inboundText = inboundEl.textContent?.trim() || "";
  if (!inboundText) return;

  const inboundId = messageIdFromEl(inboundEl);
  const state = await loadThreadState(threadId);

  // Dedup: never process same inbound twice
  if (state.lastInboundMessageId === inboundId) return;
  state.lastInboundMessageId = inboundId;

  const intent = classifyIntent(inboundText);

  // DNC absolute
  if (intent.intent === "DNC") {
    state.doNotContact = true;
    await saveThreadState(state);
    await audit({
      at: Date.now(),
      threadId,
      decision: "DNC_SET",
      reasonCodes: ["dnc_phrase"],
      intent,
      textPreview: inboundText.slice(0, 180),
    });
    return;
  }

  if (detectActionBlock()) {
    state.escalated = true;
    await saveThreadState(state);
    await audit({
      at: Date.now(),
      threadId,
      decision: "ESCALATED",
      reasonCodes: ["action_block"],
      intent,
      textPreview: inboundText.slice(0, 180),
    });
    return;
  }

  const lead = getLeadName();
  const listing = getListingContext();
  const vehicleLookup = await lookupVehicleByListing(listing.listingUrl);

  // Ingest thread snapshot + inbound message to server (best-effort)
  void bgCall("FB_REPLIES_INGEST_THREAD", {
    fbThreadId: threadId,
    participantName: lead?.value || null,
    leadNameConfidence: lead?.confidence || 0,
    listingUrl: listing.listingUrl || null,
    listingTitle: listing.listingLabel || null,
    unreadCount: 0,
    lastMessageAt: new Date().toISOString(),
  });
  void bgCall("FB_REPLIES_INGEST_MESSAGE", {
    fbThreadId: threadId,
    direction: "INBOUND",
    senderRole: "BUYER",
    sentAt: new Date().toISOString(),
    text: inboundText,
    ingestedFrom: "EXTENSION_DOM",
  });
  if (vehicleLookup.vehicleId && listing.listingUrl) {
    void bgCall("FB_REPLIES_INGEST_MAPPING", {
      fbThreadId: threadId,
      participantName: lead?.value || "",
      listingUrl: listing.listingUrl,
      vehicleId: vehicleLookup.vehicleId,
      confidence: vehicleLookup.confidence,
      method: vehicleLookup.method,
    });
  }

  const vehicleLabel = listing.listingLabel || undefined;

  const envelope = shouldAllowAutoSend({
    intent,
    leadNameConf: lead?.confidence ?? 0,
    vehicleConf: vehicleLookup.confidence,
    state,
    now: new Date(),
  });

  // Always generate a suggestion (even if we can't auto-send)
  const ai = await getAiReply({
    vehicleId: vehicleLookup.vehicleId,
    customerName: lead?.value,
    customerMessage: inboundText,
    messageHistory: [{ role: "user", content: inboundText }],
  });
  if (!ai?.reply) {
    await saveThreadState(state);
    return;
  }

  const personalized = ensurePersonalized(ai.reply, lead?.value, vehicleLabel || ai.vehicleName);

  // Hard personalization requirement for AUTO-SEND:
  const personalizationOk =
    !!lead?.value &&
    (new RegExp(`\\b${lead.value}\\b`, "i").test(personalized) || personalized.toLowerCase().startsWith("hey")) &&
    !!(vehicleLabel || ai.vehicleName);

  if (!envelope.ok || !personalizationOk) {
    const reasonCodes = [...envelope.reasonCodes];
    if (!personalizationOk) reasonCodes.push("personalization_missing");

    await audit({
      at: Date.now(),
      threadId,
      decision: "BLOCKED",
      reasonCodes,
      intent,
      leadName: lead || undefined,
      vehicle: {
        listingUrl: listing.listingUrl,
        vehicleId: vehicleLookup.vehicleId,
        label: vehicleLabel || ai.vehicleName,
        confidence: vehicleLookup.confidence,
        method: vehicleLookup.method,
      },
      textPreview: personalized.slice(0, 200),
    });
    await saveThreadState(state);
    return;
  }

  // SERVER-AUTHORITATIVE: must decide-send before any outbound automation.
  const serverDecision = await bgCall<any>("FB_REPLIES_DECIDE_SEND", {
    fbThreadId: threadId,
    participantName: lead?.value || null,
    leadNameConfidence: lead?.confidence || 0,
    listingUrl: listing.listingUrl || null,
    listingTitle: listing.listingLabel || null,
    vehicleId: vehicleLookup.vehicleId || null,
    vehicleDisplayName: vehicleLabel || ai.vehicleName || null,
    vehicleMappingConfidence: vehicleLookup.confidence,
    candidateReply: personalized,
    intent,
    localSignals: { actionBlockDetected: detectActionBlock() },
    // Best-effort context for debugging/policy; server will enforce using DB state.
    recentMessages: [{ direction: "INBOUND", senderRole: "BUYER", sentAt: new Date().toISOString(), text: inboundText }],
  });

  if (!serverDecision) {
    await audit({
      at: Date.now(),
      threadId,
      decision: "BLOCKED",
      reasonCodes: ["server_decide_unavailable"],
      intent,
      textPreview: personalized.slice(0, 200),
    });
    await saveThreadState(state);
    return;
  }

  // Server may enforce global kill/dry-run.
  if (serverDecision.globalKillSwitch === true) enabled = false;
  if (typeof serverDecision.dryRun === "boolean") dryRun = serverDecision.dryRun || dryRun;

  if (serverDecision.dnc === true) state.doNotContact = true;
  if (serverDecision.allow !== true) {
    await audit({
      at: Date.now(),
      threadId,
      decision: "BLOCKED",
      reasonCodes: Array.isArray(serverDecision.reasonCodes) ? serverDecision.reasonCodes : ["server_denied"],
      intent,
      leadName: lead || undefined,
      vehicle: {
        listingUrl: listing.listingUrl,
        vehicleId: vehicleLookup.vehicleId,
        label: vehicleLabel || ai.vehicleName,
        confidence: vehicleLookup.confidence,
        method: vehicleLookup.method,
      },
      textPreview: personalized.slice(0, 200),
    });
    await saveThreadState(state);
    return;
  }

  const stableSendKey = hashTiny(`${threadId}:${inboundId}:${personalized}`);
  // At-most-once per stable key: store lastAutoSentAt and autoTurns; if we already sent very recently, don't repeat.
  if (state.lastAutoSentAt && Date.now() - state.lastAutoSentAt < 60_000) {
    await audit({
      at: Date.now(),
      threadId,
      decision: "THROTTLED",
      reasonCodes: ["recent_send"],
      intent,
      textPreview: personalized.slice(0, 180),
    });
    await saveThreadState(state);
    return;
  }

  const currentThreadId = threadId;
  const abortIf = () => {
    if (!enabled) return true;
    if (getThreadId() !== currentThreadId) return true;
    if (detectActionBlock()) return true;
    return false;
  };

  try {
    const { typingMs, sent } = await typeAndSend(personalized, {
      abortIf,
      typingSim: serverDecision?.typingSim || undefined,
    });

    state.lastAutoSentAt = Date.now();
    state.autoTurns += 1;
    await saveThreadState(state);

    void bgCall("FB_REPLIES_INGEST_MESSAGE", {
      fbThreadId: threadId,
      direction: "OUTBOUND",
      senderRole: "SYSTEM",
      sentAt: new Date().toISOString(),
      text: personalized,
      ingestedFrom: dryRun ? "EXTENSION_DRY_RUN" : "EXTENSION_AUTOSEND",
      safetyFlags: { dryRun: !!dryRun },
    });

    await audit({
      at: Date.now(),
      threadId,
      decision: dryRun ? "DRY_RUN" : "AUTO_SENT",
      reasonCodes: [dryRun ? "dry_run" : "auto_send"],
      intent,
      leadName: lead || undefined,
      vehicle: {
        listingUrl: listing.listingUrl,
        vehicleId: vehicleLookup.vehicleId,
        label: vehicleLabel || ai.vehicleName,
        confidence: vehicleLookup.confidence,
        method: vehicleLookup.method,
      },
      textPreview: personalized.slice(0, 200),
      typingMs,
    });

    log("Auto reply", { sent, stableSendKey, typingMs });
  } catch (err) {
    state.escalated = true;
    await saveThreadState(state);

    await audit({
      at: Date.now(),
      threadId,
      decision: "ESCALATED",
      reasonCodes: [err instanceof Error ? err.message : "send_failed"],
      intent,
      leadName: lead || undefined,
      vehicle: {
        listingUrl: listing.listingUrl,
        vehicleId: vehicleLookup.vehicleId,
        label: vehicleLabel || ai.vehicleName,
        confidence: vehicleLookup.confidence,
        method: vehicleLookup.method,
      },
      textPreview: personalized.slice(0, 200),
    });
  }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    const { incoming } = getVisibleMessages();
    if (incoming.length === 0) return;

    const lastInbound = incoming[incoming.length - 1];
    processNewInbound(lastInbound);
  }, MESSAGE_CHECK_INTERVAL_MS);
}

function startObserver() {
  const main = document.querySelector('[role="main"]');
  if (!main) {
    setTimeout(startObserver, 2000);
    return;
  }

  const obs = new MutationObserver(async (muts) => {
    if (!enabled) return;
    for (const m of muts) {
      if (m.type === "childList" && m.addedNodes.length) {
        const { incoming } = getVisibleMessages();
        const last = incoming[incoming.length - 1];
        if (last) processNewInbound(last);
        break;
      }
    }
  });

  obs.observe(main, { childList: true, subtree: true });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "AI_AUTO_REPLY_TOGGLE") {
    enabled = message.payload?.enabled !== false;
    sendResponse({ ok: true });
    return true;
  }
  if (message.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

(async function init() {
  await loadFlags();
  log("Loaded", { enabled, dryRun, url: window.location.href });
  startPolling();
  startObserver();
})();
