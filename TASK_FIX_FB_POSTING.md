# TASK: Fix FB Marketplace Posting — 3 Issues

## Issue 1: Duplicate Description Content
The AI-generated description repeats vehicle specs (engine, transmission, drivetrain) that are already shown in a header line. The description in the DB field `fbDescription` or `description` has redundant content.

**Look at**: `server/ai-description-generator.ts` — the prompt likely tells Claude to include vehicle specs AND there's a separate header line being prepended. The result is specs appearing twice.

**Fix**: Either remove specs from the AI prompt instructions, or remove the header line that duplicates them. Check `chrome-extension/src/content-facebook.ts` around the description fill logic — it may be concatenating a header + the full description which already includes those details.

Check the `fillFacebook` function around line 3200+ in content-facebook.ts. Look for where description text is assembled before being typed into the textarea. It likely prepends "99% Approval Rate | We Accept All Trade-Ins | Best Prices Guaranteed\n\n" + vehicle specs line + "\n\n" + the AI description which ALSO contains those same specs.

## Issue 2: Minimum 300 km Odometer
Facebook Marketplace rejects odometer values below 300 km.

**Fix in**: `chrome-extension/src/content-facebook.ts` — where odometer is filled in. Add: `if (odometer < 300) odometer = 300;`

Also fix in `chrome-extension/src/popup.tsx` — where form data is prepared before sending to content script.

## Issue 3: Auto-click Next and Publish
After filling the form, the extension needs to:
1. Find and click the "Next" button
2. Wait for the next screen to load (~2 seconds)
3. Find and click the "Publish" button

**Fix in**: `chrome-extension/src/content-facebook.ts` at the END of the `fillFacebook` function. After all fields are filled and images uploaded:

```typescript
// Click Next button
await new Promise(r => setTimeout(r, 1000));
const nextBtn = Array.from(document.querySelectorAll('div[role="button"], button'))
  .find(el => el.textContent?.trim().toLowerCase() === 'next');
if (nextBtn) {
  (nextBtn as HTMLElement).click();
  console.log('[LV] Clicked Next button');
  
  // Wait for Publish screen
  await new Promise(r => setTimeout(r, 3000));
  
  const publishBtn = Array.from(document.querySelectorAll('div[role="button"], button'))
    .find(el => el.textContent?.trim().toLowerCase() === 'publish');
  if (publishBtn) {
    (publishBtn as HTMLElement).click();
    console.log('[LV] Clicked Publish button');
  }
}
```

## Files to Edit
1. `chrome-extension/src/content-facebook.ts` — description assembly, odometer min, Next/Publish buttons
2. `chrome-extension/src/popup.tsx` — odometer min before sending to content script
3. Possibly `server/ai-description-generator.ts` — if description duplication is in the AI prompt

## After Fixing
1. Build the extension: `cd chrome-extension && node build.cjs`
2. Verify the build succeeds
3. Commit with message: "Fix: deduplicate description, enforce 300km minimum odometer, auto-click Next and Publish"
