# Workstream 4 — FB Marketplace Replies (Server + Web UI) Implementation

Date: 2026-03-08

## Deliverables Index

| Area | Deliverable | Path(s) |
|---|---|---|
| DB | New tables + indexes migration | `migrations/0005_fb_marketplace_replies.sql` |
| Shared schema | Drizzle tables + types for replies | `shared/schema.ts` |
| Server (storage) | Persistence + idempotent upsert/append APIs | `server/storage.ts` |
| Server (routes) | Extension ingestion endpoints + Sales Manager UI APIs | `server/routes.ts` |
| Extension | Server-source-of-truth settings + ingestion + server audit | `chrome-extension/src/background-helpers.ts`, `chrome-extension/src/background.ts`, `chrome-extension/src/content-facebook-messenger.ts` |
| Web app UI | FB Inbox screen | `client/src/pages/FbInbox.tsx` |
| Web app UI | Automation Settings screen | `client/src/pages/FbAutomationSettings.tsx` |
| Web app UI | Audit Console screen | `client/src/pages/FbAuditConsole.tsx` |
| Web app UI | Routes wiring | `client/src/App.tsx` |
| Tests | API tests for ingestion idempotency + web reads | `server/tests/fb-replies-ingestion.test.ts` |

## API Surface

### Extension ingestion (JWT-authenticated; idempotent)

> Note: `extensionHmacMiddleware` is skipped when `Authorization: Bearer <jwt>` is present.

- `GET /api/extension/fb-replies/settings`
- `POST /api/extension/fb-replies/thread`
- `POST /api/extension/fb-replies/message`
- `POST /api/extension/fb-replies/audit`
- `POST /api/extension/fb-replies/mapping`
- `POST /api/extension/fb-replies/decide-send` (server-authoritative send gate)

### Sales Manager UI

- `GET /api/fb-inbox/settings`
- `PUT /api/fb-inbox/settings`
- `GET /api/fb-inbox/threads`
- `GET /api/fb-inbox/threads/:id`
- `GET /api/fb-inbox/threads/:id/messages`
- `POST /api/fb-inbox/threads/:id/pause`
- `POST /api/fb-inbox/threads/:id/auto-send`
- `POST /api/fb-inbox/threads/:id/dnc`
- `GET /api/fb-inbox/audit`

## Settings & Safety Envelope

- Auto-send defaults to **ON** server-side (`fb_reply_settings.auto_send_enabled = true`).
- Safety envelope is enforced server-side via:
  - `globalKillSwitch`
  - per-thread `isPaused`, `autoSendEnabled`, `doNotContact`
- Extension now fetches server settings on each thread processing loop and will disable local sending when server disables it.
- Audit events are written both:
  - locally (extension, for immediate inspection)
  - server-side (authoritative audit trail)

## Server-authoritative auto-send decision (production hardening)

The extension **must** call the server to decide whether an outbound auto-send attempt is allowed.

### Endpoint

- `POST /api/extension/fb-replies/decide-send`

### Request (shape)

```json
{
  "fbThreadId": "<string>",
  "participantName": "Alex Buyer",
  "leadNameConfidence": 0.92,
  "listingUrl": "https://facebook.com/marketplace/item/123",
  "listingTitle": "2019 Honda Civic",
  "vehicleId": 123,
  "vehicleDisplayName": "2019 Honda Civic",
  "vehicleMappingConfidence": 0.95,
  "candidateReply": "Hey Alex — yes, the 2019 Honda Civic is still available.",
  "intent": { "intent": "AVAILABILITY_CHECK", "confidence": 0.95 },
  "localSignals": { "actionBlockDetected": false },
  "recentMessages": [
    { "direction": "INBOUND", "senderRole": "BUYER", "sentAt": "2026-03-08T21:00:00.000Z", "text": "Is this still available?" }
  ]
}
```

### Response (shape)

```json
{
  "decision": "ALLOW",
  "allow": true,
  "reasonCodes": [],
  "dnc": false,
  "globalKillSwitch": false,
  "threadPaused": false,
  "threadAutoSendEnabled": true,
  "dryRun": true,
  "typingSim": { "msPerCharMin": 35, "msPerCharMax": 95, "...": "..." },
  "escalate": false,
  "counters": { "autoMin": 0, "autoHour": 1, "autoDay": 1, "totalDay": 2, "autoTurns": 1 }
}
```

### Enforced server checks (current)

- Global kill switch + per-thread kill switches
- DNC absolute
- Business hours (configurable JSON; safe default window)
- Per-dealership rate limits (auto + total)
- Anti-loop guards (no consecutive outbound without a new inbound; max auto turns)
- Confidence + personalization gating

> Note: the server treats the request as **best-effort signal**; authoritative state is derived from persisted thread/message history.

## How to run migrations

1. Apply DB migrations as usual for this repo.
2. Ensure `migrations/0005_fb_marketplace_replies.sql` is applied.

## How to run tests

1. Start the API server (same way as other `server/tests/*` scripts expect):

   - Ensure the server is running on `http://localhost:5000`.

2. Run:

```bash
node server/tests/fb-replies-ingestion.test.ts
node server/tests/fb-replies-decide-send.unit.test.ts
node server/tests/fb-replies-decide-send.int.test.ts
```

(If your repo uses tsx/ts-node for test scripts, run with that runner instead.)

## Gap Report (auto-fill)

### ✅ Implemented

- **Idempotent server-side ingestion endpoints**
  - Thread upsert (unique per dealership + fbThreadId)
  - Message append (unique on fbMessageId and secondary dedupeHash)
  - Audit append (unique per dealership + eventKey)
  - Mapping upsert (unique per dealership + fbThreadId + participantName + listingUrl)

- **Persistence**
  - `fb_reply_settings`
  - `fb_inbox_threads`
  - `fb_inbox_messages`
  - `fb_inbox_audit_events`
  - `fb_thread_vehicle_map`

- **Web app UI (Sales Manager)**
  - Inbox list + message view + per-thread kill switches
  - Automation settings (global kill switch + JSON configs)
  - Audit console (filters + detail view)

- **Extension integration**
  - Server as source of truth for settings (global kill + auto-send enable + dry-run)
  - Server ingestion for thread/message/audit/mapping
  - **Server-authoritative send gate** (`POST /api/extension/fb-replies/decide-send`) — extension must obey `ALLOW|DENY`

- **No external side effects in tests**
  - Tests only hit ingestion + read APIs; do not send to FB.

### ⚠️ Known gaps / follow-ups

1. **Design-pack fidelity**
   - The UI screens are functional but may not exactly match the design pack pixel-for-pixel.
   - Follow-up: apply design tokens/layout from `design/automation-overhaul/*`.

2. **Thread ↔ vehicle mapping enrichment**
   - Mapping is stored and can update thread’s `vehicleId`, but there is no UI workflow yet to pick/change the vehicle mapping.
   - Follow-up: add a “Link vehicle” control in `FbInbox`.

3. **Per-thread overrides vs global settings**
   - Global settings exist, per-thread switches exist.
   - Follow-up: surface per-thread effective policy (computed) in UI.

4. **Audit taxonomy**
   - `kind` is free-form string; spec may require an enum.
   - Follow-up: enforce `kind` enums + validation.
