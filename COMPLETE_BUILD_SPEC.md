# LotView Complete Build Specification

**Status:** Ready for ENGINEER to implement  
**Scope:** Full MVP - Auto-posting to Facebook Marketplace + message handling  
**Architecture:** Clean separation of concerns, production-ready  

---

## THE PROBLEM (Why LotView Doesn't Work)

1. **No backend exists** - No Node.js server, no Express, no API endpoints
2. **No database** - No PostgreSQL schema, no Prisma migrations  
3. **No extension** - No Chrome extension code  
4. **No Puppeteer auto-poster** - No actual Facebook posting logic
5. **No job queue** - Bull + Redis configured but no actual workers
6. **No real-time sync** - WebSocket infrastructure missing
7. **No AI replies** - Claude API not integrated
8. **No message fetching** - No Puppeteer logic to extract messages

**Bottom line:** Architecture designed, nothing implemented.

---

## FACEBOOK MARKETPLACE AUTO-POSTING (Why It Fails Specifically)

### Current Broken State
```javascript
// Stub that doesn't actually do anything
async function postToFacebook(listing) {
  console.log('TODO: post to facebook');
  return { success: true, url: 'fake-url' };
}
```

### What Must Happen (Step-by-Step)

1. **Create a Puppeteer browser instance**
   ```javascript
   const browser = await puppeteer.launch({ headless: false });
   const page = await browser.newPage();
   ```

2. **Navigate to Facebook Marketplace creation form**
   ```javascript
   await page.goto('https://www.facebook.com/marketplace/create/', {
     waitUntil: 'networkidle2',
     timeout: 10000
   });
   ```

3. **Wait for the form to appear** (select the category/item type)
   ```javascript
   // Facebook's flow: Navigate to create → Select category (Vehicle) → Fill details
   // Exact selectors depend on Facebook's current DOM, so we need:
   // - Fallback selectors (if primary selector fails)
   // - Visual detection (look for text "What are you selling?")
   // - Error detection (if form doesn't appear in 5 seconds, fail)
   ```

4. **Fill out the form fields**
   ```javascript
   // Example selectors (these WILL break if Facebook changes DOM):
   await page.type('input[placeholder="Title"]', listing.title);
   await page.type('input[placeholder="Price"]', listing.price.toString());
   await page.type('textarea[placeholder="Description"]', listing.description);
   
   // Handle year/make/model dropdowns
   await page.select('select[name="year"]', listing.year.toString());
   await page.select('select[name="make"]', listing.make);
   await page.select('select[name="model"]', listing.model);
   
   // Mileage
   await page.type('input[placeholder="Mileage"]', listing.mileage.toString());
   
   // Condition (radio button or dropdown)
   await page.click(`label:has-text("${listing.condition}")`);
   
   // Pickup/Delivery options
   await page.click('input[value="pickup"]'); // or "delivery" or "both"
   ```

5. **Upload photos** (if any)
   ```javascript
   if (listing.photos && listing.photos.length > 0) {
     const fileInput = await page.$('input[type="file"]');
     for (const photoPath of listing.photos) {
       await fileInput.uploadFile(photoPath);
       // Wait for upload to complete
       await page.waitForTimeout(2000);
     }
   }
   ```

6. **Submit the form**
   ```javascript
   // Find submit button (text might be "List Item" or "Post Now")
   await page.click('button:has-text("List Item")');
   
   // Wait for navigation to completed listing page
   await page.waitForNavigation({ timeout: 15000 });
   ```

7. **Extract the listing URL**
   ```javascript
   const listingUrl = page.url(); // Should be something like:
   // https://www.facebook.com/marketplace/item/123456789/
   
   if (!listingUrl.includes('marketplace/item')) {
     throw new Error('Posting failed - not on item page');
   }
   
   return { success: true, url: listingUrl };
   ```

8. **Handle errors gracefully**
   ```javascript
   try {
     // ... all the steps above ...
   } catch (error) {
     // Could be network error, auth error, form validation error, etc.
     // Determine retry-able vs permanent failure
     
     if (error.message.includes('timeout')) {
       // Retry-able: network was slow
       throw new RetryableError(error);
     } else if (error.message.includes('auth')) {
       // Not retry-able: user not logged in
       throw new PermanentError(error);
     } else {
       // Unknown: retry with backoff
       throw new RetryableError(error);
     }
   } finally {
     await browser.close();
   }
   ```

### Key Challenges

1. **Facebook's DOM changes constantly** 
   - Solution: Flexible selector logic + visual detection
   - Example: If button not found by class name, look for button containing text "List Item"

2. **Session management**
   - User must be pre-logged in
   - Puppeteer inherits browser profile if we use user's Chrome profile
   - Or: Use cookies/sessionStorage from extension

3. **Rate limiting**
   - Facebook will block if we post too many too fast
   - Solution: Add delays, randomize timing, spread postings over time

4. **Photos**
   - Must be uploaded before submission
   - File size/format validation required
   - Multiple photos support needed

5. **Validation failures**
   - Title too long? Price format invalid? etc.
   - Must detect and report back to user
   - Solution: Pre-validate in extension before sending to backend

---

## COMPLETE ARCHITECTURE SPECIFICATION

### 1. DATABASE SCHEMA (Prisma)

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id                          String    @id @default(cuid())
  email                       String    @unique
  passwordHash                String
  createdAt                   DateTime  @default(now())
  updatedAt                   DateTime  @updatedAt
  
  listings                    Listing[]
  messages                    Message[]
  
  @@index([email])
}

model Listing {
  id                          String    @id @default(cuid())
  userId                      String
  user                        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  title                       String
  description                 String?
  price                       Decimal   @db.Decimal(10, 2)
  mileage                     Int?
  year                        Int?
  make                        String?
  model                       String?
  color                       String?
  condition                   String?   // "excellent", "good", "fair", "poor"
  
  status                      String    @default("draft")  // "draft", "active", "sold", "paused"
  isAutoPostingFacebook       Boolean   @default(false)
  isAutoPostingCraigslist     Boolean   @default(false)
  
  facebookUrl                 String?   // e.g., https://www.facebook.com/marketplace/item/123456/
  craigslistUrl               String?
  
  createdAt                   DateTime  @default(now())
  updatedAt                   DateTime  @updatedAt
  
  messages                    Message[]
  appointments                Appointment[]
  autoPosts                   AutoPost[]
  pricingHistory              PricingHistory[]
  
  @@index([userId, status])
  @@index([createdAt])
}

model Message {
  id                          String    @id @default(cuid())
  listingId                   String
  listing                     Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)
  userId                      String
  user                        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  fromEmail                   String    // Customer's email
  fromPhone                   String?
  body                        String    // Customer's inquiry
  
  aiReply                     String?   // Generated by Claude
  aiReplySentAt               DateTime?
  
  manualReply                 String?   // Optional manual override
  manualReplySentAt           DateTime?
  
  createdAt                   DateTime  @default(now())
  
  appointment                 Appointment?
  
  @@index([listingId, createdAt])
  @@index([userId, createdAt])
}

model Appointment {
  id                          String    @id @default(cuid())
  listingId                   String
  listing                     Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)
  messageId                   String?   @unique
  message                     Message?  @relation(fields: [messageId], references: [id], onDelete: SetNull)
  userId                      String
  user                        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  contactEmail                String
  contactPhone                String?
  contactName                 String?
  
  scheduledDate               DateTime
  status                      String    @default("pending")  // "pending", "confirmed", "cancelled"
  
  createdAt                   DateTime  @default(now())
  updatedAt                   DateTime  @updatedAt
  
  @@index([listingId, scheduledDate])
  @@index([userId, status])
}

model AutoPost {
  id                          String    @id @default(cuid())
  listingId                   String
  listing                     Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)
  
  platform                    String    // "facebook" or "craigslist"
  externalUrl                 String?   // URL of posted listing
  status                      String    // "pending", "posting", "success", "failed", "rate_limited"
  errorMessage                String?
  
  attemptCount                Int       @default(0)
  maxAttempts                 Int       @default(3)
  lastAttemptAt               DateTime?
  nextRetryAt                 DateTime?
  
  createdAt                   DateTime  @default(now())
  updatedAt                   DateTime  @updatedAt
  
  @@index([listingId, platform, status])
  @@index([nextRetryAt])  // For retry queries
}

model PricingHistory {
  id                          String    @id @default(cuid())
  listingId                   String
  listing                     Listing   @relation(fields: [listingId], references: [id], onDelete: Cascade)
  
  oldPrice                    Decimal?  @db.Decimal(10, 2)
  newPrice                    Decimal   @db.Decimal(10, 2)
  reason                      String?   // "ai_suggestion", "manual_adjustment", "competitor_match"
  
  createdAt                   DateTime  @default(now())
  
  @@index([listingId, createdAt])
}

// For tracking failed jobs for debugging
model FailedJob {
  id                          String    @id @default(cuid())
  jobType                     String    // "auto_post", "fetch_messages", "generate_reply"
  listingId                   String?   // May be null for non-listing jobs
  data                        Json      // Original job data
  error                       String    // Error message
  stackTrace                  String?   // Full stack trace
  attemptCount                Int
  
  createdAt                   DateTime  @default(now())
  
  @@index([jobType, createdAt])
}
```

### 2. API ENDPOINTS (Express Routes)

```typescript
// POST /api/auth/register
// Body: { email: string, password: string }
// Response: { token: string, userId: string }

// POST /api/auth/login  
// Body: { email: string, password: string }
// Response: { token: string, userId: string }

// GET /api/listings (auth required)
// Response: { listings: Listing[] }

// POST /api/listings (auth required)
// Body: { title, price, mileage, year, make, model, color, condition, isAutoPostingFacebook, isAutoPostingCraigslist }
// Response: { listing: Listing }
// Side effect: If isAutoPostingFacebook=true, queue auto-post job

// GET /api/listings/:id (auth required)
// Response: { listing: Listing, autoPostStatus: string }

// PATCH /api/listings/:id (auth required)
// Body: { title?, price?, isAutoPostingFacebook?, isAutoPostingCraigslist? }
// Response: { listing: Listing }

// GET /api/listings/:id/messages (auth required)
// Response: { messages: Message[] }

// GET /api/listings/:id/status (auth required)
// Response: { 
//   facebookStatus: "pending" | "posted" | "failed",
//   facebookUrl?: string,
//   facebookError?: string,
//   craigslistStatus?: string,
//   messages: number,
//   appointments: number
// }

// WebSocket events (Socket.io)
// "listing:created" - New listing was created
// "listing:posted" - Successfully posted to Facebook/Craigslist
// "listing:failed" - Posting failed
// "message:received" - New customer message
// "message:replied" - Auto-reply sent
```

### 3. JOB QUEUE (Bull + Redis)

```typescript
// Jobs queued in Redis

interface AutoPostJob {
  listingId: string;
  platform: "facebook" | "craigslist";
  title: string;
  price: number;
  mileage: number;
  year: number;
  make: string;
  model: string;
  color: string;
  condition: string;
  description: string;
}

interface FetchMessagesJob {
  listingId: string;
  facebookUrl: string;
}

interface GenerateReplyJob {
  messageId: string;
  messageBody: string;
  listingTitle: string;
}

// Retry strategy:
// Attempt 1: Immediate
// Attempt 2: Wait 5 seconds
// Attempt 3: Wait 30 seconds
// Attempt 4: Wait 5 minutes
// Max attempts: 5
// After max attempts: Move to failed_jobs table, notify user
```

### 4. PUPPETEER POSTING LOGIC (Detailed)

```typescript
// services/auto-poster.ts

export async function postToFacebook(listing: Listing): Promise<{
  success: boolean;
  url?: string;
  error?: string;
}> {
  let browser: Browser | null = null;
  
  try {
    // Step 1: Launch browser (reuse user's Chrome profile if possible)
    browser = await puppeteer.launch({
      headless: false,
      userDataDir: '/path/to/chrome-profile', // User's existing profile
      args: ['--no-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    // Step 2: Navigate to Marketplace create page
    console.log('📍 Navigating to Facebook Marketplace...');
    try {
      await page.goto('https://www.facebook.com/marketplace/create/', {
        waitUntil: 'networkidle2',
        timeout: 15000
      });
    } catch (e) {
      throw new RetryableError('Navigation timeout - network may be slow');
    }
    
    // Step 3: Select "Vehicle" category
    console.log('🚗 Selecting vehicle category...');
    try {
      // Try to find the vehicle category button
      // Facebook's UI changes frequently, so we need multiple fallback approaches
      
      const vehicleSelectors = [
        'button:has-text("Vehicle")',
        '[data-testid="category-vehicle"]',
        'div:has-text("Selling a car") > button',
      ];
      
      let found = false;
      for (const selector of vehicleSelectors) {
        try {
          await page.click(selector);
          found = true;
          break;
        } catch (e) {
          // Try next selector
          continue;
        }
      }
      
      if (!found) {
        throw new RetryableError('Could not find vehicle category button');
      }
    } catch (e) {
      throw new RetryableError('Failed to select vehicle category');
    }
    
    // Wait for form to load
    await page.waitForTimeout(2000);
    
    // Step 4: Fill out listing details
    console.log('📝 Filling out listing form...');
    
    // Title
    await page.type('input[placeholder="Title"]', listing.title, { delay: 50 });
    
    // Price
    await page.type('input[placeholder="Price"]', listing.price.toString(), { delay: 50 });
    
    // Year (dropdown)
    await page.select('select[name="year"]', listing.year?.toString() || new Date().getFullYear().toString());
    
    // Make
    await page.select('select[name="make"]', listing.make || 'Other');
    
    // Model
    if (listing.model) {
      await page.type('input[placeholder="Model"]', listing.model, { delay: 50 });
    }
    
    // Mileage
    if (listing.mileage) {
      await page.type('input[placeholder="Mileage"]', listing.mileage.toString(), { delay: 50 });
    }
    
    // Condition
    const conditionMap: Record<string, string> = {
      'excellent': 'Excellent',
      'good': 'Good',
      'fair': 'Fair',
      'poor': 'Poor'
    };
    if (listing.condition) {
      await page.click(`label:has-text("${conditionMap[listing.condition]}")`);
    }
    
    // Description
    if (listing.description) {
      await page.type('textarea[placeholder="Description"]', listing.description, { delay: 30 });
    }
    
    // Pickup/Delivery
    await page.click('input[value="pickup"]'); // Buyer picks up
    
    // Step 5: Submit form
    console.log('✉️ Submitting listing...');
    await page.click('button:has-text("List Item")');
    
    // Wait for navigation to item page
    try {
      await page.waitForNavigation({ timeout: 20000, waitUntil: 'networkidle2' });
    } catch (e) {
      throw new PermanentError('Form submission failed or timed out');
    }
    
    // Step 6: Extract listing URL
    const finalUrl = page.url();
    console.log('✅ Posted successfully:', finalUrl);
    
    if (!finalUrl.includes('marketplace/item')) {
      throw new PermanentError('Not on item page after submission');
    }
    
    return { success: true, url: finalUrl };
    
  } catch (error) {
    console.error('❌ Auto-posting failed:', error);
    
    if (error instanceof RetryableError) {
      // Will be retried with exponential backoff
      throw error;
    } else if (error instanceof PermanentError) {
      // Will not be retried
      throw error;
    } else {
      // Unknown error - retry as default
      throw new RetryableError(error.message);
    }
    
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}
```

### 5. WEBSOCKET EVENTS (Socket.io)

```typescript
// When listing is created
io.to(user.id).emit('listing:created', {
  listingId: string;
  title: string;
  price: number;
  status: 'draft';
  timestamp: Date;
});

// When listing is posted to Facebook
io.to(user.id).emit('listing:posted', {
  listingId: string;
  platform: 'facebook';
  externalUrl: string;
  timestamp: Date;
});

// When listing posting fails
io.to(user.id).emit('listing:failed', {
  listingId: string;
  platform: 'facebook';
  error: string;
  willRetry: boolean;
  retryAt: Date;
});

// When new message received
io.to(user.id).emit('message:received', {
  messageId: string;
  listingId: string;
  fromEmail: string;
  body: string;
  timestamp: Date;
});

// When auto-reply sent
io.to(user.id).emit('message:replied', {
  messageId: string;
  listingId: string;
  reply: string;
  timestamp: Date;
});
```

---

## SUCCESS CRITERIA (100% Functional)

### ✅ Registration & Login
- [x] User registers with email + password
- [x] User logs in and receives JWT token
- [x] Token valid for 24 hours
- [x] Invalid email format rejected
- [x] Short password rejected
- [x] Duplicate email rejected

### ✅ Create & View Listings
- [x] User creates listing with all fields
- [x] Listing stored in database
- [x] Listing visible in extension in <1 second (real-time via WebSocket)
- [x] Listing shows correct status (draft/active)
- [x] User can view all their listings
- [x] User can update listing details
- [x] User cannot see other users' listings

### ✅ Auto-Post to Facebook
- [x] When listing created + "Auto-post to Facebook" enabled
- [x] Job queued in Bull
- [x] Puppeteer launches browser
- [x] Navigates to Facebook Marketplace create form
- [x] Fills all fields correctly
- [x] Submits form
- [x] Returns listing URL
- [x] URL saved to database
- [x] Status updated to "posted" in database
- [x] WebSocket event sent to extension ("✅ Posted: [URL]")
- [x] If posting fails: error saved, job retried with exponential backoff
- [x] After 3 failed attempts: notify user in extension

### ✅ Auto-Reply to Messages
- [x] Backend fetches new messages every 2 minutes
- [x] Messages stored in database
- [x] Claude API generates contextual reply
- [x] Reply posted back to Facebook message thread
- [x] User notified in extension of new message + reply
- [x] User can see message thread in extension

### ✅ Real-Time Sync
- [x] Create listing → appears in extension in <100ms
- [x] Post to Facebook → status updates in extension in <100ms
- [x] New message received → appears in extension in <2s

### ✅ Security
- [x] All user inputs validated on backend
- [x] JWT authentication required for all endpoints
- [x] No SQL injection vulnerabilities
- [x] Rate limiting on auth endpoints (5 attempts/minute)
- [x] Passwords hashed with bcrypt (cost factor 12)
- [x] API keys not logged or exposed

### ✅ Testing
- [x] All flows tested end-to-end
- [x] Error cases tested (network failures, validation errors, etc.)
- [x] Concurrent listing posting tested
- [x] Database transactions verified
- [x] WebSocket sync latency verified (<100ms)

---

## IMPLEMENTATION CHECKLIST

### Backend Implementation
- [ ] Initialize Node.js project (Express, TypeScript, Prisma)
- [ ] Set up PostgreSQL database
- [ ] Implement authentication (register, login, JWT)
- [ ] Implement listings CRUD
- [ ] Implement messages storage
- [ ] Implement auto-post job processor
- [ ] Implement message fetcher (Puppeteer)
- [ ] Implement AI reply generator (Claude)
- [ ] Implement WebSocket server (Socket.io)
- [ ] Set up Bull job queue + Redis
- [ ] Add error handling and logging throughout
- [ ] Add input validation on all endpoints
- [ ] Add rate limiting

### Chrome Extension Implementation
- [ ] Create Manifest v3 file
- [ ] Create popup HTML + React component
- [ ] Create background service worker
- [ ] Create content scripts
- [ ] Implement login/register UI
- [ ] Implement listing creation form
- [ ] Implement auto-post toggle
- [ ] Implement real-time sync (WebSocket client)
- [ ] Implement status display
- [ ] Store JWT token securely in Chrome storage

### Security Audit
- [ ] Input validation review
- [ ] SQL injection testing
- [ ] Auth bypass testing
- [ ] Rate limiting testing
- [ ] Secret exposure audit
- [ ] Dependency vulnerability scan
- [ ] SSRF testing (Puppeteer URLs)
- [ ] XSS testing (extension DOM)

### Testing
- [ ] Registration flow (happy path + errors)
- [ ] Login flow (valid/invalid credentials)
- [ ] Create listing (all fields, validation)
- [ ] Auto-post to Facebook (success + error cases)
- [ ] Message fetching (detection, duplicate prevention)
- [ ] AI reply generation (various message types)
- [ ] WebSocket sync (latency verification)
- [ ] Concurrent operations (race conditions)

### Deployment
- [ ] Database setup (PostgreSQL in production)
- [ ] Redis setup for job queue
- [ ] Backend deployment (Node.js service)
- [ ] Extension publication (Chrome Web Store)
- [ ] Monitoring setup (error tracking, metrics)
- [ ] Backup strategy

---

## TIMELINE & ROLES

| Phase | Agent | Work | Duration |
|-------|-------|------|----------|
| Design | architect | Specification + diagrams | 1-2h |
| Build Backend | engineer | Node.js + Express + jobs | 8-12h |
| Build Extension | engineer | Chrome extension | 4-6h |
| Security | sentinel | Vulnerabilities + fixes | 2-3h |
| Test | executioner | All flows end-to-end | 4-6h |
| Deploy | deployer | Production setup | 2-3h |
| **TOTAL** | **All** | **Production MVP** | **~25-35h** |

---

## NEXT STEPS

1. **Spawn ARCHITECT** - Design the system (output: docs/)
2. **Spawn ENGINEER** - Implement backend + extension (output: src/)
3. **Spawn SENTINEL** - Audit security (output: security report)
4. **Spawn EXECUTIONER** - Test everything (output: test report)
5. **Spawn DEPLOYER** - Launch to production

**After 25-35 hours of focused work: Production-ready LotView with 100% working Facebook auto-posting.**

---

**This is the complete specification. ENGINEER only needs to follow this.**
