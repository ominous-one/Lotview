# Olympic Auto Group - n8n Vehicle Import Integration Guide

This guide explains how to set up n8n workflows to automatically scrape vehicle inventory from dealer websites and import it into the Olympic Auto Group platform.

## Overview

The integration works as follows:
1. **n8n scrapes** the dealer website using Puppeteer/HTTP nodes
2. **ChatGPT/OpenAI** helps extract and structure vehicle data
3. **HTTP Request** sends vehicles to the API with a secure token
4. **API imports** vehicles scoped to the correct dealership

## API Endpoints

### Base URL
```
https://your-app-url.replit.app
```

### Authentication
All API requests require a Bearer token in the Authorization header:
```
Authorization: Bearer oag_dealername_xxxxxxxxxxxxxxxxxxxxx
```

### Available Endpoints

| Method | Endpoint | Permission | Description |
|--------|----------|------------|-------------|
| POST | `/api/import/vehicles` | `import:vehicles` | Import/update vehicles |
| GET | `/api/import/vehicles` | `read:vehicles` | Get current inventory |
| DELETE | `/api/import/vehicles/:id` | `delete:vehicles` | Delete by internal ID |
| DELETE | `/api/import/vehicles/vin/:vin` | `delete:vehicles` | Delete by VIN |
| POST | `/api/import/vehicles/sync` | `import:vehicles` + `delete:vehicles` | Full inventory sync |

---

## Step 1: Create API Token

1. Log in as **Super Admin**
2. Go to **Super Admin Dashboard** → **API Integrations** tab
3. Find the dealership (e.g., "Southside Nissan")
4. Click the **n8n** badge
5. Click **Create Token**
6. Name it (e.g., "n8n Scraper")
7. Select permissions:
   - ✅ **Import Vehicles** - Create and update vehicles
   - ✅ **Read Vehicles** - Check existing inventory
   - ✅ **Delete Vehicles** - Remove sold vehicles
8. **Copy the token immediately** - it won't be shown again!

---

## Step 2: n8n Workflow Architecture

### Recommended Node Setup

```
┌─────────────────────────┐
│ 1. Schedule Trigger     │  ← Runs daily at 2 AM
└───────────┬─────────────┘
            │
┌───────────▼─────────────┐
│ 2. HTTP Request         │  ← Get inventory list page
│    (Puppeteer/HTTP)     │
└───────────┬─────────────┘
            │
┌───────────▼─────────────┐
│ 3. Code Node            │  ← Extract VDP URLs
│    (Parse HTML)         │
└───────────┬─────────────┘
            │
┌───────────▼─────────────┐
│ 4. Loop Over Items      │  ← Process each vehicle
└───────────┬─────────────┘
            │
    ┌───────▼───────┐
    │ 5. Puppeteer  │  ← Open VDP, click images
    │    (Get VDP)  │
    └───────┬───────┘
            │
    ┌───────▼───────┐
    │ 6. Code Node  │  ← Extract 4K images + data
    │    (Extract)  │
    └───────┬───────┘
            │
    ┌───────▼───────┐
    │ 7. OpenAI     │  ← Structure/clean data
    │    (Optional) │
    └───────┬───────┘
            │
┌───────────▼─────────────┐
│ 8. HTTP Request         │  ← POST to API
│    (Import to API)      │
└─────────────────────────┘
```

---

## Step 3: Puppeteer Configuration for 4K Images

### Installing Puppeteer in n8n

**For Self-Hosted n8n:**
```bash
# Install community node
npm install n8n-nodes-puppeteer

# Or via n8n UI: Settings → Community Nodes → Install
# Package name: n8n-nodes-puppeteer
```

### Puppeteer Script for Image Gallery

This script opens each VDP, clicks the main image to open the gallery, and extracts 4K image URLs:

```javascript
// n8n Code Node - Extract 4K Images from VDP
const puppeteer = require('puppeteer');

// Get VDP URL from previous node
const vdpUrl = $input.first().json.url;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const page = await browser.newPage();

// Set viewport for high-res detection
await page.setViewport({ width: 1920, height: 1080 });

// Navigate to VDP
await page.goto(vdpUrl, { waitUntil: 'networkidle2', timeout: 30000 });

// Wait for main image to load
await page.waitForSelector('.vehicle-image, .gallery-main, [data-testid="main-image"]', { timeout: 10000 });

// Click on main image to open gallery
const mainImage = await page.$('.vehicle-image, .gallery-main, [data-testid="main-image"]');
if (mainImage) {
  await mainImage.click();
  await page.waitForTimeout(1000); // Wait for gallery to open
}

// Scroll through gallery to load all images
const galleryContainer = await page.$('.gallery-modal, .lightbox, .image-gallery');
if (galleryContainer) {
  // Scroll to load lazy images
  await page.evaluate(() => {
    const gallery = document.querySelector('.gallery-modal, .lightbox, .image-gallery');
    if (gallery) {
      gallery.scrollTop = gallery.scrollHeight;
    }
  });
  await page.waitForTimeout(500);
}

// Extract all image URLs, prioritizing 4K
const images = await page.evaluate(() => {
  const imgElements = document.querySelectorAll('img');
  const imageUrls = [];
  
  imgElements.forEach(img => {
    // Check srcset for highest resolution
    const srcset = img.getAttribute('srcset');
    if (srcset) {
      const sources = srcset.split(',').map(s => {
        const [url, width] = s.trim().split(' ');
        return { url, width: parseInt(width) || 0 };
      });
      // Get highest resolution
      const highest = sources.sort((a, b) => b.width - a.width)[0];
      if (highest && highest.width >= 1920) {
        imageUrls.push(highest.url);
        return;
      }
    }
    
    // Check data attributes for high-res
    const hiRes = img.getAttribute('data-src-lg') || 
                  img.getAttribute('data-large') || 
                  img.getAttribute('data-full-size');
    if (hiRes) {
      imageUrls.push(hiRes);
      return;
    }
    
    // Fall back to src if it looks like a product image
    const src = img.src;
    if (src && !src.includes('logo') && !src.includes('icon') && 
        (src.includes('vehicle') || src.includes('inventory') || src.includes('/images/'))) {
      // Try to get larger version by modifying URL
      const largeUrl = src
        .replace(/w=\d+/, 'w=3840')
        .replace(/width=\d+/, 'width=3840')
        .replace('_thumb', '_large')
        .replace('_small', '_xlarge');
      imageUrls.push(largeUrl);
    }
  });
  
  return [...new Set(imageUrls)]; // Remove duplicates
});

// Extract vehicle data from page
const vehicleData = await page.evaluate(() => {
  const getText = (selector) => {
    const el = document.querySelector(selector);
    return el ? el.textContent.trim() : '';
  };
  
  return {
    title: getText('h1') || getText('.vehicle-title'),
    price: getText('.price, .vehicle-price, [data-testid="price"]'),
    vin: getText('.vin, [data-testid="vin"]'),
    stockNumber: getText('.stock-number, [data-testid="stock"]'),
    odometer: getText('.odometer, .mileage, [data-testid="mileage"]'),
    description: getText('.description, .vehicle-description'),
  };
});

await browser.close();

return [{
  json: {
    ...vehicleData,
    images: images,
    vdpUrl: vdpUrl
  }
}];
```

---

## Step 4: OpenAI Integration for Data Cleaning

Use OpenAI to parse messy scraped data into structured format:

### n8n OpenAI Node Configuration

**Operation:** Complete  
**Model:** gpt-4o-mini (fast and cheap) or gpt-4o (more accurate)

**System Prompt:**
```
You are a vehicle data parser. Extract structured data from the provided raw scraped content.
Return ONLY valid JSON, no explanation.

Required fields:
- year (integer, 4 digits)
- make (string, e.g., "Honda", "Toyota")
- model (string, e.g., "Civic", "Camry")
- trim (string, e.g., "EX-L", "Limited")
- type (string: "SUV", "Sedan", "Truck", "Coupe", "Van", "Hatchback", "Wagon", "Convertible")
- price (integer, no decimals, e.g., 25995)
- odometer (integer, kilometers, e.g., 45000)
- vin (string, 17 characters)
- description (string, 2-3 sentences)

If a field is not found, use reasonable defaults or infer from context.
```

**User Prompt:**
```
Parse this vehicle listing:
Title: {{ $json.title }}
Price: {{ $json.price }}
VIN: {{ $json.vin }}
Mileage: {{ $json.odometer }}
Description: {{ $json.description }}
```

---

## Step 5: Import to API

### HTTP Request Node Configuration

**Method:** POST  
**URL:** `https://your-app-url.replit.app/api/import/vehicles`

**Headers:**
```
Authorization: Bearer oag_southsidenissan_xxxxxxxxxxxxxxxxxx
Content-Type: application/json
```

**Body (JSON):**
```json
{
  "vehicles": [
    {
      "year": {{ $json.year }},
      "make": "{{ $json.make }}",
      "model": "{{ $json.model }}",
      "trim": "{{ $json.trim }}",
      "type": "{{ $json.type }}",
      "price": {{ $json.price }},
      "odometer": {{ $json.odometer }},
      "location": "Vancouver, BC",
      "dealership": "Southside Nissan",
      "description": "{{ $json.description }}",
      "vin": "{{ $json.vin }}",
      "stockNumber": "{{ $json.stockNumber }}",
      "images": {{ JSON.stringify($json.images) }},
      "badges": [],
      "dealerVdpUrl": "{{ $json.vdpUrl }}"
    }
  ],
  "options": {
    "updateExisting": true
  }
}
```

### API Response

**Success (200):**
```json
{
  "imported": 1,
  "failed": 0,
  "results": {
    "success": [
      { "id": 123, "vin": "1HGCV1F34LA000001", "action": "created" }
    ],
    "errors": []
  }
}
```

**Error (400):**
```json
{
  "imported": 0,
  "failed": 1,
  "results": {
    "success": [],
    "errors": [
      { "index": 0, "vin": "...", "error": "Missing required fields: price, type" }
    ]
  }
}
```

---

## Step 6: Full Inventory Sync

To remove sold vehicles, use the sync endpoint after importing:

**Method:** POST  
**URL:** `https://your-app-url.replit.app/api/import/vehicles/sync`

### Dry Run (Preview Changes)
```json
{
  "vins": [
    "1HGCV1F34LA000001",
    "5XYZU3LA1JG000002"
  ],
  "dryRun": true
}
```

**Response:**
```json
{
  "dryRun": true,
  "totalInSystem": 50,
  "vinsProvided": 2,
  "wouldDelete": 48,
  "wouldDeleteVins": ["VIN1", "VIN2", "..."],
  "message": "No changes made. Set dryRun: false to execute deletion."
}
```

### Execute Sync
```json
{
  "vins": [
    "1HGCV1F34LA000001",
    "5XYZU3LA1JG000002"
  ]
}
```

### Safety Features

The sync endpoint includes several safety measures:

1. **Non-empty VIN list required** - Cannot accidentally delete all inventory
2. **Dry run mode** - Preview what would be deleted before executing
3. **50% deletion warning** - If sync would delete more than 50% of inventory, requires `confirmDelete: true`
4. **VIN normalization** - Automatically handles case and whitespace differences

**Force large deletion:**
```json
{
  "vins": ["VIN1", "VIN2"],
  "confirmDelete": true
}
```

This will:
1. Compare provided VINs with database (normalized: uppercase, trimmed)
2. Delete any vehicles in DB that are NOT in the provided list
3. Return count of deleted vehicles

---

## Complete n8n Workflow JSON

Here's a complete workflow you can import into n8n:

```json
{
  "name": "Dealer Website Scraper",
  "nodes": [
    {
      "name": "Schedule Trigger",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": {
        "rule": {
          "interval": [{ "triggerAtHour": 2 }]
        }
      },
      "position": [0, 0]
    },
    {
      "name": "Get Inventory Page",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://dealerwebsite.com/inventory",
        "method": "GET"
      },
      "position": [200, 0]
    },
    {
      "name": "Extract VDP Links",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "code": "const cheerio = require('cheerio');\nconst $ = cheerio.load($input.first().json.data);\nconst links = [];\n$('.vehicle-card a').each((i, el) => {\n  links.push({ url: $(el).attr('href') });\n});\nreturn links.map(l => ({ json: l }));"
      },
      "position": [400, 0]
    },
    {
      "name": "Loop VDPs",
      "type": "n8n-nodes-base.splitInBatches",
      "parameters": { "batchSize": 5 },
      "position": [600, 0]
    },
    {
      "name": "Import to API",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://your-app.replit.app/api/import/vehicles",
        "method": "POST",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendBody": true,
        "bodyParameters": {
          "parameters": [
            {
              "name": "vehicles",
              "value": "={{ [$json] }}"
            },
            {
              "name": "options",
              "value": "={{ { updateExisting: true } }}"
            }
          ]
        }
      },
      "position": [1200, 0]
    }
  ]
}
```

---

## Troubleshooting

### Common Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing or invalid Authorization header` | No token sent | Add `Authorization: Bearer <token>` header |
| `Invalid token format` | Token doesn't start with `oag_` | Get new token from Super Admin |
| `Token is deactivated` | Token was disabled | Create new token |
| `Token does not have import:vehicles permission` | Wrong permissions | Create token with correct permissions |
| `Missing required fields: ...` | Vehicle data incomplete | Ensure all required fields are present |
| `Maximum 100 vehicles per import` | Too many vehicles | Split into batches of 100 |

### Testing Your Token

```bash
# Test token validity
curl -X GET "https://your-app.replit.app/api/import/vehicles" \
  -H "Authorization: Bearer oag_dealername_xxxxxxxxxx"

# Expected: { "count": 0, "vehicles": [] }
```

---

## Multi-Tenant Architecture

Each dealership has its own:
- **API Token** - Only accesses their vehicles
- **Subdomain/Domain** - Shows only their inventory
- **Dealership ID** - Automatic scoping in database

When you create a token for "Southside Nissan", that token can ONLY:
- Import vehicles to Southside Nissan's inventory
- Read Southside Nissan's vehicles
- Delete Southside Nissan's vehicles

It cannot access Olympic Hyundai's data or any other dealership.

---

## Best Practices

1. **Run scrapes during off-hours** (2-4 AM) to avoid site load
2. **Add delays between requests** (500-2000ms) to avoid rate limiting
3. **Use updateExisting: true** to keep VINs matched to existing records
4. **Run sync after import** to remove sold vehicles
5. **Store tokens securely** - never commit to git
6. **Monitor for errors** - set up n8n notifications for failures

---

## Support

For issues with the API, check:
1. Token permissions in Super Admin Dashboard
2. Server logs for detailed error messages
3. Network tab in browser dev tools for API responses
