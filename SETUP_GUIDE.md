# LotView.ai - Complete Setup & Configuration Guide

**The Ultimate Beginner's Guide** - A comprehensive step-by-step guide to configure and deploy LotView.ai for your dealership(s). This covers **everything**: API keys, onboarding, logos, favicons, SEO, scraping, subdomains, Facebook Catalog, Marketplace posting, ChatGPT, PBS DMS, GoHighLevel CRM, Call Analysis, and more.

**No computer experience required!** Follow each step exactly as written.

---

## Table of Contents

**GETTING STARTED**
1. [Prerequisites](#1-prerequisites)
2. [Initial Database Setup](#2-initial-database-setup)
3. [Environment Variables & Secrets](#3-environment-variables--secrets)

**USERS & ACCESS**
4. [Super Admin Setup](#4-super-admin-setup)
5. [Dealership Onboarding](#5-dealership-onboarding)
6. [User Management & Roles](#6-user-management--roles)

**BRANDING & APPEARANCE**
7. [Logo & Favicon Setup](#7-logo--favicon-setup)
8. [Dealership Branding](#8-dealership-branding)
9. [SEO Configuration](#9-seo-configuration)

**AI & CHAT**
10. [OpenAI / ChatGPT Integration](#10-openai--chatgpt-integration)
11. [AI Chat Configuration](#11-ai-chat-configuration)

**FACEBOOK**
12. [Facebook Integration](#12-facebook-integration)
    - [Facebook App Setup](#121-facebook-app-setup)
    - [Facebook OAuth Flow](#122-facebook-oauth-flow)
    - [Facebook Catalog API](#123-facebook-catalog-api-for-automotive-ads)
    - [Facebook Marketplace Posting](#124-facebook-marketplace-posting)
    - [Facebook Token Management](#125-facebook-token-management)

**CRM & DMS**
13. [PBS DMS Integration](#13-pbs-dms-integration)
14. [GoHighLevel CRM Integration](#14-gohighlevel-crm-integration)
15. [Call Analysis Setup](#15-call-analysis-setup)

**INVENTORY**
16. [Inventory Scraping - Complete Guide](#16-inventory-scraping---complete-guide)
    - [Finding Your Scraping URLs](#161-finding-your-scraping-urls)
    - [Dealer Website Scraping](#162-dealer-website-scraping)
    - [CarGurus Scraping](#163-cargurus-scraping)
    - [AutoTrader.ca Scraping](#164-autotraderca-scraping)
    - [Apify Integration](#165-apify-integration)
    - [Adding Scrape Sources in the App](#166-adding-scrape-sources-in-the-app)

**MARKETING**
17. [Market Pricing & Analysis](#17-market-pricing--analysis)
18. [Google Analytics & Remarketing](#18-google-analytics--remarketing)

**TECHNICAL**
19. [Subdomain Configuration](#19-subdomain-configuration)
20. [Object Storage Setup](#20-object-storage-setup)
21. [Scheduled Jobs & Cron Tasks](#21-scheduled-jobs--cron-tasks)

**DEPLOYMENT**
22. [Publishing & Deployment](#22-publishing--deployment)
23. [Updating Without Losing Data](#23-updating-without-losing-data)

**HELP**
24. [Troubleshooting](#24-troubleshooting)
25. [Quick Reference: All Secrets](#25-quick-reference-all-secrets)
26. [Complete Dealership Onboarding Checklist](#26-complete-dealership-onboarding-checklist)

---

## 1. Prerequisites

Before starting, ensure you have:

- [ ] A Replit account with the project forked/cloned
- [ ] Access to your dealership's inventory data source (website, DMS, or manual)
- [ ] A Facebook Business Account (for Facebook integrations)
- [ ] An OpenAI account (for AI features) - *Optional: Replit provides one*
- [ ] PBS Partner Hub credentials (if using PBS DMS)
- [ ] GoHighLevel account (for CRM/Call Analysis)
- [ ] Domain name (for custom subdomains) - *Optional*

---

## 2. Initial Database Setup

LotView.ai uses PostgreSQL (Neon Serverless) for data persistence. **All data persists across deployments.**

### Step 1: Database is Auto-Provisioned
Replit automatically creates a PostgreSQL database. Verify it exists by checking:
- The `DATABASE_URL` secret in Replit Secrets panel
- Database pane in Replit workspace

### Step 2: Run Database Migrations
Migrations run automatically on startup via Drizzle ORM. To manually push schema changes:

```bash
npm run db:push
```

### Step 3: Key Database Tables

| Table | Purpose |
|-------|---------|
| `dealerships` | Multi-tenant dealership records |
| `users` | User accounts with roles |
| `vehicles` | Vehicle inventory |
| `vehicle_views` | View tracking for remarketing |
| `chat_conversations` | AI chat history |
| `chat_prompts` | AI prompt configurations |
| `facebook_accounts` | Connected Facebook pages |
| `facebook_catalog_config` | Facebook Catalog API settings |
| `pbs_config` | PBS DMS configuration |
| `pbs_sessions` | PBS API session cache |
| `ghl_accounts` | GoHighLevel OAuth tokens |
| `ghl_config` | GHL sync settings |
| `call_recordings` | Call analysis data |
| `call_analysis_criteria` | AI scoring criteria |
| `impersonation_sessions` | Super Admin login-as audit trail |
| `audit_logs` | System audit trail |

---

## 3. Environment Variables & Secrets

### Where to Set Secrets
1. Open your Replit project
2. Click **"Secrets"** in the Tools panel (or press Ctrl+Shift+S)
3. Add each secret as a key-value pair

### Required Secrets

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `DATABASE_URL` | PostgreSQL connection | Auto-provided by Replit |
| `JWT_SECRET` | JWT signing key | Generate: `openssl rand -hex 32` |
| `SESSION_SECRET` | Express session secret | Generate: `openssl rand -hex 32` |

### Facebook Secrets

| Secret Name | Description | Where to Get |
|-------------|-------------|--------------|
| `FACEBOOK_APP_ID` | Facebook App ID | [developers.facebook.com](https://developers.facebook.com) |
| `FACEBOOK_APP_SECRET` | Facebook App Secret | Facebook Developer Console |

### OpenAI Secrets

| Secret Name | Description |
|-------------|-------------|
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Auto-populated by Replit |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Auto-populated by Replit |

**Note**: Replit automatically provides OpenAI access. You only need to configure per-dealership keys if you want separate billing.

### GoHighLevel Secrets

| Secret Name | Description | Where to Get |
|-------------|-------------|--------------|
| `GHL_CLIENT_ID` | GHL OAuth Client ID | GHL Developer Marketplace |
| `GHL_CLIENT_SECRET` | GHL OAuth Client Secret | GHL Developer Marketplace |
| `GHL_REDIRECT_URI` | OAuth callback URL | `https://your-domain/api/ghl/auth/callback` |

### Optional API Keys

| Secret Name | Description | Where to Get |
|-------------|-------------|--------------|
| `MARKETCHECK_API_KEY` | Market pricing data | [marketcheck.com](https://www.marketcheck.com) |
| `APIFY_API_TOKEN` | AutoTrader.ca scraping | [apify.com](https://apify.com) |
| `APIFY_AUTOTRADER_ACTOR_ID` | Apify Actor ID | Apify Console |
| `GEOCODER_CA_USERNAME` | Canadian geocoding | [geocoder.ca](https://geocoder.ca) |
| `GEOCODER_CA_PASSWORD` | Geocoder.ca password | Geocoder.ca Account |
| `SCRAPER_PROXIES` | Proxy list for scraping | Your proxy provider |

### Environment Variables (Non-Sensitive)

Set in Replit's Environment Variables section:

```
SCHEDULER_ENABLED=true
FACEBOOK_REDIRECT_URI=https://your-domain.replit.app/api/facebook/oauth/callback
```

---

## 4. Super Admin Setup

The Super Admin is the system-wide administrator who manages all dealerships.

### Step 1: Create Super Admin (Recommended Method)

The easiest way to create a Super Admin:

1. **Register a regular user first** through the app's registration endpoint or UI
2. **Update their role in the database** using Replit's Database pane:

```sql
-- Promote an existing user to Super Admin
UPDATE users 
SET role = 'super_admin', dealership_id = NULL 
WHERE email = 'your@email.com';
```

### Alternative: Create via SQL (Advanced)

If you need to create everything from scratch via SQL:

```sql
-- Step 1: Create a dealership (required - slug is mandatory and must be unique)
INSERT INTO dealerships (name, slug, subdomain, address, city, province, phone)
VALUES (
  'Olympic Auto Group',
  'olympic-auto',           -- URL-safe identifier (required, unique)
  'olympic',                -- Subdomain for routing (optional)
  '123 Main St',
  'Vancouver',
  'BC',
  '604-555-0100'
);

-- Step 2: Create Super Admin user
-- NOTE: password_hash must be a valid bcrypt hash - generate one using the app first
INSERT INTO users (email, password_hash, name, role, dealership_id, is_active)
VALUES (
  'superadmin@lotview.ai',
  '$2b$10$YOUR_BCRYPT_HASH_HERE',  -- Use a real bcrypt hash!
  'Super Admin',                    -- Display name (not username)
  'super_admin',
  NULL,                             -- Super Admin has NO dealership affiliation
  true
);
```

**Important**: Never use a plaintext password in SQL. Always use bcrypt hashing. The recommended method above avoids this issue entirely.

### Step 2: Access Super Admin Dashboard

1. Login at `/login` with your Super Admin credentials
2. Navigate to **Super Admin Dashboard** (`/super-admin`)

### Step 3: Super Admin Capabilities

| Feature | Description |
|---------|-------------|
| **Dealership Management** | Create, edit, delete dealerships |
| **User Management** | View all users, reset passwords |
| **API Keys Configuration** | Set global and per-dealership API keys |
| **Facebook Catalog Config** | Manage Catalog IDs and System User tokens |
| **GHL Integration** | Configure GoHighLevel connections |
| **Audit Logs** | View all system changes |
| **Login As (Impersonation)** | Access any user's account for support |

---

## 5. Dealership Onboarding

### Step 1: Create a New Dealership

1. Login as Super Admin
2. Go to **Super Admin Dashboard** → **Dealerships** tab
3. Click **"Add Dealership"**
4. Fill in:

| Field | Example | Required |
|-------|---------|----------|
| Name | Olympic Hyundai Vancouver | Yes |
| Slug | `olympic-hyundai` (URL-safe identifier) | Yes |
| Subdomain | `olympic-hyundai` → becomes `olympic-hyundai.lotview.ai` | Optional |
| Address | 789 Auto Row | Optional |
| City | Vancouver | Optional |
| Province | BC | Optional |
| Phone | (604) 555-0123 | Optional |

### Step 2: Configure Dealership API Keys

Each dealership can have their own API keys (overrides global):

1. Go to **Super Admin Dashboard** → **Dealerships** → Click dealership
2. Click **"Configure Integrations"** (plug icon)
3. Enter API keys:
   - OpenAI API Key
   - MarketCheck API Key
   - Apify Token & Actor ID
   - Facebook App ID & Secret (if separate app)
   - GHL credentials (if separate account)

### Step 3: Create Master User (General Manager)

1. Go to **Super Admin Dashboard** → **Users** tab
2. Click **"Add User"**
3. Fill in:
   - Email, Username, Password
   - Role: **Master** (General Manager)
   - Dealership: Select the new dealership
4. This user has full access to their dealership

---

## 6. User Management & Roles

### Role Hierarchy (Highest to Lowest)

| Role | Title | Permissions |
|------|-------|-------------|
| `super_admin` | System Administrator | All system access, manages all dealerships, no dealership affiliation |
| `master` | **General Manager** | Full dealership access, user management, Call Analysis, all tools |
| `admin` | Administrator | High-level dealership configuration, most management features |
| `manager` | Sales Manager | Team performance, Call Analysis, inventory, sales tools |
| `salesperson` | Sales Staff | Customer-facing features, lead management, personal metrics |

### Creating Users

1. Login as Master, Admin, or Super Admin
2. Go to **Dashboard** → **User Management**
3. Click **"Add User"**
4. Assign appropriate role

### Impersonation (Super Admin Only)

For support and debugging:

1. Go to **Super Admin Dashboard** → **Users** tab
2. Click **"Login As"** next to any user
3. A persistent banner shows impersonation is active
4. Click **"Exit Impersonation"** to return
5. All impersonation sessions are logged in `impersonation_sessions` table

---

## 7. Logo & Favicon Setup

Your dealership's logo and favicon (the small icon in browser tabs) are essential for branding.

### Understanding Logo vs Favicon

| Item | What It Is | Where It Appears | Recommended Size |
|------|------------|------------------|------------------|
| **Logo** | Your dealership's main logo | Website header, emails, documents | 400x100 pixels (PNG with transparent background) |
| **Favicon** | Tiny icon | Browser tabs, bookmarks | 32x32 or 64x64 pixels (PNG or ICO) |
| **Open Graph Image** | Social sharing image | Facebook, Twitter, LinkedIn previews | 1200x630 pixels (JPG or PNG) |

### Step 1: Prepare Your Logo Files

You need THREE image files:

1. **Main Logo** (`logo.png`)
   - Your full dealership logo
   - Transparent background (PNG format)
   - About 400 pixels wide

2. **Favicon** (`favicon.png`)
   - A tiny, simplified version of your logo
   - 32x32 or 64x64 pixels
   - Works well at small sizes

3. **Social Sharing Image** (`opengraph.jpg`)
   - Image shown when your site is shared on Facebook/LinkedIn
   - 1200x630 pixels
   - Include your logo and tagline

### Step 2: Where to Get These Made

If you don't have these files:

**Free Options:**
- [Canva](https://www.canva.com) - Create logos and resize images for free
- [Favicon.io](https://favicon.io) - Generate favicons from images or text
- [Photopea](https://www.photopea.com) - Free online Photoshop alternative

**What to Ask Your Designer:**
> "I need a logo at 400x100 pixels with transparent background (PNG), a favicon at 64x64 pixels (PNG), and a social sharing image at 1200x630 pixels (JPG) with our logo centered."

### Step 3: Upload Global Files (For Entire Platform)

To change the favicon and social image for the entire platform:

1. In your Replit project, navigate to: `client/public/`
2. Replace these files:
   - `favicon.png` - Your new favicon
   - `opengraph.jpg` - Your social sharing image

**How to upload in Replit:**
1. Click the **Files** panel on the left
2. Navigate to `client` → `public`
3. Right-click → **Upload File**
4. Select your new image files
5. Make sure they have the exact same names as the originals

### Step 4: Upload Per-Dealership Logos

Each dealership can have its own logo:

1. Go to **Super Admin Dashboard** → **Dealerships**
2. Select the dealership
3. Go to the **Branding** tab
4. Upload or enter URL for:
   - **Logo URL**: Direct link to your logo image
   - **Favicon URL**: Direct link to your favicon

**Getting a Logo URL:**
- Upload your logo to your website and copy the URL
- Or use a free image host like [Imgur](https://imgur.com) or [Cloudinary](https://cloudinary.com)
- The URL should look like: `https://example.com/images/my-logo.png`

### Step 5: Update HTML Meta Tags (Advanced)

For complete control, edit `client/index.html`:

```html
<!-- Line 27: Change favicon -->
<link rel="icon" type="image/png" href="/favicon.png" />

<!-- Lines 12 and 17: Change social sharing image -->
<meta property="og:image" content="/opengraph.jpg" />
<meta name="twitter:image" content="/opengraph.jpg" />
```

---

## 8. Dealership Branding

Customize colors, headlines, and promotional content for each dealership.

### Branding Options

| Setting | What It Does | Example |
|---------|--------------|---------|
| **Logo URL** | Main logo displayed in header | `https://yoursite.com/logo.png` |
| **Favicon URL** | Browser tab icon | `https://yoursite.com/favicon.png` |
| **Primary Color** | Main brand color | `#022d60` (dark blue) |
| **Secondary Color** | Accent color | `#00aad2` (light blue) |
| **Hero Headline** | Main text on inventory page | "Find Your Perfect Vehicle" |
| **Hero Subheadline** | Supporting text | "Quality Pre-Owned Cars in Vancouver" |
| **Hero Image URL** | Background image for hero section | `https://yoursite.com/hero.jpg` |
| **Tagline** | Short dealership slogan | "Drive with Confidence" |
| **Promo Banner** | Optional promotional message | "0% Financing This Weekend Only!" |

### How to Find Your Brand Colors

**From Your Existing Website:**
1. Go to your dealership website
2. Right-click on a colored element → **Inspect**
3. Look for `color:` or `background-color:` values
4. Copy the hex code (like `#022d60`)

**From Your Logo:**
1. Upload your logo to [ColorKit](https://colorkit.co/color-palette-from-image/)
2. It will extract the main colors
3. Copy the hex codes

### Configuring Branding

1. Go to **Super Admin Dashboard** → **Dealerships**
2. Select a dealership
3. Go to the **Branding** tab
4. Fill in all fields:

```
Logo URL:           https://your-dealership.com/logo.png
Favicon URL:        https://your-dealership.com/favicon.png
Primary Color:      #022d60
Secondary Color:    #00aad2
Hero Headline:      Olympic Hyundai Vancouver
Hero Subheadline:   Your Trusted Hyundai Dealer Since 1995
Tagline:            Drive with Confidence
Promo Banner:       Spring Sale - Save up to $5,000!
Promo Active:       ✓ (check to show)
```

5. Click **Save**

### Testing Your Branding

After saving:
1. Open your dealership's subdomain in a new browser tab
2. Check that:
   - Logo appears in the header
   - Colors match your brand
   - Hero section shows correct headlines
   - Favicon shows in browser tab (may need to refresh)

---

## 9. SEO Configuration

SEO (Search Engine Optimization) helps your website appear in Google search results.

### What SEO Settings Control

| Setting | What It Does | Example |
|---------|--------------|---------|
| **Page Title** | Shows in browser tab and Google results | "Olympic Hyundai - Used Cars in Vancouver" |
| **Meta Description** | Description in Google results | "Browse quality pre-owned vehicles..." |
| **Open Graph Title** | Title when shared on Facebook | Same as page title |
| **Open Graph Description** | Description when shared on Facebook | Same as meta description |
| **Open Graph Image** | Image when shared on Facebook | Your hero image or logo |

### Step 1: Update Global SEO (Entire Platform)

Edit the file `client/index.html`:

```html
<!-- Page Title (Line 7) -->
<title>LotView.ai - Turn Your Inventory Into a 24/7 Sales Agent</title>

<!-- Meta Description (Line 8) -->
<meta name="description" content="LotView syncs your inventory, chats with leads, and books test drives automatically." />

<!-- Facebook/LinkedIn Preview (Lines 9-12) -->
<meta property="og:title" content="LotView.ai - Turn Your Inventory Into a 24/7 Sales Agent" />
<meta property="og:description" content="LotView syncs your inventory, chats with leads, and books test drives automatically." />
<meta property="og:type" content="website" />
<meta property="og:image" content="/opengraph.jpg" />

<!-- Twitter Preview (Lines 13-17) -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="LotView.ai - Turn Your Inventory Into a 24/7 Sales Agent" />
<meta name="twitter:description" content="LotView syncs your inventory, chats with leads, and books test drives automatically." />
<meta name="twitter:image" content="/opengraph.jpg" />
```

### Step 2: Update Google Tag Manager ID

If you have Google Tag Manager:

1. Find your GTM Container ID (looks like `GTM-XXXXXXX`)
2. Edit `client/index.html`
3. Replace `GTM-OLYMPIC` with your actual GTM ID on lines 20-24 and 35-36

### Step 3: Per-Dealership SEO

Each dealership can have custom SEO through the **Branding** settings:

1. **Hero Headline** → Becomes page title
2. **Hero Subheadline** → Becomes meta description
3. **Hero Image URL** → Becomes social sharing image

### SEO Best Practices for Dealerships

**Page Titles:**
- Keep under 60 characters
- Include dealership name and location
- Example: "Olympic Hyundai Vancouver | Used Cars & SUVs"

**Meta Descriptions:**
- Keep under 160 characters
- Include a call to action
- Example: "Browse 100+ quality pre-owned vehicles at Olympic Hyundai Vancouver. Easy financing available. Visit us today!"

**Keywords to Include:**
- Dealership name
- City/location
- "Used cars", "pre-owned", your brands
- "Financing", "trade-in" if applicable

### Testing Your SEO

1. **Google Rich Results Test**: [search.google.com/test/rich-results](https://search.google.com/test/rich-results)
2. **Facebook Debugger**: [developers.facebook.com/tools/debug](https://developers.facebook.com/tools/debug)
3. **LinkedIn Post Inspector**: [linkedin.com/post-inspector](https://www.linkedin.com/post-inspector)

Enter your website URL to see how it appears in search/social results.

---

## 10. OpenAI / ChatGPT Integration

LotView.ai uses OpenAI GPT for:
- Customer-facing AI chatbot
- Call analysis and scoring
- Vehicle description generation
- Market analysis summaries

### Option A: Use Replit's Built-in OpenAI (Recommended)

Replit automatically provides OpenAI access with these auto-configured secrets:
- `AI_INTEGRATIONS_OPENAI_API_KEY`
- `AI_INTEGRATIONS_OPENAI_BASE_URL`

**No setup required!** The system automatically uses these.

### Option B: Per-Dealership OpenAI Keys

For separate billing per dealership:

1. Get API key from [platform.openai.com](https://platform.openai.com)
2. Go to **Super Admin Dashboard** → **Dealerships** → **[Dealership]** → **API Keys**
3. Enter the OpenAI API Key
4. Save

**Fallback order**: Dealership key → Replit integration → Error

### Cost Estimates

| Feature | Approximate Cost |
|---------|-----------------|
| Customer chat | $0.01-0.02 per conversation |
| Call analysis | $0.05-0.10 per call |
| Vehicle descriptions | $0.005 per description |

---

## 11. AI Chat Configuration

### Configure Chat Prompts

1. Login as Manager or above
2. Go to **Dashboard** → **Chat Settings** (or **AI Settings**)
3. Configure:

| Setting | Description | Example |
|---------|-------------|---------|
| System Prompt | AI personality and instructions | "You are a helpful sales assistant for Olympic Hyundai..." |
| Welcome Message | First message to customers | "Hi! I'm here to help you find the perfect vehicle. What are you looking for?" |
| Max Tokens | Response length limit | 500 |
| Temperature | Creativity (0=focused, 1=creative) | 0.7 |
| Model | GPT model to use | gpt-4o-mini |

### System Prompt Best Practices

```
You are a friendly and knowledgeable sales assistant for [Dealership Name].

Your goals:
- Help customers find vehicles that match their needs
- Answer questions about our inventory
- Encourage customers to schedule test drives
- Collect contact information for follow-up

Rules:
- Be concise and helpful
- Never make up vehicle information
- If you don't know something, offer to connect them with a sales representative
- Always be professional and courteous

Our dealership specializes in [brands] and we're located at [address].
```

---

## 12. Facebook Integration

### 12.1 Facebook App Setup

#### Step 1: Create Facebook App

1. Go to [Facebook Developer Console](https://developers.facebook.com)
2. Click **"My Apps"** → **"Create App"**
3. Select **"Business"** app type
4. Fill in:
   - **App Name**: `LotView - [Dealership Name]`
   - **App Contact Email**: Your email
   - **Business Account**: Select your Facebook Business account

#### Step 2: Configure App Settings

1. Go to **App Dashboard** → **Settings** → **Basic**
2. Copy and save as secrets:
   - **App ID** → `FACEBOOK_APP_ID`
   - **App Secret** → `FACEBOOK_APP_SECRET`
3. Configure:
   - **App Domains**: `your-domain.replit.app`
   - **Privacy Policy URL**: `https://your-domain.replit.app/privacy-policy`
   - **Terms of Service URL**: `https://your-domain.replit.app/terms-of-service`
   - **App Icon**: Upload your logo

#### Step 3: Add Facebook Login Product

1. In App Dashboard, click **"Add Product"**
2. Find **"Facebook Login"** → Click **"Set Up"**
3. Choose **"Web"**
4. Configure:
   - **Valid OAuth Redirect URIs**: 
     ```
     https://your-domain.replit.app/api/facebook/oauth/callback
     ```
5. Save changes

#### Step 4: Request Permissions

In **App Review** → **Permissions and Features**, request:

| Permission | Why Needed |
|------------|------------|
| `pages_show_list` | List user's Facebook pages |
| `pages_read_engagement` | Read page engagement metrics |
| `pages_manage_posts` | Post to pages |
| `pages_read_user_content` | Read user posts on pages |
| `catalog_management` | Manage product catalogs |
| `business_management` | Manage business assets |

#### Step 5: Submit for App Review

For production use:
1. Go to **App Review** → **Requests**
2. For each permission, provide:
   - Screenshots showing the feature
   - Step-by-step instructions for reviewers
   - Video walkthrough (optional but helpful)
3. Submit for review (takes 1-5 business days)

### 12.2 Facebook OAuth Flow

#### Connecting a Facebook Page

1. In LotView, go to **Dashboard** → **Facebook** tab
2. Click **"Connect Facebook Page"**
3. You'll be redirected to Facebook
4. Login and authorize the app
5. Select the page(s) to connect
6. Grant the requested permissions
7. You're redirected back with the access token saved

#### Technical Flow

```
User clicks "Connect" 
  → Redirect to Facebook OAuth URL
  → User authorizes
  → Facebook redirects to /api/facebook/oauth/callback
  → Server exchanges code for access token
  → Token saved to database
  → User redirected to dashboard
```

### 12.3 Facebook Catalog API (for Automotive Ads)

The Catalog API enables **Facebook Automotive Inventory Ads** - dynamic ads that show your actual vehicles to interested buyers.

#### Step 1: Create a Catalog in Facebook Business Manager

1. Go to [Facebook Business Manager](https://business.facebook.com)
2. Click **"Commerce"** → **"Catalogs"**
3. Click **"Create Catalog"**
4. Select **"Automotive Inventory"** as the type
5. Name it: `[Dealership Name] Vehicles`
6. **Copy the Catalog ID** (numeric, like `123456789012345`)

#### Step 2: Create a System User

System Users are special accounts for automated API access:

1. In Business Manager, go to **Business Settings**
2. Navigate to **Users** → **System Users**
3. Click **"Add"**
4. Name: `LotView Catalog Sync`
5. Role: **Admin**

#### Step 3: Assign Catalog Access

1. Select your System User
2. Click **"Assign Assets"**
3. Choose **"Catalogs"**
4. Select your vehicle catalog
5. Grant **"Manage Catalog"** permission

#### Step 4: Generate Access Token

1. With System User selected, click **"Generate New Token"**
2. Select your App (from step 9.1)
3. Choose scopes:
   - `catalog_management`
   - `business_management`
4. Click **"Generate Token"**
5. **Copy the token immediately!** (It's very long, ~200 characters)

#### Step 5: Configure in LotView

1. Go to **Super Admin Dashboard** → **FB Catalogs** tab
2. Select the dealership
3. Enter:
   - **Catalog ID**: From Step 1
   - **System User Access Token**: From Step 4
   - **Enable Auto-Sync**: Toggle ON for daily sync at 4 AM
4. Click **"Test Connection"**
5. Click **"Save"**

#### Step 6: Sync Your Inventory

- **Manual**: Click **"Sync Now"** to immediately push inventory
- **Automatic**: Runs daily at 4 AM if auto-sync is enabled

#### Catalog Data Format

Vehicles are formatted per Facebook's [Automotive Catalog spec](https://developers.facebook.com/docs/marketing-api/catalog/guides/vehicle-catalog):

```json
{
  "id": "VIN or vehicle-123",
  "vehicle_id": "VIN or vehicle-123",
  "title": "2024 Honda Accord EX-L",
  "description": "Low mileage, one owner...",
  "price": "35999 CAD",
  "availability": "in stock",
  "condition": "used",
  "link": "https://dealer.lotview.ai/inventory/123",
  "image_link": "https://...",
  "brand": "Honda",
  "year": 2024,
  "make": "Honda",
  "model": "Accord",
  "body_style": "Sedan",
  "mileage": { "value": 15000, "unit": "KM" },
  "vin": "1HGCV1F32RA000123"
}
```

### 12.4 Facebook Marketplace Posting

#### Automatic Posting Setup

1. Connect your Facebook Page (see 12.2)
2. Go to **Dashboard** → **Facebook Posting**
3. Configure your schedule:
   - **Post Times**: When to post (e.g., 9 AM, 2 PM, 6 PM)
   - **Post Frequency**: How many per day
   - **Auto-Post New Inventory**: Automatically post new vehicles

#### Manual Posting

1. Go to **Inventory** → Click on a vehicle
2. Click **"Post to Facebook"** button
3. Edit the post content if desired
4. Select target page(s)
5. Click **"Post Now"** or **"Schedule"**

#### Posting Queue

Posts are queued and processed to avoid rate limits:
- Scheduler runs every minute
- Processes pending posts from queue
- Handles failures with retry logic
- Logs all post attempts

#### Post Templates

Configure default templates:

```
🚗 {YEAR} {MAKE} {MODEL} {TRIM}

💰 ${PRICE}
📍 {ODOMETER} km
🔧 {TRANSMISSION}

Features:
{DESCRIPTION}

📞 Call us: {PHONE}
🌐 View online: {URL}

#UsedCars #{MAKE} #{MODEL} #{CITY}
```

### 12.5 Facebook Token Management

Facebook access tokens expire. LotView handles this automatically:

#### Automatic Token Refresh

- **Schedule**: Daily at 3 AM
- **Checks**: Tokens expiring within 7 days
- **Action**: Requests long-lived token extension from Facebook
- **Updates**: Saves new token and expiry to database

#### Token Expiry Handling

| Token Type | Duration |
|------------|----------|
| Short-lived | ~1-2 hours |
| Long-lived User Token | ~60 days |
| Long-lived Page Token | Never expires (if page access granted) |
| System User Token | Never expires |

#### If Token Expires

1. User is prompted to re-authenticate
2. Go to **Facebook** tab → **"Reconnect"**
3. Complete OAuth flow again

---

## 13. PBS DMS Integration

PBS Partner Hub integration syncs contacts, appointments, and service data with your PBS Dealer Management System.

### What PBS Integration Provides

| Module | Features |
|--------|----------|
| **Sales** | Contact management, vehicle interests, appointments, workplan events |
| **Service** | Service appointments, repair orders, vehicle service history |
| **Parts** | Parts inventory search (read-only), orders, tire storage |

### Step 1: Obtain PBS Credentials

Contact your PBS representative to get:
- **Dealer ID**: Your unique dealership identifier
- **Username**: API username
- **Password**: API password
- **API Base URL**: Usually `https://api.pbsdealer.com/partnerhub`

### Step 2: Configure PBS in LotView

1. Go to **Super Admin Dashboard** → **Dealerships** → **[Dealership]**
2. Navigate to **PBS DMS** section
3. Enter:

| Field | Description |
|-------|-------------|
| PBS Dealer ID | Your PBS dealer identifier |
| PBS Username | API username |
| PBS Password | API password (stored encrypted) |
| API Base URL | PBS Partner Hub URL |

4. Click **"Test Connection"**
5. Save configuration

### Step 3: Session Management

PBS uses session-based authentication. LotView handles this automatically:

- **Session Creation**: On first API call
- **Session Caching**: Cached for 8 hours in `pbs_sessions` table
- **Auto-Refresh**: Automatic re-login on 401 errors
- **Logging**: All calls logged to `pbs_api_logs`

### Step 4: Available Operations

#### Sales Module

| Endpoint | Operation |
|----------|-----------|
| `ContactGet` | Search/retrieve contacts |
| `ContactSave` | Create new contact |
| `ContactChange` | Update existing contact |
| `ContactVehicleGet` | Get customer's vehicles |
| `WorkplanEventGet/Change` | Sales tasks and events |
| `WorkplanAppointmentGet/Change/Create` | Sales appointments |
| `WorkplanReminderGet` | Reminders |

#### Service Module

| Endpoint | Operation |
|----------|-----------|
| `AppointmentBookingGet` | Available booking slots |
| `AppointmentGet/Change/Create` | Service appointments |
| `RepairOrderGet/Change` | Repair orders |
| `AppointmentContactVehicleGet/Change` | Vehicle service history |

#### Parts Module (Read-Only)

| Endpoint | Operation |
|----------|-----------|
| `PartsInventoryGet/Search` | Search parts inventory |
| `PartsOrderGet` | Parts orders |
| `PurchaseOrderGet` | Purchase orders |
| `TireStorageGet` | Tire storage records |
| `ShopGet` | Shop information |

### PBS Caching

To reduce DMS load, LotView caches:
- Contacts: 24 hours
- Appointments: 24 hours
- Parts: 24 hours

Cache is invalidated on updates.

---

## 14. GoHighLevel CRM Integration

GoHighLevel (GHL) integration enables:
- Bidirectional contact sync
- Calendar/appointment sync
- Lead pipeline management
- Call recording analysis
- Automated follow-up triggers

### Step 1: Create GHL OAuth App

1. Go to [GHL Marketplace](https://marketplace.gohighlevel.com)
2. Click **"Build"** → **"Create App"**
3. Choose **Private App** (for single agency) or **Public App** (for marketplace)
4. Fill in:
   - **App Name**: `LotView CRM Sync`
   - **Description**: Vehicle inventory CRM integration
   - **Redirect URI**: `https://your-domain.replit.app/api/ghl/auth/callback`

### Step 2: Configure Scopes

Request these OAuth scopes:

| Scope | Purpose |
|-------|---------|
| `contacts.readonly` | Read contacts |
| `contacts.write` | Create/update contacts |
| `calendars.readonly` | Read calendars |
| `calendars.write` | Create calendars |
| `calendars/events.readonly` | Read appointments |
| `calendars/events.write` | Create/update appointments |
| `opportunities.readonly` | Read pipeline opportunities |
| `opportunities.write` | Create/update opportunities |
| `locations.readonly` | Read location info |
| `users.readonly` | Read team members |

### Step 3: Set GHL Secrets in Replit

```
GHL_CLIENT_ID=your-client-id
GHL_CLIENT_SECRET=your-client-secret
GHL_REDIRECT_URI=https://your-domain.replit.app/api/ghl/auth/callback
```

### Step 4: Connect GHL Account

1. Go to **Super Admin Dashboard** → **GHL Integration** (or dealership settings)
2. Click **"Connect GoHighLevel"**
3. Select your GHL sub-account (location)
4. Authorize the requested permissions
5. Callback saves OAuth tokens to `ghl_accounts` table

### Step 5: Configure Sync Settings

After connecting:

1. Go to GHL settings for the dealership
2. Configure:

| Setting | Description |
|---------|-------------|
| Sales Calendar | GHL calendar for sales appointments |
| Service Calendar | GHL calendar for service appointments |
| Lead Pipeline | GHL pipeline for new leads |
| Opportunity Stage | Default stage for new opportunities |
| Bidirectional Sync | Enable two-way sync |
| Sync Interval | How often to sync (default: daily at 5 AM) |

### Step 6: Webhook Setup (for Real-Time Sync)

GHL can send events to LotView in real-time:

1. In GHL, go to **Settings** → **Webhooks**
2. Click **"Add Webhook"**
3. Set URL: `https://your-domain.replit.app/api/ghl/webhook`
4. Select events:
   - `ContactCreate`
   - `ContactUpdate`
   - `AppointmentCreate`
   - `AppointmentUpdate`
   - `CallCompleted` (for call analysis)
5. Copy the **Webhook Signing Secret** (if available)
6. Save in LotView's GHL config

### Step 7: Token Refresh

GHL tokens expire after ~24 hours. LotView handles this:
- Tokens refreshed automatically before expiry
- 5-minute buffer before expiration
- Failed refreshes logged for troubleshooting

---

## 15. Call Analysis Setup

AI-powered call analysis scores sales calls and provides coaching insights.

### Prerequisites

- [ ] GoHighLevel integration configured
- [ ] OpenAI API access (Replit or per-dealership)
- [ ] Call recording enabled in GHL

### Step 1: Enable Call Tracking in GHL

1. In GHL, go to **Settings** → **Phone Numbers**
2. Ensure call recording is enabled for your numbers
3. Verify calls are being recorded

### Step 2: Configure Call Webhook

GHL sends `CallCompleted` events when calls end:

1. In GHL webhooks (from Step 6 above), ensure `CallCompleted` is selected
2. The webhook includes:
   - Recording URL
   - Duration
   - Caller/callee information
   - Direction (inbound/outbound)

LotView endpoint: `POST /api/ghl/call-webhook`

### Step 3: Default Analysis Criteria

LotView comes with default scoring criteria:

| Criterion | Weight | What It Measures |
|-----------|--------|-----------------|
| Greeting & Introduction | 15 | Professional phone greeting |
| Needs Discovery | 20 | Understanding customer needs |
| Product Knowledge | 15 | Vehicle expertise demonstrated |
| Objection Handling | 15 | Addressing customer concerns |
| Closing Techniques | 20 | Asking for the appointment/sale |
| Follow-up Commitment | 15 | Scheduling next steps |

### Step 4: Customize Criteria

1. Login as Manager or above
2. Go to **Dashboard** → **Call Analysis**
3. Click **"Manage Criteria"**
4. Add/edit/delete criteria:

| Field | Description |
|-------|-------------|
| Name | Criterion name |
| Description | What AI should evaluate |
| Weight | Importance (0-100, must total 100) |
| Active | Enable/disable |

### Step 5: Seed Default Criteria

For new dealerships:
1. Go to **Call Analysis** → **Manage Criteria**
2. Click **"Seed Default Criteria"**
3. Defaults are added to database

### Step 6: Review Call Scores

1. Go to **Dashboard** → **Call Analysis**
2. View:
   - **Call List**: All recorded calls with scores
   - **Filters**: By salesperson, date range, score range, needs review
   - **Detail View**: Individual call analysis
   - **Coaching Tips**: AI-generated improvement suggestions

### Call Analysis Features

| Feature | Description |
|---------|-------------|
| Overall Score | Weighted average of all criteria (0-100) |
| Criterion Breakdown | Score per criterion with notes |
| Strengths | What went well |
| Improvements | Areas to work on |
| Coaching Tips | Specific suggestions |
| Needs Review Flag | Manager can flag for discussion |
| Transcription | Full call transcript (if available) |

---

## 16. Inventory Scraping - Complete Guide

This section explains **exactly** how to set up inventory scraping for any dealership, including how to find all the URLs you need.

### What is Scraping?

Scraping automatically pulls vehicle inventory from websites. Instead of manually entering each car, the system visits your listing pages and extracts all the vehicle details automatically.

### Supported Scraping Sources

| Source Type | Reliability | Best For |
|-------------|-------------|----------|
| **Your Dealer Website** | ⭐⭐⭐⭐⭐ | Primary inventory source |
| **CarGurus.ca** | ⭐⭐⭐⭐⭐ | Deal ratings, market comparison |
| **AutoTrader.ca** | ⭐⭐⭐ | Wide market data (may have blocks) |
| **Apify (Cloud)** | ⭐⭐⭐⭐⭐ | Most reliable for AutoTrader |

---

### 16.1 Finding Your Scraping URLs

#### How to Find Your Dealer Website Inventory URL

1. Go to your dealership website (e.g., `www.olympichyundaivancouver.com`)
2. Navigate to your **Used Inventory** or **Pre-Owned Vehicles** page
3. Make sure you're viewing **ALL used vehicles** (not filtered)
4. **Copy the URL from your browser's address bar**

**Example URLs by Website Platform:**

| Platform | Example URL Pattern |
|----------|---------------------|
| DealerSocket | `https://www.dealername.com/vehicles/used/?st=price,desc&view=grid&sc=used` |
| DealerOn | `https://www.dealername.com/used-vehicles/` |
| Dealer Inspire | `https://www.dealername.com/used-inventory/` |
| PBS Websites | `https://www.dealername.com/used-cars/` |

**Real Examples (Currently Configured):**

```
Olympic Hyundai Vancouver:
https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used

Boundary Hyundai:
https://www.boundaryhyundai.com/vehicles/used/?st=price,desc&view=grid&sc=used

Kia Vancouver:
https://www.kiavancouver.com/vehicles/used/?st=year,desc&view=grid&sc=used
```

#### How to Find Your CarGurus Dealer URL

1. Go to [cargurus.ca](https://www.cargurus.ca)
2. Search for your dealership name in the search bar
3. Click on your dealership from the results
4. **Copy the URL from your browser's address bar**

**The URL will look like:**
```
https://www.cargurus.ca/Cars/m-[Dealer-Name]-sp[DEALER_ID]
```

**Real Examples:**

```
Olympic Hyundai Vancouver:
https://www.cargurus.ca/Cars/m-Olympic-Hyundai-Vancouver-sp459833

Boundary Hyundai:
https://www.cargurus.ca/Cars/m-Boundary-Hyundai-sp393663

Kia Vancouver:
https://www.cargurus.ca/Cars/m-Kia-Vancouver-sp357122
```

**How to Find Your CarGurus Dealer ID:**
- Look at the end of the URL: `sp459833`
- The number after `sp` is your dealer ID: `459833`

#### How to Find Your AutoTrader.ca Dealer URL

1. Go to [autotrader.ca](https://www.autotrader.ca)
2. Click **"Find a Dealer"** in the menu
3. Search for your dealership name
4. Click on your dealership
5. Click **"View Inventory"**
6. **Copy the URL**

**The URL will look like:**
```
https://www.autotrader.ca/dealer/[province]/[city]/[dealer-name]/[DEALER_ID]
```

**Example:**
```
https://www.autotrader.ca/dealer/bc/vancouver/olympic-hyundai-vancouver/57421
```

---

### 16.2 Dealer Website Scraping

The most reliable method - scrape directly from your own website.

#### Step 1: Get Your Inventory Page URL

Follow the instructions in 16.1 to find your dealer website inventory URL.

**Tips for the best URL:**
- Use the "View All" or "Show All" option if available
- Sort by price or date (add `?st=price,desc` if supported)
- Make sure it shows ALL used vehicles, not just one brand

#### Step 2: Add to Scrape Sources

1. Go to **Super Admin Dashboard** → **Dealerships**
2. Select your dealership
3. Go to **Inventory Sources** tab
4. Click **"Add Source"**
5. Fill in:

| Field | Value |
|-------|-------|
| Source Name | Olympic Hyundai Vancouver |
| Source URL | `https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used` |
| Source Type | `dealer_website` |
| Is Active | ✓ (checked) |
| Scrape Frequency | `daily` |

6. Click **Save**

#### Step 3: Test the Scraper

1. Go to **Dashboard** → **Inventory**
2. Click **"Sync Now"** button
3. Wait 2-5 minutes
4. Refresh the page
5. Verify vehicles appear

---

### 16.3 CarGurus Scraping

CarGurus provides additional data like deal ratings ("Great Deal", "Good Deal").

#### Step 1: Find Your CarGurus URL

Follow instructions in 16.1 to get your CarGurus dealer page URL.

#### Step 2: Add CarGurus Source

1. Go to **Super Admin Dashboard** → **Dealerships**
2. Select your dealership
3. Go to **Inventory Sources** tab
4. Click **"Add Source"**
5. Fill in:

| Field | Value |
|-------|-------|
| Source Name | Olympic Hyundai - CarGurus |
| Source URL | `https://www.cargurus.ca/Cars/m-Olympic-Hyundai-Vancouver-sp459833` |
| Source Type | `cargurus` |
| Is Active | ✓ (checked) |
| Scrape Frequency | `daily` |

6. Click **Save**

#### What CarGurus Provides

| Data | Description |
|------|-------------|
| Price | Listed price |
| Deal Rating | "Great Deal", "Good Deal", "Fair Deal", etc. |
| Days on Market | How long the vehicle has been listed |
| Price History | Price drops over time |
| Similar Vehicles | Comparison data |

---

### 16.4 AutoTrader.ca Scraping

AutoTrader.ca uses Cloudflare protection which can block scrapers. We recommend using Apify (Section 16.5) for AutoTrader.

#### Direct Scraping (May Be Blocked)

If you want to try direct scraping:

1. Add to **Inventory Sources**:

| Field | Value |
|-------|-------|
| Source Name | Olympic Hyundai - AutoTrader |
| Source URL | `https://www.autotrader.ca/dealer/bc/vancouver/olympic-hyundai-vancouver/57421` |
| Source Type | `autotrader` |

2. If blocked, you'll see errors in the scraper logs
3. Switch to Apify integration (recommended)

---

### 16.5 Apify Integration (Recommended for AutoTrader)

Apify is a cloud scraping service that handles Cloudflare protection automatically.

#### Step 1: Create Apify Account

1. Go to [apify.com](https://apify.com)
2. Click **"Sign up free"**
3. Create account with email or Google

#### Step 2: Get Your API Token

1. After logging in, click your **profile icon** (top right)
2. Click **"Settings"**
3. Click **"Integrations"** tab
4. Under **API Token**, click **"Copy"**
5. Save this token - you'll need it!

**Your token looks like:** `apify_api_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`

#### Step 3: Find AutoTrader Actor

1. In Apify, go to **Store** (left menu)
2. Search for **"AutoTrader"** or **"Canadian Cars"**
3. Find an Actor that scrapes AutoTrader.ca
4. Click on it and copy the **Actor ID**

**Actor ID looks like:** `username/autotrader-scraper` or `abc123`

#### Step 4: Add Secrets to Replit

1. In your Replit project, go to **Secrets** (Tools panel)
2. Add these secrets:

| Key | Value |
|-----|-------|
| `APIFY_API_TOKEN` | `apify_api_XXXXX...` |
| `APIFY_AUTOTRADER_ACTOR_ID` | `username/autotrader-scraper` |

#### Step 5: Configure Per-Dealership (Optional)

For different Apify settings per dealership:

1. Go to **Super Admin Dashboard** → **Dealerships** → **API Keys**
2. Enter dealership-specific Apify credentials

---

### 16.6 Adding Scrape Sources in the App

#### Complete Walkthrough

**Step 1: Access Inventory Sources**

1. Login as **Super Admin** or **Master** user
2. Go to **Super Admin Dashboard**
3. Click on **Dealerships** tab
4. Click on the dealership you want to configure
5. Click **"Inventory Sources"** or **"Scrape Sources"** tab

**Step 2: Add a New Source**

Click **"Add Source"** and fill in:

| Field | Description | Example |
|-------|-------------|---------|
| **Source Name** | Friendly name for this source | "Olympic Hyundai Website" |
| **Source URL** | The full URL to scrape | See examples above |
| **Source Type** | Type of website | `dealer_website`, `cargurus`, `autotrader` |
| **Filter Group** | Which category vehicles go into | "Used Vehicles" (optional) |
| **Is Active** | Enable/disable scraping | ✓ Checked |
| **Scrape Frequency** | How often to scrape | `daily`, `hourly`, `weekly` |

**Step 3: Save and Test**

1. Click **Save**
2. Go to **Dashboard** → **Inventory**
3. Click **"Sync Now"**
4. Check the logs for success/errors
5. Verify vehicles appear after sync

#### Recommended Setup Per Dealership

For best results, configure **2-3 sources** per dealership:

| Order | Source | Purpose |
|-------|--------|---------|
| 1 | Dealer Website | Primary source - most accurate |
| 2 | CarGurus | Deal ratings and market data |
| 3 | Apify/AutoTrader | Additional market comparison |

#### Example Complete Setup

**Olympic Hyundai Vancouver:**

| Source Name | Source Type | URL |
|-------------|-------------|-----|
| Olympic Hyundai Website | `dealer_website` | `https://www.olympichyundaivancouver.com/vehicles/used/?st=price,desc&view=grid&sc=used` |
| Olympic Hyundai CarGurus | `cargurus` | `https://www.cargurus.ca/Cars/m-Olympic-Hyundai-Vancouver-sp459833` |

**Boundary Hyundai:**

| Source Name | Source Type | URL |
|-------------|-------------|-----|
| Boundary Hyundai Website | `dealer_website` | `https://www.boundaryhyundai.com/vehicles/used/?st=price,desc&view=grid&sc=used` |
| Boundary Hyundai CarGurus | `cargurus` | `https://www.cargurus.ca/Cars/m-Boundary-Hyundai-sp393663` |

**Kia Vancouver:**

| Source Name | Source Type | URL |
|-------------|-------------|-----|
| Kia Vancouver Website | `dealer_website` | `https://www.kiavancouver.com/vehicles/used/?st=year,desc&view=grid&sc=used` |
| Kia Vancouver CarGurus | `cargurus` | `https://www.cargurus.ca/Cars/m-Kia-Vancouver-sp357122` |

---

### Scraper Schedule

| Schedule | Time | What Happens |
|----------|------|--------------|
| **Automatic** | Daily at midnight (12:00 AM) | All active sources scraped |
| **Manual** | Anytime | Click "Sync Now" in Inventory dashboard |

### Badge Detection

The scraper automatically detects special badges from vehicle descriptions:

| Badge | Keywords That Trigger It |
|-------|-------------------------|
| 🏆 One Owner | "one owner", "1 owner", "single owner" |
| ✅ No Accidents | "no accidents", "accident free", "clean history", "accident-free" |
| 📄 Clean Title | "clean title", "clear title" |
| ⭐ Certified Pre-Owned | "certified", "cpo", "certified pre-owned" |
| 🚗 Low Kilometers | Auto-calculated: under 12,000 km per year |
| 🔥 Manager Special | "manager special", "manager's special" |
| 🆕 New Arrival | "new arrival", "just arrived" |
| ⛽ Fuel Efficient | "fuel efficient", "great fuel economy" |
| 💎 Fully Loaded | "fully loaded", "loaded" |

### Troubleshooting Scraping

| Issue | Cause | Solution |
|-------|-------|----------|
| No vehicles found | Wrong URL | Verify URL shows vehicles in browser |
| Partial results | Page pagination | May need to add "view all" parameter |
| Blocked (403 error) | Cloudflare protection | Use Apify integration |
| Missing images | Different image loading | May need technical adjustment |
| Duplicate vehicles | Multiple sources | System auto-dedupes by VIN |

---

## 17. Market Pricing & Analysis

Market pricing tools help you understand how your vehicles compare to competitors and identify pricing opportunities.

### What Market Analysis Provides

| Feature | What It Tells You | Why It Matters |
|---------|-------------------|----------------|
| **Price Comparison** | How your price compares to similar vehicles | Know if you're priced competitively |
| **Days on Market** | Average time similar vehicles take to sell | Identify slow-moving inventory |
| **Price Trending** | Is the market price going up or down | Time your pricing decisions |
| **Competitive Listings** | Other dealers selling similar vehicles | Know your competition |

### MarketCheck API Setup

MarketCheck provides automotive market data across North America.

#### Step 1: Create MarketCheck Account

1. Go to [marketcheck.com](https://www.marketcheck.com)
2. Click **"Try for Free"** or **"Get Started"**
3. Select a plan:
   - **Free Tier**: 100 API calls/month (good for testing)
   - **Basic**: 1,000 calls/month
   - **Pro**: 10,000+ calls/month

#### Step 2: Get Your API Key

1. After signing up, go to your **Dashboard**
2. Click **"API Keys"** or **"Developers"**
3. Click **"Create API Key"**
4. Copy the key (looks like: `mk_live_XXXXXXXXXXXXXXXX`)

#### Step 3: Add to LotView

**Option A: Global (all dealerships)**
1. In Replit, go to **Secrets**
2. Add: `MARKETCHECK_API_KEY` = `your-api-key`

**Option B: Per-Dealership**
1. Go to **Super Admin Dashboard** → **Dealerships** → **API Keys**
2. Enter the MarketCheck API Key for that dealership

### Geocoder.ca (Canadian Addresses)

Geocoder.ca provides Canadian-specific address lookup and distance calculations.

#### What It Does

- Converts addresses to latitude/longitude
- Calculates driving distances between locations
- Detects customer location from IP address
- Powers regional pricing comparisons

#### Setup

1. Create account at [geocoder.ca](https://geocoder.ca)
2. Get credentials from your account
3. Add to Replit Secrets:

```
GEOCODER_CA_USERNAME=your-username
GEOCODER_CA_PASSWORD=your-password
```

### AI-Powered Market Summaries

When OpenAI is configured, the system generates natural language market insights:

**Example AI Summary:**
> "Your 2023 Honda Civic EX-L is priced at $28,500, which is approximately 3% below the market average of $29,400 for similar vehicles in the Vancouver area. Based on 47 comparable listings, vehicles in this condition typically sell within 18 days. Consider holding your current price - demand for this model has increased 12% month-over-month."

### Using Market Analysis

1. Go to **Dashboard** → **Inventory**
2. Click on any vehicle
3. Click **"Market Analysis"** button
4. View:
   - Price comparison chart
   - Competitor listings
   - AI recommendations

---

## 18. Google Analytics & Remarketing

Track visitor behavior and retarget interested customers with ads.

### Understanding Analytics Terms

| Term | What It Means |
|------|---------------|
| **Google Tag Manager (GTM)** | A container that holds all your tracking codes in one place |
| **Google Analytics (GA4)** | Tracks how people use your website |
| **Facebook Pixel** | Tracks visitors so Facebook can show them ads later |
| **Remarketing** | Showing ads to people who visited your site |

### Google Tag Manager Setup

GTM is the easiest way to manage all your tracking - add it once, then manage everything through GTM's interface.

#### Step 1: Create GTM Account

1. Go to [tagmanager.google.com](https://tagmanager.google.com)
2. Click **"Create Account"**
3. Fill in:
   - **Account Name**: Your company name
   - **Container Name**: `LotView` or your dealership name
   - **Target Platform**: Web
4. Accept the terms
5. **Copy your Container ID** (format: `GTM-XXXXXXX`)

#### Step 2: Add GTM to LotView

The GTM code is already in the codebase. You just need to update the ID:

1. In your Replit project, open `client/index.html`
2. Find `GTM-OLYMPIC` (appears twice)
3. Replace with your Container ID: `GTM-XXXXXXX`

Or configure per-dealership:
1. Go to **Super Admin Dashboard** → **Dealerships** → **Integrations**
2. Enter your GTM Container ID

#### Step 3: Add Google Analytics Tag in GTM

1. In GTM, go to **Tags** → **New**
2. Click **Tag Configuration** → **Google Analytics: GA4 Configuration**
3. Enter your GA4 Measurement ID (format: `G-XXXXXXXXXX`)
4. Click **Triggering** → **All Pages**
5. Save and **Publish**

### Facebook Pixel Setup

#### Step 1: Create Facebook Pixel

1. Go to [Facebook Events Manager](https://business.facebook.com/events_manager)
2. Click **"Connect Data Sources"**
3. Select **"Web"**
4. Choose **"Facebook Pixel"**
5. Name it (e.g., "Olympic Hyundai Pixel")
6. **Copy the Pixel ID** (format: `123456789012345`)

#### Step 2: Add Pixel via GTM

1. In GTM, go to **Tags** → **New**
2. Click **Tag Configuration** → **Custom HTML**
3. Paste the Facebook Pixel base code
4. Click **Triggering** → **All Pages**
5. Save and **Publish**

Or add directly to LotView settings.

### What Events Are Tracked

LotView automatically tracks these events (when pixels are configured):

| Event | When It Fires | Why It Matters |
|-------|---------------|----------------|
| `PageView` | Every page load | Basic traffic tracking |
| `ViewContent` | Vehicle detail page viewed | Shows interest in specific vehicles |
| `Search` | Inventory filtered/searched | Shows what customers want |
| `Lead` | Contact form submitted | Conversion tracking |
| `InitiateCheckout` | Financing calculator used | Shows serious buyers |
| `Contact` | Chat started | Engagement tracking |

### Remarketing Audiences

With pixels set up, you can create audiences:

**High-Intent Audience:**
- Viewed 3+ vehicles
- Used financing calculator
- Did NOT submit lead form

**Vehicle-Specific Audience:**
- Viewed SUVs only
- In last 7 days
- Price range $30,000-$50,000

These audiences can be targeted with Facebook, Google, or display ads.

---

## 19. Subdomain Configuration

Each dealership can have a custom subdomain like `olympic.lotview.ai`.

### Current Setup (Replit)

1. Go to **Super Admin Dashboard** → **Dealerships**
2. Set the **Subdomain** field (e.g., `olympic-hyundai`)
3. The app routes based on subdomain

### How Tenant Resolution Works

The system resolves which dealership to serve via:

1. **JWT Token**: Logged-in user's dealership (highest priority)
2. **Subdomain**: Extracted from request host
3. **X-Dealership-ID Header**: For API testing
4. **Default**: Falls back to dealership ID 1

### Custom Domain Setup (Production)

For your own domain:

1. In Replit, go to **Deployments** → **Domains**
2. Add your custom domain (e.g., `lotview.ai`)
3. Configure DNS at your registrar:

```
Type: A
Name: @
Value: [Replit's IP - shown in deployment settings]

Type: CNAME
Name: *
Value: [Your Replit deployment URL]
```

4. SSL is auto-provisioned by Replit

### Subdomain Routing Example

| URL | Resolves To |
|-----|-------------|
| `lotview.ai` | Marketing landing page |
| `olympic.lotview.ai` | Olympic Auto Group inventory |
| `boundary.lotview.ai` | Boundary Hyundai inventory |
| `kia.lotview.ai` | Kia Vancouver inventory |

### Structured Data (Schema.org)

LotView automatically generates structured data for search engines:

```json
{
  "@context": "https://schema.org",
  "@type": "Vehicle",
  "name": "2024 Honda Accord EX-L",
  "brand": "Honda",
  "model": "Accord",
  "vehicleModelDate": "2024",
  "mileageFromOdometer": {
    "@type": "QuantitativeValue",
    "value": 15000,
    "unitCode": "KMT"
  },
  "offers": {
    "@type": "Offer",
    "price": 35999,
    "priceCurrency": "CAD"
  }
}
```

### Sitemap

A sitemap is automatically generated at `/sitemap.xml`:
- All vehicle listing pages
- Category pages
- Legal pages
- Updated automatically when inventory changes

---

## 20. Object Storage Setup

### What is Object Storage?

Object storage is like a cloud-based file cabinet where LotView stores:
- Vehicle images
- Uploaded documents
- Dealership logos
- Call recordings

### Why Use Object Storage?

| Storage Type | Survives Deployments | Best For |
|--------------|---------------------|----------|
| Local Files | No | Temporary files |
| Object Storage | Yes | Permanent files (images, documents) |
| Database | Yes | Structured data (vehicles, users) |

### Auto-Configured by Replit

Replit automatically provides object storage. These secrets are set automatically:

| Secret | Purpose |
|--------|---------|
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Your storage bucket identifier |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Where public files are stored |
| `PRIVATE_OBJECT_DIR` | Where private uploads go |

### Directory Structure

```
bucket/
├── public/              ← Publicly accessible files
│   ├── logos/           ← Dealership logos
│   ├── vehicles/        ← Vehicle images
│   └── branding/        ← Hero images, etc.
└── .private/            ← Private files (not public)
    └── uploads/         ← User uploads, call recordings
```

### How Files Get Stored

**Automatic:**
- When scraping, vehicle images are downloaded and stored
- When calls are analyzed, recordings are saved

**Manual:**
- Dashboard → Add Vehicle → Upload Images
- Branding settings → Upload Logo

### Accessing Files

Public files are accessible via URL:
```
https://your-bucket.storage.replit.com/public/vehicles/image-123.jpg
```

---

## 21. Scheduled Jobs & Cron Tasks

LotView runs automated tasks on schedules to keep everything synchronized.

### Understanding Scheduled Jobs

| Job | When It Runs | What It Does |
|-----|--------------|--------------|
| **Inventory Sync** | Daily at midnight | Scrapes all active sources for new vehicles |
| **Facebook Token Refresh** | Daily at 3 AM | Refreshes expiring Facebook tokens |
| **Market Analysis** | Daily at 3 AM | Updates market pricing data |
| **Facebook Catalog Sync** | Daily at 4 AM | Syncs inventory to Facebook Catalogs |
| **GHL CRM Sync** | Daily at 5 AM | Bidirectional sync with GoHighLevel |
| **Facebook Posting Queue** | Every minute | Processes scheduled Facebook posts |

### Enabling/Disabling the Scheduler

To turn all scheduled jobs on or off:

1. Go to Replit **Secrets**
2. Set `SCHEDULER_ENABLED`:
   - `true` = All jobs run on schedule
   - `false` = No jobs run automatically (manual only)

### Monitoring Jobs

Check if jobs are running correctly:

**Server Logs:**
1. In Replit, look at the **Console** output
2. Search for job names like "Inventory sync started"

**Database Tables:**
| Table | What It Tracks |
|-------|----------------|
| `pbs_api_logs` | PBS DMS API calls |
| `ghl_api_logs` | GoHighLevel API calls |
| `audit_logs` | Important system events |
| `scraper_activity_logs` | Scraping results |

### Running Jobs Manually

If you need to run a job immediately:

**Inventory Sync:**
- Dashboard → Inventory → Click **"Sync Now"**

**Facebook Catalog Sync:**
- Super Admin → FB Catalogs → Select dealership → Click **"Sync Now"**

---

## 22. Publishing & Deployment

### Development vs Production

| Mode | URL | Purpose |
|------|-----|---------|
| **Development** | Replit preview (port 5000) | Testing changes |
| **Production** | `your-app.replit.app` | Live for customers |

### Step 1: Test in Development

Before publishing:
- [ ] All features work correctly
- [ ] No errors in console
- [ ] Branding looks correct
- [ ] Inventory displays properly
- [ ] Chat works

### Step 2: Publish

1. Click the **"Publish"** button (top right of Replit)
2. Choose deployment type:

| Type | Best For | Cost |
|------|----------|------|
| **Autoscale** | Production sites | Pay per use |
| **Reserved VM** | High traffic sites | Fixed monthly |

3. Click **"Publish"**

### What Replit Handles Automatically

- Building the React frontend
- Bundling the Express server
- SSL/TLS certificates (HTTPS)
- Health checks
- Custom domains
- Auto-restart on crashes

### Step 3: Post-Deployment Checklist

- [ ] Site loads at production URL
- [ ] All secrets are set for production
- [ ] Database connects properly
- [ ] Facebook OAuth uses production URL
- [ ] GHL webhooks point to production URL
- [ ] Facebook App domains updated
- [ ] SSL certificate is active (green lock icon)

---

## 23. Updating Without Losing Data

### What Happens During Updates

When you make changes and republish:

| What | Happens |
|------|---------|
| Code files | Replaced with new version |
| Database data | Preserved (unchanged) |
| Object storage files | Preserved (unchanged) |
| Secrets | Preserved (unchanged) |
| In-memory caches | Cleared (rebuilt on restart) |

### Safe Update Process

1. Make code changes in Replit editor
2. Test in development mode (click Run)
3. Verify everything works
4. Click **"Republish"**
5. Wait 30-60 seconds for deployment
6. Verify production site works

### What's Safe (Persists Across Updates)

| Data Type | Storage Location | Safe? |
|-----------|-----------------|-------|
| All vehicles | PostgreSQL database | Yes |
| User accounts | PostgreSQL database | Yes |
| Chat conversations | PostgreSQL database | Yes |
| API keys (encrypted) | PostgreSQL database | Yes |
| Uploaded images | Object Storage | Yes |
| Call recordings | Object Storage | Yes |
| Dealership settings | PostgreSQL database | Yes |

### What's NOT Safe

- Files created in the filesystem (use Object Storage instead)
- In-memory session data (sessions rebuild automatically)

### Database Migrations

Drizzle ORM handles schema changes automatically:
- New columns are added automatically
- New tables are created automatically
- Existing data is never deleted by migrations

### Rolling Back (If Something Goes Wrong)

1. In Replit, click **History** tab (left panel)
2. Browse previous checkpoints
3. Click **"Rollback"** on a working version
4. Your code returns to that state
5. Database can also be rolled back (separate option)

---

## 24. Troubleshooting

### Common Issues and Solutions

#### "Database connection failed"

**Symptoms:** App won't start, error mentions "database" or "PostgreSQL"

**Solutions:**
1. Check `DATABASE_URL` secret is set correctly
2. If using Neon free tier, the database may be paused after inactivity
   - Go to Neon dashboard and resume it
3. Try running `npm run db:push` in the shell

#### "Facebook OAuth error"

**Symptoms:** Can't connect Facebook, error during authorization

**Solutions:**
1. Verify `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` are correct
2. Check the redirect URI in Facebook App settings matches exactly:
   - `https://your-domain.replit.app/api/facebook/oauth/callback`
3. Ensure Facebook app is in **Live** mode (not Development)
4. Check that all required permissions are approved

#### "Facebook token expired"

**Symptoms:** Facebook features stop working, "token expired" error

**Solutions:**
1. Go to **Dashboard** → **Facebook** tab
2. Click **"Reconnect"**
3. Complete the OAuth flow again

#### "PBS API 401 Unauthorized"

**Symptoms:** PBS sync fails, "unauthorized" error

**Solutions:**
1. Check PBS credentials are correct in dealership settings
2. Session may have expired - system will auto-refresh
3. Verify PBS account is active with your PBS representative

#### "GHL token refresh failed"

**Symptoms:** GoHighLevel sync stops working

**Solutions:**
1. Go to dealership GHL settings
2. Click **"Reconnect"**
3. Re-authorize with GoHighLevel
4. Verify `GHL_CLIENT_ID` and `GHL_CLIENT_SECRET` are correct

#### "Scraper blocked by Cloudflare"

**Symptoms:** AutoTrader scraping fails, 403 or timeout errors

**Solutions:**
1. Use Apify integration instead (more reliable)
2. Wait and retry (may be rate limited)
3. Configure proxies in `SCRAPER_PROXIES` secret

#### "Call analysis not working"

**Symptoms:** Calls not being analyzed, no scores appearing

**Solutions:**
1. Verify OpenAI API key is configured
2. Check GHL webhook is sending `CallCompleted` events
3. Ensure call recording is enabled in GHL phone settings
4. Check `ghl_api_logs` table for errors

#### "Chat not responding"

**Symptoms:** AI chat doesn't reply, spinning or timeout

**Solutions:**
1. Check OpenAI API key is valid
2. Verify key has credits remaining (check OpenAI dashboard)
3. Look at browser console (F12) for JavaScript errors
4. Check server logs for API errors

### Log Locations

| Log Type | Where to Find It |
|----------|------------------|
| Server output | Replit Console (bottom panel) |
| PBS API calls | Database: `pbs_api_logs` table |
| GHL API calls | Database: `ghl_api_logs` table |
| System events | Database: `audit_logs` table |
| Impersonation | Database: `impersonation_sessions` table |
| Scraping results | Database: `scraper_activity_logs` table |

### Getting Help

1. Check this guide's relevant section
2. Review server logs in Replit Console
3. Check database tables for error details
4. Contact your system administrator

---

## 25. Quick Reference: All Secrets

Here's a complete list of all environment variables/secrets used by LotView.

```bash
# ============================================
# REQUIRED - Database (Auto-configured by Replit)
# ============================================
DATABASE_URL=postgresql://...

# ============================================
# REQUIRED - Authentication
# Generate with: openssl rand -hex 32
# ============================================
JWT_SECRET=your-64-character-secret-minimum
SESSION_SECRET=your-session-secret

# ============================================
# FACEBOOK INTEGRATION
# Get from: developers.facebook.com
# ============================================
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_REDIRECT_URI=https://your-domain.replit.app/api/facebook/oauth/callback

# ============================================
# GOHIGHLEVEL CRM
# Get from: marketplace.gohighlevel.com
# ============================================
GHL_CLIENT_ID=your-ghl-client-id
GHL_CLIENT_SECRET=your-ghl-client-secret
GHL_REDIRECT_URI=https://your-domain.replit.app/api/ghl/auth/callback

# ============================================
# OPENAI - Auto-configured by Replit
# Or set manually for per-dealership keys
# ============================================
AI_INTEGRATIONS_OPENAI_API_KEY=auto-configured
AI_INTEGRATIONS_OPENAI_BASE_URL=auto-configured

# ============================================
# OPTIONAL APIs - Can be global or per-dealership
# ============================================
MARKETCHECK_API_KEY=your-marketcheck-api-key
APIFY_API_TOKEN=your-apify-token
APIFY_AUTOTRADER_ACTOR_ID=your-actor-id
GEOCODER_CA_USERNAME=your-username
GEOCODER_CA_PASSWORD=your-password
SCRAPER_PROXIES=http://proxy1:port,http://proxy2:port

# ============================================
# OBJECT STORAGE - Auto-configured by Replit
# ============================================
DEFAULT_OBJECT_STORAGE_BUCKET_ID=auto-configured
PUBLIC_OBJECT_SEARCH_PATHS=auto-configured
PRIVATE_OBJECT_DIR=auto-configured

# ============================================
# SCHEDULER
# ============================================
SCHEDULER_ENABLED=true
```

### Quick Secret Setup Checklist

**Minimum Required (for basic functionality):**
- [ ] `DATABASE_URL` - Auto-configured by Replit
- [ ] `JWT_SECRET` - Generate and add manually
- [ ] `SESSION_SECRET` - Generate and add manually

**For Facebook features:**
- [ ] `FACEBOOK_APP_ID`
- [ ] `FACEBOOK_APP_SECRET`
- [ ] `FACEBOOK_REDIRECT_URI`

**For GoHighLevel CRM:**
- [ ] `GHL_CLIENT_ID`
- [ ] `GHL_CLIENT_SECRET`
- [ ] `GHL_REDIRECT_URI`

**For market analysis:**
- [ ] `MARKETCHECK_API_KEY`
- [ ] `GEOCODER_CA_USERNAME` / `GEOCODER_CA_PASSWORD`

**For AutoTrader scraping:**
- [ ] `APIFY_API_TOKEN`
- [ ] `APIFY_AUTOTRADER_ACTOR_ID`

---

## 26. Complete Dealership Onboarding Checklist

Use this checklist when adding a new dealership to LotView.ai. Complete each step in order.

### Phase 1: Basic Setup (Required)

**Account & Access:**
- [ ] Create dealership in Super Admin Dashboard
  - Name: ________________
  - Slug: ________________ (URL-safe, e.g., `olympic-hyundai`)
  - Location: ________________

- [ ] Create Master user (General Manager) for dealership
  - Email: ________________
  - Role: Master

**Branding:**
- [ ] Upload or link logo (400x100 PNG)
  - URL: ________________
- [ ] Upload or link favicon (64x64 PNG)
  - URL: ________________
- [ ] Set primary color: #________________
- [ ] Set secondary color: #________________
- [ ] Set hero headline: ________________
- [ ] Set hero subheadline: ________________
- [ ] Set tagline: ________________

**Inventory Sources:**
- [ ] Add dealer website source
  - URL: ________________
  - Type: `dealer_website`
- [ ] Add CarGurus source
  - URL: ________________
  - Type: `cargurus`
- [ ] Test scraping with "Sync Now"
- [ ] Verify vehicles appear in inventory

### Phase 2: AI & Chat (Recommended)

**OpenAI Configuration:**
- [ ] Verify OpenAI access (Replit auto-configured OR per-dealership key)
- [ ] Test AI chat functionality

**Chat Customization:**
- [ ] Set system prompt with dealership info
- [ ] Set welcome message
- [ ] Configure temperature and max tokens
- [ ] Test chat on public inventory page

### Phase 3: Facebook Integration (Optional)

**Facebook Setup:**
- [ ] Add Facebook App credentials (if separate app)
  - App ID: ________________
  - App Secret: ________________
- [ ] Complete OAuth connection
- [ ] Select Facebook Pages to connect
- [ ] Configure ad templates

**Facebook Catalog (For Automotive Ads):**
- [ ] Create/link Facebook Catalog ID
  - Catalog ID: ________________
- [ ] Add System User Access Token
- [ ] Enable auto-sync if desired
- [ ] Test catalog sync

### Phase 4: CRM Integration (Optional)

**PBS DMS:**
- [ ] Obtain PBS Partner Hub credentials
  - Partner Code: ________________
  - Dealer Code: ________________
  - Username: ________________
- [ ] Configure PBS connection
- [ ] Test contact lookup
- [ ] Enable sync features as needed

**GoHighLevel:**
- [ ] Complete GHL OAuth connection
- [ ] Map calendars (sales/service)
- [ ] Map pipelines
- [ ] Configure webhook events
- [ ] Enable bidirectional sync
- [ ] Test lead sync

### Phase 5: Analytics & Marketing (Optional)

**Tracking:**
- [ ] Set up Google Tag Manager container
  - GTM ID: GTM-________________
- [ ] Configure Google Analytics
- [ ] Set up Facebook Pixel
  - Pixel ID: ________________
- [ ] Configure remarketing pixels

### Phase 6: Final Testing

**Functionality Tests:**
- [ ] Browse inventory as guest
- [ ] Test vehicle search/filtering
- [ ] Test financing calculator
- [ ] Test AI chat
- [ ] Test contact forms
- [ ] Test on mobile devices

**Staff Tests:**
- [ ] Login as Master user
- [ ] Access dashboard
- [ ] View analytics
- [ ] Access Call Analysis (if GHL connected)
- [ ] Create test salesperson account
- [ ] Verify role permissions

### Post-Onboarding

**Documentation:**
- [ ] Record all configured URLs in this document
- [ ] Save API keys securely
- [ ] Note any custom configurations

**Training:**
- [ ] Train General Manager on dashboard
- [ ] Train sales team on chat monitoring
- [ ] Document any dealership-specific workflows

### Quick Reference: Dealership Details

Fill this out and keep for reference:

```
DEALERSHIP ONBOARDING RECORD
============================

Dealership Name: _______________________________
Slug: _______________________________
Subdomain: _______________________________.lotview.ai
Created Date: _______________________________

MASTER USER
-----------
Name: _______________________________
Email: _______________________________

INVENTORY SOURCES
-----------------
Website URL: _______________________________
CarGurus URL: _______________________________
AutoTrader URL: _______________________________

BRANDING
--------
Logo URL: _______________________________
Primary Color: #_______________
Secondary Color: #_______________

INTEGRATIONS
------------
Facebook App ID: _______________________________
Facebook Catalog ID: _______________________________
GHL Location ID: _______________________________
PBS Dealer Code: _______________________________

NOTES
-----
_______________________________
_______________________________
_______________________________
```

---

## Support

For additional support:
- Check `replit.md` for architecture details
- Review server code in `/server` directory
- Database schema in `shared/schema.ts`
- Contact your system administrator

---

*Last Updated: December 2024*
*LotView.ai - AI-Powered Automotive Inventory Platform*
