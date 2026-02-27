# Task: AI Training Defaults — Complete

## File Created
`server/ai-training-defaults.ts`

## What's In It
10 exported defaults covering every AI training field:

| Export | Type | Description |
|--------|------|-------------|
| `DEFAULT_SALES_PERSONALITY` | string | Comprehensive personality prompt blending Voss (mirroring/empathy), Elliott (always close to appointment), Cardone (urgency), Verde (qualifying questions), Lewis (rapport) |
| `DEFAULT_GREETING_TEMPLATE` | string | Template with `{{customerName}}`, `{{vehicleYear/Make/Model}}`, `{{vehicleFact}}` placeholders |
| `DEFAULT_OBJECTION_HANDLING` | Record<string, string> | **25 objections** with expert responses — all 2-3 sentences, conversational, ending with CTA |
| `DEFAULT_ALWAYS_INCLUDE` | string | 6 value props to weave in naturally |
| `DEFAULT_NEVER_SAY` | string | 12 rules for what the AI must never do |
| `DEFAULT_ESCALATION_RULES` | string | 8 escalation triggers + suggested handoff language |
| `DEFAULT_CUSTOM_CTAS` | string | 6 CTA variations to rotate through |
| `DEFAULT_SAMPLE_CONVERSATIONS` | string | 3 complete multi-turn conversations (price objection, just looking, bad credit) |
| `DEFAULT_BUSINESS_HOURS` | string | Standard dealership hours template |
| `DEFAULT_TONE` / `DEFAULT_RESPONSE_LENGTH` | string | "friendly" / "short" |

## Design Decisions
- All objection responses follow the pattern: **acknowledge → pivot to value/appointment → question or CTA**
- Sample conversations show 4-6 exchanges each, always ending with a booked appointment
- Greeting template uses placeholder variables for dynamic vehicle data
- Kept everything as simple string/record exports for easy consumption by any AI prompt builder
