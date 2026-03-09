# Workstream 4 — Facebook Marketplace Replies (Extension)

## Current implementation scope
This implementation updates the **extension-side automation** to match v1.2 semantics:
- **Auto-send default ON** (but policy-gated)
- **Safety Envelope** (allowlist intents, denylist topics, business hours)
- **Personalization requirement** (lead name + vehicle context) for auto-send
- **Typing simulation** (chunking + jitter) and abort conditions
- **DNC absolute**
- **Audit logging** (local `chrome.storage.local` record)

## Safety Envelope rules (defaults)
Auto-send is allowed only when:
- Intent is allowlisted:
  - availability check
  - hours/location
  - scheduling basic
- NOT denylisted:
  - negotiation/offers
  - financing promises
  - accident/warranty specifics
  - off-platform pressure
  - hostile content
- Within business hours (defaults in code)
- Lead name confidence and vehicle mapping confidence pass thresholds

## Kill switches
- Global (server-enforced): `fb_reply_settings.global_kill_switch`.
  - UI requires a **reason** when toggling, recorded as:
    - `global_kill_switch_last_toggled_at`
    - `global_kill_switch_last_toggled_by`
    - `global_kill_switch_last_reason`
- Local (extension quick toggle): popup toggle (**AI Bot ON/OFF**) stored in `aiAutoReplyEnabled`.
- Thread-level DNC: set automatically when buyer says “stop/don’t contact/unsubscribe”.

## Mapping listing → vehicleId
- On successful FB autopost via `/api/extension/auto-post`, the extension stores `listingUrl → vehicleId` locally under `lvFbListingMap`.
- When reading a thread, the script extracts the listing URL from the conversation and uses the map to bind the thread to `vehicleId`.

## Dry-run
- Dev builds (`__DEV__=true`) default to **dry-run** mode (`lvDryRun=true`):
  - the script types the reply (for testing), but **does not click Send**.

## Audit log
Stored locally at:
- `chrome.storage.local["lvFbReplyAudit"]` (capped to 500 records)

Server-side (Sales Inbox UI):
- `/api/extension/fb-replies/audit` ingests per-thread events into `fb_inbox_audit_events`.
- `/api/extension/fb-replies/decide-send` also persists a `DECIDE_SEND` event so the Sales Inbox can show a Suggested Reply + "Why" drilldown.

Each record includes:
- decision (AUTO_SENT / BLOCKED / ESCALATED / DNC_SET / DRY_RUN)
- reasons
- intent + confidence
- lead name confidence
- vehicle mapping confidence + method
- typing duration

## Known limitations (needs backend work)
- No server-side ingestion or Sales Inbox UI is included here.
- Rate limits are not currently per-fb-identity/day counters; only thread-level cooldown + conservative envelope are enforced in-extension.
