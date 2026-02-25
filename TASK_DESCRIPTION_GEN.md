# Task: AI Description Generator + HTML Fix

## Task 1: AI-Powered FB Marketplace Description Generator

Create `server/ai-description-generator.ts` that generates world-class Facebook Marketplace vehicle descriptions.

### Use Anthropic Claude API (NOT OpenAI)

The AI client should use the Anthropic SDK (`@anthropic-ai/sdk`). Install it if not present.
Use `ANTHROPIC_API_KEY` env var. Model: `claude-sonnet-4-20250514`.

### Description Style

Every description must follow this pattern:

```
99% Approval Rate | We Accept All Trade-Ins | Best Prices Guaranteed

[Carfax badges: No Accidents, One Owner, etc.]
[CPO status if applicable]

[Engine/drivetrain summary]
[Odometer callout - "Only X km" or "Pretty Much Brand New" if < 500 km]

[Key features as bullet points]

[One engaging paragraph about the vehicle]

Financing available
Dealer#50552
Stock number: [stockNumber]
*OAC. Prices do not include $595 Doc Fee or When Applicable, $799 Finance/Lease Fee, or taxes.
```

Use emojis tastefully. Match the vehicle personality (sporty for N Line, luxury for Calligraphy, eco for Electric/Hybrid).

Canadian market: km not miles, CAD, provinces.

### Features to include:
- Vehicle year, make, model, trim
- Price, odometer, exterior color
- Carfax badges from DB
- Highlights from the title pipe-separated text
- Tech specs if available
- Engine, transmission, drivetrain, fuel type

### Functions needed:
- `generateDescription(vehicleId: number)` - generates for one vehicle using Claude API
- `generateDescriptionTemplate(vehicle)` - template fallback without API key
- `generateBatchDescriptions(dealershipId: number)` - generates for all vehicles in a dealership

### API Endpoints (add to server/routes.ts):
- `POST /api/vehicles/:id/generate-description` - generate for one vehicle
- `POST /api/vehicles/generate-descriptions` - batch generate for dealership

### Storage:
- Save generated description to the vehicle's `description` field in DB
- Also save to a new `generatedDescription` or `fbDescription` field if one exists, otherwise just use `description`

## Task 2: Fix HTML Entity Encoding in Chrome Extension

In `chrome-extension/src/content-facebook.ts`, find where formData is used (around line 2519 in the main fill handler).

Add this function near the top of the file:

```typescript
function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
}
```

Apply it to all text fields before filling the FB form:
- formData.title
- formData.description  
- formData.model
- Any highlights text

This fixes the `SUN&#x2F;MOON ROOF` showing as encoded instead of `SUN/MOON ROOF`.

After fixing, rebuild the extension:
```
cd chrome-extension && node build.cjs
```

## When Done

Run: `openclaw system event --text "Done: AI description generator + HTML encoding fix" --mode now`
