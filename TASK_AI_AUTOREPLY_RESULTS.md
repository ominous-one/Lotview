# AI Auto-Reply Implementation Results

## Summary
Wired the AI sales agent into Facebook Marketplace messenger so it auto-responds to incoming buyer messages.

## Files Created
- `chrome-extension/src/content-facebook-messenger.ts` — New content script for FB Messenger auto-reply

## Files Modified
- `chrome-extension/manifest.json` — Added content script injection for `/marketplace/inbox/*`, `/marketplace/t/*`, `/messages/t/*`
- `chrome-extension/build.cjs` — Added build step for `content-facebook-messenger.js`
- `chrome-extension/src/background.ts` — Added `AI_AUTO_REPLY`, `AI_AUTO_REPLY_TOGGLE`, `AI_AUTO_REPLY_STATUS` handlers
- `chrome-extension/src/background-helpers.ts` — Added new actions to `ALLOWED_ACTIONS` set
- `chrome-extension/src/popup.tsx` — Added auto-reply toggle switch in Post tab UI
- `chrome-extension/src/popup.css` — Added toggle switch CSS styles

## Architecture

### Message Detection (`content-facebook-messenger.ts`)
- **Dual detection**: MutationObserver (fast) + polling every 2s (reliable fallback)
- **Message direction detection**: Uses message position (left=incoming, right=outgoing) and background color heuristics
- **Deduplication**: Content-hash-based message IDs prevent reprocessing
- **Existing message skip**: On load/navigation, marks all visible messages as "processed" so only new ones trigger replies

### AI Response Pipeline
1. Content script detects new incoming message
2. Sends `AI_AUTO_REPLY` to background script via `chrome.runtime.sendMessage`
3. Background script calls `POST /api/ai/respond` with auth token
4. Server's `generateSalesResponse()` uses Claude to generate a natural sales reply
5. Content script types the reply into the Messenger input box and sends it

### Conversation Tracking
- Per-thread `ConversationState` with message history (last 20 messages)
- Persisted to `chrome.storage.local` so context survives page reloads
- Extracts vehicleId from marketplace listing link in conversation header
- Extracts customer name from conversation title

### Rate Limiting
- **1 minute cooldown** per conversation thread
- Messages received during cooldown are still tracked in history (for AI context) but no reply is sent
- Human-like delay of 2-6 seconds before sending each reply

### Toggle Control
- On/off toggle in popup UI with green highlight when active
- State stored in `chrome.storage.local` as `aiAutoReplyEnabled`
- Toggle broadcasts to all FB content scripts via `chrome.tabs.sendMessage`
- Defaults to OFF — must be explicitly enabled

### Auto-Reply Injection
- Finds Messenger's contenteditable textbox
- Uses `document.execCommand('insertText')` for React-compatible typing
- Sends via Send button click or Enter key fallback
- SPA-aware: watches for URL changes and re-initializes on thread navigation

## API Route Used
- `POST /api/ai/respond` — Existing route, requires manager+ role
- Sends: `{ vehicleId?, customerMessage, customerName, messageHistory }`
- Returns: `{ reply, vehicleId?, vehicleName? }`

## Build Verification
✅ `node build.cjs` compiles all files successfully including the new content script.
