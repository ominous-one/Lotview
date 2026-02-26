# Task: Fix Facebook Marketplace Form Filling Bugs

Multiple bugs in chrome-extension/src/content-facebook.ts when filling the FB Marketplace vehicle form.

## Bug 1: Price showing $6 instead of $31,388

The price value is "31388" but only "6" or first digit gets into the field. 

The issue is that Facebook's price input uses React controlled components. When you set the value programmatically, React doesn't update its internal state.

### Fix:
Use the React internal instance approach:
```javascript
function setReactInputValue(input, value) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  ).set;
  nativeInputValueSetter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}
```

Apply this to the `setNativeValue` function and also to the price-specific filling at line ~3348. Make sure it dispatches both 'input' and 'change' events with bubbles:true.

Also: The character-by-character typing fallback might be fighting with React. Instead of typing char by char, try:
1. Set full value via React setter
2. Wait 500ms
3. Check if value matches
4. If not, try: focus, select all (Ctrl+A), then type the value using keyboard events

## Bug 2: Fuel Type showing "Gas" instead of "Hybrid" or "Electric"

Facebook's fuel type dropdown has specific options. The extension needs to map our values to FB's exact dropdown options.

Facebook Marketplace fuel type options are typically:
- Gasoline
- Diesel
- Electric
- Hybrid
- Other

Our DB has: "Gasoline", "Electric", "Hybrid", "Diesel"

Check the fuel type dropdown filling logic and ensure:
- "Electric" maps to "Electric" (not "Gas")
- "Hybrid" maps to "Hybrid"
- Case-insensitive matching
- The dropdown option text might be slightly different (e.g., "Gas" vs "Gasoline")

Find where fuel type dropdown is filled and fix the matching.

## Bug 3: Title still showing HTML entities

The rawFormData decode was added but the extension BUILD needs to be run. Verify that:
1. The decodeHtmlEntities function exists in content-facebook.ts
2. It's applied to rawFormData BEFORE sanitize
3. Build the extension: `cd chrome-extension && node build.cjs`

## Bug 4: Wrong Year Being Selected

Console shows "Looking for Year 2025" but vehicle is 2018. This means:
- Either the popup is sending wrong year
- Or the year extraction from formData.title is wrong

Check how year is extracted at line ~2777:
```
const yearValue = (formData as Record<string, unknown>).year as string || 
                  titleStr.match(/^(\d{4})/)?.[1] || "";
```

The year should come from `formData.year` directly, not parsed from the title. Make sure formData.year is a string like "2018" not a number.

## Bug 5: Body Style "Sedan" instead of "SUV"

The RAV4 is an SUV but FB shows Sedan. Check how body style is determined and fix the mapping. The vehicle's `type` field from the DB should be used.

## After fixes:
1. Rebuild extension: `cd chrome-extension && node build.cjs`
2. Verify build succeeds

When done run: `openclaw system event --text "Done: Fixed FB form filling - price, fuel type, year, body style, encoding" --mode now`
