# Lotview Auto Poster (Chrome Extension)

Auto-fill Facebook Marketplace listings from Lotview inventory using the salesperson's existing Facebook session. Extensible to Kijiji/Craigslist via driver model.

## Features

- **One-click login** with Lotview account credentials
- **Vehicle browser** with search/filter, thumbnails, and live count
- **Template system** for customizing titles and descriptions with variables
- **Auto-fill** Facebook Marketplace listing forms with vehicle data
- **Image upload** from inventory to Facebook form
- **Posting history** tab tracking recent submissions
- **Toast notifications** for success/error feedback
- **Loading indicators** during API calls and form filling
- **Multi-tenant** with configurable server URL

## Structure

```
chrome-extension/
├── src/
│   ├── types.ts          # Shared TypeScript types
│   ├── background.ts     # Auth, inventory fetch, message routing
│   ├── content-facebook.ts # FB form detection and auto-fill
│   ├── popup.tsx         # React popup UI
│   ├── popup.css         # Popup styles
│   └── popup.html        # Popup HTML entry
├── icons/                # Extension icons (SVG)
├── manifest.json         # MV3 manifest
├── build.cjs             # esbuild script
└── dist/                 # Built extension (load this in Chrome)
```

## Building

```bash
# Development build (with source maps)
cd chrome-extension
node build.cjs

# Production build (minified, no console logs)
node build.cjs --prod
```

This creates the `dist/` folder with the bundled extension.

## Installation

1. Build the extension (see above)
2. Open Chrome → `chrome://extensions/`
3. Enable **Developer mode** (toggle top-right)
4. Click **Load unpacked**
5. Select the `chrome-extension/dist` folder

## Usage

1. Click the extension icon in Chrome toolbar
2. Enter your **Server URL** (e.g., `https://your-lotview.replit.app`)
3. Log in with your Lotview email and password
4. Navigate to Facebook Marketplace → Create New Listing → Vehicles
5. Search and select a vehicle from your inventory
6. Optionally select a template
7. Click **Auto-fill Listing**
8. Review the filled form and click Publish

## API Endpoints (Backend)

The extension expects these endpoints on the Lotview server:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/extension/login` | POST | Authenticate user, returns JWT and dealership info |
| `/api/extension/inventory` | GET | Fetch vehicles with optional `?query=` filter |
| `/api/extension/templates` | GET | Fetch ad templates for dealership |
| `/api/extension/postings` | POST | Log posting success/failure |
| `/api/ad-templates` | POST | Create new template |
| `/api/ad-templates/shared` | POST | Create shared template (manager+) |

## Template Variables

Templates support these placeholders:

| Variable | Description |
|----------|-------------|
| `{year}` | Vehicle year |
| `{make}` | Vehicle make |
| `{model}` | Vehicle model |
| `{trim}` | Vehicle trim |
| `{price}` | Price with $ prefix |
| `{odometer}` | Mileage in km |
| `{fuel}` | Fuel type |
| `{transmission}` | Transmission type |
| `{drivetrain}` | Drivetrain (AWD, FWD, etc.) |
| `{vin}` | Vehicle VIN |
| `{stock}` | Stock number |

Example title: `{year} {make} {model} - ${price}`
Example description: `Check out this {year} {make} {model} {trim}! {odometer} km on the clock.`

## Security Notes

- JWT tokens are stored in Chrome's `chrome.storage.sync` (synced across devices)
- No Facebook credentials are stored or accessed
- Uses the user's existing Facebook login session
- Server URL is configurable per installation
- Image URLs are signed server-side for secure access

## Troubleshooting

**"Server URL not configured"**
- Enter your Lotview server URL on the login screen

**"Session expired"**
- Log out and log back in

**"No active tab found"**
- Make sure you're on a Facebook Marketplace create listing page

**Form fields not filling**
- Facebook may have updated their UI. Report the issue for selector updates.

## Platform Extensibility

The extension is designed for future platform support:

- `facebook` - ✅ Implemented
- `kijiji` - 🚧 Coming soon
- `craigslist` - 🚧 Coming soon

Each platform requires a content script driver that implements the form-filling logic.

---

**Version**: 0.3.0  
**Last Updated**: January 2026
