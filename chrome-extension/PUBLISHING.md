# Chrome Web Store Publishing Guide

## Prerequisites

1. A [Chrome Web Store Developer account](https://chrome.google.com/webstore/devconsole) ($5 one-time fee)
2. Extension icons: 16x16, 48x48, 128x128 PNG files in `icons/`
3. Store listing assets:
   - At least one screenshot (1280x800 or 640x400)
   - Promotional tile (440x280) - optional but recommended
   - Description (up to 132 characters for summary)

## Building the Extension

```bash
cd chrome-extension

# Install dependencies
npm ci

# Run tests
npm test

# Build production zip
npm run build:zip
```

This produces `lotview-auto-poster-v<VERSION>.zip` in the `chrome-extension/` directory.

## Submitting to Chrome Web Store

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **"Add new item"** (first time) or select the existing listing
3. Upload the `.zip` file
4. Fill in the store listing:
   - **Category**: Productivity
   - **Language**: English
   - **Description**: Explain the auto-posting features for car dealerships
5. Upload screenshots showing the popup and auto-fill in action
6. Set **Visibility**: Public (or Unlisted for beta testing)
7. Click **Submit for review**

Review typically takes 1-3 business days.

## Updating an Existing Listing

1. Bump the version in both `manifest.json` and `package.json`
2. Build the zip: `npm run build:zip`
3. Go to Developer Dashboard → select the extension → **Package** tab
4. Click **Upload new package** and upload the new zip
5. Update the changelog/description if needed
6. Click **Submit for review**

## Version Numbering

Use semver: `MAJOR.MINOR.PATCH`

- **MAJOR**: Breaking changes to user workflow
- **MINOR**: New features (new platform support, new UI panels)
- **PATCH**: Bug fixes, performance improvements

## Testing Before Submission

1. Build dev version: `npm run build`
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode**
4. Click **Load unpacked** and select `chrome-extension/dist/`
5. Test all flows:
   - Login via popup
   - Navigate to FB Marketplace create page
   - Verify auto-fill works
   - Check that vehicle data loads correctly

## CI/CD

The GitHub Actions deploy workflow automatically builds the extension zip as an artifact on every push to `main`. Download it from the Actions tab to submit manually, or extend the workflow with the [Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api/) for automated publishing.
