# LotView Diagnosis & Full Build Plan

**Date:** 2026-02-23  
**Status:** Zero codebase. Starting from scratch with complete clarity.  
**Goal:** World-class, production-ready auto-posting system with 100% Facebook Marketplace integration.

---

## The Problem

**Current state:** Project exists in structure only. No code. No backend. No extension. No auto-posting.

**Why it's broken:**
- No backend implementation at all
- No Chrome extension at all
- No Puppeteer auto-posting logic
- No job queue execution
- No real Facebook Marketplace integration
- No message fetching
- No AI reply generation
- No database schema
- No API endpoints
- No authentication system
- No data models

**The gap:** Between "architecture designed" and "actually works."

---

## What LotView Must Do (MVP Scope)

### Core Feature: Auto-Post to Facebook Marketplace

1. **User logs into LotView** (extension)
   - Email + password authentication
   - JWT token stored in Chrome local storage
   
2. **User creates a listing** (via extension or backend)
   - Form: Title, Price, Mileage, Year, Make, Model, Color, Description
   - Backend stores in PostgreSQL
   - Real-time sync to extension via WebSocket
   
3. **User toggles auto-post** (in extension Settings)
   - Checkbox: "Auto-post to Facebook Marketplace"
   - Checkbox: "Auto-post to Craigslist" (phase 2)
   - Toggles saved to Chrome local storage
   
4. **Backend triggers auto-posting** (via job queue)
   - When listing created AND auto-post enabled
   - Puppeteer launches browser
   - Uses existing Facebook Marketplace session (user pre-logged in)
   - Navigates to: https://www.facebook.com/marketplace/create/
   - Fills form: title, price, mileage, description, photos
   - Submits listing
   - Returns: listing URL
   
5. **Extension shows status** (real-time)
   - "✅ Posted to Facebook: [URL]"
   - Or "⚠️ Posting failed, retrying..."
   - Or "❌ Posting failed permanently"

### Secondary Feature: Message Auto-Reply (Phase 1b)

1. **Backend fetches messages** (scheduled every 2 minutes)
   - Puppeteer navigates to Facebook Marketplace
   - Reads incoming messages on listings
   - Stores in `messages` table with `replied = false`
   
2. **AI generates reply** (via Claude API)
   - Analyzes message content
   - Generates contextual response
   - Examples: schedule test drive, answer pricing question, confirm availability
   
3. **Backend posts reply** (via Puppeteer)
   - Navigates to message thread
   - Submits AI-generated reply
   - Marks message as `replied = true` with timestamp

### Tertiary Feature: Pricing Intelligence (Phase 2)

1. **Dashboard shows demand score** (0-10)
2. **AI suggests price adjustments** based on:
   - Similar vehicles in same market
   - Days on lot
   - Inquiry volume
   - Competitor pricing
3. **User can manually adjust** or auto-adjust

---

## Why Facebook Marketplace Auto-Posting Fails Currently

**Root cause:** Puppeteer doesn't know:
1. **Where to navigate** - What's the exact URL for creating a listing?
2. **What form fields exist** - What are the CSS selectors for each field?
3. **How to fill them** - What format for price, mileage, etc.?
4. **How to detect errors** - When does submission fail? How to retry?
5. **How to get the result** - What URL is the listing posted to?
6. **How to handle auth** - What if session expires?

**Current broken approach:** Backend probably has stubs like:
```javascript
async function postToFacebook(listing) {
  console.log('Posting:', listing.title);
  // TODO: implement puppeteer
  return { success: true };
}
```

**What we need:**
```javascript
async function postToFacebook(listing) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // STEP 1: Navigate
  await page.goto('https://www.facebook.com/marketplace/create/');
  
  // STEP 2: Detect form structure
  const selectors = await detectFormSelectors(page);
  // → { titleInput, priceInput, mileageInput, descriptionInput, submitButton }
  
  // STEP 3: Fill form
  await page.type(selectors.titleInput, listing.title);
  await page.type(selectors.priceInput, listing.price.toString());
  // ... etc
  
  // STEP 4: Upload photos (if any)
  if (listing.photos) {
    await uploadPhotos(page, listing.photos);
  }
  
  // STEP 5: Submit
  await page.click(selectors.submitButton);
  await page.waitForNavigation();
  
  // STEP 6: Extract result URL
  const listingUrl = page.url();
  
  // STEP 7: Cleanup
  await browser.close();
  
  return { success: true, listingUrl };
}
```

---

## Build Plan (Sequential Pipeline)

### Phase 0: Specification & Architecture (ARCHITECT)
**Agent:** architect  
**Time:** 1-2 hours  
**Output:** `docs/ARCHITECTURE.md`

Must define:
1. System architecture (services, data flow, failure modes)
2. Database schema (users, listings, messages, auto_posts, pricing_history)
3. API contract (all endpoints, request/response shapes)
4. Job queue structure (posting jobs, retry logic, exponential backoff)
5. Puppeteer flow (exact steps to post on Facebook)
6. Error handling strategy
7. Observability (logging, metrics, alerts)

### Phase 1: Backend Implementation (ENGINEER)
**Agent:** engineer  
**Time:** 8-16 hours  
**Output:** Production-ready Node.js backend

Must build:
1. Authentication (register, login, JWT)
2. Database (PostgreSQL schema, migrations via Prisma)
3. API endpoints:
   - POST /auth/register
   - POST /auth/login
   - GET/POST /listings
   - GET/PATCH /listings/:id
   - GET/POST /listings/:id/messages
   - GET/POST /appointments
4. Job queue (Bull + Redis):
   - auto-post-to-facebook job
   - fetch-messages job
   - generate-reply job
5. Services:
   - Puppeteer auto-poster (with exact Facebook form logic)
   - AI reply generator (Claude API integration)
   - Message fetcher
6. WebSocket server (Socket.io):
   - Real-time listing updates
   - Real-time posting status
7. Error handling & logging throughout

### Phase 2: Chrome Extension Implementation (ENGINEER)
**Agent:** engineer  
**Time:** 4-8 hours  
**Output:** Production-ready extension

Must build:
1. Authentication UI (register/login forms)
2. Dashboard (listings list, create button)
3. Settings (auto-post toggles per platform)
4. Real-time sync (WebSocket listener)
5. Status display (posting progress, messages)
6. Background service worker (heartbeat, notifications)
7. Content scripts (detect when on Facebook/Craigslist)

### Phase 3: Security Audit (SENTINEL)
**Agent:** sentinel  
**Time:** 2-4 hours  
**Output:** Vulnerability report + fixes

Must audit:
1. Input validation (all API inputs)
2. SQL injection (Prisma usage)
3. Auth bypass (JWT, session management)
4. Rate limiting (endpoints)
5. Secret exposure (API keys, connection strings)
6. Dependency vulnerabilities (npm audit)
7. SSRF (Puppeteer could be attacked)
8. XSS (extension DOM manipulation)
9. CSRF (form submissions)
10. Privilege escalation (user roles)

### Phase 4: End-to-End Testing (EXECUTIONER)
**Agent:** executioner  
**Time:** 4-8 hours  
**Output:** Test report + bug reproduction steps

Must test:
1. **Registration flow** (valid/invalid inputs, duplicate email, password strength)
2. **Authentication** (login, logout, JWT expiry, missing token)
3. **Create listing** (all fields, validation errors, max length, types)
4. **Auto-post to Facebook** (success case, error cases, network failures, retries)
5. **Message fetching** (new messages appear in extension, duplicate prevention)
6. **Auto-reply** (AI generates reasonable replies, posting succeeds)
7. **WebSocket sync** (create listing → appears in extension in <1s)
8. **Pricing** (demand score updates, AI suggestions)
9. **Error states** (network down, auth expired, posting failed)
10. **Concurrency** (multiple listings posting simultaneously)
11. **Data isolation** (dealership A doesn't see dealership B's listings)

### Phase 5: Production Deployment (DEPLOYER)
**Agent:** deployer  
**Time:** 2-4 hours  
**Output:** Live system

Must do:
1. Database migrations (prod PostgreSQL)
2. Environment setup (secrets, API keys)
3. Job queue startup (Bull workers, Redis)
4. Backend deployment (Node.js + Express)
5. Extension publication (Chrome Web Store)
6. Monitoring setup (error tracking, performance)
7. Backup strategy (database backups)

---

## Success Criteria

### ✅ Must Have (MVP)
- [x] User can register/login
- [x] User can create a listing
- [x] Listing syncs to extension in real-time
- [x] User can toggle "Auto-post to Facebook"
- [x] When listing created + auto-post enabled:
  - Puppeteer posts to Facebook Marketplace
  - Listing URL returned
  - Status shown in extension ("✅ Posted: [URL]")
- [x] Posting failures retry automatically (with exponential backoff)
- [x] All code passes security audit (zero critical/high vulns)
- [x] All flows tested end-to-end
- [x] System handles 1000 concurrent listings/day
- [x] <100ms API response times

### 🟡 Should Have (Phase 1b)
- [ ] Auto-fetch incoming messages
- [ ] AI-generate replies
- [ ] Auto-post replies
- [ ] Message tracking in dashboard

### 🔵 Nice to Have (Phase 2)
- [ ] Pricing intelligence
- [ ] Competitor analysis
- [ ] Dashboard with KPIs
- [ ] Craigslist auto-posting

---

## Timeline

| Phase | Agent | Duration | Owner |
|-------|-------|----------|-------|
| 0: Architecture | architect | 1-2h | Principal design |
| 1: Backend | engineer | 8-16h | Implementation |
| 2: Extension | engineer | 4-8h | Implementation |
| 3: Security | sentinel | 2-4h | Audit |
| 4: Testing | executioner | 4-8h | QA |
| 5: Deploy | deployer | 2-4h | DevOps |
| **Total** | **All** | **~30-50h** | **Production** |

**Estimated calendar time:** 1 week (working 8h/day, agents in parallel where possible)

---

## What Will Be Built

### Backend (Node.js + TypeScript)
```
src/
├── index.ts (Express server, Socket.io)
├── middleware/
│   ├── auth.ts (JWT verification)
│   ├── errors.ts (error handling)
│   └── logging.ts (structured logging)
├── routes/
│   ├── auth.ts (register, login)
│   ├── listings.ts (CRUD)
│   ├── messages.ts (fetch, send)
│   └── appointments.ts (book, view)
├── services/
│   ├── auto-poster.ts (Puppeteer for Facebook/Craigslist)
│   ├── ai-agent.ts (Claude API for replies)
│   ├── message-fetcher.ts (Puppeteer for messages)
│   ├── pricing-engine.ts (demand scoring)
│   └── database.ts (Prisma client)
├── jobs/
│   ├── auto-post.ts (Bull job processor)
│   ├── fetch-messages.ts (Bull job processor)
│   ├── generate-reply.ts (Bull job processor)
│   └── update-pricing.ts (Bull job processor)
├── models/
│   ├── user.ts (schema/types)
│   ├── listing.ts (schema/types)
│   ├── message.ts (schema/types)
│   └── appointment.ts (schema/types)
├── utils/
│   ├── encryption.ts (AES-256 for secrets)
│   └── validators.ts (input validation)
└── tests/
    ├── auth.test.ts
    ├── listings.test.ts
    ├── auto-poster.test.ts
    └── integration.test.ts

prisma/
├── schema.prisma (7 tables)
└── migrations/

docker-compose.yml
package.json
tsconfig.json
```

### Chrome Extension
```
extension/
├── manifest.json (Manifest v3)
├── popup.html (UI)
├── popup.tsx (React component)
├── background.ts (Service worker)
├── content.ts (Content script for Facebook/Craigslist)
├── styles/
│   └── popup.css
└── utils/
    ├── api-client.ts (HTTP wrapper)
    ├── storage.ts (Chrome storage)
    └── websocket.ts (Socket.io client)
```

### Database (PostgreSQL)
```
users (id, email, password_hash, created_at)
listings (id, user_id, title, price, status, created_at)
messages (id, listing_id, from_email, body, replied, created_at)
appointments (id, listing_id, scheduled_date, status, created_at)
auto_posts (id, listing_id, platform, status, external_url, created_at)
pricing_history (id, listing_id, old_price, new_price, reason, created_at)
failed_jobs (id, job_type, data, error, attempt_count, created_at)
```

---

## Next Steps

1. **Spawn ARCHITECT** to design the complete system
2. **Spawn ENGINEER** to implement backend + extension
3. **Spawn SENTINEL** to audit for security
4. **Spawn EXECUTIONER** to test everything
5. **Spawn DEPLOYER** to launch

**All happening today.**

---

**Current status:** Nothing works yet. We're about to build the entire system from scratch using the full agent pipeline. This will result in production-ready, tested, secure code.
