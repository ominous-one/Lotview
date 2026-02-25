# Task: Fix Facebook Marketplace Posting - 100% Automated

## REQUIREMENT: Everything must be 100% automated. NO manual steps. NO "drag photos here" overlays. The user clicks one button and the listing posts with all photos and correct title. Period.

## Issue 1: Title HTML Entity Encoding

Title shows `SUN&#x2F;MOONROOF` instead of `SUN/MOONROOF`.

### Root causes to check and fix:
1. The `highlights` field in the DB may contain HTML entities from scraping. Fix in `server/dealer-listing-scraper.ts` - decode entities when extracting highlights from the VDP HTML.
2. The server constructs the title with highlights before sending to extension. Fix in the route that builds the PostJob.
3. The content script should also decode as a safety net.

### Fix:
Add this decode function and apply it everywhere text flows through:
```
function decodeHtmlEntities(text) {
  return text.replace(/&#x2F;/g, '/').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c)).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}
```

Apply in:
- server/routes.ts (where PostJob title/description is built)
- server/dealer-listing-scraper.ts (where highlights are extracted)
- chrome-extension/src/content-facebook.ts (safety net on formData)

Also: update all existing vehicles in the DB that have encoded highlights. Write a quick migration/fix script.

## Issue 2: Image Upload - MUST BE 100% AUTOMATED

Facebook blocks standard programmatic file uploads. The solution is to use the BACKGROUND SERVICE WORKER to handle image fetching (no CORS issues) and then use advanced techniques to inject them.

### Strategy: Background-fetched blobs + Native React event simulation

**Step 1: Background script fetches images as blobs**
In `chrome-extension/src/background.ts`, add a handler:
- Message type: `FETCH_IMAGES_AS_BLOBS`  
- For each image URL, fetch it using the background script's fetch (no CORS restrictions)
- Convert to base64 data URLs
- Return array of {dataUrl, filename, mimeType} to the content script

**Step 2: Content script creates Files from data URLs**
In `chrome-extension/src/content-facebook.ts`:
- Receive base64 data URLs from background
- Convert each to a File object using: `new File([blob], filename, {type: mimeType})`

**Step 3: Use React's internal fiber to set files**
Facebook uses React. Standard DOM events don't trigger React's state updates. The key technique:

```javascript
// Find the file input
const fileInput = document.querySelector('input[type="file"][accept*="image"]');

// Create a DataTransfer with our files
const dataTransfer = new DataTransfer();
files.forEach(f => dataTransfer.items.add(f));

// Use Object.getOwnPropertyDescriptor to set files through React's setter
const nativeInputFileSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype, 'files'
);
nativeInputFileSetter.set.call(fileInput, dataTransfer.files);

// Dispatch events that React listens to
fileInput.dispatchEvent(new Event('input', { bubbles: true }));
fileInput.dispatchEvent(new Event('change', { bubbles: true }));

// Also try: React 18+ uses SyntheticEvent internally
// Create and dispatch a native change event at the React root
const nativeEvent = new Event('change', { bubbles: true, cancelable: false });
Object.defineProperty(nativeEvent, 'target', { writable: false, value: fileInput });
fileInput.dispatchEvent(nativeEvent);
```

**Step 4: If React setter doesn't work, try drag-and-drop simulation**
```javascript
// Create a proper DragEvent with DataTransfer containing files
const dropZone = document.querySelector('[aria-label*="photo" i], [aria-label*="drag" i]') 
  || document.querySelector('[data-testid*="photo"]');

const dt = new DataTransfer();
files.forEach(f => dt.items.add(f));

// Full drag sequence
dropZone.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true }));
dropZone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }));
dropZone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
```

**Step 5: If drag-drop doesn't work, try clipboard paste**
```javascript
const photoArea = document.querySelector('[aria-label*="photo" i]');
photoArea.focus();

const clipboardData = new DataTransfer();
files.forEach(f => clipboardData.items.add(f));

const pasteEvent = new ClipboardEvent('paste', {
  bubbles: true,
  cancelable: true,
  clipboardData: clipboardData
});
photoArea.dispatchEvent(pasteEvent);
```

**Step 6: Last resort - use chrome.debugger API**
If all DOM-level approaches fail, use `chrome.debugger` to attach to the tab and use Chrome DevTools Protocol:
```javascript
// In background.ts
chrome.debugger.attach({tabId}, '1.3', () => {
  // Use DOM.setFileInputFiles to set files on the input
  chrome.debugger.sendCommand({tabId}, 'DOM.setFileInputFiles', {
    files: localFilePaths,  // This requires actual file paths
    nodeId: fileInputNodeId
  });
});
```

This is the nuclear option but it works because it operates at the browser level, not the DOM level.

**IMPORTANT: The chrome.debugger approach requires the "debugger" permission in manifest.json.**

### Implementation order:
1. Try background-fetch + React native setter (most likely to work)
2. Try drag-drop simulation with proper DataTransfer
3. Try clipboard paste
4. Try chrome.debugger as last resort
5. ALL attempts must be AUTOMATIC - no user interaction required

### Testing:
After implementing, the flow should be:
1. User clicks "Post to FB" in extension
2. Extension navigates to FB Marketplace create vehicle page
3. Extension fills ALL fields (year, make, model, price, mileage, etc.)
4. Extension uploads ALL photos automatically
5. User just clicks "Publish"

Rebuild after changes: `cd chrome-extension && node build.cjs`

When done run: `openclaw system event --text "Done: Fixed FB title encoding and fully automated image upload" --mode now`
