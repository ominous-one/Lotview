# LotView MVP Backend Architecture

> Auto-posting vehicles to Facebook Marketplace via browser automation.
> Designed for the Chrome Extension → Backend → Puppeteer pipeline.

---

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DEALERSHIP BROWSER                          │
│  ┌──────────────────────┐                                          │
│  │  Chrome Extension     │◄── Content scripts inject into FB       │
│  │  (Manifest V3)        │    Marketplace posting form              │
│  │                       │                                          │
│  │  - Popup UI           │    WebSocket ◄──► Backend                │
│  │  - Background worker  │    REST API  ◄──► Backend                │
│  └──────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────┘
          │  HTTPS + WSS
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Node.js / Fastify)                │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ REST API  │  │ WebSocket    │  │ Job Queue    │  │ Auth       │ │
│  │ Routes    │  │ Gateway      │  │ (BullMQ)     │  │ (JWT+RBAC) │ │
│  └─────┬────┘  └──────┬───────┘  └──────┬───────┘  └────────────┘ │
│        │               │                 │                          │
│        ▼               ▼                 ▼                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                    Service Layer                              │  │
│  │  VehicleService · PostingService · DealershipService          │  │
│  │  AppraisalService · ListingAIService · InventorySyncService   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│        │               │                 │                          │
│        ▼               ▼                 ▼                          │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐                  │
│  │ PostgreSQL │  │ Redis      │  │ Puppeteer    │                  │
│  │ (Prisma)   │  │ (BullMQ +  │  │ Worker Pool  │                  │
│  │            │  │  sessions) │  │ (headless)   │                  │
│  └────────────┘  └────────────┘  └──────────────┘                  │
│                                         │                          │
│                                         ▼                          │
│                                  Facebook Marketplace               │
│                                  (browser automation)               │
└─────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  External Services                                                  │
│  - Anthropic Claude API (AI listing generation)                     │
│  - S3-compatible storage (vehicle images)                           │
│  - SMTP / SendGrid (notifications)                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### MVP Scope

The MVP delivers **one thing well**: a salesperson clicks a button on a vehicle in LotView, and it gets posted to Facebook Marketplace with an AI-generated listing — zero manual data entry.

Out of MVP scope: Craigslist posting, competitive pricing module, inventory scraping engine (vehicles are manually imported or CSV-uploaded for MVP).

---

## 2. Database Schema (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Multi-Tenant Core ──────────────────────────────────────────

model Dealership {
  id            String    @id @default(cuid())
  name          String
  slug          String    @unique          // used in URLs
  address       String?
  city          String?
  state         String?
  zip           String?
  phone         String?
  website       String?
  logoUrl       String?
  timezone      String    @default("America/Los_Angeles")
  plan          Plan      @default(BASE)
  active        Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  users         User[]
  vehicles      Vehicle[]
  postings      Posting[]
  fbAccounts    FacebookAccount[]
  apiKeys       ApiKey[]
}

enum Plan {
  BASE        // $299/mo
  INTEL       // $499/mo with competitive pricing
}

// ─── Users & Auth ───────────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  dealershipId  String
  email         String    @unique
  passwordHash  String
  firstName     String
  lastName      String
  role          Role
  active        Boolean   @default(true)
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  dealership    Dealership @relation(fields: [dealershipId], references: [id], onDelete: Cascade)
  postings      Posting[]
  refreshTokens RefreshToken[]

  @@index([dealershipId])
  @@index([email])
}

enum Role {
  GM              // General Manager — full access
  SALES_MANAGER   // Appraisals, inventory, posting
  SALESPERSON     // Posting only
}

model RefreshToken {
  id          String   @id @default(cuid())
  userId      String
  token       String   @unique
  family      String                      // token rotation family
  expiresAt   DateTime
  revokedAt   DateTime?
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([userId])
}

model ApiKey {
  id            String    @id @default(cuid())
  dealershipId  String
  keyHash       String    @unique          // SHA-256 of the actual key
  label         String
  lastUsedAt    DateTime?
  expiresAt     DateTime?
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())

  dealership    Dealership @relation(fields: [dealershipId], references: [id], onDelete: Cascade)

  @@index([keyHash])
}

// ─── Vehicles ───────────────────────────────────────────────────

model Vehicle {
  id            String    @id @default(cuid())
  dealershipId  String
  stockNumber   String                     // dealer's internal stock #
  vin           String?
  year          Int
  make          String
  model         String
  trim          String?
  mileage       Int?
  exteriorColor String?
  interiorColor String?
  bodyStyle     String?                    // sedan, SUV, truck, etc.
  drivetrain    String?                    // FWD, RWD, AWD, 4WD
  transmission  String?                    // automatic, manual
  engine        String?                    // "2.0L Turbo I4"
  fuelType      String?                    // gas, diesel, electric, hybrid
  price         Int?                       // cents (avoid float)
  costBasis     Int?                       // cents — what dealer paid
  condition     VehicleCondition @default(USED)
  features      String[]                   // array of feature strings
  notes         String?                    // internal notes
  daysOnLot     Int?                       // computed or manual
  lotDate       DateTime?                  // date vehicle hit the lot
  status        VehicleStatus @default(ACTIVE)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  dealership    Dealership @relation(fields: [dealershipId], references: [id], onDelete: Cascade)
  images        VehicleImage[]
  postings      Posting[]

  @@unique([dealershipId, stockNumber])
  @@index([dealershipId, status])
  @@index([dealershipId, make, model])
}

enum VehicleCondition {
  NEW
  USED
  CPO     // Certified Pre-Owned
}

enum VehicleStatus {
  ACTIVE      // on the lot, available
  PENDING     // sale pending
  SOLD
  ARCHIVED
}

model VehicleImage {
  id          String   @id @default(cuid())
  vehicleId   String
  url         String                       // S3 URL
  sortOrder   Int      @default(0)
  isPrimary   Boolean  @default(false)
  createdAt   DateTime @default(now())

  vehicle     Vehicle  @relation(fields: [vehicleId], references: [id], onDelete: Cascade)

  @@index([vehicleId])
}

// ─── Facebook Posting ───────────────────────────────────────────

model FacebookAccount {
  id            String    @id @default(cuid())
  dealershipId  String
  label         String                     // "Main FB Account", etc.
  // Encrypted at rest — stores cookies/session for Puppeteer
  sessionData   String                     // AES-256-GCM encrypted JSON
  sessionValid  Boolean   @default(true)
  lastCheckedAt DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  dealership    Dealership @relation(fields: [dealershipId], references: [id], onDelete: Cascade)
  postings      Posting[]

  @@index([dealershipId])
}

model Posting {
  id              String        @id @default(cuid())
  dealershipId    String
  vehicleId       String
  userId          String                   // who initiated the post
  fbAccountId     String?
  platform        Platform      @default(FACEBOOK)
  status          PostingStatus @default(QUEUED)
  // AI-generated listing content
  title           String?
  description     String?
  price           Int?                     // cents — may differ from vehicle price
  location        String?
  // FB-specific
  fbListingId     String?                  // FB's listing ID once posted
  fbListingUrl    String?
  // Job tracking
  jobId           String?       @unique    // BullMQ job ID
  attempts        Int           @default(0)
  lastError       String?
  scheduledFor    DateTime?                // future posting
  postedAt        DateTime?
  deletedAt       DateTime?                // when removed from FB
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  dealership      Dealership    @relation(fields: [dealershipId], references: [id], onDelete: Cascade)
  vehicle         Vehicle       @relation(fields: [vehicleId], references: [id])
  user            User          @relation(fields: [userId], references: [id])
  fbAccount       FacebookAccount? @relation(fields: [fbAccountId], references: [id])

  @@index([dealershipId, status])
  @@index([vehicleId])
  @@index([jobId])
  @@index([status, scheduledFor])
}

enum Platform {
  FACEBOOK
  CRAIGSLIST   // future
}

enum PostingStatus {
  QUEUED          // waiting in job queue
  GENERATING      // AI listing being created
  READY           // listing generated, awaiting post
  POSTING         // Puppeteer actively posting
  POSTED          // live on FB
  FAILED          // posting failed
  CANCELLED       // user cancelled
  DELETED         // removed from FB
}
```

---

## 3. API Endpoints

Base URL: `https://api.lotview.io/v1`

All endpoints require `Authorization: Bearer <jwt>` unless marked PUBLIC.
Tenant isolation enforced at middleware level — JWT contains `dealershipId`.

### 3.1 Auth

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/auth/login` | PUBLIC | Email + password → JWT + refresh token |
| POST | `/auth/refresh` | PUBLIC | Refresh token → new JWT + rotated refresh token |
| POST | `/auth/logout` | ANY | Revoke refresh token family |
| GET | `/auth/me` | ANY | Current user + dealership info |

**POST `/auth/login`**
```json
// Request
{ "email": "john@dealer.com", "password": "..." }

// Response 200
{
  "accessToken": "eyJ...",          // 15-min expiry
  "refreshToken": "rt_...",         // 7-day expiry, httpOnly cookie
  "user": {
    "id": "clx...",
    "email": "john@dealer.com",
    "firstName": "John",
    "lastName": "Smith",
    "role": "SALESPERSON",
    "dealership": { "id": "clx...", "name": "Smith Auto", "slug": "smith-auto" }
  }
}
```

### 3.2 Users (GM only)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/users` | GM | List dealership users |
| POST | `/users` | GM | Create user (sends invite email) |
| PATCH | `/users/:id` | GM | Update user role/status |
| DELETE | `/users/:id` | GM | Deactivate user (soft delete) |

### 3.3 Vehicles

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/vehicles` | ANY | List vehicles. Query: `?status=ACTIVE&page=1&limit=50&search=camry` |
| GET | `/vehicles/:id` | ANY | Single vehicle with images |
| POST | `/vehicles` | GM, SM | Create vehicle |
| PATCH | `/vehicles/:id` | GM, SM | Update vehicle |
| DELETE | `/vehicles/:id` | GM | Archive vehicle |
| POST | `/vehicles/import` | GM, SM | CSV bulk import (multipart/form-data) |
| POST | `/vehicles/:id/images` | GM, SM | Upload images (multipart, max 20, max 5MB each) |
| DELETE | `/vehicles/:id/images/:imageId` | GM, SM | Remove image |

**POST `/vehicles`**
```json
// Request
{
  "stockNumber": "A1234",
  "vin": "1HGBH41JXMN109186",
  "year": 2021,
  "make": "Toyota",
  "model": "Camry",
  "trim": "SE",
  "mileage": 34500,
  "exteriorColor": "Silver",
  "bodyStyle": "Sedan",
  "drivetrain": "FWD",
  "transmission": "Automatic",
  "engine": "2.5L I4",
  "fuelType": "Gas",
  "price": 2499900,
  "features": ["Backup Camera", "Bluetooth", "Lane Departure Warning"],
  "notes": "Clean title, one owner"
}

// Response 201
{ "id": "clx...", "stockNumber": "A1234", ... }
```

**GET `/vehicles`** response:
```json
{
  "data": [ { /* vehicle */ }, ... ],
  "pagination": { "page": 1, "limit": 50, "total": 127, "totalPages": 3 }
}
```

### 3.4 Postings (Facebook)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/postings` | ANY | Queue a vehicle for FB posting |
| GET | `/postings` | ANY | List postings. Query: `?status=POSTED&vehicleId=x` |
| GET | `/postings/:id` | ANY | Single posting with status |
| POST | `/postings/:id/retry` | ANY | Retry a failed posting |
| POST | `/postings/:id/cancel` | ANY | Cancel a queued/generating posting |
| DELETE | `/postings/:id` | GM, SM | Delete listing from FB (queues removal job) |
| POST | `/postings/bulk` | GM, SM | Post multiple vehicles at once |
| POST | `/postings/:id/preview` | ANY | Regenerate AI listing without posting |

**POST `/postings`**
```json
// Request
{
  "vehicleId": "clx...",
  "fbAccountId": "clx...",
  "scheduledFor": null,            // null = post immediately
  "priceOverride": null,           // null = use vehicle price
  "locationOverride": null         // null = use dealership address
}

// Response 202
{
  "id": "clx...",
  "status": "QUEUED",
  "jobId": "posting:abc123",
  "vehicle": { "year": 2021, "make": "Toyota", "model": "Camry" }
}
```

**POST `/postings/bulk`**
```json
// Request
{
  "vehicleIds": ["clx1", "clx2", "clx3"],
  "fbAccountId": "clx...",
  "staggerMinutes": 5              // delay between posts to avoid FB throttle
}

// Response 202
{
  "postings": [
    { "id": "clx...", "vehicleId": "clx1", "status": "QUEUED", "scheduledFor": "..." },
    { "id": "clx...", "vehicleId": "clx2", "status": "QUEUED", "scheduledFor": "..." },
    { "id": "clx...", "vehicleId": "clx3", "status": "QUEUED", "scheduledFor": "..." }
  ]
}
```

### 3.5 Facebook Accounts

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/fb-accounts` | GM, SM | List connected FB accounts |
| POST | `/fb-accounts` | GM | Connect new FB account (session setup flow) |
| POST | `/fb-accounts/:id/validate` | GM, SM | Check if session is still valid |
| DELETE | `/fb-accounts/:id` | GM | Disconnect FB account |

**POST `/fb-accounts`** — initiates a supervised Puppeteer session where the user logs into Facebook through a proxied browser view. Session cookies are captured and encrypted.

### 3.6 AI Listing Generation

| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/listings/generate` | ANY | Generate AI listing for a vehicle |
| POST | `/listings/regenerate` | ANY | Regenerate with custom instructions |

**POST `/listings/generate`**
```json
// Request
{ "vehicleId": "clx...", "tone": "professional" }

// Response 200
{
  "title": "2021 Toyota Camry SE — 34K Miles, One Owner, Clean Title",
  "description": "Sharp 2021 Camry SE with only 34,500 miles...",
  "suggestedPrice": 2499900
}
```

### 3.7 Dealership Settings (GM only)

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/dealership` | GM | Get dealership profile |
| PATCH | `/dealership` | GM | Update dealership profile |
| GET | `/dealership/api-keys` | GM | List API keys |
| POST | `/dealership/api-keys` | GM | Create API key |
| DELETE | `/dealership/api-keys/:id` | GM | Revoke API key |

---

## 4. Puppeteer Facebook Posting Flow

### 4.1 Architecture

- **Worker pool**: 2-4 headless Chromium instances managed by a pool (via `generic-pool`)
- **One browser per FB account** at a time — no concurrent posts from the same account
- **Stealth**: `puppeteer-extra-plugin-stealth` to avoid detection
- **Proxy rotation**: residential proxies to avoid IP-based blocks (env-configured)
- Each posting job acquires a browser instance, loads session cookies, executes, releases

### 4.2 Step-by-Step Posting Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    POSTING JOB EXECUTION                        │
│                                                                 │
│  1. ACQUIRE BROWSER                                             │
│     ├─ Get idle Chromium from pool (or launch new)              │
│     ├─ Set viewport: 1920×1080                                  │
│     └─ Configure proxy if set                                   │
│                                                                 │
│  2. LOAD SESSION                                                │
│     ├─ Decrypt FacebookAccount.sessionData (AES-256-GCM)        │
│     ├─ Set cookies on .facebook.com domain                      │
│     ├─ Navigate to https://www.facebook.com                     │
│     ├─ Verify login state (check for profile element)           │
│     └─ IF session invalid → mark account, FAIL job, notify user │
│                                                                 │
│  3. NAVIGATE TO MARKETPLACE                                     │
│     ├─ Go to https://www.facebook.com/marketplace/create/vehicle│
│     ├─ Wait for form to render (max 15s)                        │
│     └─ IF blocked/captcha → screenshot, FAIL, notify            │
│                                                                 │
│  4. FILL VEHICLE DETAILS                                        │
│     ├─ Year → dropdown select                                   │
│     ├─ Make → dropdown select                                   │
│     ├─ Model → dropdown select (waits for make-dependent load)  │
│     ├─ Trim → text input (if field exists)                      │
│     ├─ Vehicle Type → select (bodyStyle mapping)                │
│     ├─ Mileage → number input                                  │
│     ├─ Price → number input                                    │
│     ├─ Condition → select (maps VehicleCondition → FB options)  │
│     ├─ Transmission → select                                   │
│     ├─ Fuel Type → select                                      │
│     ├─ Exterior Color → select                                 │
│     ├─ Description → textarea (AI-generated)                   │
│     ├─ Location → type dealership city, select from autocomplete│
│     └─ Human-like delays: 50-200ms between keystrokes,         │
│        300-800ms between fields (randomized)                    │
│                                                                 │
│  5. UPLOAD IMAGES                                               │
│     ├─ Download vehicle images from S3 to temp dir              │
│     ├─ Click "Add Photos" button                                │
│     ├─ Use input[type=file] element, set files                  │
│     ├─ Wait for all uploads to complete (progress indicators)   │
│     ├─ Max 20 images per FB listing                             │
│     └─ 1-3s delay between upload batches                        │
│                                                                 │
│  6. REVIEW & SUBMIT                                             │
│     ├─ Screenshot the filled form (stored for audit)            │
│     ├─ Click "Next" / "Publish" button                          │
│     ├─ Wait for confirmation page/toast (max 30s)               │
│     ├─ Extract FB listing ID from URL or confirmation           │
│     └─ Screenshot confirmation                                  │
│                                                                 │
│  7. CLEANUP                                                     │
│     ├─ Update Posting record: status=POSTED, fbListingId, etc.  │
│     ├─ Delete temp image files                                  │
│     ├─ Save updated cookies back to FacebookAccount             │
│     ├─ Release browser to pool                                  │
│     └─ Emit WebSocket event: posting.completed                  │
│                                                                 │
│  ON FAILURE (any step):                                         │
│     ├─ Screenshot current page state                            │
│     ├─ Log error + screenshot URL to Posting.lastError          │
│     ├─ Update status=FAILED, increment attempts                 │
│     ├─ Release browser to pool                                  │
│     ├─ Emit WebSocket event: posting.failed                     │
│     └─ If attempts < 3, auto-retry with exponential backoff     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.3 Facebook Marketplace Field Mapping

| FB Field | Source | Notes |
|----------|--------|-------|
| Year | `vehicle.year` | Dropdown — must match FB's list |
| Make | `vehicle.make` | Dropdown — normalize to FB's list (e.g., "Chevy" → "Chevrolet") |
| Model | `vehicle.model` | Dropdown — loaded after make selection |
| Trim | `vehicle.trim` | Free text, optional on FB |
| Body Style | `vehicle.bodyStyle` | Map: "SUV"→"SUV", "Sedan"→"Sedan", "Truck"→"Truck/Van" |
| Mileage | `vehicle.mileage` | Number input |
| Price | `posting.price ?? vehicle.price` | In dollars (divide cents by 100) |
| Condition | `vehicle.condition` | Map: USED→"Used", NEW→"New", CPO→"Used - Certified Pre-Owned" |
| Fuel Type | `vehicle.fuelType` | Map to FB's options |
| Transmission | `vehicle.transmission` | Map to FB's options |
| Exterior Color | `vehicle.exteriorColor` | Map to FB's color list |
| Description | `posting.description` | AI-generated text |
| Location | `dealership.city, dealership.state` | Autocomplete input |
| Photos | `vehicle.images[].url` | Downloaded → uploaded via file input |

### 4.4 Anti-Detection Measures

1. **puppeteer-extra-plugin-stealth** — patches navigator, WebGL, etc.
2. **Randomized timing** — no fixed delays; use normal distribution around target ms
3. **Mouse movement** — simulate natural cursor paths between fields (bezier curves)
4. **Viewport variation** — slight randomization (±50px) per session
5. **Residential proxies** — rotate per FB account, sticky sessions
6. **Cookie refresh** — save updated cookies after every successful session
7. **Rate limiting** — max 5 posts per FB account per hour, max 20 per day
8. **User-agent rotation** — match real Chrome versions

### 4.5 Deletion Flow

When a vehicle is sold or a posting is manually deleted:

1. Job loads session, navigates to `fbListingUrl`
2. Clicks "Delete Listing" or "Mark as Sold"
3. Confirms deletion
4. Updates `Posting.deletedAt`
5. Emits `posting.deleted` event

---

## 5. Job Queue Design (BullMQ + Redis)

### 5.1 Queues

| Queue Name | Purpose | Concurrency | Rate Limit |
|------------|---------|-------------|------------|
| `posting` | FB posting jobs | 2 | 5/hr per FB account |
| `posting-delete` | FB listing removal | 1 | — |
| `listing-generate` | AI listing generation | 5 | 60/min (Claude API) |
| `image-process` | Download + optimize images | 10 | — |
| `session-validate` | Periodic FB session checks | 1 | — |
| `inventory-sync` | Future: DMS scraping | 1 | — |

### 5.2 Job Lifecycle

```
QUEUED → GENERATING → READY → POSTING → POSTED
                                  ↓
                               FAILED → (auto-retry up to 3x)
                                  ↓
                            CANCELLED (manual)
```

### 5.3 Posting Job Schema

```typescript
interface PostingJobData {
  postingId: string;
  vehicleId: string;
  fbAccountId: string;
  dealershipId: string;
  attempt: number;
}

interface PostingJobOptions {
  attempts: 3;
  backoff: {
    type: 'exponential';
    delay: 60_000;          // 1min, 2min, 4min
  };
  timeout: 300_000;         // 5 min max per job
  removeOnComplete: {
    age: 86400;             // keep completed jobs 24h
    count: 1000;
  };
  removeOnFail: {
    age: 604800;            // keep failed jobs 7 days
  };
}
```

### 5.4 Per-Account Rate Limiting

Implemented via BullMQ's `RateLimiter` + a Redis sorted set per FB account:

```typescript
// Before dispatching a posting job:
const key = `ratelimit:fb:${fbAccountId}`;
const hourAgo = Date.now() - 3600_000;

// Remove entries older than 1 hour
await redis.zremrangebyscore(key, 0, hourAgo);

// Count posts in last hour
const count = await redis.zcard(key);
if (count >= 5) {
  // Delay job to next available slot
  const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
  const delayMs = (parseInt(oldest[1]) + 3600_000) - Date.now();
  await postingQueue.add('post', data, { delay: delayMs });
} else {
  await redis.zadd(key, Date.now(), jobId);
  await postingQueue.add('post', data);
}
```

### 5.5 Scheduled & Bulk Posts

- `scheduledFor` on the Posting record → BullMQ `delay` option
- Bulk posts: staggered by `staggerMinutes` (default 5), each gets `delay: i * staggerMinutes * 60_000`
- Dashboard shows upcoming scheduled posts with cancel capability

---

## 6. WebSocket Events

Connection: `wss://api.lotview.io/ws?token=<jwt>`

Auth validated on connect. Connection scoped to `dealershipId` from JWT.
Uses `socket.io` for auto-reconnect + room management.

### 6.1 Server → Client Events

| Event | Payload | When |
|-------|---------|------|
| `posting.queued` | `{ postingId, vehicleId, jobId }` | Job enters queue |
| `posting.generating` | `{ postingId, vehicleId }` | AI listing generation started |
| `posting.ready` | `{ postingId, title, description }` | AI listing generated |
| `posting.posting` | `{ postingId, vehicleId }` | Puppeteer started |
| `posting.progress` | `{ postingId, step, total, message }` | Each step of the flow (e.g., "Filling vehicle details 4/7") |
| `posting.completed` | `{ postingId, fbListingUrl, fbListingId }` | Successfully posted |
| `posting.failed` | `{ postingId, error, attempt, willRetry }` | Posting failed |
| `posting.cancelled` | `{ postingId }` | Cancelled by user |
| `posting.deleted` | `{ postingId }` | Removed from FB |
| `session.invalid` | `{ fbAccountId, label }` | FB session expired/invalid |
| `vehicle.updated` | `{ vehicleId, changes }` | Vehicle data changed |
| `bulk.progress` | `{ bulkId, completed, total, failed }` | Bulk posting progress |

### 6.2 Client → Server Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `posting.cancel` | `{ postingId }` | Cancel a queued posting |
| `subscribe.vehicle` | `{ vehicleId }` | Get real-time updates for a specific vehicle |
| `unsubscribe.vehicle` | `{ vehicleId }` | Stop updates |

### 6.3 Room Structure

```
dealership:{dealershipId}          — all events for this dealership
dealership:{dealershipId}:vehicle:{vehicleId}  — per-vehicle updates
user:{userId}                      — user-specific notifications
```

---

## 7. Security Baseline

### 7.1 Authentication

- **JWT access tokens**: 15-minute expiry, signed with RS256 (asymmetric)
- **Refresh tokens**: 7-day expiry, stored as httpOnly secure cookie + DB record
- **Token rotation**: each refresh invalidates the old token family if reuse detected
- **Password hashing**: bcrypt, cost factor 12
- **Login rate limit**: 5 attempts per email per 15 minutes, then 30-minute lockout

### 7.2 Authorization (RBAC)

```typescript
const PERMISSIONS = {
  GM:            ['*'],                                      // everything
  SALES_MANAGER: ['vehicles.*', 'postings.*', 'fb-accounts.read', 'fb-accounts.validate', 'listings.*'],
  SALESPERSON:   ['vehicles.read', 'postings.create', 'postings.read', 'postings.cancel', 'listings.generate'],
} as const;
```

Enforced by middleware on every route. Tenant isolation (`dealershipId`) checked on every DB query.

### 7.3 Data Protection

| Data | Protection |
|------|-----------|
| Passwords | bcrypt (cost 12) |
| FB session cookies | AES-256-GCM, key from env `FB_SESSION_ENCRYPTION_KEY` |
| JWT signing | RS256 keypair, private key in env |
| API keys | SHA-256 hash stored; raw key shown once at creation |
| PII (emails, names) | Encrypted at rest via PostgreSQL TDE or column-level encryption |
| Vehicle images | S3 with private ACL, pre-signed URLs for access (1hr expiry) |

### 7.4 API Security

- **Rate limiting**: 100 req/min per user (general), 20 req/min for posting endpoints
- **CORS**: whitelist `*.lotview.io` + Chrome extension ID
- **Helmet**: standard security headers (HSTS, CSP, X-Frame-Options)
- **Input validation**: Zod schemas on every endpoint, reject unknown fields
- **Request size**: 10MB max (for image uploads), 1MB default
- **SQL injection**: Prisma parameterized queries (no raw SQL without explicit parameterization)

### 7.5 Chrome Extension Security

- Extension communicates only with `api.lotview.io` (declared in manifest permissions)
- JWT stored in `chrome.storage.session` (cleared on browser close)
- Content scripts have minimal permissions — only Facebook Marketplace and Craigslist domains
- No inline `eval()` or remote code execution
- CSP in manifest: `script-src 'self'`

### 7.6 Infrastructure

- **HTTPS everywhere** — TLS 1.2+ only
- **Environment variables** — no secrets in code or config files
- **Logging** — structured JSON logs (Pino), no PII in logs, no FB credentials
- **Error handling** — generic error messages to client, detailed logs server-side
- **Audit trail** — all posting actions logged with userId, timestamp, IP

### 7.7 Facebook-Specific Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Account ban | Rate limiting, human-like behavior, residential proxies |
| Session expiry | Periodic validation job, proactive user notification |
| Captcha/challenge | Screenshot + fail gracefully, notify user to re-auth |
| FB DOM changes | Selector abstraction layer, easy selector updates, monitoring |
| Legal/TOS | User accepts responsibility, sessions are their own FB accounts |

---

## 8. Project Structure

```
lotview/
├── apps/
│   ├── api/                        # Fastify backend
│   │   ├── src/
│   │   │   ├── server.ts           # Fastify app setup
│   │   │   ├── config.ts           # Env config (validated with Zod)
│   │   │   ├── routes/
│   │   │   │   ├── auth.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── vehicles.ts
│   │   │   │   ├── postings.ts
│   │   │   │   ├── fb-accounts.ts
│   │   │   │   ├── listings.ts
│   │   │   │   └── dealership.ts
│   │   │   ├── middleware/
│   │   │   │   ├── auth.ts         # JWT verification
│   │   │   │   ├── rbac.ts         # Role-based access
│   │   │   │   ├── tenant.ts       # Dealership isolation
│   │   │   │   └── rate-limit.ts
│   │   │   ├── services/
│   │   │   │   ├── vehicle.service.ts
│   │   │   │   ├── posting.service.ts
│   │   │   │   ├── listing-ai.service.ts
│   │   │   │   ├── fb-account.service.ts
│   │   │   │   └── dealership.service.ts
│   │   │   ├── workers/
│   │   │   │   ├── posting.worker.ts
│   │   │   │   ├── listing.worker.ts
│   │   │   │   ├── image.worker.ts
│   │   │   │   └── session-validate.worker.ts
│   │   │   ├── puppeteer/
│   │   │   │   ├── browser-pool.ts
│   │   │   │   ├── fb-poster.ts    # Core posting logic
│   │   │   │   ├── fb-selectors.ts # Centralized DOM selectors
│   │   │   │   ├── fb-field-map.ts # Vehicle → FB field mapping
│   │   │   │   ├── human-like.ts   # Delays, mouse movement, typing
│   │   │   │   └── screenshot.ts   # Audit screenshots
│   │   │   ├── lib/
│   │   │   │   ├── prisma.ts       # Prisma client singleton
│   │   │   │   ├── redis.ts        # Redis client
│   │   │   │   ├── queues.ts       # BullMQ queue definitions
│   │   │   │   ├── websocket.ts    # Socket.io setup
│   │   │   │   ├── encryption.ts   # AES-256-GCM for FB sessions
│   │   │   │   ├── jwt.ts          # Token generation/verification
│   │   │   │   └── s3.ts           # Image storage
│   │   │   └── schemas/            # Zod validation schemas
│   │   │       ├── auth.schema.ts
│   │   │       ├── vehicle.schema.ts
│   │   │       ├── posting.schema.ts
│   │   │       └── ...
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── web/                        # Next.js frontend (future)
│   └── extension/                  # Chrome extension (future)
├── packages/
│   └── shared/                     # Shared types, constants
│       ├── types.ts
│       └── constants.ts
├── docker-compose.yml              # PostgreSQL + Redis for dev
├── package.json                    # Monorepo root (pnpm workspaces)
└── turbo.json                      # Turborepo config
```

---

## 9. Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/lotview

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_PRIVATE_KEY=<RS256 private key, base64>
JWT_PUBLIC_KEY=<RS256 public key, base64>

# Facebook Session Encryption
FB_SESSION_ENCRYPTION_KEY=<32-byte hex string>

# Anthropic Claude
ANTHROPIC_API_KEY=sk-ant-...

# S3 (images)
S3_ENDPOINT=https://...
S3_BUCKET=lotview-images
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_REGION=us-west-2

# Proxy (residential, for Puppeteer)
PROXY_HOST=...
PROXY_PORT=...
PROXY_USER=...
PROXY_PASS=...

# App
NODE_ENV=production
PORT=3001
CORS_ORIGINS=https://app.lotview.io,https://lotview.io
LOG_LEVEL=info
```

---

## 10. Deployment (MVP)

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Vercel      │     │   Railway     │     │   Railway     │
│   Next.js     │────▶│   Fastify API │────▶│   PostgreSQL  │
│   Frontend    │     │   + Workers   │     │   + Redis     │
└──────────────┘     │   + Puppeteer │     └──────────────┘
                     └──────────────┘
                            │
                     ┌──────────────┐
                     │  S3 / R2     │
                     │  (images)    │
                     └──────────────┘
```

- **API + Workers**: single Railway service initially (split workers later if needed)
- **Puppeteer on Railway**: works with `@sparticuz/chromium` or Docker with Chrome installed
- **Scale path**: when posting volume grows, split Puppeteer workers to dedicated GPU-less VMs with more RAM

---

## Appendix A: AI Listing Prompt Template

```
You are writing a Facebook Marketplace vehicle listing for a car dealership.

Vehicle:
- {{year}} {{make}} {{model}} {{trim}}
- {{mileage}} miles
- {{exteriorColor}} exterior
- {{condition}}
- Features: {{features}}
- Notes: {{notes}}

Dealership: {{dealershipName}}, {{city}}, {{state}}

Rules:
1. Title: {{year}} {{make}} {{model}} {{trim}} — highlight one key selling point
2. Description: 3-4 short paragraphs. Lead with the strongest selling point.
3. Use specific numbers (mileage, features count)
4. Include a call to action: "Call or message us at {{dealershipName}} to schedule a test drive."
5. Never use the words: "disrupt", "synergy", "leverage"
6. Tone: professional, direct, no hype. Write like a seasoned dealer, not a marketer.
7. Do NOT include price in the description (FB has a separate price field)
8. Max 1000 characters for description
```

---

## Appendix B: Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `AUTH_TOKEN_EXPIRED` | 401 | JWT expired |
| `AUTH_REFRESH_REVOKED` | 401 | Refresh token was revoked (possible theft) |
| `AUTH_RATE_LIMITED` | 429 | Too many login attempts |
| `FORBIDDEN` | 403 | Role doesn't have permission |
| `TENANT_MISMATCH` | 403 | Accessing another dealership's data |
| `VEHICLE_NOT_FOUND` | 404 | Vehicle doesn't exist or wrong tenant |
| `POSTING_ALREADY_ACTIVE` | 409 | Vehicle already has an active FB posting |
| `FB_SESSION_INVALID` | 422 | Facebook session expired, re-auth needed |
| `FB_RATE_LIMITED` | 429 | Too many posts to FB, try later |
| `FB_POSTING_FAILED` | 502 | Puppeteer couldn't complete the posting |
| `AI_GENERATION_FAILED` | 502 | Claude API error |
| `VALIDATION_ERROR` | 400 | Request body failed Zod validation |
