/**
 * Facebook Marketplace Messenger Auto-Reply
 * Detects incoming buyer messages and auto-responds using the AI sales agent.
 */

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

interface ConversationState {
  conversationId: string;       // FB thread identifier
  vehicleId: number | null;     // Matched vehicle from listing link
  vehicleName: string;
  messages: { role: "user" | "assistant"; content: string }[];
  lastReplyAt: number;          // Timestamp of last auto-reply (rate limiting)
  customerName: string;
}

const RATE_LIMIT_MS = 60_000;                   // 1 minute per conversation
const MESSAGE_CHECK_INTERVAL_MS = 2_000;        // Poll every 2s
const MAX_HISTORY_PER_THREAD = 20;
const STORAGE_KEY_ENABLED = "aiAutoReplyEnabled";
const STORAGE_KEY_CONVERSATIONS = "aiConversations";

let enabled = false;
let conversations = new Map<string, ConversationState>();
let processedMessageIds = new Set<string>();
let observerActive = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// HELPERS
// ============================================================================

function log(...args: unknown[]) {
  console.log("[LV-AutoReply]", ...args);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Generate a stable ID for a message row to avoid reprocessing */
function getMessageId(el: Element): string {
  // Use data attributes if available, otherwise content hash
  const text = el.textContent?.trim() || "";
  const timestamp = el.closest("[data-scope]")?.getAttribute("data-scope") || "";
  return `${timestamp}_${text.slice(0, 80)}`;
}

/**
 * Detect if we're on a FB Marketplace conversation page.
 * URLs like: facebook.com/marketplace/t/THREAD_ID or /messages/t/THREAD_ID
 */
function getThreadId(): string | null {
  const url = window.location.href;
  // Marketplace inbox: /marketplace/inbox/THREAD_ID or /marketplace/t/THREAD_ID
  let match = url.match(/\/marketplace\/(?:inbox|t)\/(\d+)/);
  if (match) return match[1];
  // General Messenger: /messages/t/THREAD_ID
  match = url.match(/\/messages\/t\/(\d+)/);
  if (match) return match[1];
  return null;
}

/**
 * Try to extract a vehicleId from the conversation context.
 * FB Marketplace conversations have the listing linked in the thread header.
 */
function extractVehicleIdFromPage(): { vehicleId: number | null; vehicleName: string } {
  // Look for the listing card in the chat header area
  // FB Marketplace threads show the listing at the top with a link to /marketplace/item/ID
  const links = document.querySelectorAll('a[href*="/marketplace/item/"]');
  for (const link of links) {
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/marketplace\/item\/(\d+)/);
    if (match) {
      const vehicleName = link.textContent?.trim() || "Vehicle";
      return { vehicleId: parseInt(match[1]), vehicleName };
    }
  }

  // Also check for listing title text in the conversation header
  // The listing card typically shows Year Make Model
  const headerArea = document.querySelector('[role="main"] [role="banner"]') ||
                     document.querySelector('[role="main"]')?.firstElementChild;
  if (headerArea) {
    const text = headerArea.textContent || "";
    // Look for year-make-model pattern
    const ymMatch = text.match(/(\d{4})\s+(\w+)\s+(\w+)/);
    if (ymMatch) {
      return { vehicleId: null, vehicleName: `${ymMatch[1]} ${ymMatch[2]} ${ymMatch[3]}` };
    }
  }

  return { vehicleId: null, vehicleName: "Vehicle" };
}

/**
 * Get the customer name from the conversation header.
 */
function getCustomerName(): string {
  // The conversation title typically has the customer's name
  const titleEl = document.querySelector('[role="main"] h2, [role="main"] [data-testid="mwthreadlist-item-open"] span');
  if (titleEl) {
    const name = titleEl.textContent?.trim() || "";
    if (name && name.length < 60) return name;
  }
  // Fallback: look for name in thread header  
  const header = document.querySelector('[role="main"] [role="heading"]');
  if (header) {
    return header.textContent?.trim() || "there";
  }
  return "there";
}

// ============================================================================
// MESSAGE DETECTION
// ============================================================================

/**
 * Find all visible messages in the current conversation thread.
 * Returns { incoming: Element[], outgoing: Element[] }
 */
function getVisibleMessages(): { incoming: Element[]; outgoing: Element[] } {
  const incoming: Element[] = [];
  const outgoing: Element[] = [];

  // Facebook Messenger message rows
  // Incoming messages are typically on the left, outgoing on the right
  // They use different background colors and alignment
  const messageRows = document.querySelectorAll(
    '[role="main"] [role="row"], [role="main"] [data-scope="messages_table"] > div'
  );

  for (const row of messageRows) {
    const messageDiv = row.querySelector('[dir="auto"]');
    if (!messageDiv) continue;

    const text = messageDiv.textContent?.trim();
    if (!text) continue;

    // Determine direction by checking alignment/position
    // Outgoing messages typically have a colored background (blue)
    // Incoming messages have a gray/white background
    const style = window.getComputedStyle(messageDiv.closest('[style]') || messageDiv);
    const bgColor = style.backgroundColor;
    const isOutgoing = bgColor?.includes("0, 132, 255") || // FB blue
                       bgColor?.includes("0,132,255") ||
                       messageDiv.closest('[class*="outgoing"]') !== null;

    if (isOutgoing) {
      outgoing.push(messageDiv);
    } else {
      incoming.push(messageDiv);
    }
  }

  // Alternative detection: use the message container structure
  // FB wraps messages in divs with specific data attributes
  if (incoming.length === 0 && outgoing.length === 0) {
    const allMessages = document.querySelectorAll('[role="main"] [dir="auto"][class]');
    for (const msg of allMessages) {
      const text = msg.textContent?.trim();
      if (!text || text.length < 2) continue;
      
      // Check if this message is from "me" by looking at the parent structure
      // FB positions own messages to the right
      const rect = msg.getBoundingClientRect();
      const parentRect = msg.closest('[role="main"]')?.getBoundingClientRect();
      if (!parentRect) continue;

      const centerX = rect.left + rect.width / 2;
      const parentCenter = parentRect.left + parentRect.width / 2;

      if (centerX > parentCenter + 50) {
        outgoing.push(msg);
      } else if (centerX < parentCenter - 50) {
        incoming.push(msg);
      }
    }
  }

  return { incoming, outgoing };
}

/**
 * Get the latest incoming message that we haven't processed yet.
 */
function getNewIncomingMessage(): { text: string; id: string } | null {
  const { incoming } = getVisibleMessages();
  if (incoming.length === 0) return null;

  // Get the last (most recent) incoming message
  const lastMsg = incoming[incoming.length - 1];
  const text = lastMsg.textContent?.trim() || "";
  if (!text) return null;

  const id = getMessageId(lastMsg);
  if (processedMessageIds.has(id)) return null;

  return { text, id };
}

// ============================================================================
// AUTO-REPLY ENGINE
// ============================================================================

/**
 * Type a message into the FB Messenger reply box and send it.
 */
async function typeAndSendReply(text: string): Promise<boolean> {
  // Find the message input box
  const inputSelectors = [
    '[role="main"] [contenteditable="true"][role="textbox"]',
    '[role="main"] [aria-label*="Message" i][contenteditable="true"]',
    '[role="main"] [aria-label*="Type a message" i]',
    '[role="main"] p[contenteditable="true"]',
  ];

  let inputBox: HTMLElement | null = null;
  for (const sel of inputSelectors) {
    inputBox = document.querySelector<HTMLElement>(sel);
    if (inputBox) break;
  }

  if (!inputBox) {
    log("Reply box not found");
    return false;
  }

  // Focus the input
  inputBox.focus();
  await sleep(200);

  // Clear existing content
  inputBox.textContent = "";
  await sleep(100);

  // Type using execCommand for contenteditable compatibility
  document.execCommand("insertText", false, text);
  inputBox.dispatchEvent(new Event("input", { bubbles: true }));
  await sleep(300);

  // Verify text was inserted
  if (!inputBox.textContent?.includes(text.slice(0, 20))) {
    log("Text insertion failed, trying fallback");
    inputBox.textContent = text;
    inputBox.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(200);
  }

  // Find and click the Send button
  await sleep(500);

  const sendSelectors = [
    '[role="main"] [aria-label="Send" i]',
    '[role="main"] [aria-label="Press enter to send" i]',
    '[role="main"] [data-testid="send-button"]',
  ];

  let sendBtn: HTMLElement | null = null;
  for (const sel of sendSelectors) {
    sendBtn = document.querySelector<HTMLElement>(sel);
    if (sendBtn) break;
  }

  if (sendBtn) {
    sendBtn.click();
    log("Clicked Send button");
  } else {
    // Fallback: press Enter to send
    inputBox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
    await sleep(50);
    inputBox.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", bubbles: true }));
    log("Pressed Enter to send");
  }

  await sleep(500);
  return true;
}

/**
 * Call the AI sales agent backend to generate a response.
 */
async function getAiResponse(
  conversationState: ConversationState,
  customerMessage: string
): Promise<string | null> {
  try {
    const response = await new Promise<{
      ok: boolean;
      reply?: string;
      error?: string;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "AI_AUTO_REPLY",
          payload: {
            vehicleId: conversationState.vehicleId,
            customerMessage,
            customerName: conversationState.customerName,
            messageHistory: conversationState.messages.slice(-MAX_HISTORY_PER_THREAD),
          },
        },
        (res) => resolve(res || { ok: false, error: "No response" })
      );
    });

    if (response.ok && response.reply) {
      return response.reply;
    }
    log("AI response failed:", response.error);
    return null;
  } catch (err) {
    log("AI request error:", err);
    return null;
  }
}

/**
 * Process a new incoming message: get AI response and auto-reply.
 */
async function processNewMessage(messageText: string, messageId: string) {
  const threadId = getThreadId();
  if (!threadId) return;

  // Mark as processed immediately to prevent duplicates
  processedMessageIds.add(messageId);

  // Get or create conversation state
  let state = conversations.get(threadId);
  if (!state) {
    const { vehicleId, vehicleName } = extractVehicleIdFromPage();
    state = {
      conversationId: threadId,
      vehicleId,
      vehicleName,
      messages: [],
      lastReplyAt: 0,
      customerName: getCustomerName(),
    };
    conversations.set(threadId, state);
  }

  // Rate limiting
  const now = Date.now();
  if (now - state.lastReplyAt < RATE_LIMIT_MS) {
    log(`Rate limited: ${Math.ceil((RATE_LIMIT_MS - (now - state.lastReplyAt)) / 1000)}s remaining`);
    // Still track the message
    state.messages.push({ role: "user", content: messageText });
    return;
  }

  // Add customer message to history
  state.messages.push({ role: "user", content: messageText });

  log(`Processing message from ${state.customerName}: "${messageText.slice(0, 50)}..."`);

  // Get AI response
  const reply = await getAiResponse(state, messageText);
  if (!reply) {
    log("No AI reply generated, skipping");
    return;
  }

  // Simulate typing indicator: click input and type/delete a character to trigger FB "typing..."
  const typingInputSelectors = [
    '[role="main"] [contenteditable="true"][role="textbox"]',
    '[role="main"] [aria-label*="Message" i][contenteditable="true"]',
    '[role="main"] p[contenteditable="true"]',
  ];
  let typingBox: HTMLElement | null = null;
  for (const sel of typingInputSelectors) {
    typingBox = document.querySelector<HTMLElement>(sel);
    if (typingBox) break;
  }
  if (typingBox) {
    typingBox.focus();
    await sleep(500);
    // Type a character then delete it to trigger FB's typing indicator
    document.execCommand("insertText", false, ".");
    typingBox.dispatchEvent(new Event("input", { bubbles: true }));
    await sleep(1000);
    document.execCommand("delete", false);
    typingBox.dispatchEvent(new Event("input", { bubbles: true }));
    log("Typing indicator triggered");
  }

  // Add realistic delay to feel more human (30-90 seconds)
  const humanDelay = 30_000 + Math.random() * 60_000;
  log(`Waiting ${Math.round(humanDelay / 1000)}s before replying...`);
  await sleep(humanDelay);

  // Type and send the reply
  const sent = await typeAndSendReply(reply);
  if (sent) {
    state.messages.push({ role: "assistant", content: reply });
    state.lastReplyAt = Date.now();
    log(`Reply sent: "${reply.slice(0, 50)}..."`);

    // Persist conversation state
    saveConversations();
  }
}

// ============================================================================
// CONVERSATION PERSISTENCE
// ============================================================================

function saveConversations() {
  try {
    const data: Record<string, ConversationState> = {};
    conversations.forEach((v, k) => {
      // Keep only last N messages to avoid storage bloat
      data[k] = { ...v, messages: v.messages.slice(-MAX_HISTORY_PER_THREAD) };
    });
    chrome.storage.local.set({ [STORAGE_KEY_CONVERSATIONS]: data });
  } catch (err) {
    log("Failed to save conversations:", err);
  }
}

async function loadConversations() {
  try {
    const stored = await chrome.storage.local.get([STORAGE_KEY_CONVERSATIONS]) as {
      [STORAGE_KEY_CONVERSATIONS]?: Record<string, ConversationState>;
    };
    const data = stored[STORAGE_KEY_CONVERSATIONS];
    if (data) {
      conversations = new Map(Object.entries(data));
      log(`Loaded ${conversations.size} conversation(s) from storage`);
    }
  } catch (err) {
    log("Failed to load conversations:", err);
  }
}

// ============================================================================
// POLLING & OBSERVATION
// ============================================================================

function startPolling() {
  if (pollTimer) return;
  log("Starting message polling");

  pollTimer = setInterval(() => {
    if (!enabled) return;
    const threadId = getThreadId();
    if (!threadId) return;

    const newMsg = getNewIncomingMessage();
    if (newMsg) {
      processNewMessage(newMsg.text, newMsg.id);
    }
  }, MESSAGE_CHECK_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
    log("Stopped message polling");
  }
}

/**
 * Also use MutationObserver for faster detection of new messages.
 */
function startObserver() {
  if (observerActive) return;

  const mainArea = document.querySelector('[role="main"]');
  if (!mainArea) {
    log("No [role=main] found, will retry...");
    setTimeout(startObserver, 3000);
    return;
  }

  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    const threadId = getThreadId();
    if (!threadId) return;

    // Check if any mutation added new message elements
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        // Debounce: check after a short delay to let FB render complete
        setTimeout(() => {
          const newMsg = getNewIncomingMessage();
          if (newMsg) {
            processNewMessage(newMsg.text, newMsg.id);
          }
        }, 500);
        break;
      }
    }
  });

  observer.observe(mainArea, { childList: true, subtree: true });
  observerActive = true;
  log("MutationObserver active on [role=main]");
}

// ============================================================================
// INITIALIZATION
// ============================================================================

async function init() {
  log("Content script loaded on:", window.location.href);

  // Load persisted state
  await loadConversations();

  // Check if auto-reply is enabled
  const stored = await chrome.storage.local.get([STORAGE_KEY_ENABLED]) as {
    [STORAGE_KEY_ENABLED]?: boolean;
  };
  enabled = stored[STORAGE_KEY_ENABLED] === true;
  log("Auto-reply enabled:", enabled);

  if (enabled) {
    startPolling();
    startObserver();
  }

  // Mark existing messages as processed to avoid replying to old ones
  const { incoming } = getVisibleMessages();
  for (const msg of incoming) {
    processedMessageIds.add(getMessageId(msg));
  }
  log(`Marked ${incoming.length} existing messages as processed`);
}

// Listen for enable/disable toggle from popup
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "AI_AUTO_REPLY_TOGGLE") {
    enabled = message.payload.enabled;
    log("Auto-reply toggled:", enabled);

    if (enabled) {
      startPolling();
      startObserver();
      // Mark current messages as processed
      const { incoming } = getVisibleMessages();
      for (const msg of incoming) {
        processedMessageIds.add(getMessageId(msg));
      }
    } else {
      stopPolling();
    }

    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "PING") {
    sendResponse({ ok: true });
    return true;
  }

  return false;
});

// Listen for URL changes (SPA navigation)
let lastUrl = window.location.href;
const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    log("URL changed to:", lastUrl);
    // Reset processed messages for new thread
    processedMessageIds.clear();
    // Re-mark existing messages
    setTimeout(() => {
      const { incoming } = getVisibleMessages();
      for (const msg of incoming) {
        processedMessageIds.add(getMessageId(msg));
      }
      log(`Marked ${incoming.length} messages on new thread`);
    }, 2000);
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// Start
init();
