import { pgTable, text, integer, serial, timestamp, boolean, uuid, real, jsonb, customType } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// ====== MULTI-TENANT CORE TABLES ======

// Dealerships table - Each dealership is a tenant
export const dealerships = pgTable("dealerships", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // e.g., "Olympic Auto Group"
  slug: text("slug").notNull().unique(), // URL-safe identifier (e.g., "olympic-auto")
  subdomain: text("subdomain").unique(), // For subdomain routing (e.g., "olympic")
  address: text("address"), // Street address
  city: text("city"), // City
  province: text("province"), // Province/State (e.g., "BC")
  postalCode: text("postal_code"), // Postal/ZIP code
  phone: text("phone"), // Contact phone number
  timezone: text("timezone").default("America/Vancouver"), // Timezone for scheduling
  defaultCurrency: text("default_currency").default("CAD"), // Default currency code
  vdpFooterDescription: text("vdp_footer_description"), // Universal footer text for all VDP pages (set by GM)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDealershipSchema = createInsertSchema(dealerships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDealership = z.infer<typeof insertDealershipSchema>;
export type Dealership = typeof dealerships.$inferSelect;

// Dealership subscriptions - Billing and plan management
export const dealershipSubscriptions = pgTable("dealership_subscriptions", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  plan: text("plan").notNull().default('starter'), // starter, professional, enterprise
  status: text("status").notNull().default('trial'), // trial, active, past_due, cancelled
  currentPeriodEnd: timestamp("current_period_end"), // When current billing period ends
  stripeCustomerId: text("stripe_customer_id"), // Stripe customer ID
  stripeSubscriptionId: text("stripe_subscription_id"), // Stripe subscription ID
  monthlyPrice: integer("monthly_price"), // Price in cents
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDealershipSubscriptionSchema = createInsertSchema(dealershipSubscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDealershipSubscription = z.infer<typeof insertDealershipSubscriptionSchema>;
export type DealershipSubscription = typeof dealershipSubscriptions.$inferSelect;

// Dealership API keys - Master user manages these per dealership
export const dealershipApiKeys = pgTable("dealership_api_keys", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  openaiApiKey: text("openai_api_key"), // OpenAI API key for per-dealership AI training
  marketcheckKey: text("marketcheck_key"), // MarketCheck API key
  apifyToken: text("apify_token"), // Apify API token
  apifyActorId: text("apify_actor_id"), // Apify actor ID for AutoTrader scraper
  geminiApiKey: text("gemini_api_key"), // Google Gemini Veo API key
  ghlApiKey: text("ghl_api_key"), // GoHighLevel API key
  ghlLocationId: text("ghl_location_id"), // GoHighLevel location/sub-account ID
  facebookAppId: text("facebook_app_id"), // Facebook App ID (shared or per-dealership)
  facebookAppSecret: text("facebook_app_secret"), // Facebook App Secret
  gtmContainerId: text("gtm_container_id"), // Google Tag Manager container ID (e.g., GTM-XXXXX)
  googleAnalyticsId: text("google_analytics_id"), // Google Analytics 4 measurement ID (e.g., G-XXXXX)
  googleAdsId: text("google_ads_id"), // Google Ads account ID for remarketing (e.g., AW-XXXXX)
  facebookPixelId: text("facebook_pixel_id"), // Facebook Pixel ID for remarketing
  browserlessApiKey: text("browserless_api_key"), // Browserless.io API key for cloud Puppeteer fallback
  scrapingbeeApiKey: text("scrapingbee_api_key"), // ScrapingBee API key for cloud scraping fallback
  apiNinjasKey: text("api_ninjas_key"), // API Ninjas key for VIN decoding fallback
  scrapeWebhookSecret: text("scrape_webhook_secret"), // Secret key for Zapier/n8n webhook triggers
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDealershipApiKeysSchema = createInsertSchema(dealershipApiKeys).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDealershipApiKeys = z.infer<typeof insertDealershipApiKeysSchema>;
export type DealershipApiKeys = typeof dealershipApiKeys.$inferSelect;

// External API tokens - For n8n and other external integrations
export const externalApiTokens = pgTable("external_api_tokens", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  tokenName: text("token_name").notNull(), // Descriptive name (e.g., "n8n Scraper")
  tokenHash: text("token_hash").notNull(), // bcrypt hash of the token
  tokenPrefix: text("token_prefix").notNull(), // First 8 chars for identification (e.g., "oag_n8n_")
  permissions: text("permissions").array().notNull(), // ["import:vehicles", "read:vehicles"]
  lastUsedAt: timestamp("last_used_at"),
  expiresAt: timestamp("expires_at"), // Optional expiration
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by"), // User ID who created the token (no FK to avoid circular ref)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExternalApiTokenSchema = createInsertSchema(externalApiTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertExternalApiToken = z.infer<typeof insertExternalApiTokenSchema>;
export type ExternalApiToken = typeof externalApiTokens.$inferSelect;

// ====== APPLICATION TABLES (Multi-Tenant) ======

// Vehicles table
export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  filterGroupId: integer("filter_group_id"), // Which filter group this vehicle belongs to (references filter_groups.id)
  year: integer("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  trim: text("trim").notNull(),
  type: text("type").notNull(), // SUV, Truck, Sedan, etc.
  price: integer("price").notNull(),
  odometer: integer("odometer").notNull(),
  images: text("images").array().notNull(), // Multiple images from detail page (CDN URLs)
  localImages: text("local_images").array(), // Images stored in Lotview Object Storage (local URLs)
  badges: text("badges").array().notNull(),
  location: text("location").notNull(), // Vancouver, Burnaby
  dealership: text("dealership").notNull(), // Boundary Hyundai Vancouver, Olympic Hyundai Vancouver, Kia Vancouver
  description: text("description").notNull(),
  fullPageContent: text("full_page_content"), // Full page content for AI description generation
  vin: text("vin"), // VIN number
  interiorColor: text("interior_color"), // Interior color (from VIN decode or manual entry)
  exteriorColor: text("exterior_color"), // Exterior color (from VIN decode or manual entry)
  transmission: text("transmission"), // Transmission type (Automatic, Manual, CVT, etc.)
  fuelType: text("fuel_type"), // Fuel type (Gasoline, Diesel, Electric, Hybrid, etc.)
  drivetrain: text("drivetrain"), // Drivetrain (AWD, FWD, RWD, 4WD, etc.)
  engine: text("engine"), // Engine info (e.g., "2.0L 4-Cylinder", "PLUG IN HYBRID")
  stockNumber: text("stock_number"), // Stock # from dealership
  cargurusPrice: integer("cargurus_price"), // Price on CarGurus (for comparison)
  cargurusUrl: text("cargurus_url"), // Link to CarGurus listing
  dealRating: text("deal_rating"), // CarGurus deal rating (Great Deal, Good Deal, etc.)
  carfaxUrl: text("carfax_url"), // Link to Carfax vehicle history report
  carfaxBadges: text("carfax_badges").array(), // Carfax badges: "No Reported Accidents", "One Owner", etc.
  highlights: text("highlights"), // Feature highlights from dealer VDP (e.g., "LEATHER SEATS | HEATED SEATS | SUNROOF")
  vdpDescription: text("vdp_description"), // Vehicle overview from dealer's VDP page
  techSpecs: text("tech_specs"), // JSON: { features: [], mechanical: [], exterior: [], interior: [], entertainment: [] }
  dealerVdpUrl: text("dealer_vdp_url"), // Link to dealer's vehicle detail page
  videoUrl: text("video_url"), // Generated video URL from Gemini Veo
  manualHeadline: text("manual_headline"), // Manually edited headline (preserved across scrapes)
  manualSubheadline: text("manual_subheadline"), // Manually edited subheadline (preserved across scrapes)
  manualDescription: text("manual_description"), // Manually edited description (preserved across scrapes)
  isManuallyEdited: boolean("is_manually_edited").default(false), // Flag to preserve manual edits during scraper updates
  lastEditedBy: integer("last_edited_by"), // User ID who last edited manually
  lastEditedAt: timestamp("last_edited_at"), // When vehicle was last manually edited
  // Marketplace Blast - AI-generated social content
  socialTemplates: text("social_templates"), // JSON: { marketplace: { title, description }, pagePost: { body }, instagram: { caption, hashtags } }
  socialTemplatesGeneratedAt: timestamp("social_templates_generated_at"), // When AI content was last generated
  fbMarketplaceDescription: text("fb_marketplace_description"), // AI-generated world-class FB Marketplace description
  marketplacePostedAt: timestamp("marketplace_posted_at"), // When vehicle was last posted to Marketplace (for queue filtering)
  marketplacePostedBy: integer("marketplace_posted_by"), // User ID who posted to Marketplace
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastScrapedAt: timestamp("last_scraped_at").defaultNow(), // Track when vehicle was last scraped (for incremental sync)
  missedScrapeCount: integer("missed_scrape_count").default(0), // Tracks consecutive scrapes where vehicle wasn't found (for safe deletion)
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({
  id: true,
  createdAt: true,
});

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;

// Custom type for PostgreSQL bytea columns (binary data)
const bytea = customType<{ data: Buffer; driverParam: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Cached vehicle images stored as binary data in PostgreSQL
// Solves the problem of AutoTrader CDN URLs expiring and returning 404
export const vehicleImages = pgTable("vehicle_images", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  imageIndex: integer("image_index").notNull(),
  data: bytea("data").notNull(),
  contentType: text("content_type").default("image/jpeg"),
  originalUrl: text("original_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VehicleImage = typeof vehicleImages.$inferSelect;

// Carfax report data scraped from vhr.carfax.ca
export const carfaxReports = pgTable("carfax_reports", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: 'cascade' }),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  vin: text("vin").notNull(),
  reportUrl: text("report_url"),
  accidentCount: integer("accident_count").default(0),
  ownerCount: integer("owner_count").default(0),
  serviceRecordCount: integer("service_record_count").default(0),
  lastReportedOdometer: integer("last_reported_odometer"),
  lastReportedDate: text("last_reported_date"),
  damageReported: boolean("damage_reported").default(false),
  lienReported: boolean("lien_reported").default(false),
  registrationHistory: jsonb("registration_history"), // [{date, location, event}]
  serviceHistory: jsonb("service_history"), // [{date, location, description, odometer}]
  accidentHistory: jsonb("accident_history"), // [{date, description, severity}]
  ownershipHistory: jsonb("ownership_history"), // [{startDate, endDate, location, type}]
  odometerHistory: jsonb("odometer_history"), // [{date, reading, source}]
  fullReportData: jsonb("full_report_data"), // raw structured data
  badges: text("badges").array(),
  scrapedAt: timestamp("scraped_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCarfaxReportSchema = createInsertSchema(carfaxReports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCarfaxReport = z.infer<typeof insertCarfaxReportSchema>;
export type CarfaxReport = typeof carfaxReports.$inferSelect;

// View tracking table
export const vehicleViews = pgTable("vehicle_views", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  sessionId: text("session_id").notNull(), // For remarketing tracking
  viewedAt: timestamp("viewed_at").defaultNow().notNull(),
});

export const insertVehicleViewSchema = createInsertSchema(vehicleViews).omit({
  id: true,
  viewedAt: true,
});

export type InsertVehicleView = z.infer<typeof insertVehicleViewSchema>;
export type VehicleView = typeof vehicleViews.$inferSelect;

// Facebook pages connected by sales team (LEGACY - being replaced by facebookAccounts)
export const facebookPages = pgTable("facebook_pages", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  pageName: text("page_name").notNull(),
  pageId: text("page_id").notNull().unique(),
  accessToken: text("access_token"), // Optional - for future OAuth integration
  isActive: boolean("is_active").notNull().default(true),
  selectedTemplate: text("selected_template").notNull().default('modern'),
  connectedAt: timestamp("connected_at").defaultNow().notNull(),
});

export const insertFacebookPageSchema = createInsertSchema(facebookPages).omit({
  id: true,
  connectedAt: true,
});

export type InsertFacebookPage = z.infer<typeof insertFacebookPageSchema>;
export type FacebookPage = typeof facebookPages.$inferSelect;

// Priority inventory for each Facebook page (LEGACY - being replaced by postingQueue)
export const pagePriorityVehicles = pgTable("page_priority_vehicles", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  pageId: integer("page_id").notNull().references(() => facebookPages.id),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  priority: integer("priority").notNull(), // Order for posting
});

export const insertPagePriorityVehicleSchema = createInsertSchema(pagePriorityVehicles).omit({
  id: true,
});

export type InsertPagePriorityVehicle = z.infer<typeof insertPagePriorityVehicleSchema>;
export type PagePriorityVehicle = typeof pagePriorityVehicles.$inferSelect;

// GHL Webhook configuration for SMS handoff
export const ghlWebhookConfig = pgTable("ghl_webhook_config", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  webhookUrl: text("webhook_url").notNull(), // GHL inbound webhook URL
  webhookName: text("webhook_name").notNull(), // Descriptive name
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGhlWebhookConfigSchema = createInsertSchema(ghlWebhookConfig).omit({
  id: true,
  updatedAt: true,
});

export type InsertGhlWebhookConfig = z.infer<typeof insertGhlWebhookConfigSchema>;
export type GhlWebhookConfig = typeof ghlWebhookConfig.$inferSelect;

// AI prompt templates for vehicle descriptions
export const aiPromptTemplates = pgTable("ai_prompt_templates", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Vehicle Description", "Short Description"
  promptText: text("prompt_text").notNull(), // The actual ChatGPT prompt
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAiPromptTemplateSchema = createInsertSchema(aiPromptTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAiPromptTemplate = z.infer<typeof insertAiPromptTemplateSchema>;
export type AiPromptTemplate = typeof aiPromptTemplates.$inferSelect;

// Chat conversations for analytics and training
export const chatConversations = pgTable("chat_conversations", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  category: text("category").notNull(), // 'test-drive', 'get-approved', 'value-trade', 'reserve', 'general'
  vehicleId: integer("vehicle_id").references(() => vehicles.id),
  vehicleName: text("vehicle_name"), // e.g., "2024 Toyota Camry"
  messages: text("messages").notNull(), // JSON string of message array
  sessionId: text("session_id").notNull(),
  handoffRequested: boolean("handoff_requested").notNull().default(false), // User requested SMS handoff
  handoffPhone: text("handoff_phone"), // Phone number for SMS handoff
  handoffEmail: text("handoff_email"), // Email address for follow-up
  handoffName: text("handoff_name"), // Customer name extracted from conversation
  handoffSent: boolean("handoff_sent").notNull().default(false), // Successfully sent to GHL
  handoffSentAt: timestamp("handoff_sent_at"), // When handoff was sent
  ghlContactId: text("ghl_contact_id"), // GHL/FWC contact ID for sending messages
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  createdAt: true,
});

export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatConversation = typeof chatConversations.$inferSelect;

// Chat prompts for different scenarios - syncs to GHL workflows
export const chatPrompts = pgTable("chat_prompts", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // Human-readable name for the prompt
  scenario: text("scenario").notNull(), // 'sales', 'service', 'appointment', 'follow-up', 'general', 'after-hours'
  channel: text("channel").notNull().default('all'), // 'sms', 'email', 'chat', 'all'
  systemPrompt: text("system_prompt").notNull(), // The system/instruction prompt for ChatGPT
  greeting: text("greeting").notNull(), // Initial greeting message
  followUpPrompt: text("follow_up_prompt"), // Prompt for follow-up messages
  escalationTriggers: text("escalation_triggers"), // JSON array of keywords/phrases that trigger human handoff
  aiModel: text("ai_model").default('gpt-4o'), // Which AI model to use
  temperature: real("temperature").default(0.7), // AI temperature setting
  maxTokens: integer("max_tokens").default(500), // Max response tokens
  isActive: boolean("is_active").notNull().default(true),
  // GHL Sync fields
  ghlWorkflowId: text("ghl_workflow_id"), // GHL workflow ID this prompt is linked to
  ghlPromptSynced: boolean("ghl_prompt_synced").default(false), // Whether synced to GHL
  ghlLastSyncedAt: timestamp("ghl_last_synced_at"), // Last successful sync time
  ghlSyncError: text("ghl_sync_error"), // Last sync error message
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertChatPromptSchema = createInsertSchema(chatPrompts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertChatPrompt = z.infer<typeof insertChatPromptSchema>;
export type ChatPrompt = typeof chatPrompts.$inferSelect;

// Users table with role-based access
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").references(() => dealerships.id, { onDelete: 'cascade' }), // NULL for master users who manage all dealerships
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // 'super_admin', 'master', 'manager', 'salesperson'
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by"), // Master user who created this account
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Admin configuration (legacy - will migrate to users table)
export const adminConfig = pgTable("admin_config", {
  id: serial("id").primaryKey(),
  passwordHash: text("password_hash").notNull(), // Hashed master password
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAdminConfigSchema = createInsertSchema(adminConfig).omit({
  id: true,
  updatedAt: true,
});

export type InsertAdminConfig = z.infer<typeof insertAdminConfigSchema>;
export type AdminConfig = typeof adminConfig.$inferSelect;

// Global settings - Super admin manages API keys and global configuration
export const globalSettings = pgTable("global_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // e.g., 'marketcheck_api_key', 'apify_api_key'
  value: text("value").notNull(), // Encrypted value
  description: text("description"), // Human-readable description
  isSecret: boolean("is_secret").notNull().default(true), // If true, mask value in UI
  updatedBy: integer("updated_by").references(() => users.id), // Super admin who last updated
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGlobalSettingSchema = createInsertSchema(globalSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGlobalSetting = z.infer<typeof insertGlobalSettingSchema>;
export type GlobalSetting = typeof globalSettings.$inferSelect;

// Super Admin Configs - System-wide configuration like secrets password
export const superAdminConfigs = pgTable("super_admin_configs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // e.g., 'secrets_password_hash'
  value: text("value").notNull(), // Encrypted/hashed value
  updatedBy: integer("updated_by").references(() => users.id), // Super admin who last updated
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSuperAdminConfigSchema = createInsertSchema(superAdminConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSuperAdminConfig = z.infer<typeof insertSuperAdminConfigSchema>;
export type SuperAdminConfig = typeof superAdminConfigs.$inferSelect;

// Audit logs - Track all super admin actions
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id), // Super admin who performed action
  userEmail: text("user_email"), // User email address for display in audit logs
  action: text("action").notNull(), // e.g., 'create_dealership', 'update_global_setting'
  resource: text("resource").notNull(), // e.g., 'dealership', 'global_setting'
  resourceId: text("resource_id"), // ID of affected resource
  details: text("details"), // JSON with additional context
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

// Password reset tokens for self-service password recovery
export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text("token_hash").notNull(), // bcrypt hash of the reset token
  expiresAt: timestamp("expires_at").notNull(), // Token expiration (1 hour default)
  usedAt: timestamp("used_at"), // When token was used (null if unused)
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).omit({
  id: true,
  createdAt: true,
});

export type InsertPasswordResetToken = z.infer<typeof insertPasswordResetTokenSchema>;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;

// Financing rules - Credit score tiers
export const creditScoreTiers = pgTable("credit_score_tiers", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  tierName: text("tier_name").notNull(), // e.g., "Excellent", "Good", "Fair", "Poor"
  minScore: integer("min_score").notNull(),
  maxScore: integer("max_score").notNull(),
  interestRate: integer("interest_rate").notNull(), // Stored as basis points (e.g., 575 = 5.75%)
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCreditScoreTierSchema = createInsertSchema(creditScoreTiers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCreditScoreTier = z.infer<typeof insertCreditScoreTierSchema>;
export type CreditScoreTier = typeof creditScoreTiers.$inferSelect;

// Financing rules - Model year term eligibility
export const modelYearTerms = pgTable("model_year_terms", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  minModelYear: integer("min_model_year").notNull(), // e.g., 2020
  maxModelYear: integer("max_model_year").notNull(), // e.g., 2024
  availableTerms: text("available_terms").array().notNull(), // e.g., ["36", "48", "60", "72", "84"]
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertModelYearTermSchema = createInsertSchema(modelYearTerms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertModelYearTerm = z.infer<typeof insertModelYearTermSchema>;
export type ModelYearTerm = typeof modelYearTerms.$inferSelect;

// Dealership fees - fees added to payment calculation but not shown in price
export const dealershipFees = pgTable("dealership_fees", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  feeName: text("fee_name").notNull(), // e.g., "Admin Fee", "Documentation Fee", "Tire Levy"
  feeAmount: integer("fee_amount").notNull(), // Stored in cents (e.g., 49900 = $499.00)
  isPercentage: boolean("is_percentage").notNull().default(false), // If true, feeAmount is percentage * 100 (e.g., 150 = 1.5%)
  includeInPayment: boolean("include_in_payment").notNull().default(true), // Include in payment calculation
  isActive: boolean("is_active").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDealershipFeeSchema = createInsertSchema(dealershipFees).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDealershipFee = z.infer<typeof insertDealershipFeeSchema>;
export type DealershipFee = typeof dealershipFees.$inferSelect;

// Filter groups - Organize vehicles into categories per dealership
export const filterGroups = pgTable("filter_groups", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  groupName: text("group_name").notNull(), // e.g., "Used Inventory", "Certified Pre-Owned", "Luxury Collection"
  groupSlug: text("group_slug").notNull(), // URL-safe identifier (e.g., "used-inventory")
  description: text("description"), // Optional description
  displayOrder: integer("display_order").notNull().default(0), // Order in filter sidebar
  isDefault: boolean("is_default").notNull().default(false), // If true, this is the default filter for the dealership
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFilterGroupSchema = createInsertSchema(filterGroups).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFilterGroup = z.infer<typeof insertFilterGroupSchema>;
export type FilterGroup = typeof filterGroups.$inferSelect;

// Scrape sources - URLs to scrape for inventory
export const scrapeSources = pgTable("scrape_sources", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  filterGroupId: integer("filter_group_id").references(() => filterGroups.id, { onDelete: 'set null' }), // Which filter group vehicles belong to
  sourceName: text("source_name").notNull(), // e.g., "Olympic Hyundai Vancouver", "Boundary Hyundai"
  sourceUrl: text("source_url").notNull(), // The URL to scrape
  sourceType: text("source_type").notNull().default("dealer_website"), // "dealer_website", "cargurus", "autotrader", etc.
  isActive: boolean("is_active").notNull().default(true),
  lastScrapedAt: timestamp("last_scraped_at"),
  vehicleCount: integer("vehicle_count").default(0), // Number of vehicles from this source
  scrapeFrequency: text("scrape_frequency").notNull().default("daily"), // "hourly", "daily", "weekly"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertScrapeSourceSchema = createInsertSchema(scrapeSources).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastScrapedAt: true,
  vehicleCount: true,
});

export type InsertScrapeSource = z.infer<typeof insertScrapeSourceSchema>;
export type ScrapeSource = typeof scrapeSources.$inferSelect;

// Scrape runs - Log each inventory scrape attempt with status and error info
export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").references(() => dealerships.id, { onDelete: 'cascade' }),
  scrapeType: text("scrape_type").notNull().default("incremental"), // "full", "incremental"
  scrapeMethod: text("scrape_method").notNull().default("puppeteer"), // "puppeteer", "browserless", "apify", "cache_preserve"
  status: text("status").notNull().default("running"), // "running", "success", "failed", "partial"
  vehiclesFound: integer("vehicles_found").default(0),
  vehiclesInserted: integer("vehicles_inserted").default(0),
  vehiclesUpdated: integer("vehicles_updated").default(0),
  vehiclesDeleted: integer("vehicles_deleted").default(0),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  durationMs: integer("duration_ms"),
  triggeredBy: text("triggered_by").default("scheduler"), // "scheduler", "manual", "webhook"
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const insertScrapeRunSchema = createInsertSchema(scrapeRuns).omit({
  id: true,
  startedAt: true,
});

export type InsertScrapeRun = z.infer<typeof insertScrapeRunSchema>;
export type ScrapeRun = typeof scrapeRuns.$inferSelect;

// Scrape queue - Checkpointed VDP URLs for resumable scraping
export const scrapeQueue = pgTable("scrape_queue", {
  id: serial("id").primaryKey(),
  scrapeRunId: integer("scrape_run_id").references(() => scrapeRuns.id, { onDelete: 'cascade' }),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  vdpUrl: text("vdp_url").notNull(),
  vehicleTitle: text("vehicle_title"), // e.g., "2024 Toyota Corolla" for quick reference
  position: integer("position").notNull(), // Order in the queue (1, 2, 3...)
  status: text("status").notNull().default("pending"), // "pending", "processing", "completed", "failed"
  vehicleId: integer("vehicle_id"), // Populated after successful save
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  processedAt: timestamp("processed_at"),
});

export const insertScrapeQueueSchema = createInsertSchema(scrapeQueue).omit({
  id: true,
  createdAt: true,
});

export type InsertScrapeQueue = z.infer<typeof insertScrapeQueueSchema>;
export type ScrapeQueue = typeof scrapeQueue.$inferSelect;

// Facebook accounts for salespeople (up to 5 per user)
export const facebookAccounts = pgTable("facebook_accounts", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id), // Salesperson who owns this account
  accountName: text("account_name").notNull(), // Display name for the account
  facebookUserId: text("facebook_user_id"), // Facebook user ID (from OAuth)
  accessToken: text("access_token"), // Long-lived access token
  tokenExpiresAt: timestamp("token_expires_at"), // When the token expires
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFacebookAccountSchema = createInsertSchema(facebookAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFacebookAccount = z.infer<typeof insertFacebookAccountSchema>;
export type FacebookAccount = typeof facebookAccounts.$inferSelect;

// Ad templates for Facebook Marketplace posts
export const adTemplates = pgTable("ad_templates", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id), // User who created this
  templateName: text("template_name").notNull(), // e.g., "Classic", "Premium", "Budget"
  titleTemplate: text("title_template").notNull(), // e.g., "{year} {make} {model} - ${price}"
  descriptionTemplate: text("description_template").notNull(), // Full description with variables
  isDefault: boolean("is_default").notNull().default(false), // If this is the default template
  isShared: boolean("is_shared").notNull().default(false), // If true, visible to all staff (manager-created)
  parentTemplateId: integer("parent_template_id"), // If copied from a shared template, reference to original
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAdTemplateSchema = createInsertSchema(adTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAdTemplate = z.infer<typeof insertAdTemplateSchema>;
export type AdTemplate = typeof adTemplates.$inferSelect;

// Posting queue for Facebook Marketplace
export const postingQueue = pgTable("posting_queue", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id), // Salesperson
  facebookAccountId: integer("facebook_account_id").references(() => facebookAccounts.id), // Which account to use
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  templateId: integer("template_id").references(() => adTemplates.id), // Which template to use
  queueOrder: integer("queue_order").notNull(), // Position in queue (1-45)
  status: text("status").notNull().default('queued'), // 'queued', 'scheduled', 'posting', 'posted', 'failed'
  scheduledFor: timestamp("scheduled_for"), // When to post (null = use auto-scheduler)
  postedAt: timestamp("posted_at"), // When it was actually posted
  facebookPostId: text("facebook_post_id"), // Facebook Marketplace listing ID
  errorMessage: text("error_message"), // If posting failed
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPostingQueueSchema = createInsertSchema(postingQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPostingQueue = z.infer<typeof insertPostingQueueSchema>;
export type PostingQueue = typeof postingQueue.$inferSelect;

// Posting schedule configuration (per salesperson)
export const postingSchedule = pgTable("posting_schedule", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id).unique(), // One schedule per salesperson
  startTime: text("start_time").notNull().default('09:00'), // HH:MM format
  intervalMinutes: integer("interval_minutes").notNull().default(30), // Time between posts
  isActive: boolean("is_active").notNull().default(false), // Auto-posting enabled/disabled
  lastPostedAt: timestamp("last_posted_at"), // Track when we last posted
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPostingScheduleSchema = createInsertSchema(postingSchedule).omit({
  id: true,
  updatedAt: true,
});

export type InsertPostingSchedule = z.infer<typeof insertPostingScheduleSchema>;
export type PostingSchedule = typeof postingSchedule.$inferSelect;

// Facebook Page Settings - Per-page auto-posting configuration
export const facebookPageSettings = pgTable("facebook_page_settings", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id), // Salesperson who owns this page
  facebookAccountId: integer("facebook_account_id").notNull().references(() => facebookAccounts.id, { onDelete: 'cascade' }),
  pageId: text("page_id").notNull(), // Facebook Page ID
  pageName: text("page_name").notNull(), // Display name
  pageColor: text("page_color").notNull().default('#00aad2'), // Color for calendar display
  // Posting settings
  frequencyPreset: text("frequency_preset").notNull().default('balanced'), // 'aggressive', 'balanced', 'lightweight'
  postsPerDay: integer("posts_per_day").notNull().default(3), // Max posts per day
  startTime: text("start_time").notNull().default('09:00'), // HH:MM format
  endTime: text("end_time").notNull().default('21:00'), // Quiet hours after this
  intervalMinutes: integer("interval_minutes").notNull().default(120), // Time between posts
  activeDays: text("active_days").array().notNull(), // Days to post (Mon, Tue, Wed, Thu, Fri, Sat, Sun)
  // Template settings
  defaultTemplateId: integer("default_template_id").references(() => adTemplates.id),
  // Auto-posting control
  isAutoPostingEnabled: boolean("is_auto_posting_enabled").notNull().default(false),
  lastPostedAt: timestamp("last_posted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFacebookPageSettingsSchema = createInsertSchema(facebookPageSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastPostedAt: true,
});

export type InsertFacebookPageSettings = z.infer<typeof insertFacebookPageSettingsSchema>;
export type FacebookPageSettings = typeof facebookPageSettings.$inferSelect;

// Facebook Catalog configuration (for Automotive Inventory Ads)
export const facebookCatalogConfig = pgTable("facebook_catalog_config", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }).unique(),
  catalogId: text("catalog_id").notNull(), // Facebook Catalog ID
  accessToken: text("access_token").notNull(), // System user access token for catalog
  catalogName: text("catalog_name"), // Display name of catalog
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"), // When we last synced inventory
  lastSyncStatus: text("last_sync_status"), // 'success', 'partial', 'failed'
  lastSyncMessage: text("last_sync_message"), // Details about last sync
  vehiclesSynced: integer("vehicles_synced").default(0), // Count of vehicles in catalog
  autoSyncEnabled: boolean("auto_sync_enabled").notNull().default(true), // Enable daily auto-sync
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFacebookCatalogConfigSchema = createInsertSchema(facebookCatalogConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncAt: true,
  lastSyncStatus: true,
  lastSyncMessage: true,
  vehiclesSynced: true,
});

export type InsertFacebookCatalogConfig = z.infer<typeof insertFacebookCatalogConfigSchema>;
export type FacebookCatalogConfig = typeof facebookCatalogConfig.$inferSelect;

// Facebook Messenger conversations (from Facebook pages connected by salespeople)
export const messengerConversations = pgTable("messenger_conversations", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  facebookAccountId: integer("facebook_account_id").notNull().references(() => facebookAccounts.id, { onDelete: 'cascade' }),
  pageId: text("page_id").notNull(), // Facebook Page ID
  pageName: text("page_name").notNull(), // Facebook Page name for display
  conversationId: text("conversation_id").notNull().unique(), // Facebook conversation ID
  participantName: text("participant_name").notNull(), // Customer's name from Facebook
  participantId: text("participant_id").notNull(), // Customer's Facebook ID
  lastMessage: text("last_message"), // Preview of last message
  lastMessageAt: timestamp("last_message_at"), // When last message was sent
  unreadCount: integer("unread_count").notNull().default(0),
  status: text("status").notNull().default('active'), // 'active', 'archived', 'spam'
  ghlConversationId: text("ghl_conversation_id"), // GoHighLevel conversation ID for sync
  ghlContactId: text("ghl_contact_id"), // GoHighLevel contact ID for sync
  lastGhlSyncAt: timestamp("last_ghl_sync_at"), // When last synced with GHL
  // Sales pipeline metadata (synced with GHL)
  leadStatus: text("lead_status").default('new'), // 'new', 'hot', 'warm', 'cold', 'pending', 'sold', 'lost'
  pipelineStage: text("pipeline_stage").default('inquiry'), // 'inquiry', 'qualified', 'test_drive', 'negotiation', 'closed'
  tags: text("tags").array(), // Tags array e.g. ['Facebook Lead', 'Trade-In Interest']
  vehicleOfInterest: text("vehicle_of_interest"), // Stock # or description of vehicle customer is interested in
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id, { onDelete: 'set null' }), // Direct assignment field
  customerPhone: text("customer_phone"), // Phone if collected during conversation
  customerEmail: text("customer_email"), // Email if collected during conversation
  // AI Agent settings
  aiEnabled: boolean("ai_enabled").notNull().default(true), // Whether AI can respond
  aiDisabledReason: text("ai_disabled_reason"), // 'stop_request', 'rudeness', 'manual'
  aiDisabledAt: timestamp("ai_disabled_at"), // When AI was disabled
  aiWatchMode: boolean("ai_watch_mode").notNull().default(false), // Manual takeover - AI watches but doesn't respond
  aiWatchModeAt: timestamp("ai_watch_mode_at"), // When watch mode was enabled
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertMessengerConversationSchema = createInsertSchema(messengerConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMessengerConversation = z.infer<typeof insertMessengerConversationSchema>;
export type MessengerConversation = typeof messengerConversations.$inferSelect;

// Messenger messages - Individual messages within a conversation
export const messengerMessages = pgTable("messenger_messages", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  conversationId: integer("conversation_id").notNull().references(() => messengerConversations.id, { onDelete: 'cascade' }),
  facebookMessageId: text("facebook_message_id").notNull().unique(), // Facebook message ID
  senderId: text("sender_id").notNull(), // Facebook ID of sender
  senderName: text("sender_name").notNull(), // Display name of sender
  isFromCustomer: boolean("is_from_customer").notNull(), // true = customer message, false = dealership response
  content: text("content").notNull(), // Message text content
  attachmentType: text("attachment_type"), // 'image', 'video', 'file', null if text only
  attachmentUrl: text("attachment_url"), // URL of attachment if any
  isRead: boolean("is_read").notNull().default(false),
  sentAt: timestamp("sent_at").notNull(), // When the message was sent
  ghlMessageId: text("ghl_message_id"), // GoHighLevel message ID for deduplication
  syncSource: text("sync_source").default('facebook'), // 'facebook', 'ghl', 'lotview' - where message originated
  // AI-generated message fields
  aiGenerated: boolean("ai_generated").default(false), // Was this message generated by AI?
  aiPromptUsed: text("ai_prompt_used"), // The prompt/context that generated this message
  // Training mode - allow editing AI prompts for learning
  aiPromptEdited: text("ai_prompt_edited"), // Edited version of the prompt after training
  aiPromptEditReason: text("ai_prompt_edit_reason"), // Why the prompt was edited
  aiPromptEditedById: integer("ai_prompt_edited_by_id").references(() => users.id, { onDelete: 'set null' }),
  aiPromptEditedAt: timestamp("ai_prompt_edited_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMessengerMessageSchema = createInsertSchema(messengerMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertMessengerMessage = z.infer<typeof insertMessengerMessageSchema>;
export type MessengerMessage = typeof messengerMessages.$inferSelect;

// Scheduled messages - Messages scheduled for future delivery
export const scheduledMessages = pgTable("scheduled_messages", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  conversationId: integer("conversation_id").references(() => messengerConversations.id, { onDelete: 'cascade' }),
  crmContactId: integer("crm_contact_id").references(() => crmContacts.id, { onDelete: 'cascade' }),
  // Message details
  channel: text("channel").notNull(), // 'facebook', 'sms', 'email'
  content: text("content").notNull(),
  subject: text("subject"), // For email
  // Scheduling
  scheduledAt: timestamp("scheduled_at").notNull(), // When to send
  status: text("status").notNull().default('pending'), // 'pending', 'sent', 'cancelled', 'failed'
  // AI context
  aiGenerated: boolean("ai_generated").default(false),
  aiPromptUsed: text("ai_prompt_used"),
  triggerContext: text("trigger_context"), // Why this was scheduled (customer said "call me Friday")
  // Tracking
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertScheduledMessageSchema = createInsertSchema(scheduledMessages).omit({
  id: true,
  createdAt: true,
  sentAt: true,
});

export type InsertScheduledMessage = z.infer<typeof insertScheduledMessageSchema>;
export type ScheduledMessage = typeof scheduledMessages.$inferSelect;

// Conversation assignments - Assign conversations to salespeople
export const conversationAssignments = pgTable("conversation_assignments", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  conversationId: integer("conversation_id").notNull().references(() => messengerConversations.id, { onDelete: 'cascade' }).unique(),
  assignedToUserId: integer("assigned_to_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  assignedByUserId: integer("assigned_by_user_id").references(() => users.id, { onDelete: 'set null' }), // Manager who assigned
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  notes: text("notes"), // Assignment notes from manager
});

export const insertConversationAssignmentSchema = createInsertSchema(conversationAssignments).omit({
  id: true,
  assignedAt: true,
});

export type InsertConversationAssignment = z.infer<typeof insertConversationAssignmentSchema>;
export type ConversationAssignment = typeof conversationAssignments.$inferSelect;

// Remarketing vehicles - Master user selects up to 20 vehicles for remarketing campaigns
export const remarketingVehicles = pgTable("remarketing_vehicles", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  budgetPriority: integer("budget_priority").notNull(), // 1-5 scale (5 = highest priority)
  isActive: boolean("is_active").notNull().default(true),
  addedAt: timestamp("added_at").defaultNow().notNull(),
});

export const insertRemarketingVehicleSchema = createInsertSchema(remarketingVehicles).omit({
  id: true,
  addedAt: true,
});

export type InsertRemarketingVehicle = z.infer<typeof insertRemarketingVehicleSchema>;
export type RemarketingVehicle = typeof remarketingVehicles.$inferSelect;

// PBS DMS Integration Configuration
export const pbsConfig = pgTable("pbs_config", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  partnerId: text("partner_id").notNull(), // PBS Partner ID
  username: text("username").notNull(), // PBS API username
  password: text("password").notNull(), // PBS API password (encrypted)
  webhookUrl: text("webhook_url"), // Our endpoint URL for PBS to send webhooks
  webhookSecret: text("webhook_secret"), // Secret for webhook signature verification
  pbsApiUrl: text("pbs_api_url").notNull().default('https://partnerhub.pbsdealers.com'), // PBS API endpoint
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPbsConfigSchema = createInsertSchema(pbsConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPbsConfig = z.infer<typeof insertPbsConfigSchema>;
export type PbsConfig = typeof pbsConfig.$inferSelect;

// PBS Webhook Events Log
export const pbsWebhookEvents = pgTable("pbs_webhook_events", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  eventType: text("event_type").notNull(), // e.g., 'customer.created', 'vehicle.updated', 'appointment.scheduled'
  eventId: text("event_id").notNull(), // PBS event ID
  payload: text("payload").notNull(), // JSON payload from PBS
  status: text("status").notNull().default('pending'), // pending, processed, failed
  errorMessage: text("error_message"), // If processing failed
  processedAt: timestamp("processed_at"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
});

export const insertPbsWebhookEventSchema = createInsertSchema(pbsWebhookEvents).omit({
  id: true,
  receivedAt: true,
});

export type InsertPbsWebhookEvent = z.infer<typeof insertPbsWebhookEventSchema>;
export type PbsWebhookEvent = typeof pbsWebhookEvents.$inferSelect;

// PBS API Sessions - stores authenticated sessions for PBS Partner Hub API
export const pbsSessions = pgTable("pbs_sessions", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  sessionToken: text("session_token").notNull(), // PBS session token/cookie
  sessionData: text("session_data"), // Additional session metadata (JSON)
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertPbsSessionSchema = createInsertSchema(pbsSessions).omit({
  id: true,
  issuedAt: true,
  lastUsedAt: true,
});

export type InsertPbsSession = z.infer<typeof insertPbsSessionSchema>;
export type PbsSession = typeof pbsSessions.$inferSelect;

// PBS Contact Cache - cache contacts from PBS for quick AI lookups
export const pbsContactCache = pgTable("pbs_contact_cache", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  pbsContactId: text("pbs_contact_id").notNull(), // PBS internal contact ID
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  cellPhone: text("cell_phone"),
  address: text("address"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  payload: text("payload").notNull(), // Full PBS response JSON
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertPbsContactCacheSchema = createInsertSchema(pbsContactCache).omit({
  id: true,
  fetchedAt: true,
});

export type InsertPbsContactCache = z.infer<typeof insertPbsContactCacheSchema>;
export type PbsContactCache = typeof pbsContactCache.$inferSelect;

// PBS Appointment Cache - cache appointments from PBS
export const pbsAppointmentCache = pgTable("pbs_appointment_cache", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  pbsAppointmentId: text("pbs_appointment_id").notNull(), // PBS internal appointment ID
  appointmentType: text("appointment_type").notNull(), // 'sales', 'service', 'parts'
  pbsContactId: text("pbs_contact_id"), // Link to contact
  scheduledDate: timestamp("scheduled_date"),
  status: text("status"), // PBS appointment status
  payload: text("payload").notNull(), // Full PBS response JSON
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertPbsAppointmentCacheSchema = createInsertSchema(pbsAppointmentCache).omit({
  id: true,
  fetchedAt: true,
});

export type InsertPbsAppointmentCache = z.infer<typeof insertPbsAppointmentCacheSchema>;
export type PbsAppointmentCache = typeof pbsAppointmentCache.$inferSelect;

// PBS Parts Inventory Cache - cache parts data from PBS
export const pbsPartsCache = pgTable("pbs_parts_cache", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  partNumber: text("part_number").notNull(),
  description: text("description"),
  quantityOnHand: integer("quantity_on_hand"),
  quantityAvailable: integer("quantity_available"),
  retailPrice: text("retail_price"), // MSRP
  costPrice: text("cost_price"),
  payload: text("payload").notNull(), // Full PBS response JSON
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const insertPbsPartsCacheSchema = createInsertSchema(pbsPartsCache).omit({
  id: true,
  fetchedAt: true,
});

export type InsertPbsPartsCache = z.infer<typeof insertPbsPartsCacheSchema>;
export type PbsPartsCache = typeof pbsPartsCache.$inferSelect;

// PBS API Call Log - track all PBS API calls for debugging and rate limiting
export const pbsApiLogs = pgTable("pbs_api_logs", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  endpoint: text("endpoint").notNull(), // e.g., 'ContactGet', 'AppointmentChange'
  method: text("method").notNull(), // 'GET', 'POST'
  requestPayload: text("request_payload"), // Request body (sanitized)
  responseStatus: integer("response_status"), // HTTP status code
  responsePayload: text("response_payload"), // Response body (truncated)
  durationMs: integer("duration_ms"), // Request duration
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPbsApiLogSchema = createInsertSchema(pbsApiLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertPbsApiLog = z.infer<typeof insertPbsApiLogSchema>;
export type PbsApiLog = typeof pbsApiLogs.$inferSelect;

// Manager Settings for postal code and search preferences
export const managerSettings = pgTable("manager_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  postalCode: text("postal_code").notNull(), // Canadian postal code (e.g., V6B 1A1)
  defaultRadiusKm: integer("default_radius_km").notNull().default(50), // Default search radius in kilometers
  geocodeLat: text("geocode_lat"), // Cached latitude from postal code
  geocodeLon: text("geocode_lon"), // Cached longitude from postal code
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertManagerSettingsSchema = createInsertSchema(managerSettings).omit({
  id: true,
  updatedAt: true,
});

export type InsertManagerSettings = z.infer<typeof insertManagerSettingsSchema>;
export type ManagerSettings = typeof managerSettings.$inferSelect;

// Market Listings Cache (scraped from AutoTrader, Kijiji, etc.)
export const marketListings = pgTable("market_listings", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  externalId: text("external_id").notNull(), // Unique ID from source platform
  source: text("source").notNull(), // 'marketcheck', 'apify', 'autotrader_scraper'
  listingType: text("listing_type").notNull(), // 'dealer', 'private'
  year: integer("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  trim: text("trim"),
  price: integer("price").notNull(),
  mileage: integer("mileage"), // in kilometers
  location: text("location").notNull(), // City, Province
  postalCode: text("postal_code"), // Seller postal code (if available)
  latitude: text("latitude"),
  longitude: text("longitude"),
  sellerName: text("seller_name"), // Dealer name or "Private Seller"
  imageUrl: text("image_url"),
  listingUrl: text("listing_url").notNull().unique(), // Original listing URL
  postedDate: timestamp("posted_date"), // When the listing was posted
  scrapedAt: timestamp("scraped_at").defaultNow().notNull(), // When we scraped it
  isActive: boolean("is_active").notNull().default(true), // False if listing is removed
  interiorColor: text("interior_color"), // Interior color from CarGurus
  exteriorColor: text("exterior_color"), // Exterior color from CarGurus
  vin: text("vin"), // Vehicle VIN for color lookup
  colorScrapedAt: timestamp("color_scraped_at"), // When colors were last scraped
  // Extended CarGurus data fields
  sourceConfidence: integer("source_confidence"), // Quality score 0-100 based on data completeness
  specsJson: text("specs_json"), // JSON string with vehicle specs (engine, transmission, etc.)
  featuresJson: text("features_json"), // JSON string with vehicle features list
  marketAvailabilityCount: integer("market_availability_count"), // How many similar vehicles on market
  dataSourceRank: integer("data_source_rank"), // Priority: 1=MarketCheck, 2=CarGurus, 3=Apify, 4=AutoTrader scraper
  vehicleHash: text("vehicle_hash"), // Normalized hash for deduplication (make/model/year/trim/dealer/mileage)
  dealerRating: text("dealer_rating"), // Dealer rating from source
  historyBadges: text("history_badges"), // JSON array of history badges (accident-free, one-owner, etc.)
  daysOnLot: integer("days_on_lot"), // Days listing has been on market from CarGurus
});

// Market Listing Sources - Tracks when same vehicle appears on multiple platforms
export const marketListingSources = pgTable("market_listing_sources", {
  id: serial("id").primaryKey(),
  primaryListingId: integer("primary_listing_id").notNull().references(() => marketListings.id, { onDelete: 'cascade' }),
  source: text("source").notNull(), // 'cargurus', 'autotrader', 'kijiji', etc.
  externalId: text("external_id").notNull(),
  listingUrl: text("listing_url").notNull(),
  price: integer("price"),
  sourceConfidence: integer("source_confidence"), // Quality score for this source
  rawDataJson: text("raw_data_json"), // Full scraped data for reference
  scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
});

export const insertMarketListingSourcesSchema = createInsertSchema(marketListingSources).omit({
  id: true,
  scrapedAt: true,
});

export type InsertMarketListingSource = z.infer<typeof insertMarketListingSourcesSchema>;
export type MarketListingSource = typeof marketListingSources.$inferSelect;

// CarGurus Color Cache - Stores scraped color data by VIN with TTL
export const cargurusColorCache = pgTable("cargurus_color_cache", {
  id: serial("id").primaryKey(),
  vin: text("vin").notNull().unique(), // VIN as primary lookup key
  interiorColor: text("interior_color"),
  exteriorColor: text("exterior_color"),
  cargurusListingId: text("cargurus_listing_id"), // CarGurus listing ID where color was found
  cargurusUrl: text("cargurus_url"), // URL of the listing
  scrapedAt: timestamp("scraped_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(), // TTL for cache (e.g., 30 days)
});

export const insertCargurusColorCacheSchema = createInsertSchema(cargurusColorCache).omit({
  id: true,
  scrapedAt: true,
});

export type InsertCargurusColorCache = z.infer<typeof insertCargurusColorCacheSchema>;
export type CargurusColorCache = typeof cargurusColorCache.$inferSelect;

export const insertMarketListingSchema = createInsertSchema(marketListings).omit({
  id: true,
  scrapedAt: true,
});

export type InsertMarketListing = z.infer<typeof insertMarketListingSchema>;
export type MarketListing = typeof marketListings.$inferSelect;

// Price History Tracking (for trend analysis)
export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  marketListingId: integer("market_listing_id").references(() => marketListings.id, { onDelete: 'cascade' }),
  externalId: text("external_id").notNull(), // Link to original listing
  source: text("source").notNull(), // 'autotrader', 'kijiji', 'cargurus', etc.
  year: integer("year").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  trim: text("trim"),
  price: integer("price").notNull(),
  mileage: integer("mileage"),
  location: text("location").notNull(),
  sellerName: text("seller_name"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

export const insertPriceHistorySchema = createInsertSchema(priceHistory).omit({
  id: true,
  recordedAt: true,
});

export type InsertPriceHistory = z.infer<typeof insertPriceHistorySchema>;
export type PriceHistory = typeof priceHistory.$inferSelect;

// Competitor Dealers (tracked nearby competitors)
export const competitorDealers = pgTable("competitor_dealers", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  competitorName: text("competitor_name").notNull(),
  competitorUrl: text("competitor_url"),
  competitorAddress: text("competitor_address"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  distanceKm: integer("distance_km"), // Distance from home dealership
  totalListings: integer("total_listings").default(0),
  averagePrice: integer("average_price"),
  lastScrapedAt: timestamp("last_scraped_at"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCompetitorDealerSchema = createInsertSchema(competitorDealers).omit({
  id: true,
  createdAt: true,
});

export type InsertCompetitorDealer = z.infer<typeof insertCompetitorDealerSchema>;
export type CompetitorDealer = typeof competitorDealers.$inferSelect;

// Market Analysis Snapshots (daily/weekly summaries)
export const marketSnapshots = pgTable("market_snapshots", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  snapshotDate: timestamp("snapshot_date").notNull(),
  make: text("make").notNull(),
  model: text("model").notNull(),
  yearMin: integer("year_min"),
  yearMax: integer("year_max"),
  totalListings: integer("total_listings").notNull(),
  averagePrice: integer("average_price").notNull(),
  medianPrice: integer("median_price").notNull(),
  minPrice: integer("min_price").notNull(),
  maxPrice: integer("max_price").notNull(),
  p10Price: integer("p10_price"), // 10th percentile
  p25Price: integer("p25_price"), // 25th percentile
  p75Price: integer("p75_price"), // 75th percentile
  p90Price: integer("p90_price"), // 90th percentile
  averageMileage: integer("average_mileage"),
  averageDaysOnMarket: integer("average_days_on_market"),
  sources: text("sources").array(), // Which sources contributed
  searchRadiusKm: integer("search_radius_km"),
  searchPostalCode: text("search_postal_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertMarketSnapshotSchema = createInsertSchema(marketSnapshots).omit({
  id: true,
  createdAt: true,
});

export type InsertMarketSnapshot = z.infer<typeof insertMarketSnapshotSchema>;
export type MarketSnapshot = typeof marketSnapshots.$inferSelect;

// ====== ONBOARDING SYSTEM TABLES ======

// Dealership branding - logos, colors, content
export const dealershipBranding = pgTable("dealership_branding", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }).unique(),
  logoUrl: text("logo_url"), // Main logo URL
  faviconUrl: text("favicon_url"), // Favicon URL
  primaryColor: text("primary_color").default('#022d60'), // Primary brand color (hex)
  secondaryColor: text("secondary_color").default('#00aad2'), // Secondary brand color (hex)
  heroHeadline: text("hero_headline"), // Main headline for inventory page
  heroSubheadline: text("hero_subheadline"), // Subheadline
  heroImageUrl: text("hero_image_url"), // Hero background image URL
  tagline: text("tagline"), // Dealership tagline
  customCss: text("custom_css"), // Custom CSS overrides
  promoBannerText: text("promo_banner_text"), // Optional promo banner
  promoBannerActive: boolean("promo_banner_active").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDealershipBrandingSchema = createInsertSchema(dealershipBranding).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDealershipBranding = z.infer<typeof insertDealershipBrandingSchema>;
export type DealershipBranding = typeof dealershipBranding.$inferSelect;

// Dealership contact channels
export const dealershipContacts = pgTable("dealership_contacts", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }).unique(),
  supportEmail: text("support_email"), // Customer support email
  salesEmail: text("sales_email"), // Sales team email
  salesPhone: text("sales_phone"), // Sales hotline
  smsNumber: text("sms_number"), // SMS/text number
  websiteUrl: text("website_url"), // Main website
  privacyPolicyUrl: text("privacy_policy_url"), // Privacy policy link
  termsOfServiceUrl: text("terms_of_service_url"), // Terms of service link
  businessHours: text("business_hours"), // JSON with hours per day
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertDealershipContactsSchema = createInsertSchema(dealershipContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDealershipContacts = z.infer<typeof insertDealershipContactsSchema>;
export type DealershipContacts = typeof dealershipContacts.$inferSelect;

// Staff invitations - pending user accounts
export const staffInvites = pgTable("staff_invites", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull(), // 'master', 'manager', 'salesperson'
  inviteToken: text("invite_token").notNull().unique(), // Hashed token for signup link
  status: text("status").notNull().default('pending'), // 'pending', 'accepted', 'expired'
  invitedBy: integer("invited_by").references(() => users.id),
  expiresAt: timestamp("expires_at").notNull(),
  acceptedAt: timestamp("accepted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertStaffInviteSchema = createInsertSchema(staffInvites).omit({
  id: true,
  createdAt: true,
  acceptedAt: true,
});

export type InsertStaffInvite = z.infer<typeof insertStaffInviteSchema>;
export type StaffInvite = typeof staffInvites.$inferSelect;

// Onboarding runs - track each onboarding execution
export const onboardingRuns = pgTable("onboarding_runs", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").references(() => dealerships.id, { onDelete: 'cascade' }),
  status: text("status").notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'failed', 'partial'
  initiatedBy: integer("initiated_by").notNull().references(() => users.id),
  inputData: text("input_data").notNull(), // JSON of all onboarding form data
  errorMessage: text("error_message"), // Overall error if failed
  completedSteps: integer("completed_steps").default(0),
  totalSteps: integer("total_steps").default(0),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertOnboardingRunSchema = createInsertSchema(onboardingRuns).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

export type InsertOnboardingRun = z.infer<typeof insertOnboardingRunSchema>;
export type OnboardingRun = typeof onboardingRuns.$inferSelect;

// Onboarding run steps - detailed progress for each step
export const onboardingRunSteps = pgTable("onboarding_run_steps", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => onboardingRuns.id, { onDelete: 'cascade' }),
  stepName: text("step_name").notNull(), // e.g., 'create_dealership', 'seed_financing', 'create_users'
  stepOrder: integer("step_order").notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'failed', 'skipped'
  details: text("details"), // JSON with step-specific results
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});

export const insertOnboardingRunStepSchema = createInsertSchema(onboardingRunSteps).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export type InsertOnboardingRunStep = z.infer<typeof insertOnboardingRunStepSchema>;
export type OnboardingRunStep = typeof onboardingRunSteps.$inferSelect;

// Integration status tracking - monitor each integration's health
export const integrationStatus = pgTable("integration_status", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  integrationName: text("integration_name").notNull(), // 'openai', 'facebook', 'marketcheck', etc.
  status: text("status").notNull().default('not_configured'), // 'not_configured', 'pending', 'active', 'error', 'expired'
  lastCheckedAt: timestamp("last_checked_at"),
  lastSuccessAt: timestamp("last_success_at"),
  errorMessage: text("error_message"),
  configDetails: text("config_details"), // JSON with non-sensitive config info
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertIntegrationStatusSchema = createInsertSchema(integrationStatus).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertIntegrationStatus = z.infer<typeof insertIntegrationStatusSchema>;
export type IntegrationStatus = typeof integrationStatus.$inferSelect;

// Launch checklist - tracks manual tasks needed before dealership goes live
export const launchChecklist = pgTable("launch_checklist", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  category: text("category").notNull(), // 'accounts', 'legal', 'branding', 'integrations', 'staff', 'content'
  taskName: text("task_name").notNull(), // e.g., 'Create Facebook Business Page'
  taskDescription: text("task_description"), // Detailed instructions
  isRequired: boolean("is_required").notNull().default(true), // Required vs optional
  status: text("status").notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'skipped'
  completedBy: integer("completed_by").references(() => users.id),
  completedAt: timestamp("completed_at"),
  dueDate: timestamp("due_date"), // Optional deadline
  sortOrder: integer("sort_order").notNull().default(0), // For ordering within category
  externalUrl: text("external_url"), // Link to external service (e.g., Stripe signup)
  notes: text("notes"), // User notes about the task
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertLaunchChecklistSchema = createInsertSchema(launchChecklist).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
});

export type InsertLaunchChecklist = z.infer<typeof insertLaunchChecklistSchema>;
export type LaunchChecklist = typeof launchChecklist.$inferSelect;

// ===== GOHIGHLEVEL INTEGRATION TABLES =====

// GoHighLevel Accounts - OAuth tokens and account info per dealership
export const ghlAccounts = pgTable("ghl_accounts", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  locationId: text("location_id").notNull(), // GHL location/sub-account ID
  companyId: text("company_id"), // GHL agency company ID (if applicable)
  accessToken: text("access_token").notNull(), // OAuth access token (encrypted in production)
  refreshToken: text("refresh_token").notNull(), // OAuth refresh token
  tokenType: text("token_type").notNull().default('Bearer'),
  expiresAt: timestamp("expires_at").notNull(), // When access token expires
  scope: text("scope"), // OAuth scopes granted
  userType: text("user_type"), // GHL user type from OAuth (Location, Company, etc.)
  userName: text("user_name"), // GHL user name who connected
  userEmail: text("user_email"), // GHL user email
  locationName: text("location_name"), // Sub-account/location name
  isActive: boolean("is_active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"), // Last successful sync
  syncStatus: text("sync_status").default('pending'), // 'pending', 'syncing', 'synced', 'error'
  syncError: text("sync_error"), // Last sync error message
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGhlAccountSchema = createInsertSchema(ghlAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGhlAccount = z.infer<typeof insertGhlAccountSchema>;
export type GhlAccount = typeof ghlAccounts.$inferSelect;

// GoHighLevel Configuration - calendars, pipelines, custom field mappings per dealership
export const ghlConfig = pgTable("ghl_config", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  ghlAccountId: integer("ghl_account_id").notNull().references(() => ghlAccounts.id, { onDelete: 'cascade' }),
  // Calendar settings
  salesCalendarId: text("sales_calendar_id"), // GHL calendar ID for sales appointments
  serviceCalendarId: text("service_calendar_id"), // GHL calendar ID for service appointments
  // Pipeline settings
  salesPipelineId: text("sales_pipeline_id"), // GHL pipeline for vehicle sales
  servicePipelineId: text("service_pipeline_id"), // GHL pipeline for service leads
  // Stage mappings (JSON)
  pipelineStages: text("pipeline_stages"), // JSON: { "new_lead": "stage_id", "contacted": "stage_id", ... }
  // Custom field mappings (JSON)
  customFieldMappings: text("custom_field_mappings"), // JSON: { "vin": "field_id", "vehicle_interest": "field_id", ... }
  // Tag settings
  autoTagNewLeads: boolean("auto_tag_new_leads").notNull().default(true),
  leadSourceTag: text("lead_source_tag").default('Lotview.ai'),
  // Sync settings
  syncContacts: boolean("sync_contacts").notNull().default(true),
  syncAppointments: boolean("sync_appointments").notNull().default(true),
  syncOpportunities: boolean("sync_opportunities").notNull().default(true),
  bidirectionalSync: boolean("bidirectional_sync").notNull().default(true), // Sync both ways
  // Webhook settings
  webhookVerifyToken: text("webhook_verify_token"), // Shared secret for webhook signature verification
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertGhlConfigSchema = createInsertSchema(ghlConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertGhlConfig = z.infer<typeof insertGhlConfigSchema>;
export type GhlConfig = typeof ghlConfig.$inferSelect;

// GoHighLevel Webhook Events - incoming webhooks from GHL
export const ghlWebhookEvents = pgTable("ghl_webhook_events", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  eventType: text("event_type").notNull(), // e.g., 'ContactCreate', 'AppointmentCreate', 'OpportunityStageUpdate'
  eventId: text("event_id").notNull(), // GHL event ID for deduplication
  locationId: text("location_id").notNull(), // GHL location ID to route to correct dealership
  resourceId: text("resource_id"), // ID of the affected resource (contact ID, appointment ID, etc.)
  payload: text("payload").notNull(), // Full webhook payload JSON
  status: text("status").notNull().default('pending'), // 'pending', 'processing', 'processed', 'failed', 'skipped'
  processingAttempts: integer("processing_attempts").notNull().default(0),
  errorMessage: text("error_message"),
  processedAt: timestamp("processed_at"),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
});

export const insertGhlWebhookEventSchema = createInsertSchema(ghlWebhookEvents).omit({
  id: true,
  receivedAt: true,
});

export type InsertGhlWebhookEvent = z.infer<typeof insertGhlWebhookEventSchema>;
export type GhlWebhookEvent = typeof ghlWebhookEvents.$inferSelect;

// GoHighLevel Contact Sync - track synced contacts between GHL, PBS, and Lotview
export const ghlContactSync = pgTable("ghl_contact_sync", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  ghlContactId: text("ghl_contact_id").notNull(), // GoHighLevel contact ID
  pbsContactId: text("pbs_contact_id"), // PBS DMS contact ID (if synced)
  lotviewLeadId: integer("lotview_lead_id"), // Internal Lotview lead ID (future)
  // Contact snapshot for quick access
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  // Sync metadata
  ghlUpdatedAt: timestamp("ghl_updated_at"), // Last update time in GHL
  pbsUpdatedAt: timestamp("pbs_updated_at"), // Last update time in PBS
  syncDirection: text("sync_direction").notNull().default('bidirectional'), // 'ghl_to_pbs', 'pbs_to_ghl', 'bidirectional'
  syncStatus: text("sync_status").notNull().default('synced'), // 'synced', 'pending', 'conflict', 'error'
  lastSyncAt: timestamp("last_sync_at").defaultNow().notNull(),
  syncError: text("sync_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGhlContactSyncSchema = createInsertSchema(ghlContactSync).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true,
});

export type InsertGhlContactSync = z.infer<typeof insertGhlContactSyncSchema>;
export type GhlContactSync = typeof ghlContactSync.$inferSelect;

// GoHighLevel Appointment Sync - track synced appointments between GHL and PBS
export const ghlAppointmentSync = pgTable("ghl_appointment_sync", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  ghlAppointmentId: text("ghl_appointment_id").notNull(), // GoHighLevel appointment ID
  ghlCalendarId: text("ghl_calendar_id").notNull(), // GHL calendar ID
  pbsAppointmentId: text("pbs_appointment_id"), // PBS appointment ID (if synced)
  ghlContactId: text("ghl_contact_id"), // GHL contact ID
  pbsContactId: text("pbs_contact_id"), // PBS contact ID
  appointmentType: text("appointment_type").notNull().default('sales'), // 'sales', 'service', 'test_drive'
  scheduledStart: timestamp("scheduled_start").notNull(),
  scheduledEnd: timestamp("scheduled_end"),
  title: text("title"),
  status: text("status"), // 'confirmed', 'cancelled', 'completed', 'no_show'
  syncDirection: text("sync_direction").notNull().default('bidirectional'), // 'ghl_to_pbs', 'pbs_to_ghl', 'bidirectional'
  syncStatus: text("sync_status").notNull().default('synced'), // 'synced', 'pending', 'conflict', 'error'
  lastSyncAt: timestamp("last_sync_at").defaultNow().notNull(),
  syncError: text("sync_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGhlAppointmentSyncSchema = createInsertSchema(ghlAppointmentSync).omit({
  id: true,
  createdAt: true,
  lastSyncAt: true,
});

export type InsertGhlAppointmentSync = z.infer<typeof insertGhlAppointmentSyncSchema>;
export type GhlAppointmentSync = typeof ghlAppointmentSync.$inferSelect;

// GoHighLevel API Logs - track API calls for debugging and rate limiting
export const ghlApiLogs = pgTable("ghl_api_logs", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  endpoint: text("endpoint").notNull(), // e.g., 'contacts', 'calendars/events', 'opportunities'
  method: text("method").notNull(), // 'GET', 'POST', 'PUT', 'DELETE'
  requestPayload: text("request_payload"), // Request body (sanitized)
  responseStatus: integer("response_status"), // HTTP status code
  responsePayload: text("response_payload"), // Response body (truncated)
  durationMs: integer("duration_ms"), // Request duration
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertGhlApiLogSchema = createInsertSchema(ghlApiLogs).omit({
  id: true,
  createdAt: true,
});

export type InsertGhlApiLog = z.infer<typeof insertGhlApiLogSchema>;
export type GhlApiLog = typeof ghlApiLogs.$inferSelect;

// ====== SCRAPER ACTIVITY LOGS ======

// Scraper activity logs - track all inventory sync operations
export const scraperActivityLogs = pgTable("scraper_activity_logs", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").references(() => dealerships.id, { onDelete: 'cascade' }),
  scrapeSourceId: integer("scrape_source_id").references(() => scrapeSources.id, { onDelete: 'set null' }),
  sourceType: text("source_type").notNull(), // 'cargurus', 'autotrader', 'manual', 'apify', 'puppeteer'
  sourceName: text("source_name"), // Human-readable source name
  status: text("status").notNull(), // 'started', 'running', 'completed', 'failed', 'partial'
  vehiclesFound: integer("vehicles_found").default(0),
  vehiclesAdded: integer("vehicles_added").default(0),
  vehiclesUpdated: integer("vehicles_updated").default(0),
  vehiclesRemoved: integer("vehicles_removed").default(0),
  errorCount: integer("error_count").default(0),
  errorMessages: text("error_messages"), // JSON array of error messages
  duration: integer("duration"), // Duration in milliseconds
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  triggeredBy: text("triggered_by").default('scheduled'), // 'scheduled', 'manual', 'webhook'
  metadata: text("metadata"), // Additional JSON metadata
});

export const insertScraperActivityLogSchema = createInsertSchema(scraperActivityLogs).omit({
  id: true,
  startedAt: true,
  completedAt: true,
});

export type InsertScraperActivityLog = z.infer<typeof insertScraperActivityLogSchema>;
export type ScraperActivityLog = typeof scraperActivityLogs.$inferSelect;

// ====== CALL ANALYSIS SYSTEM ======

// Call analysis criteria - configurable criteria for AI to evaluate calls
export const callAnalysisCriteria = pgTable("call_analysis_criteria", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Script Adherence", "Professionalism", "Closing Technique"
  description: text("description"), // Detailed description for AI to understand
  category: text("category").notNull().default('general'), // 'greeting', 'qualification', 'objection_handling', 'closing', 'general'
  weight: integer("weight").notNull().default(1), // Weight for overall score calculation (1-10)
  isActive: boolean("is_active").notNull().default(true),
  promptGuidance: text("prompt_guidance"), // Additional AI prompt guidance for this criterion
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCallAnalysisCriteriaSchema = createInsertSchema(callAnalysisCriteria).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCallAnalysisCriteria = z.infer<typeof insertCallAnalysisCriteriaSchema>;
export type CallAnalysisCriteria = typeof callAnalysisCriteria.$inferSelect;

// Call recordings - store call data from GHL webhooks
export const callRecordings = pgTable("call_recordings", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  ghlCallId: text("ghl_call_id").notNull(), // GHL message/call ID
  ghlContactId: text("ghl_contact_id"), // GHL contact ID if available
  callerPhone: text("caller_phone").notNull(),
  dealershipPhone: text("dealership_phone").notNull(), // The tracking number called
  direction: text("direction").notNull(), // 'inbound', 'outbound'
  duration: integer("duration").notNull(), // Duration in seconds
  callStatus: text("call_status").notNull(), // 'completed', 'missed', 'voicemail', 'busy', 'no_answer'
  recordingUrl: text("recording_url"), // URL to the call recording
  transcription: text("transcription"), // Full call transcription
  // Caller/contact info
  callerName: text("caller_name"),
  // Salesperson info
  salespersonId: integer("salesperson_id").references(() => users.id, { onDelete: 'set null' }),
  salespersonName: text("salesperson_name"),
  // Analysis status
  analysisStatus: text("analysis_status").notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed', 'skipped'
  analysisError: text("analysis_error"),
  analyzedAt: timestamp("analyzed_at"),
  // AI Analysis results (JSON stored as text)
  overallScore: integer("overall_score"), // 0-100 overall score
  criteriaScores: text("criteria_scores"), // JSON: { criterionId: score, ... }
  sentiment: text("sentiment"), // 'positive', 'neutral', 'negative'
  keyInsights: text("key_insights"), // JSON array of key insights
  coachingRecommendations: text("coaching_recommendations"), // JSON array of recommendations
  actionItems: text("action_items"), // JSON array of follow-up actions
  leadQualification: text("lead_qualification"), // 'hot', 'warm', 'cold', 'not_qualified'
  // Flags
  needsReview: boolean("needs_review").notNull().default(false), // Flag for manager attention
  reviewedBy: integer("reviewed_by").references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp("reviewed_at"),
  reviewNotes: text("review_notes"),
  // Timestamps
  callStartedAt: timestamp("call_started_at").notNull(),
  callEndedAt: timestamp("call_ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCallRecordingSchema = createInsertSchema(callRecordings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCallRecording = z.infer<typeof insertCallRecordingSchema>;
export type CallRecording = typeof callRecordings.$inferSelect;

// ====== SUPER ADMIN IMPERSONATION ======

// Impersonation sessions - audit trail for super admin login-as feature
export const impersonationSessions = pgTable("impersonation_sessions", {
  id: serial("id").primaryKey(),
  superAdminId: integer("super_admin_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetUserId: integer("target_user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetDealershipId: integer("target_dealership_id").references(() => dealerships.id, { onDelete: 'cascade' }),
  reason: text("reason"), // Optional reason for impersonation
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"), // NULL if session is still active
  actionsPerformed: integer("actions_performed").notNull().default(0), // Count of actions during session
});

export const insertImpersonationSessionSchema = createInsertSchema(impersonationSessions).omit({
  id: true,
  startedAt: true,
});

export type InsertImpersonationSession = z.infer<typeof insertImpersonationSessionSchema>;
export type ImpersonationSession = typeof impersonationSessions.$inferSelect;

// ====== AUTOMATION ENGINE TABLES ======

// Follow-up sequences - Define automated message sequences
export const followUpSequences = pgTable("follow_up_sequences", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "Cold Lead Revival", "Post Test Drive"
  description: text("description"),
  triggerType: text("trigger_type").notNull(), // 'chat_ended', 'no_activity', 'vehicle_views', 'post_test_drive', 'manual'
  triggerConditions: text("trigger_conditions"), // JSON: { days_inactive: 3, min_views: 2, etc. }
  // Steps is a JSON array of sequence steps
  // [{ stepNumber: 1, delayMinutes: 1440, messageType: 'sms', templateText: 'Hi {{name}}...' }, ...]
  steps: text("steps").notNull(), // JSON array of sequence steps
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFollowUpSequenceSchema = createInsertSchema(followUpSequences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFollowUpSequence = z.infer<typeof insertFollowUpSequenceSchema>;
export type FollowUpSequence = typeof followUpSequences.$inferSelect;

// Follow-up queue - Track scheduled messages for each contact
export const followUpQueue = pgTable("follow_up_queue", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  sequenceId: integer("sequence_id").notNull().references(() => followUpSequences.id, { onDelete: 'cascade' }),
  // Contact info (can be from chat, PBS, or GHL)
  contactId: text("contact_id"), // GHL contact ID if synced
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  // Source tracking
  sourceType: text("source_type").notNull(), // 'chat', 'vehicle_view', 'pbs_contact', 'manual'
  sourceId: text("source_id"), // chat conversation ID, etc.
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: 'set null' }), // Related vehicle if any
  // Sequence progress
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull(),
  // Scheduling
  nextSendAt: timestamp("next_send_at").notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'processing', 'sent', 'completed', 'cancelled', 'failed'
  // Results
  lastSentAt: timestamp("last_sent_at"),
  lastError: text("last_error"),
  ghlMessageId: text("ghl_message_id"), // GHL message ID if sent
  // Metadata
  metadata: text("metadata"), // JSON: additional context data
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFollowUpQueueSchema = createInsertSchema(followUpQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFollowUpQueue = z.infer<typeof insertFollowUpQueueSchema>;
export type FollowUpQueue = typeof followUpQueue.$inferSelect;

// Price watches - Track customer interest in specific vehicles for price alerts
export const priceWatches = pgTable("price_watches", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  // Contact info
  contactId: text("contact_id"), // GHL contact ID if available
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  // How they showed interest
  sourceType: text("source_type").notNull(), // 'vehicle_view', 'chat', 'manual', 'auto'
  sourceId: text("source_id"), // Related source ID (chat conversation, etc.)
  viewCount: integer("view_count").notNull().default(1), // Number of times viewed
  // Subscription settings
  notifyOnPriceDrop: boolean("notify_on_price_drop").notNull().default(true),
  notifyOnSold: boolean("notify_on_sold").notNull().default(true),
  minPriceDropPercent: integer("min_price_drop_percent").default(5), // Only notify if price drops by at least X%
  // Status
  isActive: boolean("is_active").notNull().default(true),
  lastNotifiedAt: timestamp("last_notified_at"),
  priceWhenSubscribed: integer("price_when_subscribed"), // Original price when they started watching
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPriceWatchSchema = createInsertSchema(priceWatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertPriceWatch = z.infer<typeof insertPriceWatchSchema>;
export type PriceWatch = typeof priceWatches.$inferSelect;

// Competitor price alerts - Store alerts when competitors undercut prices
export const competitorPriceAlerts = pgTable("competitor_price_alerts", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: 'set null' }), // Our matching vehicle
  // Competitor info
  competitorDealerId: integer("competitor_dealer_id").references(() => competitorDealers.id, { onDelete: 'set null' }),
  competitorName: text("competitor_name").notNull(),
  competitorVehicleUrl: text("competitor_vehicle_url"),
  // Vehicle comparison
  competitorYear: integer("competitor_year").notNull(),
  competitorMake: text("competitor_make").notNull(),
  competitorModel: text("competitor_model").notNull(),
  competitorTrim: text("competitor_trim"),
  competitorPrice: integer("competitor_price").notNull(),
  competitorOdometer: integer("competitor_odometer"),
  // Our pricing
  ourPrice: integer("our_price"),
  priceDifference: integer("price_difference"), // Positive = competitor is cheaper
  percentDifference: real("percent_difference"), // Percentage difference
  // Alert status
  alertType: text("alert_type").notNull(), // 'undercut', 'new_competitor', 'price_change'
  severity: text("severity").notNull().default('medium'), // 'low', 'medium', 'high', 'critical'
  status: text("status").notNull().default('new'), // 'new', 'acknowledged', 'resolved', 'dismissed'
  acknowledgedBy: integer("acknowledged_by").references(() => users.id, { onDelete: 'set null' }),
  acknowledgedAt: timestamp("acknowledged_at"),
  resolvedAt: timestamp("resolved_at"),
  resolutionNote: text("resolution_note"),
  // Timestamps
  detectedAt: timestamp("detected_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCompetitorPriceAlertSchema = createInsertSchema(competitorPriceAlerts).omit({
  id: true,
  createdAt: true,
});

export type InsertCompetitorPriceAlert = z.infer<typeof insertCompetitorPriceAlertSchema>;
export type CompetitorPriceAlert = typeof competitorPriceAlerts.$inferSelect;

// Automation logs - Audit trail for all automated actions
export const automationLogs = pgTable("automation_logs", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  automationType: text("automation_type").notNull(), // 'follow_up', 'appointment_reminder', 'price_alert', 'competitor_alert'
  actionType: text("action_type").notNull(), // 'triggered', 'sent', 'failed', 'skipped', 'cancelled'
  // Reference to the source record
  sourceTable: text("source_table"), // 'follow_up_queue', 'price_watches', etc.
  sourceId: integer("source_id"),
  // Contact info
  contactId: text("contact_id"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  // Action details
  messageType: text("message_type"), // 'sms', 'email', 'internal_alert'
  messageContent: text("message_content"), // The actual message sent
  // Results
  success: boolean("success").notNull(),
  errorMessage: text("error_message"),
  externalId: text("external_id"), // GHL message ID, etc.
  // Metadata
  metadata: text("metadata"), // JSON: additional context
  executedAt: timestamp("executed_at").defaultNow().notNull(),
});

export const insertAutomationLogSchema = createInsertSchema(automationLogs).omit({
  id: true,
});

export type InsertAutomationLog = z.infer<typeof insertAutomationLogSchema>;
export type AutomationLog = typeof automationLogs.$inferSelect;

// Appointment reminders - Track scheduled reminders for appointments
export const appointmentReminders = pgTable("appointment_reminders", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  // Appointment reference
  appointmentSource: text("appointment_source").notNull(), // 'pbs', 'ghl', 'manual'
  appointmentId: text("appointment_id").notNull(), // External appointment ID
  appointmentType: text("appointment_type").notNull(), // 'test_drive', 'service', 'sales', 'other'
  appointmentTime: timestamp("appointment_time").notNull(),
  // Contact info
  contactId: text("contact_id"),
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  // Vehicle if relevant
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: 'set null' }),
  vehicleDescription: text("vehicle_description"), // "2024 Honda Civic"
  // Reminder scheduling
  reminderType: text("reminder_type").notNull(), // '24h', '2h', '1h', 'custom'
  reminderMinutesBefore: integer("reminder_minutes_before").notNull(), // How many minutes before appointment
  scheduledSendAt: timestamp("scheduled_send_at").notNull(),
  // Status
  status: text("status").notNull().default('pending'), // 'pending', 'sent', 'failed', 'cancelled'
  sentAt: timestamp("sent_at"),
  errorMessage: text("error_message"),
  ghlMessageId: text("ghl_message_id"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAppointmentReminderSchema = createInsertSchema(appointmentReminders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAppointmentReminder = z.infer<typeof insertAppointmentReminderSchema>;
export type AppointmentReminder = typeof appointmentReminders.$inferSelect;

// ====== SEQUENCE ANALYTICS & RE-ENGAGEMENT TABLES ======

// Sequence executions - Track each time a sequence is run for a contact
export const sequenceExecutions = pgTable("sequence_executions", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  sequenceId: integer("sequence_id").notNull().references(() => followUpSequences.id, { onDelete: 'cascade' }),
  // Contact info
  contactId: text("contact_id"), // GHL contact ID
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  // Trigger info
  triggerType: text("trigger_type").notNull(), // 'chat_ended', 'no_activity', 'vehicle_views', 'reengagement', 'manual'
  triggerSource: text("trigger_source"), // What triggered it (vehicle ID, chat ID, etc.)
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: 'set null' }),
  // Progress
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull(),
  status: text("status").notNull().default('active'), // 'active', 'completed', 'converted', 'unsubscribed', 'failed'
  // Outcome tracking
  messagesDelivered: integer("messages_delivered").notNull().default(0),
  messagesOpened: integer("messages_opened").notNull().default(0),
  responsesReceived: integer("responses_received").notNull().default(0),
  appointmentsBooked: integer("appointments_booked").notNull().default(0),
  // Timestamps
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
});

export const insertSequenceExecutionSchema = createInsertSchema(sequenceExecutions).omit({
  id: true,
  startedAt: true,
});

export type InsertSequenceExecution = z.infer<typeof insertSequenceExecutionSchema>;
export type SequenceExecution = typeof sequenceExecutions.$inferSelect;

// Sequence messages - Track each individual message sent in a sequence
export const sequenceMessages = pgTable("sequence_messages", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  executionId: integer("execution_id").notNull().references(() => sequenceExecutions.id, { onDelete: 'cascade' }),
  sequenceId: integer("sequence_id").notNull().references(() => followUpSequences.id, { onDelete: 'cascade' }),
  stepNumber: integer("step_number").notNull(),
  // Message details
  messageType: text("message_type").notNull(), // 'sms', 'email'
  messageContent: text("message_content").notNull(),
  recipientPhone: text("recipient_phone"),
  recipientEmail: text("recipient_email"),
  // Delivery status
  status: text("status").notNull().default('pending'), // 'pending', 'sent', 'delivered', 'opened', 'clicked', 'replied', 'failed', 'bounced'
  externalMessageId: text("external_message_id"), // GHL/Twilio message ID
  // Engagement tracking
  deliveredAt: timestamp("delivered_at"),
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  repliedAt: timestamp("replied_at"),
  // Error tracking
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  // Timestamps
  scheduledAt: timestamp("scheduled_at").notNull(),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSequenceMessageSchema = createInsertSchema(sequenceMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertSequenceMessage = z.infer<typeof insertSequenceMessageSchema>;
export type SequenceMessage = typeof sequenceMessages.$inferSelect;

// Sequence conversions - Track conversions attributed to sequences
export const sequenceConversions = pgTable("sequence_conversions", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  executionId: integer("execution_id").notNull().references(() => sequenceExecutions.id, { onDelete: 'cascade' }),
  sequenceId: integer("sequence_id").notNull().references(() => followUpSequences.id, { onDelete: 'cascade' }),
  // What triggered the conversion
  triggerMessageId: integer("trigger_message_id").references(() => sequenceMessages.id, { onDelete: 'set null' }),
  // Conversion details
  conversionType: text("conversion_type").notNull(), // 'response', 'appointment', 'test_drive', 'sale', 'lead_qualified'
  conversionValue: integer("conversion_value"), // Monetary value in cents if applicable
  // Contact at time of conversion
  contactId: text("contact_id"),
  contactName: text("contact_name"),
  // Related records
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: 'set null' }),
  appointmentId: text("appointment_id"), // External appointment ID
  // Attribution
  attributionWindow: integer("attribution_window").notNull().default(7), // Days since last message
  stepThatConverted: integer("step_that_converted"), // Which step led to conversion
  // Timestamps
  convertedAt: timestamp("converted_at").defaultNow().notNull(),
});

export const insertSequenceConversionSchema = createInsertSchema(sequenceConversions).omit({
  id: true,
});

export type InsertSequenceConversion = z.infer<typeof insertSequenceConversionSchema>;
export type SequenceConversion = typeof sequenceConversions.$inferSelect;

// Contact activity - Track last activity per contact for re-engagement campaigns
export const contactActivity = pgTable("contact_activity", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  // Contact identification
  contactId: text("contact_id"), // GHL/PBS contact ID
  contactName: text("contact_name").notNull(),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  // Source of contact
  source: text("source").notNull(), // 'pbs', 'ghl', 'chat', 'vehicle_view', 'manual'
  sourceId: text("source_id"), // External ID from source
  // Activity tracking
  lastActivityType: text("last_activity_type").notNull(), // 'vehicle_view', 'chat', 'appointment', 'service', 'purchase', 'message_reply'
  lastActivityAt: timestamp("last_activity_at").notNull(),
  lastVehicleViewed: integer("last_vehicle_viewed").references(() => vehicles.id, { onDelete: 'set null' }),
  totalVehicleViews: integer("total_vehicle_views").notNull().default(0),
  totalChatSessions: integer("total_chat_sessions").notNull().default(0),
  totalAppointments: integer("total_appointments").notNull().default(0),
  // Engagement score (calculated)
  engagementScore: integer("engagement_score").notNull().default(0), // 0-100 based on activity
  // Re-engagement status
  reengagementStatus: text("reengagement_status").notNull().default('active'), // 'active', 'cold', 'reengaged', 'unsubscribed', 'purchased'
  lastReengagementAt: timestamp("last_reengagement_at"),
  reengagementCount: integer("reengagement_count").notNull().default(0),
  // Timestamps
  firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertContactActivitySchema = createInsertSchema(contactActivity).omit({
  id: true,
  firstSeenAt: true,
  updatedAt: true,
});

export type InsertContactActivity = z.infer<typeof insertContactActivitySchema>;
export type ContactActivity = typeof contactActivity.$inferSelect;

// Re-engagement campaigns - Track monthly automated outreach to cold contacts
export const reengagementCampaigns = pgTable("reengagement_campaigns", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // e.g., "December 2024 Win-Back"
  // Configuration
  inactiveDaysThreshold: integer("inactive_days_threshold").notNull().default(90), // Contact inactive for X days
  sequenceId: integer("sequence_id").references(() => followUpSequences.id, { onDelete: 'set null' }), // Which sequence to use
  targetAudience: text("target_audience").notNull().default('all'), // 'all', 'vehicle_viewers', 'chat_contacts', 'past_customers'
  maxContactsPerRun: integer("max_contacts_per_run").notNull().default(50), // Rate limit
  // Scheduling
  isActive: boolean("is_active").notNull().default(true),
  runFrequency: text("run_frequency").notNull().default('daily'), // 'daily', 'weekly', 'monthly'
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  // Stats
  totalContactsTargeted: integer("total_contacts_targeted").notNull().default(0),
  totalContactsReengaged: integer("total_contacts_reengaged").notNull().default(0),
  totalResponses: integer("total_responses").notNull().default(0),
  totalConversions: integer("total_conversions").notNull().default(0),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertReengagementCampaignSchema = createInsertSchema(reengagementCampaigns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReengagementCampaign = z.infer<typeof insertReengagementCampaignSchema>;
export type ReengagementCampaign = typeof reengagementCampaigns.$inferSelect;

// Sequence analytics aggregates - Pre-computed daily stats for dashboard performance
export const sequenceAnalytics = pgTable("sequence_analytics", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  sequenceId: integer("sequence_id").notNull().references(() => followUpSequences.id, { onDelete: 'cascade' }),
  // Date for aggregation
  date: timestamp("date").notNull(),
  // Execution metrics
  executionsStarted: integer("executions_started").notNull().default(0),
  executionsCompleted: integer("executions_completed").notNull().default(0),
  executionsConverted: integer("executions_converted").notNull().default(0),
  // Message metrics
  messagesSent: integer("messages_sent").notNull().default(0),
  messagesDelivered: integer("messages_delivered").notNull().default(0),
  messagesOpened: integer("messages_opened").notNull().default(0),
  messagesClicked: integer("messages_clicked").notNull().default(0),
  messagesReplied: integer("messages_replied").notNull().default(0),
  messagesFailed: integer("messages_failed").notNull().default(0),
  // Conversion metrics
  responsesReceived: integer("responses_received").notNull().default(0),
  appointmentsBooked: integer("appointments_booked").notNull().default(0),
  testDrivesScheduled: integer("test_drives_scheduled").notNull().default(0),
  salesCompleted: integer("sales_completed").notNull().default(0),
  totalConversionValue: integer("total_conversion_value").notNull().default(0), // In cents
  // Rates (stored as percentages * 100 for precision)
  deliveryRate: integer("delivery_rate"), // messagesDelivered / messagesSent * 10000
  openRate: integer("open_rate"), // messagesOpened / messagesDelivered * 10000
  clickRate: integer("click_rate"), // messagesClicked / messagesOpened * 10000
  replyRate: integer("reply_rate"), // messagesReplied / messagesDelivered * 10000
  conversionRate: integer("conversion_rate"), // executionsConverted / executionsStarted * 10000
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSequenceAnalyticsSchema = createInsertSchema(sequenceAnalytics).omit({
  id: true,
  createdAt: true,
});

export type InsertSequenceAnalytics = z.infer<typeof insertSequenceAnalyticsSchema>;
export type SequenceAnalytics = typeof sequenceAnalytics.$inferSelect;

// ====== VEHICLE APPRAISALS ======
// Stores saved VIN lookups, market analysis results, and quotes for later recall
export const vehicleAppraisals = pgTable("vehicle_appraisals", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  createdBy: integer("created_by").references(() => users.id, { onDelete: 'set null' }),
  // VIN and decoded data
  vin: text("vin").notNull(),
  year: integer("year"),
  make: text("make"),
  model: text("model"),
  trim: text("trim"),
  bodyType: text("body_type"),
  engineInfo: text("engine_info"), // e.g., "V6, 3.5L"
  driveType: text("drive_type"), // e.g., "AWD"
  transmission: text("transmission"),
  fuelType: text("fuel_type"),
  // Vehicle condition and details
  mileage: integer("mileage"),
  exteriorColor: text("exterior_color"),
  interiorColor: text("interior_color"),
  condition: text("condition"), // 'excellent', 'good', 'fair', 'poor'
  conditionNotes: text("condition_notes"),
  // Pricing and quotes
  askingPrice: integer("asking_price"), // Suggested asking price (cents)
  tradeinValue: integer("tradein_value"), // Estimated trade-in value (cents)
  wholesaleValue: integer("wholesale_value"), // Wholesale/auction value (cents)
  retailValue: integer("retail_value"), // Retail market value (cents)
  // Market analysis data (stored as JSON for flexibility)
  marketAnalysisData: text("market_analysis_data"), // JSON string of full market analysis results
  comparableCount: integer("comparable_count"), // Number of comparable listings found
  averageMarketPrice: integer("average_market_price"), // Average price from market analysis (cents)
  marketPriceRange: text("market_price_range"), // e.g., "$25,000 - $32,000"
  daysOnMarketAvg: integer("days_on_market_avg"),
  // Competitor listings URLs (JSON array of top competitors)
  competitorListings: text("competitor_listings"), // JSON array: [{url, dealer, price, listingDate}]
  // Notes and status
  notes: text("notes"),
  status: text("status").notNull().default('draft'), // 'draft', 'quoted', 'purchased', 'passed'
  // Look-to-Book tracking fields
  quotedPrice: integer("quoted_price"), // Price offered to customer (cents) - may differ from tradeinValue
  actualSalePrice: integer("actual_sale_price"), // What we actually bought for if purchased (cents)
  missedReason: text("missed_reason"), // 'lost_to_competitor', 'customer_declined', 'price_too_high', 'wholesaled', 'other'
  missedNotes: text("missed_notes"), // Additional notes about why trade was missed
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertVehicleAppraisalSchema = createInsertSchema(vehicleAppraisals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertVehicleAppraisal = z.infer<typeof insertVehicleAppraisalSchema>;
export type VehicleAppraisal = typeof vehicleAppraisals.$inferSelect;

// ====== CRM CONTACT DATABASE ======
// Unified customer contact database for omnichannel messaging and relationship management

export const crmContacts = pgTable("crm_contacts", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  // Ownership & assignment
  ownerId: integer("owner_id").references(() => users.id, { onDelete: 'set null' }), // Assigned salesperson
  createdById: integer("created_by_id").references(() => users.id, { onDelete: 'set null' }), // Who created the contact
  // Core identity
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  secondaryPhone: text("secondary_phone"),
  // Social/messaging identifiers
  facebookId: text("facebook_id"), // Facebook Messenger ID
  facebookName: text("facebook_name"),
  // Address
  address: text("address"),
  city: text("city"),
  province: text("province"),
  postalCode: text("postal_code"),
  country: text("country").default('Canada'),
  // Lead/Customer status
  status: text("status").notNull().default('lead'), // 'lead', 'prospect', 'customer', 'lost', 'inactive'
  leadSource: text("lead_source"), // 'website', 'facebook', 'walk-in', 'referral', 'phone', 'trade-in', etc.
  leadScore: integer("lead_score").default(0), // AI-calculated lead score (0-100)
  // Vehicle interests
  interestedVehicleIds: text("interested_vehicle_ids"), // JSON array of vehicle IDs
  preferredMake: text("preferred_make"),
  preferredModel: text("preferred_model"),
  preferredPriceMin: integer("preferred_price_min"),
  preferredPriceMax: integer("preferred_price_max"),
  tradeInVehicle: text("trade_in_vehicle"), // Description of trade-in
  tradeInValue: integer("trade_in_value"), // Estimated trade-in value (cents)
  // Engagement tracking
  lastContactedAt: timestamp("last_contacted_at"), // When we last reached out
  lastRespondedAt: timestamp("last_responded_at"), // When they last responded
  totalMessagesReceived: integer("total_messages_received").default(0),
  totalMessagesSent: integer("total_messages_sent").default(0),
  // Preferences
  preferredContactMethod: text("preferred_contact_method").default('phone'), // 'phone', 'email', 'sms', 'facebook'
  optInEmail: boolean("opt_in_email").default(true),
  optInSms: boolean("opt_in_sms").default(true),
  optInFacebook: boolean("opt_in_facebook").default(true),
  timezone: text("timezone"),
  // External CRM links
  ghlContactId: text("ghl_contact_id"), // GoHighLevel contact ID
  pbsContactId: text("pbs_contact_id"), // PBS DMS contact ID
  // Notes and custom data
  notes: text("notes"),
  customFields: text("custom_fields"), // JSON for extensibility
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCrmContactSchema = createInsertSchema(crmContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCrmContact = z.infer<typeof insertCrmContactSchema>;
export type CrmContact = typeof crmContacts.$inferSelect;

// CRM Contact Tags - Categorize contacts with tags
export const crmTags = pgTable("crm_tags", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  color: text("color").default('#3B82F6'), // Hex color for display
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCrmTagSchema = createInsertSchema(crmTags).omit({
  id: true,
  createdAt: true,
});

export type InsertCrmTag = z.infer<typeof insertCrmTagSchema>;
export type CrmTag = typeof crmTags.$inferSelect;

// CRM Contact-Tag Links - Many-to-many relationship
export const crmContactTags = pgTable("crm_contact_tags", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => crmContacts.id, { onDelete: 'cascade' }),
  tagId: integer("tag_id").notNull().references(() => crmTags.id, { onDelete: 'cascade' }),
  addedAt: timestamp("added_at").defaultNow().notNull(),
  addedById: integer("added_by_id").references(() => users.id, { onDelete: 'set null' }),
});

export type CrmContactTag = typeof crmContactTags.$inferSelect;

// CRM Contact Activities - Timeline of all interactions
export const crmActivities = pgTable("crm_activities", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id").notNull().references(() => crmContacts.id, { onDelete: 'cascade' }),
  userId: integer("user_id").references(() => users.id, { onDelete: 'set null' }), // Who performed the activity
  // Activity type and details
  activityType: text("activity_type").notNull(), // 'call', 'email', 'sms', 'facebook', 'note', 'meeting', 'task', 'status_change', 'vehicle_view', 'test_drive'
  direction: text("direction"), // 'inbound', 'outbound' for messages/calls
  subject: text("subject"), // Email subject or activity title
  content: text("content"), // Message content or activity description
  // Delivery/status tracking
  status: text("status").default('completed'), // 'pending', 'completed', 'failed', 'scheduled'
  deliveryStatus: text("delivery_status"), // 'sent', 'delivered', 'read', 'failed', 'bounced'
  // Related entities
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: 'set null' }),
  messageId: text("message_id"), // External message ID (email provider, SMS, etc.)
  conversationId: integer("conversation_id").references(() => messengerConversations.id, { onDelete: 'set null' }),
  // Metadata
  metadata: text("metadata"), // JSON for additional data
  // Timestamps
  scheduledAt: timestamp("scheduled_at"), // For scheduled activities
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCrmActivitySchema = createInsertSchema(crmActivities).omit({
  id: true,
  createdAt: true,
});

export type InsertCrmActivity = z.infer<typeof insertCrmActivitySchema>;
export type CrmActivity = typeof crmActivities.$inferSelect;

// CRM Messages - Outbound message queue and history
export const crmMessages = pgTable("crm_messages", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id").notNull().references(() => crmContacts.id, { onDelete: 'cascade' }),
  sentById: integer("sent_by_id").references(() => users.id, { onDelete: 'set null' }),
  // Message content
  channel: text("channel").notNull(), // 'email', 'sms', 'facebook'
  subject: text("subject"), // For email
  content: text("content").notNull(),
  templateId: integer("template_id"), // If using a template
  // Recipient info (snapshot at send time)
  recipientEmail: text("recipient_email"),
  recipientPhone: text("recipient_phone"),
  recipientFacebookId: text("recipient_facebook_id"),
  // Delivery tracking
  status: text("status").notNull().default('pending'), // 'pending', 'sent', 'delivered', 'read', 'failed', 'bounced'
  externalMessageId: text("external_message_id"), // Provider's message ID
  errorMessage: text("error_message"), // If failed
  // Engagement tracking
  openedAt: timestamp("opened_at"),
  clickedAt: timestamp("clicked_at"),
  repliedAt: timestamp("replied_at"),
  // AI features
  aiGenerated: boolean("ai_generated").default(false),
  aiPromptUsed: text("ai_prompt_used"), // The prompt that generated this message
  // Training mode - allow editing AI prompts for learning
  aiPromptEdited: text("ai_prompt_edited"), // Edited version of the prompt after training
  aiPromptEditReason: text("ai_prompt_edit_reason"), // Why the prompt was edited
  aiPromptEditedById: integer("ai_prompt_edited_by_id").references(() => users.id, { onDelete: 'set null' }),
  aiPromptEditedAt: timestamp("ai_prompt_edited_at"),
  // Timestamps
  scheduledAt: timestamp("scheduled_at"), // For scheduled sends
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCrmMessageSchema = createInsertSchema(crmMessages).omit({
  id: true,
  createdAt: true,
});

export type InsertCrmMessage = z.infer<typeof insertCrmMessageSchema>;
export type CrmMessage = typeof crmMessages.$inferSelect;

// CRM Message Templates - Reusable message templates with AI enhancement
export const crmMessageTemplates = pgTable("crm_message_templates", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: 'set null' }),
  // Template details
  name: text("name").notNull(),
  channel: text("channel").notNull(), // 'email', 'sms', 'facebook'
  category: text("category"), // 'follow-up', 'appointment', 'thank-you', 'promotion', 'custom'
  subject: text("subject"), // For email
  content: text("content").notNull(), // Supports {{placeholders}}
  // Personalization fields available
  availableFields: text("available_fields"), // JSON array of merge fields like ['firstName', 'vehicleName', 'dealershipName']
  // Usage stats
  timesUsed: integer("times_used").default(0),
  // AI enhancement
  aiEnhanced: boolean("ai_enhanced").default(false),
  originalContent: text("original_content"), // Original before AI enhancement
  // Status
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false), // Default template for category
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCrmMessageTemplateSchema = createInsertSchema(crmMessageTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCrmMessageTemplate = z.infer<typeof insertCrmMessageTemplateSchema>;
export type CrmMessageTemplate = typeof crmMessageTemplates.$inferSelect;

// CRM Tasks - Follow-up tasks for contacts
export const crmTasks = pgTable("crm_tasks", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  contactId: integer("contact_id").references(() => crmContacts.id, { onDelete: 'cascade' }),
  assignedToId: integer("assigned_to_id").references(() => users.id, { onDelete: 'set null' }),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: 'set null' }),
  // Task details
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type").notNull().default('follow-up'), // 'call', 'email', 'sms', 'meeting', 'follow-up', 'custom'
  priority: text("priority").default('medium'), // 'low', 'medium', 'high', 'urgent'
  // Status and timing
  status: text("status").notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'cancelled'
  dueAt: timestamp("due_at"),
  completedAt: timestamp("completed_at"),
  reminderAt: timestamp("reminder_at"),
  // AI-generated
  aiGenerated: boolean("ai_generated").default(false),
  aiReason: text("ai_reason"), // Why AI suggested this task
  // Related entities
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: 'set null' }),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCrmTaskSchema = createInsertSchema(crmTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCrmTask = z.infer<typeof insertCrmTaskSchema>;
export type CrmTask = typeof crmTasks.$inferSelect;

// CRM Saved Views - Custom list views for contacts
export const crmSavedViews = pgTable("crm_saved_views", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: 'cascade' }),
  // View configuration
  name: text("name").notNull(),
  description: text("description"),
  filters: text("filters").notNull(), // JSON object with filter criteria
  sortField: text("sort_field").default('createdAt'),
  sortDirection: text("sort_direction").default('desc'), // 'asc' or 'desc'
  visibleColumns: text("visible_columns"), // JSON array of column IDs
  // Sharing
  isPublic: boolean("is_public").default(false), // Visible to all team members
  isDefault: boolean("is_default").default(false), // User's default view
  // Timestamps
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCrmSavedViewSchema = createInsertSchema(crmSavedViews).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCrmSavedView = z.infer<typeof insertCrmSavedViewSchema>;
export type CrmSavedView = typeof crmSavedViews.$inferSelect;

// ====== CALL SCORING SYSTEM ======

// Call Scoring Templates - Define scoring criteria sets per department
export const callScoringTemplates = pgTable("call_scoring_templates", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").references(() => dealerships.id, { onDelete: 'cascade' }), // NULL = system default
  department: text("department").notNull(), // 'sales', 'service', 'parts', 'finance', 'general'
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false), // Default template for this department
  version: integer("version").notNull().default(1),
  createdById: integer("created_by_id").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCallScoringTemplateSchema = createInsertSchema(callScoringTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCallScoringTemplate = z.infer<typeof insertCallScoringTemplateSchema>;
export type CallScoringTemplate = typeof callScoringTemplates.$inferSelect;

// Call Scoring Criteria - Individual scoring items within a template
export const callScoringCriteria = pgTable("call_scoring_criteria", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id").notNull().references(() => callScoringTemplates.id, { onDelete: 'cascade' }),
  category: text("category").notNull(), // 'greeting', 'discovery', 'product_knowledge', 'closing', 'professionalism', 'follow_up'
  label: text("label").notNull(), // "Greeted customer with name and dealership"
  description: text("description"), // Detailed guidance for scoring
  weight: integer("weight").notNull().default(1), // Point value for this criterion
  maxScore: integer("max_score").notNull().default(10), // Maximum possible score
  ratingType: text("rating_type").notNull().default('numeric'), // 'numeric', 'yes_no', 'scale_5', 'text'
  sortOrder: integer("sort_order").notNull().default(0),
  aiInstruction: text("ai_instruction"), // Guidance for AI when auto-scoring
  isRequired: boolean("is_required").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCallScoringCriterionSchema = createInsertSchema(callScoringCriteria).omit({
  id: true,
  createdAt: true,
});

export type InsertCallScoringCriterion = z.infer<typeof insertCallScoringCriterionSchema>;
export type CallScoringCriterion = typeof callScoringCriteria.$inferSelect;

// Call Scoring Sheets - Individual call scores
export const callScoringSheets = pgTable("call_scoring_sheets", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  callRecordingId: integer("call_recording_id").notNull().references(() => callRecordings.id, { onDelete: 'cascade' }),
  templateId: integer("template_id").notNull().references(() => callScoringTemplates.id, { onDelete: 'cascade' }),
  reviewerId: integer("reviewer_id").references(() => users.id, { onDelete: 'set null' }), // Manager who reviewed
  // Scores
  aiTotalScore: integer("ai_total_score"), // AI-calculated score (0-100)
  aiMaxScore: integer("ai_max_score"), // Maximum possible AI score
  reviewerTotalScore: integer("reviewer_total_score"), // Manager-adjusted score
  finalScore: integer("final_score"), // Final approved score
  // Status
  status: text("status").notNull().default('pending'), // 'pending', 'ai_scored', 'reviewed', 'approved', 'disputed'
  // Identified employee
  employeeId: integer("employee_id").references(() => users.id, { onDelete: 'set null' }),
  employeeName: text("employee_name"),
  employeeDepartment: text("employee_department"), // 'sales', 'service', 'parts', 'finance', 'general'
  // Notes
  reviewerNotes: text("reviewer_notes"),
  coachingNotes: text("coaching_notes"), // Specific feedback for training
  // Timestamps
  aiScoredAt: timestamp("ai_scored_at"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCallScoringSheetSchema = createInsertSchema(callScoringSheets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCallScoringSheet = z.infer<typeof insertCallScoringSheetSchema>;
export type CallScoringSheet = typeof callScoringSheets.$inferSelect;

// Call Scoring Responses - Individual criterion scores within a sheet
export const callScoringResponses = pgTable("call_scoring_responses", {
  id: serial("id").primaryKey(),
  sheetId: integer("sheet_id").notNull().references(() => callScoringSheets.id, { onDelete: 'cascade' }),
  criterionId: integer("criterion_id").notNull().references(() => callScoringCriteria.id, { onDelete: 'cascade' }),
  // Scores
  aiScore: integer("ai_score"), // AI-suggested score
  aiReasoning: text("ai_reasoning"), // Why AI gave this score
  reviewerScore: integer("reviewer_score"), // Manager-adjusted score
  // Feedback
  comment: text("comment"), // Reviewer's comment for this criterion
  timestamp: text("timestamp"), // When in the call this was observed (e.g., "2:34")
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCallScoringResponseSchema = createInsertSchema(callScoringResponses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCallScoringResponse = z.infer<typeof insertCallScoringResponseSchema>;
export type CallScoringResponse = typeof callScoringResponses.$inferSelect;

// Call Participants - Identified speakers in a call
export const callParticipants = pgTable("call_participants", {
  id: serial("id").primaryKey(),
  callRecordingId: integer("call_recording_id").notNull().references(() => callRecordings.id, { onDelete: 'cascade' }),
  speakerLabel: text("speaker_label").notNull(), // 'Speaker 1', 'Speaker 2' from transcription
  speakerName: text("speaker_name"), // Identified name
  speakerRole: text("speaker_role").notNull(), // 'customer', 'employee', 'unknown'
  department: text("department"), // 'sales', 'service', 'parts', 'finance', 'general' if employee
  userId: integer("user_id").references(() => users.id, { onDelete: 'set null' }), // Matched user if employee
  confidenceScore: integer("confidence_score"), // 0-100 confidence in identification
  speakingTimeSeconds: integer("speaking_time_seconds"), // Total time speaking
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCallParticipantSchema = createInsertSchema(callParticipants).omit({
  id: true,
  createdAt: true,
});

export type InsertCallParticipant = z.infer<typeof insertCallParticipantSchema>;
export type CallParticipant = typeof callParticipants.$inferSelect;

// ====== FACEBOOK MARKETPLACE AUTOMATION ======

// FB Marketplace Accounts - Sales rep Facebook accounts for posting
// Each user can have max 2 accounts (accountSlot 1 or 2)
export const fbMarketplaceAccounts = pgTable("fb_marketplace_accounts", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }), // Owner of this account
  accountSlot: integer("account_slot").notNull().default(1), // 1 or 2 - each user can have max 2 accounts
  accountName: text("account_name").notNull(), // Display name for account
  facebookEmail: text("facebook_email").notNull(), // Facebook login email (for display only)
  facebookUserId: text("facebook_user_id"), // FB user ID once authenticated
  profileId: text("profile_id").notNull().unique(), // Unique ID for encrypted browser profile on filesystem
  status: text("status").notNull().default('needs_auth'), // 'needs_auth', 'active', 'session_expired', 'suspended', 'disabled'
  lastAuthAt: timestamp("last_auth_at"), // Last successful authentication
  sessionExpiresAt: timestamp("session_expires_at"), // When session is expected to expire
  postsToday: integer("posts_today").notNull().default(0), // Rate limiting counter
  postsThisWeek: integer("posts_this_week").notNull().default(0),
  totalPosts: integer("total_posts").notNull().default(0),
  dailyLimit: integer("daily_limit").notNull().default(5), // Max posts per day for this account
  warmupComplete: boolean("warmup_complete").notNull().default(false), // Account warmed up
  lastPostAt: timestamp("last_post_at"),
  lastError: text("last_error"), // Last error message
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFbMarketplaceAccountSchema = createInsertSchema(fbMarketplaceAccounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFbMarketplaceAccount = z.infer<typeof insertFbMarketplaceAccountSchema>;
export type FbMarketplaceAccount = typeof fbMarketplaceAccounts.$inferSelect;

// FB Marketplace Listings - Vehicles posted to Marketplace
export const fbMarketplaceListings = pgTable("fb_marketplace_listings", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  accountId: integer("account_id").notNull().references(() => fbMarketplaceAccounts.id, { onDelete: 'cascade' }),
  fbListingId: text("fb_listing_id"), // Facebook's listing ID
  fbListingUrl: text("fb_listing_url"), // Direct URL to the listing
  status: text("status").notNull().default('pending'), // 'pending', 'posted', 'updated', 'sold', 'removed', 'failed', 'expired'
  postedPrice: integer("posted_price"), // Price at time of posting (cents)
  currentPrice: integer("current_price"), // Current synced price
  priceNeedsUpdate: boolean("price_needs_update").notNull().default(false),
  views: integer("views").default(0), // FB listing views
  messages: integer("messages").default(0), // Number of inquiries
  saves: integer("saves").default(0), // Number of saves
  postedAt: timestamp("posted_at"),
  lastUpdatedAt: timestamp("last_updated_at"),
  lastRenewedAt: timestamp("last_renewed_at"), // When listing was renewed
  expiresAt: timestamp("expires_at"), // When listing will expire (7 days)
  soldAt: timestamp("sold_at"),
  removedAt: timestamp("removed_at"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFbMarketplaceListing = createInsertSchema(fbMarketplaceListings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFbMarketplaceListing = z.infer<typeof insertFbMarketplaceListing>;
export type FbMarketplaceListing = typeof fbMarketplaceListings.$inferSelect;

// FB Marketplace Posting Queue - Scheduled posts
export const fbMarketplaceQueue = pgTable("fb_marketplace_queue", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  accountId: integer("account_id").references(() => fbMarketplaceAccounts.id, { onDelete: 'set null' }), // Assigned account (null = auto-assign)
  action: text("action").notNull().default('post'), // 'post', 'update', 'renew', 'remove', 'mark_sold'
  priority: integer("priority").notNull().default(5), // 1=highest, 10=lowest
  status: text("status").notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed', 'cancelled'
  scheduledFor: timestamp("scheduled_for"), // When to execute (null = ASAP)
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFbMarketplaceQueueSchema = createInsertSchema(fbMarketplaceQueue).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFbMarketplaceQueue = z.infer<typeof insertFbMarketplaceQueueSchema>;
export type FbMarketplaceQueue = typeof fbMarketplaceQueue.$inferSelect;

// FB Marketplace Activity Log - Audit trail
export const fbMarketplaceActivityLog = pgTable("fb_marketplace_activity_log", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }),
  accountId: integer("account_id").references(() => fbMarketplaceAccounts.id, { onDelete: 'set null' }),
  listingId: integer("listing_id").references(() => fbMarketplaceListings.id, { onDelete: 'set null' }),
  vehicleId: integer("vehicle_id").references(() => vehicles.id, { onDelete: 'set null' }),
  action: text("action").notNull(), // 'auth', 'post', 'update', 'renew', 'remove', 'mark_sold', 'error', 'session_expired'
  status: text("status").notNull(), // 'success', 'failed', 'warning'
  details: text("details"), // JSON with additional context
  errorMessage: text("error_message"),
  duration: integer("duration"), // Action duration in milliseconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFbMarketplaceActivityLogSchema = createInsertSchema(fbMarketplaceActivityLog).omit({
  id: true,
  createdAt: true,
});

export type InsertFbMarketplaceActivityLog = z.infer<typeof insertFbMarketplaceActivityLogSchema>;
export type FbMarketplaceActivityLog = typeof fbMarketplaceActivityLog.$inferSelect;

// FB Marketplace Settings - Per-dealership configuration
export const fbMarketplaceSettings = pgTable("fb_marketplace_settings", {
  id: serial("id").primaryKey(),
  dealershipId: integer("dealership_id").notNull().references(() => dealerships.id, { onDelete: 'cascade' }).unique(),
  isEnabled: boolean("is_enabled").notNull().default(false),
  autoPostNewVehicles: boolean("auto_post_new_vehicles").notNull().default(false),
  autoRemoveSold: boolean("auto_remove_sold").notNull().default(true),
  autoUpdatePrices: boolean("auto_update_prices").notNull().default(true),
  autoRenewListings: boolean("auto_renew_listings").notNull().default(true),
  renewBeforeDays: integer("renew_before_days").notNull().default(1), // Renew X days before expiry
  defaultDailyLimit: integer("default_daily_limit").notNull().default(5), // Default per-account daily limit
  postingStartHour: integer("posting_start_hour").notNull().default(9), // Start posting at 9 AM
  postingEndHour: integer("posting_end_hour").notNull().default(18), // Stop posting at 6 PM
  minDelayMinutes: integer("min_delay_minutes").notNull().default(15), // Min delay between posts
  maxDelayMinutes: integer("max_delay_minutes").notNull().default(45), // Max delay between posts
  descriptionTemplate: text("description_template"), // Template for listing descriptions
  includeWebsiteLink: boolean("include_website_link").notNull().default(true),
  includeContactInfo: boolean("include_contact_info").notNull().default(true),
  filterGroupIds: text("filter_group_ids").array(), // Only post vehicles from these groups (null = all)
  minPrice: integer("min_price"), // Only post vehicles above this price
  maxPrice: integer("max_price"), // Only post vehicles below this price
  encryptionKeyId: text("encryption_key_id"), // Reference to encryption key for browser profiles
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFbMarketplaceSettingsSchema = createInsertSchema(fbMarketplaceSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFbMarketplaceSettings = z.infer<typeof insertFbMarketplaceSettingsSchema>;
export type FbMarketplaceSettings = typeof fbMarketplaceSettings.$inferSelect;
