# Multi-Tenant SaaS Migration - Remaining Work

## ✅ Completed

### Schema (shared/schema.ts)
- [x] Created `dealerships` table with full tenant metadata
- [x] Created `dealership_subscriptions` table for billing
- [x] Created `dealership_api_keys` table for per-tenant API credentials
- [x] Added `dealershipId` foreign key to ALL 20+ tables
- [x] Set up proper foreign key constraints with CASCADE delete

### Middleware (server/tenant-middleware.ts)
- [x] Created tenant context extraction middleware
- [x] Extract dealership from: authenticated user, subdomain, header, default
- [x] Added `requireDealership`, `masterOnly`, `dealershipOwnerOrMaster` guards
- [x] Set `req.dealershipId` for downstream use

### Storage Layer - Interface Updates (server/storage.ts)
- [x] Added dealership CRUD operations to interface
- [x] Updated vehicle methods to require `dealershipId` parameter
- [x] Updated user methods with dealership filtering
- [x] Updated chat conversation methods with dealership filtering
- [x] Updated remarketing methods with dealership filtering

### Storage Layer - Implementations
- [x] Implemented dealership CRUD (get, getBySlug, getBySubdomain, create, update, delete)
- [x] Implemented dealership API keys (get, save, update with upsert logic)
- [x] Implemented dealership subscriptions (get, create, update)
- [x] Implemented vehicle CRUD with REQUIRED dealershipId and filtering
- [x] Implemented user management with multi-tenant filtering and validation

### Documentation
- [x] Created comprehensive MULTI_TENANT_MIGRATION_GUIDE.md
- [x] Documented proper Drizzle approach (no custom SQL migrations)
- [x] Documented migration options (fresh start vs. migrate existing data)
- [x] Documented multi-tenant architecture patterns

## 🚧 In Progress - Critical Path

### Storage Layer - Remaining Method Implementations

#### Chat Operations
- [ ] Update `getAllConversations(dealershipId, category?)` implementation
  - Currently: No filtering, returns all conversations
  - Required: Filter by `dealershipId`
- [ ] Update `getConversationById(id, dealershipId)` implementation
  - Currently: No filtering, can access any conversation
  - Required: Filter by `dealershipId`
- [ ] Update `updateConversationHandoff(id, dealershipId, data)` implementation
  - Currently: No filtering, can update any conversation
  - Required: Filter by `dealershipId`
- [ ] Update `saveChatConversation(conversation)` implementation
  - Currently: No validation
  - Required: Validate `dealershipId` is present before insert

#### Remarketing Operations
- [ ] Update `getRemarketingVehicles(dealershipId)` implementation
  - Currently: No filtering, returns all remarketing vehicles
  - Required: Filter by `dealershipId`
- [ ] Update `addRemarketingVehicle(vehicle)` implementation
  - Currently: No validation
  - Required: Validate `dealershipId` is present before insert
- [ ] Update `updateRemarketingVehicle(id, dealershipId, vehicle)` implementation
  - Currently: No filtering
  - Required: Filter by `dealershipId`
- [ ] Update `removeRemarketingVehicle(id, dealershipId)` implementation
  - Currently: No filtering
  - Required: Filter by `dealershipId`
- [ ] Update `getRemarketingVehicleCount(dealershipId)` implementation
  - Currently: No filtering
  - Required: Filter by `dealershipId`

#### Analytics & View Tracking
- [ ] Update `getVehicleViews(vehicleId, hours)` to include dealership validation
  - Currently: No filtering, can access views for any vehicle
  - Required: Join with vehicles table and filter by `dealershipId`
- [ ] Update `getAllVehicleViews(hours)` to filter by dealership
  - Currently: Returns views for all dealerships
  - Required: Add `dealershipId` parameter, filter results

#### Facebook Operations (20+ methods)
- [ ] Update `getFacebookAccounts(userId, dealershipId)`
- [ ] Update `createFacebookAccount(account)` - validate dealershipId
- [ ] Update `updateFacebookAccount(id, dealershipId, account)`
- [ ] Update `deleteFacebookAccount(id, dealershipId)`
- [ ] Update `getAdTemplates(userId, dealershipId)`
- [ ] Update `createAdTemplate(template)` - validate dealershipId
- [ ] Update `updateAdTemplate(id, dealershipId, template)`
- [ ] Update `deleteAdTemplate(id, dealershipId)`
- [ ] Update `getPostingQueue(userId, dealershipId)`
- [ ] Update `addToPostingQueue(item)` - validate dealershipId
- [ ] Update `removeFromPostingQueue(id, dealershipId)`
- [ ] Update `reorderPostingQueue(userId, dealershipId, queueItems)`
- [ ] Update `updatePostingQueueItem(id, dealershipId, item)`
- [ ] Update `getPostingSchedule(userId, dealershipId)`
- [ ] Update `createPostingSchedule(schedule)` - validate dealershipId
- [ ] Update `updatePostingSchedule(userId, dealershipId, schedule)`

#### PBS DMS Integration
- [ ] Update `getPbsConfig()` to `getPbsConfig(dealershipId)`
- [ ] Update `createPbsConfig(config)` - validate dealershipId
- [ ] Update `updatePbsConfig(id, dealershipId, config)`
- [ ] Update `deletePbsConfig(id, dealershipId)`
- [ ] Update `getPbsWebhookEvents(dealershipId, limit?)`
- [ ] Update `getPbsWebhookEventById(id, dealershipId)`
- [ ] Update `createPbsWebhookEvent(event)` - validate dealershipId
- [ ] Update `updatePbsWebhookEvent(id, dealershipId, event)`

#### Manager Settings & Market Listings
- [ ] Update `getManagerSettings(userId, dealershipId)` - add dealership validation
- [ ] Update `createManagerSettings(settings)` - validate dealershipId
- [ ] Update `updateManagerSettings(userId, dealershipId, settings)`
- [ ] Update `getMarketListings(dealershipId, filters)` - add dealership filter
- [ ] Update `getMarketListingById(id, dealershipId)`
- [ ] Update `getMarketListingsByUrls(dealershipId, urls)`
- [ ] Update `createMarketListing(listing)` - validate dealershipId
- [ ] Update `updateMarketListing(id, dealershipId, listing)`
- [ ] Update `deactivateMarketListing(dealershipId, url)`
- [ ] Update `deleteOldMarketListings(dealershipId, daysOld)`

#### Financing Rules
- [ ] Update `getCreditScoreTiers()` to `getCreditScoreTiers(dealershipId)`
- [ ] Update `createCreditScoreTier(tier)` - validate dealershipId
- [ ] Update `updateCreditScoreTier(id, dealershipId, tier)`
- [ ] Update `deleteCreditScoreTier(id, dealershipId)`
- [ ] Update `getInterestRateForCreditScore(score)` to include dealershipId
- [ ] Update `getModelYearTerms()` to `getModelYearTerms(dealershipId)`
- [ ] Update `createModelYearTerm(term)` - validate dealershipId
- [ ] Update `updateModelYearTerm(id, dealershipId, term)`
- [ ] Update `deleteModelYearTerm(id, dealershipId)`
- [ ] Update `getAllowedTermsForYear(year)` to include dealershipId

### Routes Layer (server/routes.ts)
- [ ] Update ALL route handlers to pass `req.dealershipId` to storage methods
- [ ] Update vehicle routes (GET /vehicles, POST /vehicles, PUT /vehicles/:id, DELETE /vehicles/:id)
- [ ] Update user routes (GET /users, POST /users, PUT /users/:id)
- [ ] Update chat routes (GET /conversations, POST /conversations, PUT /conversations/:id/handoff)
- [ ] Update remarketing routes (GET /remarketing, POST /remarketing, PUT /remarketing/:id, DELETE /remarketing/:id)
- [ ] Update Facebook routes (all posting queue, templates, accounts, schedules)
- [ ] Update PBS routes (config, webhook events)
- [ ] Update manager routes (settings, market listings, scraping)
- [ ] Update financing routes (credit tiers, model year terms)
- [ ] Add proper error handling for missing dealershipId
- [ ] Add master user override logic where appropriate

### Scraper (server/scraper.ts)
- [ ] Update scraper to accept dealershipId parameter
- [ ] Pass dealershipId when creating vehicles from scraped data
- [ ] Update cron job to scrape for all active dealerships
- [ ] Add per-dealership scraper configuration (URLs, selectors)

### Authentication (server/routes.ts - auth endpoints)
- [ ] Update login route to handle multi-tenant authentication
- [ ] Update session to include dealershipId
- [ ] Update logout to clear dealership context
- [ ] Add dealership switcher for master users

## 🔮 Future Work - New Features

### Master User Dashboard
- [ ] Create dealership management UI
- [ ] Add dealership creation/editing forms
- [ ] Add subscription management
- [ ] Add API keys management per dealership
- [ ] Add dealership switcher in header

### Dealership Signup Flow
- [ ] Create public signup page
- [ ] Add Stripe checkout integration
- [ ] Create onboarding wizard
- [ ] Send welcome emails
- [ ] Set up 14-day trial

### Testing & Validation
- [ ] Write unit tests for multi-tenant storage methods
- [ ] Write integration tests for data isolation
- [ ] Test master user access to all dealerships
- [ ] Test non-master user restrictions
- [ ] Load testing with multiple tenants

### Migration Execution
- [ ] Backup current production database
- [ ] Run Drizzle db:push with nullable dealershipId
- [ ] Create seed script for default dealership
- [ ] Update existing records with dealershipId
- [ ] Run db:push again with non-nullable dealershipId
- [ ] Validate data integrity

## 📊 Progress Tracking

### Storage Layer Methods
- Total methods: ~80
- Completed: 15 (dealerships + vehicles + users)
- Remaining: ~65

### Route Handlers  
- Total routes: ~50
- Completed: 0
- Remaining: ~50

### Estimated Effort
- Storage layer fixes: 4-6 hours
- Route layer updates: 3-4 hours
- Testing & validation: 2-3 hours
- Migration execution: 1-2 hours
- **Total: 10-15 hours**

## 🎯 Next Session Priorities

1. **Complete storage layer implementations** (highest priority)
   - Focus on analytics methods first (prevent data leakage)
   - Then chat, remarketing, Facebook operations
   - Finally PBS, manager settings, financing rules

2. **Update all route handlers**
   - Start with most-used routes (vehicles, users)
   - Add comprehensive error handling
   - Test each route after updating

3. **Execute database migration**
   - Follow MULTI_TENANT_MIGRATION_GUIDE.md
   - Use Option 1 (fresh start) for development
   - Plan Option 2 (migrate existing data) for production

4. **Build master user dashboard**
   - Dealership management CRUD
   - API keys management
   - Subscription management

5. **Continue with AI chat, Facebook, video features**
   - Once multi-tenant foundation is solid
   - All new features will be built multi-tenant from the start
