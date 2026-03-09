# FB Conversation Fixtures

These fixtures are used for:
- policy / decide-send tests (prompt injection, DNC, business hours)
- UI seed data

## Files
- `001_basic_inquiry.json` — normal inbound “is this available?”
- `002_prompt_injection.json` — inbound tries to override rules
- `003_dnc.json` — user asks to stop messaging
- `004_price_negotiation.json` — negotiation + appointment booking attempt

All timestamps are ISO-8601.
