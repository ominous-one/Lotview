# LotView Build Execution Plan (Path A - Full Agent Pipeline)

**Status:** Ready to execute when OpenClaw gateway is available  
**Quality Gates:** SENTINEL (security) + EXECUTIONER (testing) required before deployment  
**Timeline:** ~30 hours of focused agent work  
**Target:** 100% production-ready, fully tested, security audited

---

## PHASE BREAKDOWN

### PHASE 0: ARCHITECTURE DESIGN (ARCHITECT AGENT)
**Duration:** 1-2 hours  
**Output Destination:** `~/projects/lotview/docs/`

**Spawn Command:**
```
agent: architect
task: Design the complete LotView MVP system for auto-posting to Facebook Marketplace

Output files required:
✅ ARCHITECTURE.md (20KB+, with Mermaid diagram)
✅ DATABASE_SCHEMA.prisma (copy-paste ready)
✅ API_CONTRACT.openapi.yaml (complete OpenAPI 3.0)
✅ PUPPETEER_FLOW.md (step-by-step Facebook posting with selectors)
✅ WEBSOCKET_EVENTS.md (all Socket.io events defined)
✅ JOB_QUEUE.md (Bull + Redis architecture)
✅ EXTENSION_ARCHITECTURE.md (Chrome extension design)
✅ SECURITY_BASELINE.md (security requirements)
✅ DEPLOYMENT.md (deployment strategy)

Handoff to ENGINEER: All 9 documents, zero ambiguity
```

**Success Criteria:**
- [ ] ARCHITECTURE.md exists and is detailed (no TODOs)
- [ ] DATABASE_SCHEMA.prisma has all 7 tables with constraints
- [ ] API_CONTRACT.openapi.yaml has every endpoint
- [ ] PUPPETEER_FLOW.md includes exact CSS selectors or detection logic
- [ ] WEBSOCKET_EVENTS.md defines every event
- [ ] SECURITY_BASELINE.md covers all attack vectors
- [ ] DEPLOYMENT.md is step-by-step executable

---

### PHASE 1: BACKEND IMPLEMENTATION (ENGINEER AGENT)
**Duration:** 8-12 hours  
**Output Destination:** `~/projects/lotview/src/backend/`

**Spawn Command:**
```
agent: engineer
task: Implement the LotView backend per ARCHITECTURE.md

Read these first:
- ~/projects/lotview/docs/ARCHITECTURE.md
- ~/projects/lotview/docs/DATABASE_SCHEMA.prisma
- ~/projects/lotview/docs/API_CONTRACT.openapi.yaml
- ~/projects/lotview/docs/PUPPETEER_FLOW.md
- ~/projects/lotview/docs/JOB_QUEUE.md

Build:
✅ Express.js server with TypeScript
✅ Prisma ORM + PostgreSQL schema
✅ 7 REST API endpoints (auth, listings, messages, appointments)
✅ Socket.io WebSocket server
✅ Bull job queue + Redis
✅ Puppeteer auto-posting service (exact implementation per PUPPETEER_FLOW.md)
✅ Claude API integration for AI replies
✅ Message fetching service (Puppeteer)
✅ Pricing engine service
✅ Error handling + structured logging throughout
✅ Input validation on all endpoints
✅ Rate limiting per SECURITY_BASELINE.md
✅ Full test suite (unit + integration)

Output structure:
src/backend/
├── package.json (all dependencies)
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml (PostgreSQL + Redis)
├── src/
│   ├── index.ts (Express + Socket.io server)
│   ├── middleware/
│   │   ├── auth.ts (JWT verification)
│   │   ├── errorHandler.ts
│   │   └── logging.ts
│   ├── routes/
│   │   ├── auth.ts (register, login)
│   │   ├── listings.ts (CRUD)
│   │   ├── messages.ts
│   │   └── appointments.ts
│   ├── services/
│   │   ├── auto-poster.ts (Puppeteer Facebook posting)
│   │   ├── message-fetcher.ts (Puppeteer messages)
│   │   ├── ai-agent.ts (Claude integration)
│   │   ├── pricing-engine.ts
│   │   └── database.ts (Prisma client)
│   ├── jobs/
│   │   ├── auto-post.ts (Bull processor)
│   │   ├── fetch-messages.ts
│   │   ├── generate-reply.ts
│   │   └── update-pricing.ts
│   ├── models/ (TypeScript types)
│   ├── utils/ (validators, encryption)
│   └── tests/ (comprehensive test suite)
├── prisma/
│   ├── schema.prisma (exact schema from ARCHITECT)
│   └── migrations/
└── .env.example

Deployment ready: Docker, environment variables, health checks
```

**Success Criteria:**
- [ ] `npm install && npm run build` completes with zero errors
- [ ] `npm run dev` starts server on port 3000
- [ ] All 7 API endpoints respond correctly
- [ ] POST /auth/register creates user in database
- [ ] POST /auth/login returns valid JWT
- [ ] POST /listings creates listing + queues auto-post job
- [ ] WebSocket connection establishes and receives events
- [ ] Bull jobs are created in Redis queue
- [ ] All test suites pass (`npm run test`)
- [ ] No TypeScript errors (`npm run build`)

---

### PHASE 2: CHROME EXTENSION IMPLEMENTATION (ENGINEER AGENT - SECOND SPAWN)
**Duration:** 4-6 hours  
**Output Destination:** `~/projects/lotview/src/extension/`

**Spawn Command:**
```
agent: engineer
task: Implement the LotView Chrome extension per EXTENSION_ARCHITECTURE.md

Read these first:
- ~/projects/lotview/docs/EXTENSION_ARCHITECTURE.md
- ~/projects/lotview/docs/API_CONTRACT.openapi.yaml (endpoints to call)
- ~/projects/lotview/docs/WEBSOCKET_EVENTS.md (events to listen for)
- Backend is deployed at http://localhost:3000 (for development)

Build:
✅ Manifest v3 configuration
✅ React popup component (register, login, create listing, view status)
✅ Background service worker (Socket.io listener, heartbeat)
✅ Content script (detect Facebook Marketplace, auto-fill helpers)
✅ WebSocket client (Socket.io)
✅ Chrome storage wrapper (JWT, preferences)
✅ API client wrapper (HTTP calls)
✅ Real-time status display
✅ Error handling + retry logic
✅ Full test suite

Output structure:
src/extension/
├── manifest.json (Manifest v3)
├── public/
│   ├── popup.html
│   ├── popup.css
│   └── icons/
├── src/
│   ├── popup.tsx (React component)
│   ├── background.ts (service worker)
│   ├── content.ts (content script)
│   ├── api/ (HTTP client)
│   ├── websocket/ (Socket.io client)
│   ├── storage/ (Chrome storage)
│   ├── types/ (TypeScript)
│   ├── utils/ (helpers)
│   └── tests/
├── package.json
├── tsconfig.json
├── webpack.config.js (or vite.config.ts)
└── .env.example

Can be tested locally by loading unpacked in Chrome
```

**Success Criteria:**
- [ ] `npm install && npm run build` completes with zero errors
- [ ] Extension loads in Chrome (Developer mode → Load unpacked)
- [ ] Popup displays with register/login form
- [ ] Can register new user (calls backend)
- [ ] Can login (stores JWT)
- [ ] Can create listing (calls backend)
- [ ] Listing appears in real-time (WebSocket sync)
- [ ] Auto-post toggle works
- [ ] Status updates in real-time ("✅ Posted")
- [ ] All test suites pass

---

### PHASE 3: SECURITY AUDIT (SENTINEL AGENT)
**Duration:** 2-3 hours  
**Output Destination:** `~/projects/lotview/docs/SECURITY_AUDIT.md`

**Spawn Command:**
```
agent: sentinel
task: Security audit of LotView backend + extension

Review:
- ~/projects/lotview/src/backend/ (all source code)
- ~/projects/lotview/src/extension/ (all source code)
- ~/projects/lotview/docs/SECURITY_BASELINE.md (requirements)

Audit for:
✅ Input validation (all endpoints, all fields)
✅ SQL injection (Prisma usage, raw queries)
✅ Authentication/authorization (JWT, role-based access)
✅ SSRF vulnerabilities (Puppeteer URLs)
✅ XSS vulnerabilities (extension DOM manipulation)
✅ CSRF vulnerabilities (state tokens)
✅ Rate limiting effectiveness
✅ Secret exposure (API keys, connection strings in code/logs)
✅ Dependency vulnerabilities (npm audit)
✅ Privilege escalation (user roles)
✅ Race conditions (concurrent operations)
✅ Session management (JWT expiry, refresh tokens)

Output: SECURITY_AUDIT.md with:
- Vulnerability list (critical/high/medium/low)
- Affected code locations
- Remediation steps
- Risk assessment
- Compliance notes (GDPR/CCPA if applicable)

Gate: Zero critical vulnerabilities required before deployment
```

**Success Criteria:**
- [ ] SECURITY_AUDIT.md created
- [ ] All critical vulnerabilities listed
- [ ] All high vulnerabilities listed with fixes
- [ ] Medium vulnerabilities documented
- [ ] No secrets exposed in code
- [ ] Dependencies have no known vulns (or documented)
- [ ] Rate limiting verified on sensitive endpoints

**QUALITY GATE:** If critical/high vulnerabilities found → Send back to ENGINEER to fix → Re-audit

---

### PHASE 4: END-TO-END TESTING (EXECUTIONER AGENT)
**Duration:** 4-6 hours  
**Output Destination:** `~/projects/lotview/docs/TEST_REPORT.md`

**Spawn Command:**
```
agent: executioner
task: Comprehensive end-to-end testing of LotView

Prerequisites:
- Backend running at http://localhost:3000
- Extension loaded in Chrome
- PostgreSQL + Redis running locally
- All SENTINEL security fixes applied

Test everything:

REGISTRATION & AUTH:
✅ Register with valid email/password
✅ Login with correct credentials
✅ Login with wrong password (should fail)
✅ Register with duplicate email (should fail)
✅ Register with weak password (should fail)
✅ JWT token stored in Chrome storage
✅ Token expires after 24 hours

LISTING CREATION:
✅ Create listing with all fields
✅ Listing appears in extension in <1 second
✅ Listing saved to database
✅ Create listing with invalid price (should fail)
✅ Create listing without title (should fail)
✅ Validate all field types (string, number, etc.)

AUTO-POSTING TO FACEBOOK:
✅ Toggle "Auto-post to Facebook" on
✅ Create new listing
✅ Within 2 seconds: job added to queue
✅ Within 5 seconds: Puppeteer posts to Facebook
✅ Listing URL captured and saved
✅ Extension shows "✅ Posted: [URL]"
✅ URL clickable and opens real Facebook listing

AUTO-POSTING FAILURE CASES:
✅ If Facebook form changes: fallback selectors work
✅ If network fails: retry with exponential backoff
✅ If max retries exceeded: user notified in extension
✅ Failed job logged in failed_jobs table

MESSAGE HANDLING:
✅ Fetch messages every 2 minutes
✅ Display new messages in extension
✅ Claude generates contextual reply
✅ Reply posted to Facebook message thread
✅ User notified "💬 New message + reply sent"
✅ Duplicate messages not created

REAL-TIME SYNC:
✅ Create listing → appears in extension (<100ms)
✅ Post to Facebook → status updates (<100ms)
✅ New message → appears in extension (<2s)
✅ Multiple concurrent listings sync correctly

PERFORMANCE:
✅ API responses <200ms (p95)
✅ WebSocket events <100ms (p95)
✅ Extension popup loads in <1s
✅ Database queries optimized (with indexes)

ERROR HANDLING:
✅ Network down → graceful degradation
✅ Database down → 503 Service Unavailable
✅ Invalid JWT → 401 Unauthorized
✅ Malformed JSON → 400 Bad Request
✅ Rate limited → 429 Too Many Requests

CONCURRENCY:
✅ 10 listings created simultaneously
✅ All posted to Facebook in order
✅ No duplicate postings
✅ Database transactions correct

Output: TEST_REPORT.md with:
- All test cases executed
- Pass/fail for each
- Performance metrics
- Bug reports (if any)
- Test coverage percentage
- Recommended fixes for any failures

Gate: 100% pass rate required before deployment
```

**Success Criteria:**
- [ ] TEST_REPORT.md created
- [ ] All test cases pass (100%)
- [ ] No critical bugs
- [ ] No data loss scenarios
- [ ] Performance meets SLAs
- [ ] WebSocket sync <100ms
- [ ] Facebook posting works consistently

**QUALITY GATE:** If any tests fail → Send back to ENGINEER to fix → Re-test

---

### PHASE 5: DEPLOYMENT (DEPLOYER AGENT)
**Duration:** 2-3 hours  
**Output Destination:** Live system

**Spawn Command:**
```
agent: deployer
task: Deploy LotView to production

Preconditions:
- All SENTINEL security audit passed
- All EXECUTIONER tests passed (100%)
- All code reviewed and approved

Deploy:
✅ Production PostgreSQL database setup
✅ Redis instance for job queue
✅ Node.js backend service (PM2/systemd)
✅ Bull worker processes (auto-post, fetch-messages, etc.)
✅ WebSocket reverse proxy (nginx)
✅ Chrome extension upload to Chrome Web Store
✅ DNS configuration
✅ SSL/TLS certificates
✅ Environment variables configured
✅ Backup strategy (automated daily)
✅ Monitoring + alerting (error tracking, performance)
✅ Health check endpoint configured
✅ Logging aggregation (Datadog/CloudWatch)

Output: DEPLOYMENT.md with:
- Production system URLs
- How to run backend service
- How to run worker processes
- Backup/restore procedures
- Monitoring dashboard
- On-call runbook (what to do if something breaks)

Post-deployment verification:
✅ Backend API responds to health check
✅ Database connected
✅ Redis queue operational
✅ Bull workers processing jobs
✅ WebSocket accepting connections
✅ Extension available in Chrome Web Store
✅ Monitoring alerting correctly
✅ Backups running on schedule
```

**Success Criteria:**
- [ ] Backend running in production
- [ ] Health check: `GET /api/health` returns 200
- [ ] Database: Can write/read data
- [ ] Redis: Queue processing jobs
- [ ] Extension: Installable from Chrome Web Store
- [ ] WebSocket: Real-time events flowing
- [ ] Monitoring: Dashboard shows healthy metrics
- [ ] Backups: Database backed up daily

---

## QUALITY GATES (MUST PASS)

### Gate 1: Security (SENTINEL)
```
MUST HAVE: Zero critical vulnerabilities
MUST HAVE: Zero high vulnerabilities (or with documented workarounds)
MUST HAVE: No secrets in code
MUST HAVE: All dependencies secure (npm audit clean)
MUST HAVE: Rate limiting on sensitive endpoints
```

### Gate 2: Testing (EXECUTIONER)
```
MUST HAVE: 100% test pass rate
MUST HAVE: Auto-post to Facebook works consistently
MUST HAVE: Message handling works correctly
MUST HAVE: WebSocket sync <100ms (p95)
MUST HAVE: No data loss in concurrent scenarios
MUST HAVE: All error cases handled gracefully
```

### Gate 3: Deployment (DEPLOYER)
```
MUST HAVE: Production PostgreSQL + Redis running
MUST HAVE: Backend service stable (uptime 99%+)
MUST HAVE: Extension in Chrome Web Store
MUST HAVE: Monitoring + alerting configured
MUST HAVE: Backup/restore tested
MUST HAVE: Health checks passing
```

---

## TOTAL TIMELINE

| Phase | Agent | Duration | Days |
|-------|-------|----------|------|
| 0: Design | architect | 1-2h | 0.5 |
| 1: Backend | engineer | 8-12h | 1-1.5 |
| 2: Extension | engineer | 4-6h | 0.5-1 |
| 3: Security | sentinel | 2-3h | 0.25 |
| 4: Testing | executioner | 4-6h | 0.5-1 |
| 5: Deploy | deployer | 2-3h | 0.25 |
| **TOTAL** | **All** | **~28-35h** | **~4-5 days** |

**Working full days (8h) with agents in parallel: 4-5 calendar days to 100% production-ready**

---

## CRITICAL EXECUTION RULES

1. **NO SKIPPING PHASES.** Each phase depends on the prior.
2. **QUALITY GATES ARE HARD BLOCKS.** If security audit finds vulns, go back to ENGINEER. If tests fail, go back to ENGINEER. No exceptions.
3. **EVERY PHASE MUST PRODUCE DOCUMENTATION.** Each agent writes detailed specs/reports.
4. **NO SHORTCUTS.** This is production code. It must be world-class or it doesn't ship.
5. **TEST EVERYTHING TWICE.** Once in dev (local), once in production (after deploy).

---

## SUCCESS DEFINITION (100% WORKING)

You register in the extension → Create a listing (title, price, mileage, make, model) → Toggle "Auto-post to Facebook" → 30 seconds later: Extension shows "✅ Posted to Facebook: [URL]" → Click URL → Your vehicle is live on Facebook Marketplace with all details filled → Customer messages → Backend fetches message automatically → Claude generates smart reply → Extension shows "💬 New message + Reply sent" → **Everything real-time, zero manual work, zero errors.**

That's 100% working.

---

## WHEN GATEWAY IS READY

Execute these commands in order:

```bash
# Phase 0: ARCHITECT
openclaw spawn architect --task "Design LotView MVP system" --project ~/projects/lotview/

# Wait for completion...

# Phase 1: ENGINEER (Backend)
openclaw spawn engineer --task "Build backend per ARCHITECTURE.md" --project ~/projects/lotview/

# Wait for completion...

# Phase 2: ENGINEER (Extension)
openclaw spawn engineer --task "Build extension per EXTENSION_ARCHITECTURE.md" --project ~/projects/lotview/

# Wait for completion...

# Phase 3: SENTINEL
openclaw spawn sentinel --task "Security audit of LotView" --project ~/projects/lotview/

# Wait for completion, fix any critical issues...

# Phase 4: EXECUTIONER
openclaw spawn executioner --task "End-to-end testing of LotView" --project ~/projects/lotview/

# Wait for completion, fix any test failures...

# Phase 5: DEPLOYER
openclaw spawn deployer --task "Deploy LotView to production" --project ~/projects/lotview/

# ✅ DONE - System is 100% working
```

---

**This is the plan. Execute it exactly. Let's build world-class software.**
