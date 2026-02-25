import { db } from "./db";
import { hashPassword } from "./auth";
import { 
  dealerships,
  dealershipSubscriptions,
  dealershipApiKeys,
  vehicles, 
  vehicleViews, 
  facebookPages,
  pagePriorityVehicles,
  ghlConfig,
  ghlWebhookConfig,
  aiPromptTemplates,
  chatConversations,
  chatPrompts,
  adminConfig,
  users,
  creditScoreTiers,
  modelYearTerms,
  dealershipFees,
  filterGroups,
  scrapeSources,
  facebookAccounts,
  adTemplates,
  postingQueue,
  postingSchedule,
  messengerConversations,
  messengerMessages,
  scheduledMessages,
  conversationAssignments,
  remarketingVehicles,
  type Dealership,
  type InsertDealership,
  type DealershipSubscription,
  type InsertDealershipSubscription,
  type DealershipApiKeys,
  type InsertDealershipApiKeys,
  type Vehicle, 
  type InsertVehicle,
  type VehicleView,
  type InsertVehicleView,
  type FacebookPage,
  type InsertFacebookPage,
  type PagePriorityVehicle,
  type InsertPagePriorityVehicle,
  type GhlConfig,
  type InsertGhlConfig,
  type GhlWebhookConfig,
  type InsertGhlWebhookConfig,
  type AiPromptTemplate,
  type InsertAiPromptTemplate,
  type ChatConversation,
  type InsertChatConversation,
  type ChatPrompt,
  type InsertChatPrompt,
  type AdminConfig,
  type InsertAdminConfig,
  type User,
  type InsertUser,
  type CreditScoreTier,
  type InsertCreditScoreTier,
  type ModelYearTerm,
  type InsertModelYearTerm,
  type DealershipFee,
  type InsertDealershipFee,
  type FilterGroup,
  type InsertFilterGroup,
  type ScrapeSource,
  type InsertScrapeSource,
  type FacebookAccount,
  type InsertFacebookAccount,
  type AdTemplate,
  type InsertAdTemplate,
  type PostingQueue,
  type InsertPostingQueue,
  type PostingSchedule,
  type InsertPostingSchedule,
  type MessengerConversation,
  type InsertMessengerConversation,
  type MessengerMessage,
  type InsertMessengerMessage,
  type ScheduledMessage,
  type InsertScheduledMessage,
  type ConversationAssignment,
  type InsertConversationAssignment,
  type RemarketingVehicle,
  type InsertRemarketingVehicle,
  pbsConfig,
  type PbsConfig,
  type InsertPbsConfig,
  pbsWebhookEvents,
  type PbsWebhookEvent,
  type InsertPbsWebhookEvent,
  pbsSessions,
  type PbsSession,
  type InsertPbsSession,
  pbsContactCache,
  type PbsContactCache,
  type InsertPbsContactCache,
  pbsAppointmentCache,
  type PbsAppointmentCache,
  type InsertPbsAppointmentCache,
  pbsPartsCache,
  type PbsPartsCache,
  type InsertPbsPartsCache,
  pbsApiLogs,
  type PbsApiLog,
  type InsertPbsApiLog,
  managerSettings,
  type ManagerSettings,
  type InsertManagerSettings,
  marketListings,
  type MarketListing,
  cargurusColorCache,
  type CargurusColorCache,
  type InsertCargurusColorCache,
  type InsertMarketListing,
  globalSettings,
  type GlobalSetting,
  type InsertGlobalSetting,
  superAdminConfigs,
  type SuperAdminConfig,
  type InsertSuperAdminConfig,
  auditLogs,
  type AuditLog,
  type InsertAuditLog,
  externalApiTokens,
  type ExternalApiToken,
  type InsertExternalApiToken,
  staffInvites,
  passwordResetTokens,
  type PasswordResetToken,
  type StaffInvite,
  launchChecklist,
  type LaunchChecklist,
  type InsertLaunchChecklist,
  priceHistory,
  type PriceHistory,
  type InsertPriceHistory,
  competitorDealers,
  type CompetitorDealer,
  type InsertCompetitorDealer,
  marketSnapshots,
  type MarketSnapshot,
  type InsertMarketSnapshot,
  facebookCatalogConfig,
  type FacebookCatalogConfig,
  type InsertFacebookCatalogConfig,
  ghlAccounts,
  type GhlAccount,
  type InsertGhlAccount,
  ghlWebhookEvents,
  type GhlWebhookEvent,
  type InsertGhlWebhookEvent,
  ghlContactSync,
  type GhlContactSync,
  type InsertGhlContactSync,
  ghlAppointmentSync,
  type GhlAppointmentSync,
  type InsertGhlAppointmentSync,
  ghlApiLogs,
  type GhlApiLog,
  type InsertGhlApiLog,
  scraperActivityLogs,
  type ScraperActivityLog,
  type InsertScraperActivityLog,
  dealershipBranding,
  type DealershipBranding,
  type InsertDealershipBranding,
  callAnalysisCriteria,
  type CallAnalysisCriteria,
  type InsertCallAnalysisCriteria,
  callRecordings,
  type CallRecording,
  type InsertCallRecording,
  impersonationSessions,
  type ImpersonationSession,
  type InsertImpersonationSession,
  followUpSequences,
  type FollowUpSequence,
  type InsertFollowUpSequence,
  followUpQueue,
  type FollowUpQueue,
  type InsertFollowUpQueue,
  priceWatches,
  type PriceWatch,
  type InsertPriceWatch,
  competitorPriceAlerts,
  type CompetitorPriceAlert,
  type InsertCompetitorPriceAlert,
  automationLogs,
  type AutomationLog,
  type InsertAutomationLog,
  appointmentReminders,
  type AppointmentReminder,
  type InsertAppointmentReminder,
  sequenceExecutions,
  type SequenceExecution,
  type InsertSequenceExecution,
  sequenceMessages,
  type SequenceMessage,
  type InsertSequenceMessage,
  sequenceConversions,
  type SequenceConversion,
  type InsertSequenceConversion,
  contactActivity,
  type ContactActivity,
  type InsertContactActivity,
  reengagementCampaigns,
  type ReengagementCampaign,
  type InsertReengagementCampaign,
  sequenceAnalytics,
  type SequenceAnalytics,
  type InsertSequenceAnalytics,
  vehicleAppraisals,
  type VehicleAppraisal,
  type InsertVehicleAppraisal,
  crmContacts,
  type CrmContact,
  type InsertCrmContact,
  crmTags,
  type CrmTag,
  type InsertCrmTag,
  crmContactTags,
  type CrmContactTag,
  crmActivities,
  type CrmActivity,
  type InsertCrmActivity,
  crmTasks,
  type CrmTask,
  type InsertCrmTask,
  crmMessages,
  type CrmMessage,
  type InsertCrmMessage,
  crmMessageTemplates,
  type CrmMessageTemplate,
  type InsertCrmMessageTemplate,
  callScoringTemplates,
  type CallScoringTemplate,
  type InsertCallScoringTemplate,
  callScoringCriteria,
  type CallScoringCriterion,
  type InsertCallScoringCriterion,
  callScoringSheets,
  type CallScoringSheet,
  type InsertCallScoringSheet,
  callScoringResponses,
  type CallScoringResponse,
  type InsertCallScoringResponse,
  callParticipants,
  type CallParticipant,
  type InsertCallParticipant,
  scrapeRuns,
  type ScrapeRun,
  type InsertScrapeRun,
  scrapeQueue,
  type ScrapeQueue,
  type InsertScrapeQueue,
  carfaxReports,
  type CarfaxReport,
  type InsertCarfaxReport
} from "@shared/schema";
import { eq, desc, asc, sql, and, gte, lte, lt, gt, inArray, or, ilike, isNotNull, isNull, type SQL } from "drizzle-orm";

export interface IStorage {
  // ====== SUPER ADMIN - GLOBAL SETTINGS ======
  getGlobalSetting(key: string): Promise<GlobalSetting | undefined>;
  getAllGlobalSettings(): Promise<GlobalSetting[]>;
  setGlobalSetting(setting: InsertGlobalSetting): Promise<GlobalSetting>;
  deleteGlobalSetting(key: string): Promise<boolean>;
  
  // ====== SUPER ADMIN - CONFIG (secrets password, etc) ======
  getSuperAdminConfig(key: string): Promise<SuperAdminConfig | undefined>;
  setSuperAdminConfig(key: string, value: string, updatedBy: number | null): Promise<SuperAdminConfig>;
  
  // ====== SUPER ADMIN - AUDIT LOGGING ======
  logAuditAction(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number, offset?: number): Promise<{ logs: AuditLog[]; total: number }>;
  
  // ====== SUPER ADMIN - DEALERSHIP PROVISIONING ======
  createDealershipWithSetup(params: {
    name: string;
    slug: string;
    subdomain: string;
    address?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    phone?: string;
    timezone?: string;
    defaultCurrency?: string;
    masterAdminEmail: string;
    masterAdminName: string;
    masterAdminPassword: string;
  }): Promise<{ dealership: Dealership; masterAdmin: User }>;
  
  // ====== DEALERSHIP MANAGEMENT ======
  getDealership(id: number): Promise<Dealership | undefined>;
  getDealershipBySlug(slug: string): Promise<Dealership | undefined>;
  getDealershipBySubdomain(subdomain: string): Promise<Dealership | undefined>;
  getAllDealerships(): Promise<Dealership[]>;
  createDealership(dealership: InsertDealership): Promise<Dealership>;
  updateDealership(id: number, dealership: Partial<InsertDealership>): Promise<Dealership | undefined>;
  deleteDealership(id: number): Promise<boolean>;
  
  // Dealership API keys
  getDealershipApiKeys(dealershipId: number): Promise<DealershipApiKeys | undefined>;
  saveDealershipApiKeys(keys: InsertDealershipApiKeys): Promise<DealershipApiKeys>;
  updateDealershipApiKeys(dealershipId: number, keys: Partial<InsertDealershipApiKeys>): Promise<DealershipApiKeys | undefined>;
  
  // Dealership subscriptions
  getDealershipSubscription(dealershipId: number): Promise<DealershipSubscription | undefined>;
  createDealershipSubscription(subscription: InsertDealershipSubscription): Promise<DealershipSubscription>;
  updateDealershipSubscription(dealershipId: number, subscription: Partial<InsertDealershipSubscription>): Promise<DealershipSubscription | undefined>;
  
  // ====== VEHICLE OPERATIONS (Multi-Tenant) ======
  // dealershipId is REQUIRED for all multi-tenant operations to ensure data isolation
  getVehicles(dealershipId: number, limit?: number, offset?: number): Promise<{ vehicles: Vehicle[]; total: number }>;
  getVehicleById(id: number, dealershipId: number): Promise<Vehicle | undefined>;
  getVehicleByVin(vin: string, dealershipId: number): Promise<Vehicle | undefined>;
  deleteVehiclesByVinNotIn(vins: string[], dealershipId: number): Promise<{ deletedCount: number; deletedVins: string[] }>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: number, vehicle: Partial<InsertVehicle>, dealershipId: number): Promise<Vehicle | undefined>;
  deleteVehicle(id: number, dealershipId: number): Promise<boolean>;
  
  // View tracking (Multi-Tenant)
  trackVehicleView(view: InsertVehicleView): Promise<VehicleView>; // Must include dealershipId
  getVehicleViews(vehicleId: number, dealershipId: number, hours?: number): Promise<number>; // REQUIRED filtering
  getAllVehicleViews(dealershipId: number, hours?: number): Promise<Map<number, number>>; // REQUIRED filtering
  
  // Facebook pages
  getFacebookPages(dealershipId?: number): Promise<FacebookPage[]>;
  getFacebookPageByPageId(pageId: string): Promise<FacebookPage | undefined>;
  createFacebookPage(page: InsertFacebookPage): Promise<FacebookPage>;
  updateFacebookPage(id: number, page: Partial<InsertFacebookPage>): Promise<FacebookPage | undefined>;
  
  // Facebook Catalog Config (for Automotive Inventory Ads)
  getFacebookCatalogConfig(dealershipId: number): Promise<FacebookCatalogConfig | undefined>;
  getAllFacebookCatalogConfigs(): Promise<(FacebookCatalogConfig & { dealershipName?: string })[]>;
  saveFacebookCatalogConfig(config: InsertFacebookCatalogConfig): Promise<FacebookCatalogConfig>;
  updateFacebookCatalogConfig(dealershipId: number, config: Partial<InsertFacebookCatalogConfig>): Promise<FacebookCatalogConfig | undefined>;
  updateCatalogSyncStatus(dealershipId: number, status: { lastSyncAt?: Date; lastSyncStatus?: string; lastSyncMessage?: string; vehiclesSynced?: number }): Promise<FacebookCatalogConfig | undefined>;
  deleteFacebookCatalogConfig(dealershipId: number): Promise<boolean>;
  
  // Priority vehicles
  getPagePriorityVehicles(pageId: number, dealershipId: number): Promise<PagePriorityVehicle[]>;
  setPagePriorityVehicles(pageId: number, vehicleIds: number[], dealershipId: number): Promise<void>;
  
  // GoHighLevel config
  saveGHLConfig(config: InsertGhlConfig): Promise<GhlConfig>;
  
  // GHL Webhook config
  saveGHLWebhookConfig(config: InsertGhlWebhookConfig): Promise<GhlWebhookConfig>;
  getActiveGHLWebhookConfig(dealershipId: number): Promise<GhlWebhookConfig | undefined>;
  
  // GHL Accounts (OAuth integration) - Multi-Tenant
  getGhlAccountByDealership(dealershipId: number): Promise<GhlAccount | undefined>;
  getGhlAccountById(id: number, dealershipId: number): Promise<GhlAccount | undefined>;
  createGhlAccount(account: InsertGhlAccount): Promise<GhlAccount>;
  updateGhlAccount(id: number, dealershipId: number, updates: Partial<InsertGhlAccount>): Promise<GhlAccount | undefined>;
  deleteGhlAccount(id: number, dealershipId: number): Promise<boolean>;
  
  // GHL Config (calendars, pipelines, mappings) - Multi-Tenant
  getGhlConfig(dealershipId: number): Promise<GhlConfig | undefined>;
  createGhlConfig(config: InsertGhlConfig): Promise<GhlConfig>;
  updateGhlConfig(id: number, dealershipId: number, updates: Partial<InsertGhlConfig>): Promise<GhlConfig | undefined>;
  
  // GHL Webhook Events - Multi-Tenant
  createGhlWebhookEvent(event: InsertGhlWebhookEvent): Promise<GhlWebhookEvent>;
  getGhlWebhookEvents(dealershipId: number, status?: string, limit?: number): Promise<GhlWebhookEvent[]>;
  updateGhlWebhookEvent(id: number, dealershipId: number, updates: Partial<InsertGhlWebhookEvent>): Promise<GhlWebhookEvent | undefined>;
  getGhlWebhookEventByEventId(dealershipId: number, eventId: string): Promise<GhlWebhookEvent | undefined>;
  
  // GHL Contact Sync - Multi-Tenant
  getGhlContactSync(dealershipId: number, ghlContactId: string): Promise<GhlContactSync | undefined>;
  getGhlContactSyncByPbsId(dealershipId: number, pbsContactId: string): Promise<GhlContactSync | undefined>;
  createGhlContactSync(sync: InsertGhlContactSync): Promise<GhlContactSync>;
  updateGhlContactSync(id: number, dealershipId: number, updates: Partial<InsertGhlContactSync>): Promise<GhlContactSync | undefined>;
  getPendingGhlContactSyncs(dealershipId: number, limit?: number): Promise<GhlContactSync[]>;
  
  // GHL Appointment Sync - Multi-Tenant
  getGhlAppointmentSync(dealershipId: number, ghlAppointmentId: string): Promise<GhlAppointmentSync | undefined>;
  createGhlAppointmentSync(sync: InsertGhlAppointmentSync): Promise<GhlAppointmentSync>;
  updateGhlAppointmentSync(id: number, dealershipId: number, updates: Partial<InsertGhlAppointmentSync>): Promise<GhlAppointmentSync | undefined>;
  getPendingGhlAppointmentSyncs(dealershipId: number, limit?: number): Promise<GhlAppointmentSync[]>;
  
  // GHL API Logs - Multi-Tenant
  createGhlApiLog(log: InsertGhlApiLog): Promise<GhlApiLog>;
  getGhlApiLogs(dealershipId: number, limit?: number): Promise<GhlApiLog[]>;
  
  // AI prompt templates
  saveAIPromptTemplate(template: InsertAiPromptTemplate): Promise<AiPromptTemplate>;
  
  // Chat conversations (Multi-Tenant)
  saveChatConversation(conversation: InsertChatConversation): Promise<ChatConversation>; // Must include dealershipId
  getAllConversations(dealershipId: number, category?: string, limit?: number, offset?: number): Promise<{ conversations: ChatConversation[]; total: number }>; // REQUIRED filtering
  getConversationById(id: number, dealershipId: number): Promise<ChatConversation | undefined>; // REQUIRED filtering
  updateConversationHandoff(id: number, dealershipId: number, data: { handoffRequested?: boolean; handoffPhone?: string; handoffEmail?: string; handoffName?: string; handoffSent?: boolean; handoffSentAt?: Date; ghlContactId?: string }): Promise<ChatConversation | undefined>;
  getConversationByGhlContactId(dealershipId: number, ghlContactId: string): Promise<ChatConversation | undefined>;
  appendMessageToConversation(id: number, dealershipId: number, message: { role: string; content: string; timestamp: string; channel?: string; direction?: string; ghlMessageId?: string }): Promise<ChatConversation | undefined>;
  
  // Messenger conversations (Multi-Tenant)
  getMessengerConversations(dealershipId: number, userId?: number, userRole?: string): Promise<(MessengerConversation & { ownerName?: string; assignedTo?: { id: number; name: string } })[]>;
  getMessengerConversationById(id: number, dealershipId: number): Promise<(MessengerConversation & { pageAccessToken: string }) | undefined>;
  createMessengerConversation(conversation: InsertMessengerConversation): Promise<MessengerConversation>;
  updateMessengerConversation(id: number, dealershipId: number, data: Partial<InsertMessengerConversation>): Promise<MessengerConversation | undefined>;
  
  // Messenger messages (Multi-Tenant)
  getMessengerMessages(dealershipId: number, conversationId: number): Promise<MessengerMessage[]>;
  createMessengerMessage(message: InsertMessengerMessage): Promise<MessengerMessage>;
  markMessagesAsRead(dealershipId: number, conversationId: number): Promise<void>;
  getMessengerMessageByGhlId(dealershipId: number, ghlMessageId: string): Promise<MessengerMessage | undefined>;
  getMessengerConversationByGhlId(dealershipId: number, ghlConversationId: string): Promise<MessengerConversation | undefined>;
  getMessengerConversationByGhlContactId(dealershipId: number, ghlContactId: string): Promise<MessengerConversation | undefined>;
  getMessengerConversationWithTokenByGhlId(dealershipId: number, ghlConversationId: string): Promise<(MessengerConversation & { pageAccessToken: string; participantId: string }) | undefined>;
  updateMessengerMessage(id: number, dealershipId: number, data: Partial<InsertMessengerMessage>): Promise<MessengerMessage | undefined>;
  
  // Scheduled messages (Multi-Tenant)
  getScheduledMessages(dealershipId: number, status?: string): Promise<ScheduledMessage[]>;
  getScheduledMessagesByConversation(dealershipId: number, conversationId: number): Promise<ScheduledMessage[]>;
  getPendingScheduledMessages(dealershipId: number): Promise<ScheduledMessage[]>;
  getDueScheduledMessages(): Promise<ScheduledMessage[]>;
  createScheduledMessage(message: InsertScheduledMessage): Promise<ScheduledMessage>;
  updateScheduledMessage(id: number, dealershipId: number, data: Partial<InsertScheduledMessage>): Promise<ScheduledMessage | undefined>;
  cancelScheduledMessage(id: number, dealershipId: number): Promise<boolean>;
  
  // Conversation assignments (Multi-Tenant)
  getConversationAssignment(dealershipId: number, conversationId: number): Promise<ConversationAssignment | undefined>;
  assignConversation(assignment: InsertConversationAssignment): Promise<ConversationAssignment>;
  updateConversationAssignment(dealershipId: number, conversationId: number, assignedToUserId: number, assignedByUserId?: number): Promise<ConversationAssignment | undefined>;
  
  // Chat prompts (Multi-Tenant)
  getChatPrompts(dealershipId: number): Promise<ChatPrompt[]>;
  getAllChatPrompts(dealershipId: number): Promise<ChatPrompt[]>; // Include inactive prompts for admin
  getChatPromptByScenario(scenario: string, dealershipId: number): Promise<ChatPrompt | undefined>;
  getChatPromptById(id: number, dealershipId: number): Promise<ChatPrompt | undefined>;
  getActivePromptForScenario(dealershipId: number, scenario: string): Promise<ChatPrompt | undefined>;
  saveChatPrompt(prompt: InsertChatPrompt): Promise<ChatPrompt>;
  updateChatPrompt(scenario: string, dealershipId: number, prompt: Partial<InsertChatPrompt>): Promise<ChatPrompt | undefined>;
  updateChatPromptById(id: number, dealershipId: number, prompt: Partial<InsertChatPrompt>): Promise<ChatPrompt | undefined>;
  deleteChatPrompt(id: number, dealershipId: number): Promise<boolean>;
  
  // Admin
  getAdminConfig(): Promise<AdminConfig | undefined>;
  setAdminPassword(passwordHash: string): Promise<AdminConfig>;
  
  // User management (Multi-Tenant)
  getUserByEmail(email: string, dealershipId?: number): Promise<User | undefined>; // dealershipId optional for auth lookup
  getUserById(id: number, dealershipId?: number): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>; // Must include dealershipId in user data
  updateUser(id: number, user: Partial<InsertUser>, dealershipId?: number): Promise<User | undefined>;
  getAllUsers(dealershipId: number): Promise<User[]>; // REQUIRED: only get users from specific dealership
  getUsersByRole(role: string, dealershipId: number): Promise<User[]>;
  getUsersByDealership(dealershipId: number): Promise<User[]>; // Get all users for a specific dealership
  
  // Super Admin User Management
  getAllUsersForSuperAdmin(filters?: { dealershipId?: number; role?: string; search?: string }): Promise<(User & { dealershipName?: string })[]>;
  deleteUser(userId: number): Promise<boolean>;
  updateUserStatus(userId: number, isActive: boolean): Promise<User | undefined>;
  updateUserPassword(userId: number, passwordHash: string): Promise<boolean>;
  
  // Financing rules - Credit score tiers (Multi-Tenant)
  getCreditScoreTiers(dealershipId: number): Promise<CreditScoreTier[]>;
  createCreditScoreTier(tier: InsertCreditScoreTier): Promise<CreditScoreTier>;
  updateCreditScoreTier(id: number, dealershipId: number, tier: Partial<InsertCreditScoreTier>): Promise<CreditScoreTier | undefined>;
  deleteCreditScoreTier(id: number, dealershipId: number): Promise<boolean>;
  getInterestRateForCreditScore(dealershipId: number, score: number): Promise<number | null>;
  
  // Financing rules - Model year terms (Multi-Tenant)
  getModelYearTerms(dealershipId: number): Promise<ModelYearTerm[]>;
  createModelYearTerm(term: InsertModelYearTerm): Promise<ModelYearTerm>;
  updateModelYearTerm(id: number, dealershipId: number, term: Partial<InsertModelYearTerm>): Promise<ModelYearTerm | undefined>;
  deleteModelYearTerm(id: number, dealershipId: number): Promise<boolean>;
  getAvailableTermsForYear(dealershipId: number, modelYear: number): Promise<string[]>;
  
  // Dealership Fees (Multi-Tenant)
  getDealershipFees(dealershipId: number): Promise<DealershipFee[]>;
  createDealershipFee(fee: InsertDealershipFee): Promise<DealershipFee>;
  updateDealershipFee(id: number, dealershipId: number, fee: Partial<InsertDealershipFee>): Promise<DealershipFee | undefined>;
  deleteDealershipFee(id: number, dealershipId: number): Promise<boolean>;
  getActiveDealershipFees(dealershipId: number): Promise<DealershipFee[]>;
  
  // Filter Groups (Multi-Tenant) - Organize vehicles into categories per dealership
  getFilterGroups(dealershipId: number): Promise<FilterGroup[]>;
  getFilterGroupById(id: number, dealershipId: number): Promise<FilterGroup | undefined>;
  createFilterGroup(group: InsertFilterGroup): Promise<FilterGroup>;
  updateFilterGroup(id: number, dealershipId: number, group: Partial<InsertFilterGroup>): Promise<FilterGroup | undefined>;
  deleteFilterGroup(id: number, dealershipId: number): Promise<boolean>;
  getActiveFilterGroups(dealershipId: number): Promise<FilterGroup[]>;
  getAllFilterGroups(): Promise<FilterGroup[]>;
  getFilterGroupBySlug(dealershipId: number, slug: string): Promise<FilterGroup | undefined>;
  
  // Scrape Sources (Multi-Tenant)
  getScrapeSources(dealershipId: number): Promise<ScrapeSource[]>;
  createScrapeSource(source: InsertScrapeSource): Promise<ScrapeSource>;
  updateScrapeSource(id: number, dealershipId: number, source: Partial<InsertScrapeSource>): Promise<ScrapeSource | undefined>;
  updateScrapeSourceAdmin(id: number, source: Partial<InsertScrapeSource>): Promise<ScrapeSource | undefined>;
  deleteScrapeSource(id: number, dealershipId: number): Promise<boolean>;
  deleteScrapeSourceAdmin(id: number): Promise<boolean>;
  getActiveScrapeSources(dealershipId: number): Promise<ScrapeSource[]>;
  getAllActiveScrapeSources(): Promise<ScrapeSource[]>;
  getAllScrapeSources(): Promise<ScrapeSource[]>;
  updateScrapeSourceStats(id: number, vehicleCount: number): Promise<void>;
  
  // Facebook Accounts (Multi-Tenant - Defense-in-Depth)
  getFacebookAccountsByUser(userId: number, dealershipId: number): Promise<FacebookAccount[]>;
  getAllFacebookAccountsByDealership(dealershipId: number): Promise<FacebookAccount[]>;
  getFacebookAccountById(id: number, userId: number, dealershipId: number): Promise<FacebookAccount | undefined>;
  createFacebookAccount(account: InsertFacebookAccount): Promise<FacebookAccount>;
  updateFacebookAccount(id: number, userId: number, dealershipId: number, account: Partial<InsertFacebookAccount>): Promise<FacebookAccount | undefined>;
  updateFacebookAccountDirect(id: number, account: Partial<InsertFacebookAccount>): Promise<FacebookAccount | undefined>;
  getFacebookAccountByIdDirect(id: number, dealershipId: number): Promise<FacebookAccount | undefined>;
  deleteFacebookAccount(id: number, userId: number, dealershipId: number): Promise<boolean>;
  
  // Ad Templates (Multi-Tenant - Defense-in-Depth)
  getAdTemplatesByUser(userId: number, dealershipId: number): Promise<AdTemplate[]>;
  getAdTemplatesByDealership(dealershipId: number): Promise<AdTemplate[]>;
  getSharedAdTemplates(dealershipId: number): Promise<AdTemplate[]>;
  getUserPersonalAdTemplates(userId: number, dealershipId: number): Promise<AdTemplate[]>;
  getAdTemplatesForUser(userId: number, dealershipId: number): Promise<AdTemplate[]>; // Shared + personal combined
  getAdTemplateById(id: number, userId: number, dealershipId: number): Promise<AdTemplate | undefined>;
  getSharedAdTemplateById(id: number, dealershipId: number): Promise<AdTemplate | undefined>;
  createAdTemplate(template: InsertAdTemplate): Promise<AdTemplate>;
  updateAdTemplate(id: number, userId: number, dealershipId: number, template: Partial<InsertAdTemplate>): Promise<AdTemplate | undefined>;
  updateSharedAdTemplate(id: number, dealershipId: number, template: Partial<InsertAdTemplate>): Promise<AdTemplate | undefined>;
  deleteAdTemplate(id: number, userId: number, dealershipId: number): Promise<boolean>;
  deleteSharedAdTemplate(id: number, dealershipId: number): Promise<boolean>;
  forkAdTemplate(templateId: number, userId: number, dealershipId: number): Promise<AdTemplate>;
  
  // Posting Queue (Multi-Tenant - Defense-in-Depth)
  getPostingQueueByUser(userId: number, dealershipId: number): Promise<PostingQueue[]>;
  getPostingQueueItem(id: number, dealershipId: number): Promise<PostingQueue | undefined>;
  createPostingQueueItem(item: InsertPostingQueue): Promise<PostingQueue>;
  updatePostingQueueItem(id: number, userId: number, dealershipId: number, item: Partial<InsertPostingQueue>): Promise<PostingQueue | undefined>;
  deletePostingQueueItem(id: number, userId: number, dealershipId: number): Promise<boolean>;
  getNextQueuedPost(userId: number, dealershipId: number): Promise<PostingQueue | undefined>;
  
  // Posting Schedule (Multi-Tenant - Defense-in-Depth)
  getPostingScheduleByUser(userId: number, dealershipId: number): Promise<PostingSchedule | undefined>;
  getAllPostingSchedules(dealershipId: number): Promise<PostingSchedule[]>;
  createPostingSchedule(schedule: InsertPostingSchedule): Promise<PostingSchedule>;
  updatePostingSchedule(userId: number, dealershipId: number, schedule: Partial<InsertPostingSchedule>): Promise<PostingSchedule | undefined>;
  
  // Remarketing Vehicles (Multi-Tenant)
  getRemarketingVehicles(dealershipId: number): Promise<RemarketingVehicle[]>; // REQUIRED filtering
  addRemarketingVehicle(vehicle: InsertRemarketingVehicle): Promise<RemarketingVehicle>; // Must include dealershipId
  updateRemarketingVehicle(id: number, dealershipId: number, vehicle: Partial<InsertRemarketingVehicle>): Promise<RemarketingVehicle | undefined>;
  removeRemarketingVehicle(id: number, dealershipId: number): Promise<boolean>;
  getRemarketingVehicleCount(dealershipId: number): Promise<number>; // REQUIRED filtering
  
  // PBS DMS Integration (Multi-Tenant)
  getPbsConfig(dealershipId: number): Promise<PbsConfig | undefined>;
  createPbsConfig(config: InsertPbsConfig): Promise<PbsConfig>;
  updatePbsConfig(id: number, dealershipId: number, config: Partial<InsertPbsConfig>): Promise<PbsConfig | undefined>;
  deletePbsConfig(id: number, dealershipId: number): Promise<boolean>;
  
  // PBS Webhook Events (Multi-Tenant)
  getPbsWebhookEvents(dealershipId: number, limit?: number): Promise<PbsWebhookEvent[]>;
  getPbsWebhookEventById(id: number, dealershipId: number): Promise<PbsWebhookEvent | undefined>;
  createPbsWebhookEvent(event: InsertPbsWebhookEvent): Promise<PbsWebhookEvent>;
  updatePbsWebhookEvent(id: number, dealershipId: number, event: Partial<InsertPbsWebhookEvent>): Promise<PbsWebhookEvent | undefined>;
  
  // PBS Sessions (Multi-Tenant)
  getPbsSession(dealershipId: number): Promise<PbsSession | undefined>;
  createPbsSession(session: InsertPbsSession): Promise<PbsSession>;
  updatePbsSessionLastUsed(id: number, dealershipId: number): Promise<void>;
  deletePbsSession(id: number, dealershipId: number): Promise<boolean>;
  deleteExpiredPbsSessions(dealershipId: number): Promise<number>;

  // PBS Contact Cache (Multi-Tenant)
  getPbsContactByPbsId(dealershipId: number, pbsContactId: string): Promise<PbsContactCache | undefined>;
  getPbsContactByPhone(dealershipId: number, phone: string): Promise<PbsContactCache | undefined>;
  getPbsContactByEmail(dealershipId: number, email: string): Promise<PbsContactCache | undefined>;
  createPbsContactCache(contact: InsertPbsContactCache): Promise<PbsContactCache>;
  updatePbsContactCache(id: number, dealershipId: number, contact: Partial<InsertPbsContactCache>): Promise<PbsContactCache | undefined>;
  deleteExpiredPbsContactCache(dealershipId: number): Promise<number>;

  // PBS Appointment Cache (Multi-Tenant)
  getPbsAppointmentByPbsId(dealershipId: number, pbsAppointmentId: string): Promise<PbsAppointmentCache | undefined>;
  getPbsAppointmentsByContact(dealershipId: number, pbsContactId: string): Promise<PbsAppointmentCache[]>;
  getUpcomingPbsAppointments(dealershipId: number, hoursAhead?: number): Promise<PbsAppointmentCache[]>;
  createPbsAppointmentCache(appointment: InsertPbsAppointmentCache): Promise<PbsAppointmentCache>;
  updatePbsAppointmentCache(id: number, dealershipId: number, appointment: Partial<InsertPbsAppointmentCache>): Promise<PbsAppointmentCache | undefined>;
  deleteExpiredPbsAppointmentCache(dealershipId: number): Promise<number>;

  // PBS Parts Cache (Multi-Tenant)
  getPbsPartByNumber(dealershipId: number, partNumber: string): Promise<PbsPartsCache | undefined>;
  searchPbsParts(dealershipId: number, query: string): Promise<PbsPartsCache[]>;
  createPbsPartsCache(part: InsertPbsPartsCache): Promise<PbsPartsCache>;
  updatePbsPartsCache(id: number, dealershipId: number, part: Partial<InsertPbsPartsCache>): Promise<PbsPartsCache | undefined>;
  deleteExpiredPbsPartsCache(dealershipId: number): Promise<number>;

  // PBS API Logs (Multi-Tenant)
  createPbsApiLog(log: InsertPbsApiLog): Promise<PbsApiLog>;
  getPbsApiLogs(dealershipId: number, limit?: number): Promise<PbsApiLog[]>;

  // Manager Settings (Multi-Tenant)
  getManagerSettings(userId: number, dealershipId: number): Promise<ManagerSettings | undefined>;
  getManagerSettingsByDealership(dealershipId: number): Promise<ManagerSettings | undefined>;
  createManagerSettings(settings: InsertManagerSettings): Promise<ManagerSettings>;
  updateManagerSettings(userId: number, dealershipId: number, settings: Partial<InsertManagerSettings>): Promise<ManagerSettings | undefined>;
  
  // Market Listings (Multi-Tenant)
  getMarketListings(dealershipId: number, filters: { make?: string; model?: string; yearMin?: number; yearMax?: number; source?: string }, limit?: number, offset?: number): Promise<{ listings: MarketListing[]; total: number }>;
  getMarketListingById(id: number, dealershipId: number): Promise<MarketListing | undefined>;
  getMarketListingsByUrls(dealershipId: number, urls: string[]): Promise<MarketListing[]>;
  createMarketListing(listing: InsertMarketListing): Promise<MarketListing>;
  updateMarketListing(id: number, dealershipId: number, listing: Partial<InsertMarketListing>): Promise<MarketListing | undefined>;
  updateMarketListingColors(id: number, dealershipId: number, colors: { interiorColor?: string; exteriorColor?: string; vin?: string }): Promise<MarketListing | undefined>;
  deactivateMarketListing(dealershipId: number, url: string): Promise<boolean>;
  deleteOldMarketListings(dealershipId: number, daysOld: number): Promise<number>;
  
  // CarGurus Color Cache
  getCargurusColorByVin(vin: string): Promise<CargurusColorCache | undefined>;
  upsertCargurusColorCache(data: InsertCargurusColorCache): Promise<CargurusColorCache>;
  getExpiredCargurusColors(): Promise<CargurusColorCache[]>;
  
  // External API Tokens (Multi-Tenant)
  getExternalApiTokens(dealershipId: number): Promise<ExternalApiToken[]>;
  getExternalApiTokenById(id: number, dealershipId: number): Promise<ExternalApiToken | undefined>;
  getExternalApiTokenByPrefix(prefix: string): Promise<ExternalApiToken | undefined>;
  createExternalApiToken(token: InsertExternalApiToken): Promise<ExternalApiToken>;
  updateExternalApiToken(id: number, dealershipId: number, token: Partial<InsertExternalApiToken>): Promise<ExternalApiToken | undefined>;
  deleteExternalApiToken(id: number, dealershipId: number): Promise<boolean>;
  updateExternalApiTokenLastUsed(id: number): Promise<void>;
  
  // Staff Invites
  getStaffInviteByToken(token: string): Promise<StaffInvite | undefined>;
  acceptStaffInvite(id: number): Promise<void>;
  getDealershipById(id: number): Promise<Dealership | undefined>;
  
  // Password Reset Tokens
  createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken>;
  getAllValidPasswordResetTokens(): Promise<PasswordResetToken[]>;
  markPasswordResetTokenUsed(id: number): Promise<void>;
  deleteExpiredPasswordResetTokens(): Promise<number>;
  
  // Launch Checklist (Multi-Tenant)
  getLaunchChecklist(dealershipId: number): Promise<LaunchChecklist[]>;
  getLaunchChecklistByCategory(dealershipId: number, category: string): Promise<LaunchChecklist[]>;
  getLaunchChecklistProgress(dealershipId: number): Promise<{ total: number; completed: number; required: number; requiredCompleted: number }>;
  createLaunchChecklistItem(item: InsertLaunchChecklist): Promise<LaunchChecklist>;
  createLaunchChecklistItems(items: InsertLaunchChecklist[]): Promise<LaunchChecklist[]>;
  updateLaunchChecklistItem(id: number, dealershipId: number, item: Partial<InsertLaunchChecklist>): Promise<LaunchChecklist | undefined>;
  completeLaunchChecklistItem(id: number, dealershipId: number, userId: number): Promise<LaunchChecklist | undefined>;
  skipLaunchChecklistItem(id: number, dealershipId: number, notes?: string): Promise<LaunchChecklist | undefined>;
  deleteLaunchChecklistItem(id: number, dealershipId: number): Promise<boolean>;
  
  // Price History (Multi-Tenant)
  getPriceHistory(dealershipId: number, filters: { make?: string; model?: string; externalId?: string }, limit?: number): Promise<PriceHistory[]>;
  createPriceHistory(record: InsertPriceHistory): Promise<PriceHistory>;
  createPriceHistoryBatch(records: InsertPriceHistory[]): Promise<PriceHistory[]>;
  getPriceHistoryForListing(dealershipId: number, externalId: string): Promise<PriceHistory[]>;
  
  // Competitor Dealers (Multi-Tenant)
  getCompetitorDealers(dealershipId: number): Promise<CompetitorDealer[]>;
  getCompetitorDealerById(id: number, dealershipId: number): Promise<CompetitorDealer | undefined>;
  createCompetitorDealer(dealer: InsertCompetitorDealer): Promise<CompetitorDealer>;
  updateCompetitorDealer(id: number, dealershipId: number, dealer: Partial<InsertCompetitorDealer>): Promise<CompetitorDealer | undefined>;
  deleteCompetitorDealer(id: number, dealershipId: number): Promise<boolean>;
  
  // Market Snapshots (Multi-Tenant)
  getMarketSnapshots(dealershipId: number, filters: { make?: string; model?: string; limit?: number }): Promise<MarketSnapshot[]>;
  createMarketSnapshot(snapshot: InsertMarketSnapshot): Promise<MarketSnapshot>;
  getLatestMarketSnapshot(dealershipId: number, make: string, model: string): Promise<MarketSnapshot | undefined>;
  getLatestMarketSnapshotDate(dealershipId: number): Promise<Date | null>;
  
  // ====== SCRAPER ACTIVITY LOGS ======
  createScraperActivityLog(log: InsertScraperActivityLog): Promise<ScraperActivityLog>;
  updateScraperActivityLog(id: number, updates: Partial<InsertScraperActivityLog>): Promise<ScraperActivityLog | undefined>;
  getScraperActivityLogs(dealershipId?: number, limit?: number): Promise<ScraperActivityLog[]>;
  getLatestScraperLog(dealershipId: number, sourceType?: string): Promise<ScraperActivityLog | undefined>;
  
  // ====== DEALERSHIP BRANDING ======
  getDealershipBranding(dealershipId: number): Promise<DealershipBranding | undefined>;
  upsertDealershipBranding(branding: InsertDealershipBranding): Promise<DealershipBranding>;
  
  // ====== SYSTEM HEALTH COUNTS (Cross-Dealership) ======
  getTotalVehicleCount(): Promise<number>;
  getAllConversationsCount(): Promise<number>;
  getAllChatPromptsCount(): Promise<number>;
  getAllFilterGroupsCount(): Promise<number>;
  getApiKeysConfiguredCount(): Promise<number>;
  getTotalRemarketingVehicleCount(): Promise<number>;
  
  // ====== CALL ANALYSIS SYSTEM ======
  // Call Analysis Criteria (Multi-Tenant)
  getCallAnalysisCriteria(dealershipId: number): Promise<CallAnalysisCriteria[]>;
  getActiveCallAnalysisCriteria(dealershipId: number): Promise<CallAnalysisCriteria[]>;
  createCallAnalysisCriteria(criteria: InsertCallAnalysisCriteria): Promise<CallAnalysisCriteria>;
  updateCallAnalysisCriteria(id: number, dealershipId: number, criteria: Partial<InsertCallAnalysisCriteria>): Promise<CallAnalysisCriteria | undefined>;
  deleteCallAnalysisCriteria(id: number, dealershipId: number): Promise<boolean>;
  
  // Call Recordings (Multi-Tenant)
  getCallRecordings(dealershipId: number, filters?: { 
    salespersonId?: number; 
    startDate?: Date; 
    endDate?: Date; 
    analysisStatus?: string;
    needsReview?: boolean;
    minScore?: number;
    maxScore?: number;
  }, limit?: number, offset?: number): Promise<{ recordings: CallRecording[]; total: number }>;
  getCallRecordingById(id: number, dealershipId: number): Promise<CallRecording | undefined>;
  getCallRecordingByGhlCallId(ghlCallId: string, dealershipId: number): Promise<CallRecording | undefined>;
  createCallRecording(recording: InsertCallRecording): Promise<CallRecording>;
  updateCallRecording(id: number, dealershipId: number, recording: Partial<InsertCallRecording>): Promise<CallRecording | undefined>;
  getPendingCallRecordings(dealershipId: number, limit?: number): Promise<CallRecording[]>;
  getCallRecordingsNeedingReview(dealershipId: number, limit?: number): Promise<CallRecording[]>;
  getCallRecordingStats(dealershipId: number, startDate?: Date, endDate?: Date): Promise<{
    totalCalls: number;
    analyzedCalls: number;
    averageScore: number;
    callsNeedingReview: number;
    sentimentBreakdown: { positive: number; neutral: number; negative: number };
  }>;
  
  // ====== SUPER ADMIN IMPERSONATION ======
  createImpersonationSession(session: InsertImpersonationSession): Promise<ImpersonationSession>;
  getActiveImpersonationSession(superAdminId: number): Promise<ImpersonationSession | undefined>;
  endImpersonationSession(id: number, superAdminId: number): Promise<ImpersonationSession | undefined>;
  getImpersonationSessions(limit?: number, offset?: number): Promise<{ sessions: (ImpersonationSession & { superAdminName?: string; targetUserName?: string; targetDealershipName?: string })[]; total: number }>;
  incrementImpersonationActions(id: number): Promise<void>;
  
  // ====== AUTOMATION ENGINE ======
  // Follow-up Sequences (Multi-Tenant)
  getFollowUpSequences(dealershipId: number): Promise<FollowUpSequence[]>;
  getActiveFollowUpSequences(dealershipId: number): Promise<FollowUpSequence[]>;
  getFollowUpSequenceById(id: number, dealershipId: number): Promise<FollowUpSequence | undefined>;
  createFollowUpSequence(sequence: InsertFollowUpSequence): Promise<FollowUpSequence>;
  updateFollowUpSequence(id: number, dealershipId: number, sequence: Partial<InsertFollowUpSequence>): Promise<FollowUpSequence | undefined>;
  deleteFollowUpSequence(id: number, dealershipId: number): Promise<boolean>;
  
  // Follow-up Queue (Multi-Tenant)
  getFollowUpQueueItems(dealershipId: number, status?: string, limit?: number): Promise<FollowUpQueue[]>;
  getFollowUpQueueById(id: number, dealershipId: number): Promise<FollowUpQueue | undefined>;
  getPendingFollowUpsByContact(dealershipId: number, contactPhone: string): Promise<FollowUpQueue[]>;
  getDueFollowUpItems(dealershipId: number, limit?: number): Promise<FollowUpQueue[]>;
  createFollowUpQueueItem(item: InsertFollowUpQueue): Promise<FollowUpQueue>;
  updateFollowUpQueueItem(id: number, dealershipId: number, item: Partial<InsertFollowUpQueue>): Promise<FollowUpQueue | undefined>;
  deleteFollowUpQueueItem(id: number, dealershipId: number): Promise<boolean>;
  
  // Price Watches (Multi-Tenant)
  getPriceWatches(dealershipId: number, vehicleId?: number): Promise<PriceWatch[]>;
  getActivePriceWatches(dealershipId: number): Promise<PriceWatch[]>;
  getPriceWatchesByVehicle(dealershipId: number, vehicleId: number): Promise<PriceWatch[]>;
  getPriceWatchById(id: number, dealershipId: number): Promise<PriceWatch | undefined>;
  getPriceWatchByContact(dealershipId: number, vehicleId: number, contactPhone: string): Promise<PriceWatch | undefined>;
  getPriceWatchesWithPriceDrops(dealershipId: number): Promise<(PriceWatch & { vehicle: Vehicle; dropPercent: number })[]>;
  createPriceWatch(watch: InsertPriceWatch): Promise<PriceWatch>;
  updatePriceWatch(id: number, dealershipId: number, watch: Partial<InsertPriceWatch>): Promise<PriceWatch | undefined>;
  deletePriceWatch(id: number, dealershipId: number): Promise<boolean>;
  incrementPriceWatchViewCount(id: number, dealershipId: number): Promise<void>;
  
  // Competitor Price Alerts (Multi-Tenant)
  getCompetitorPriceAlerts(dealershipId: number, filters?: { status?: string; severity?: string; vehicleId?: number }, limit?: number): Promise<CompetitorPriceAlert[]>;
  getCompetitorPriceAlertById(id: number, dealershipId: number): Promise<CompetitorPriceAlert | undefined>;
  createCompetitorPriceAlert(alert: InsertCompetitorPriceAlert): Promise<CompetitorPriceAlert>;
  updateCompetitorPriceAlert(id: number, dealershipId: number, alert: Partial<InsertCompetitorPriceAlert>): Promise<CompetitorPriceAlert | undefined>;
  acknowledgeCompetitorPriceAlert(id: number, dealershipId: number, userId: number): Promise<CompetitorPriceAlert | undefined>;
  resolveCompetitorPriceAlert(id: number, dealershipId: number, note?: string): Promise<CompetitorPriceAlert | undefined>;
  
  // Automation Logs (Multi-Tenant)
  getAutomationLogs(dealershipId: number, filters?: { automationType?: string; actionType?: string; startDate?: Date; endDate?: Date }, limit?: number): Promise<AutomationLog[]>;
  createAutomationLog(log: InsertAutomationLog): Promise<AutomationLog>;
  
  // Appointment Reminders (Multi-Tenant)
  getAppointmentReminders(dealershipId: number, status?: string): Promise<AppointmentReminder[]>;
  getDueAppointmentReminders(dealershipId: number, limit?: number): Promise<AppointmentReminder[]>;
  getAppointmentRemindersByAppointment(dealershipId: number, appointmentId: string): Promise<AppointmentReminder[]>;
  createAppointmentReminder(reminder: InsertAppointmentReminder): Promise<AppointmentReminder>;
  updateAppointmentReminder(id: number, dealershipId: number, reminder: Partial<InsertAppointmentReminder>): Promise<AppointmentReminder | undefined>;
  lockAppointmentReminderForProcessing(id: number, dealershipId: number): Promise<AppointmentReminder | undefined>;
  deleteAppointmentReminder(id: number, dealershipId: number): Promise<boolean>;
  
  // ====== SEQUENCE ANALYTICS & RE-ENGAGEMENT ======
  // Sequence Executions
  getSequenceExecutions(dealershipId: number, sequenceId?: number, status?: string, limit?: number): Promise<SequenceExecution[]>;
  getSequenceExecutionById(id: number, dealershipId: number): Promise<SequenceExecution | undefined>;
  getActiveExecutionsByContact(dealershipId: number, contactPhone: string): Promise<SequenceExecution[]>;
  createSequenceExecution(execution: InsertSequenceExecution): Promise<SequenceExecution>;
  updateSequenceExecution(id: number, dealershipId: number, execution: Partial<InsertSequenceExecution>): Promise<SequenceExecution | undefined>;
  incrementExecutionMetric(id: number, dealershipId: number, metric: 'messagesDelivered' | 'messagesOpened' | 'responsesReceived' | 'appointmentsBooked'): Promise<void>;
  
  // Sequence Messages
  getSequenceMessages(dealershipId: number, executionId: number): Promise<SequenceMessage[]>;
  getSequenceMessageById(id: number, dealershipId: number): Promise<SequenceMessage | undefined>;
  getPendingSequenceMessages(dealershipId: number, limit?: number): Promise<SequenceMessage[]>;
  createSequenceMessage(message: InsertSequenceMessage): Promise<SequenceMessage>;
  updateSequenceMessage(id: number, dealershipId: number, message: Partial<InsertSequenceMessage>): Promise<SequenceMessage | undefined>;
  
  // Sequence Conversions
  getSequenceConversions(dealershipId: number, sequenceId?: number, startDate?: Date, endDate?: Date): Promise<SequenceConversion[]>;
  createSequenceConversion(conversion: InsertSequenceConversion): Promise<SequenceConversion>;
  
  // Contact Activity
  getContactActivity(dealershipId: number, contactPhone?: string, contactEmail?: string): Promise<ContactActivity | undefined>;
  getInactiveContacts(dealershipId: number, inactiveDays: number, limit?: number): Promise<ContactActivity[]>;
  getAllContactActivity(dealershipId: number, limit?: number, offset?: number): Promise<{ contacts: ContactActivity[]; total: number }>;
  upsertContactActivity(activity: InsertContactActivity): Promise<ContactActivity>;
  updateContactActivity(id: number, dealershipId: number, activity: Partial<InsertContactActivity>): Promise<ContactActivity | undefined>;
  
  // Re-engagement Campaigns
  getReengagementCampaigns(dealershipId: number): Promise<ReengagementCampaign[]>;
  getActiveReengagementCampaigns(dealershipId: number): Promise<ReengagementCampaign[]>;
  getReengagementCampaignById(id: number, dealershipId: number): Promise<ReengagementCampaign | undefined>;
  getDueReengagementCampaigns(): Promise<ReengagementCampaign[]>;
  createReengagementCampaign(campaign: InsertReengagementCampaign): Promise<ReengagementCampaign>;
  updateReengagementCampaign(id: number, dealershipId: number, campaign: Partial<InsertReengagementCampaign>): Promise<ReengagementCampaign | undefined>;
  deleteReengagementCampaign(id: number, dealershipId: number): Promise<boolean>;
  
  // Sequence Analytics
  getSequenceAnalytics(dealershipId: number, sequenceId?: number, startDate?: Date, endDate?: Date): Promise<SequenceAnalytics[]>;
  upsertSequenceAnalytics(analytics: InsertSequenceAnalytics): Promise<SequenceAnalytics>;
  getSequencePerformanceSummary(dealershipId: number, startDate?: Date, endDate?: Date): Promise<{
    totalExecutions: number;
    totalConversions: number;
    totalMessagesSent: number;
    averageOpenRate: number;
    averageReplyRate: number;
    averageConversionRate: number;
    topPerformingSequences: { sequenceId: number; name: string; conversionRate: number }[];
  }>;
  
  // ====== VEHICLE APPRAISALS ======
  getVehicleAppraisals(dealershipId: number, filters?: { status?: string; search?: string; createdBy?: number }, limit?: number, offset?: number): Promise<{ appraisals: VehicleAppraisal[]; total: number }>;
  getAppraisalStats(dealershipId: number): Promise<{ purchased: number; passed: number; lookToBookRatio: string; totalQuoted: number; totalActual: number; accuracyVariance: number }>;
  getMissedTradesStats(dealershipId: number): Promise<{ 
    totalMissed: number; 
    totalLostValue: number;
    byReason: { reason: string; count: number; totalValue: number }[];
    recentMissed: { id: number; vin: string; year: number; make: string; model: string; quotedPrice: number; missedReason: string; missedNotes: string | null; createdAt: Date }[];
  }>;
  getAppraisalAccuracyReport(dealershipId: number): Promise<{
    totalPurchased: number;
    averageVariance: number;
    overPaidCount: number;
    underPaidCount: number;
    exactCount: number;
    totalOverpaid: number;
    totalUnderpaid: number;
    monthlyTrend: { month: string; avgVariance: number; count: number }[];
    recentPurchases: { id: number; vin: string; year: number; make: string; model: string; quotedPrice: number; actualSalePrice: number; variance: number; createdAt: Date }[];
  }>;
  getVehicleAppraisalById(id: number, dealershipId: number): Promise<VehicleAppraisal | undefined>;
  getVehicleAppraisalByVin(vin: string, dealershipId: number): Promise<VehicleAppraisal | undefined>;
  searchVehicleAppraisals(dealershipId: number, query: string, limit?: number): Promise<VehicleAppraisal[]>;
  createVehicleAppraisal(appraisal: InsertVehicleAppraisal): Promise<VehicleAppraisal>;
  updateVehicleAppraisal(id: number, dealershipId: number, appraisal: Partial<InsertVehicleAppraisal>): Promise<VehicleAppraisal | undefined>;
  deleteVehicleAppraisal(id: number, dealershipId: number): Promise<boolean>;
  
  // ====== CRM CONTACTS ======
  getCrmContacts(dealershipId: number, filters?: { 
    ownerId?: number;
    status?: string;
    leadSource?: string;
    search?: string;
    tagIds?: number[];
  }, pagination?: { limit?: number; offset?: number }, sorting?: { field?: string; direction?: 'asc' | 'desc' }): Promise<{ contacts: CrmContact[]; total: number }>;
  getCrmContactById(id: number, dealershipId: number): Promise<CrmContact | undefined>;
  createCrmContact(contact: InsertCrmContact): Promise<CrmContact>;
  updateCrmContact(id: number, dealershipId: number, contact: Partial<InsertCrmContact>): Promise<CrmContact | undefined>;
  deleteCrmContact(id: number, dealershipId: number): Promise<boolean>;
  
  // ====== CRM TAGS ======
  getCrmTags(dealershipId: number): Promise<CrmTag[]>;
  createCrmTag(tag: InsertCrmTag): Promise<CrmTag>;
  updateCrmTag(id: number, dealershipId: number, tag: Partial<InsertCrmTag>): Promise<CrmTag | undefined>;
  deleteCrmTag(id: number, dealershipId: number): Promise<boolean>;
  addTagToContact(contactId: number, tagId: number, addedById?: number): Promise<CrmContactTag>;
  removeTagFromContact(contactId: number, tagId: number): Promise<boolean>;
  getContactTags(contactId: number): Promise<CrmTag[]>;
  
  // ====== CRM ACTIVITIES ======
  getCrmActivities(contactId: number, dealershipId: number, limit?: number): Promise<CrmActivity[]>;
  createCrmActivity(activity: InsertCrmActivity): Promise<CrmActivity>;
  
  // ====== CRM TASKS ======
  getCrmTasks(dealershipId: number, filters?: {
    assignedToId?: number;
    contactId?: number;
    status?: string;
    priority?: string;
    dueAfter?: Date;
    dueBefore?: Date;
  }, limit?: number): Promise<CrmTask[]>;
  getCrmTaskById(id: number, dealershipId: number): Promise<CrmTask | undefined>;
  createCrmTask(task: InsertCrmTask): Promise<CrmTask>;
  updateCrmTask(id: number, dealershipId: number, task: Partial<InsertCrmTask>): Promise<CrmTask | undefined>;
  deleteCrmTask(id: number, dealershipId: number): Promise<boolean>;
  
  // ====== CRM MESSAGES ======
  createCrmMessage(message: InsertCrmMessage): Promise<CrmMessage>;
  updateCrmMessage(id: number, dealershipId: number, message: Partial<InsertCrmMessage>): Promise<CrmMessage | undefined>;
  getCrmMessages(contactId: number, dealershipId: number, limit?: number): Promise<CrmMessage[]>;
  
  // ====== CRM MESSAGE TEMPLATES ======
  getCrmMessageTemplates(dealershipId: number, channel?: string): Promise<CrmMessageTemplate[]>;
  getCrmMessageTemplateById(id: number, dealershipId: number): Promise<CrmMessageTemplate | undefined>;
  createCrmMessageTemplate(template: InsertCrmMessageTemplate): Promise<CrmMessageTemplate>;
  updateCrmMessageTemplate(id: number, dealershipId: number, template: Partial<InsertCrmMessageTemplate>): Promise<CrmMessageTemplate | undefined>;
  deleteCrmMessageTemplate(id: number, dealershipId: number): Promise<boolean>;
  incrementTemplateUsage(id: number, dealershipId: number): Promise<void>;
  
  // ====== MESSENGER HELPERS ======
  getMessengerConversationsByContactFacebookId(dealershipId: number, facebookId: string): Promise<any[]>;
  
  // ====== CALL SCORING SYSTEM ======
  // Templates
  getCallScoringTemplates(dealershipId: number | null): Promise<CallScoringTemplate[]>;
  getCallScoringTemplate(id: number): Promise<CallScoringTemplate | undefined>;
  createCallScoringTemplate(template: InsertCallScoringTemplate): Promise<CallScoringTemplate>;
  updateCallScoringTemplate(id: number, template: Partial<InsertCallScoringTemplate>): Promise<CallScoringTemplate | undefined>;
  deleteCallScoringTemplate(id: number): Promise<boolean>;
  cloneTemplateForDealership(templateId: number, dealershipId: number, userId: number): Promise<CallScoringTemplate>;

  // Criteria
  getTemplateCriteria(templateId: number): Promise<CallScoringCriterion[]>;
  createCriterion(criterion: InsertCallScoringCriterion): Promise<CallScoringCriterion>;
  updateCriterion(id: number, criterion: Partial<InsertCallScoringCriterion>): Promise<CallScoringCriterion | undefined>;
  deleteCriterion(id: number): Promise<boolean>;
  reorderCriteria(templateId: number, criteriaIds: number[]): Promise<void>;

  // Scoring Sheets
  getCallScoringSheet(callRecordingId: number): Promise<CallScoringSheet | undefined>;
  getCallScoringSheetWithResponses(callRecordingId: number): Promise<{ sheet: CallScoringSheet; responses: CallScoringResponse[] } | undefined>;
  createCallScoringSheet(sheet: InsertCallScoringSheet): Promise<CallScoringSheet>;
  updateCallScoringSheet(id: number, sheet: Partial<InsertCallScoringSheet>): Promise<CallScoringSheet | undefined>;

  // Scoring Responses
  getCallScoringResponses(sheetId: number): Promise<CallScoringResponse[]>;
  upsertCallScoringResponse(response: InsertCallScoringResponse): Promise<CallScoringResponse>;
  bulkUpsertCallScoringResponses(responses: InsertCallScoringResponse[]): Promise<CallScoringResponse[]>;

  // Call Participants
  getCallParticipants(callRecordingId: number): Promise<CallParticipant[]>;
  createCallParticipant(participant: InsertCallParticipant): Promise<CallParticipant>;
  updateCallParticipant(id: number, participant: Partial<InsertCallParticipant>): Promise<CallParticipant | undefined>;

  // Scrape Runs - Inventory scrape logging
  createScrapeRun(run: InsertScrapeRun): Promise<ScrapeRun>;
  updateScrapeRun(id: number, updates: Partial<InsertScrapeRun>): Promise<ScrapeRun | undefined>;
  getScrapeRuns(dealershipId?: number, limit?: number): Promise<ScrapeRun[]>;
  getLatestScrapeRun(dealershipId?: number): Promise<ScrapeRun | undefined>;

  // Scrape Queue - Checkpointed VDP processing
  createScrapeQueueBatch(items: InsertScrapeQueue[]): Promise<ScrapeQueue[]>;
  getPendingScrapeQueueItems(scrapeRunId: number): Promise<ScrapeQueue[]>;
  getIncompleteScrapeQueue(dealershipId: number): Promise<{ scrapeRunId: number; items: ScrapeQueue[] } | null>;
  updateScrapeQueueItem(id: number, updates: Partial<InsertScrapeQueue>): Promise<ScrapeQueue | undefined>;
  markScrapeQueueCompleted(id: number, vehicleId: number): Promise<void>;
  markScrapeQueueFailed(id: number, errorMessage: string): Promise<void>;
  clearScrapeQueue(scrapeRunId: number): Promise<void>;

  // ====== CARFAX REPORTS ======
  getCarfaxReport(vehicleId: number): Promise<CarfaxReport | undefined>;
  getCarfaxReportByVin(vin: string): Promise<CarfaxReport | undefined>;
  upsertCarfaxReport(data: InsertCarfaxReport): Promise<CarfaxReport>;
}

export class DatabaseStorage implements IStorage {
  // ====== DEALERSHIP MANAGEMENT ======
  async getDealership(id: number): Promise<Dealership | undefined> {
    const result = await db
      .select()
      .from(dealerships)
      .where(eq(dealerships.id, id))
      .limit(1);
    return result[0];
  }

  async getDealershipBySlug(slug: string): Promise<Dealership | undefined> {
    const result = await db
      .select()
      .from(dealerships)
      .where(eq(dealerships.slug, slug))
      .limit(1);
    return result[0];
  }

  async getDealershipBySubdomain(subdomain: string): Promise<Dealership | undefined> {
    const result = await db
      .select()
      .from(dealerships)
      .where(
        and(
          sql`LOWER(${dealerships.subdomain}) = LOWER(${subdomain})`,
          eq(dealerships.isActive, true)
        )
      )
      .limit(1);
    return result[0];
  }

  async getAllDealerships(): Promise<Dealership[]> {
    return await db.select().from(dealerships).orderBy(dealerships.name);
  }

  async createDealership(dealership: InsertDealership): Promise<Dealership> {
    const result = await db.insert(dealerships).values(dealership).returning();
    return result[0];
  }

  async updateDealership(id: number, dealership: Partial<InsertDealership>): Promise<Dealership | undefined> {
    const result = await db.update(dealerships).set({ ...dealership, updatedAt: new Date() }).where(eq(dealerships.id, id)).returning();
    return result[0];
  }

  async deleteDealership(id: number): Promise<boolean> {
    await db.delete(dealerships).where(eq(dealerships.id, id));
    return true;
  }

  // Dealership API keys
  async getDealershipApiKeys(dealershipId: number): Promise<DealershipApiKeys | undefined> {
    const result = await db.select().from(dealershipApiKeys).where(eq(dealershipApiKeys.dealershipId, dealershipId)).limit(1);
    return result[0];
  }

  async saveDealershipApiKeys(keys: InsertDealershipApiKeys): Promise<DealershipApiKeys> {
    // Check if keys already exist for this dealership
    const existing = await this.getDealershipApiKeys(keys.dealershipId);
    
    if (existing) {
      // Update existing keys
      const result = await db.update(dealershipApiKeys)
        .set({ ...keys, updatedAt: new Date() })
        .where(eq(dealershipApiKeys.dealershipId, keys.dealershipId))
        .returning();
      return result[0];
    } else {
      // Create new keys
      const result = await db.insert(dealershipApiKeys).values(keys).returning();
      return result[0];
    }
  }

  async updateDealershipApiKeys(dealershipId: number, keys: Partial<InsertDealershipApiKeys>): Promise<DealershipApiKeys | undefined> {
    const result = await db.update(dealershipApiKeys)
      .set({ ...keys, updatedAt: new Date() })
      .where(eq(dealershipApiKeys.dealershipId, dealershipId))
      .returning();
    return result[0];
  }

  // Dealership subscriptions
  async getDealershipSubscription(dealershipId: number): Promise<DealershipSubscription | undefined> {
    const result = await db.select().from(dealershipSubscriptions).where(eq(dealershipSubscriptions.dealershipId, dealershipId)).limit(1);
    return result[0];
  }

  async createDealershipSubscription(subscription: InsertDealershipSubscription): Promise<DealershipSubscription> {
    const result = await db.insert(dealershipSubscriptions).values(subscription).returning();
    return result[0];
  }

  async updateDealershipSubscription(dealershipId: number, subscription: Partial<InsertDealershipSubscription>): Promise<DealershipSubscription | undefined> {
    const result = await db.update(dealershipSubscriptions)
      .set({ ...subscription, updatedAt: new Date() })
      .where(eq(dealershipSubscriptions.dealershipId, dealershipId))
      .returning();
    return result[0];
  }

  // ====== VEHICLE OPERATIONS (Multi-Tenant) ======
  // All operations enforce dealership isolation for security
  async getVehicles(dealershipId: number, limit: number = 50, offset: number = 0): Promise<{ vehicles: Vehicle[]; total: number }> {
    // Get total count for pagination metadata
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vehicles)
      .where(eq(vehicles.dealershipId, dealershipId));
    
    // Get paginated vehicles
    const vehiclesList = await db.select().from(vehicles)
      .where(eq(vehicles.dealershipId, dealershipId))
      .orderBy(desc(vehicles.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      vehicles: vehiclesList,
      total: count
    };
  }

  async getVehicleById(id: number, dealershipId: number): Promise<Vehicle | undefined> {
    const result = await db.select().from(vehicles)
      .where(and(
        eq(vehicles.id, id), 
        eq(vehicles.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async getVehicleByVin(vin: string, dealershipId: number): Promise<Vehicle | undefined> {
    // Normalize VIN: uppercase and trim whitespace for consistent matching
    const normalizedVin = vin.trim().toUpperCase();
    const result = await db.select().from(vehicles)
      .where(and(
        sql`UPPER(TRIM(${vehicles.vin})) = ${normalizedVin}`,
        eq(vehicles.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async deleteVehiclesByVinNotIn(vins: string[], dealershipId: number): Promise<{ deletedCount: number; deletedVins: string[] }> {
    // Normalize all VINs for comparison
    const normalizedVins = vins.map(v => v.trim().toUpperCase()).filter(v => v.length > 0);
    
    // SAFETY: If no valid VINs provided, refuse to execute (would delete everything)
    if (normalizedVins.length === 0) {
      throw new Error('Cannot execute sync with empty VIN list - this would delete all vehicles');
    }
    
    // Get vehicles that will be deleted (for reporting)
    // Using parameterized array to prevent SQL injection
    const toDelete = await db.select({ id: vehicles.id, vin: vehicles.vin })
      .from(vehicles)
      .where(and(
        eq(vehicles.dealershipId, dealershipId),
        sql`${vehicles.vin} IS NOT NULL`,
        sql`UPPER(TRIM(${vehicles.vin})) != ALL(${normalizedVins}::text[])`
      ));
    
    if (toDelete.length === 0) {
      return { deletedCount: 0, deletedVins: [] };
    }
    
    // Delete in one efficient query using parameterized array
    const idsToDelete = toDelete.map(v => v.id);
    await db.delete(vehicles).where(and(
      eq(vehicles.dealershipId, dealershipId),
      sql`${vehicles.id} = ANY(${idsToDelete}::int[])`
    ));
    
    return {
      deletedCount: toDelete.length,
      deletedVins: toDelete.map(v => v.vin).filter((v): v is string => v !== null)
    };
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    // Ensure dealershipId is set - it's required in schema
    if (!vehicle.dealershipId) {
      throw new Error('dealershipId is required when creating a vehicle');
    }
    const result = await db.insert(vehicles).values(vehicle).returning();
    return result[0];
  }

  async updateVehicle(id: number, vehicle: Partial<InsertVehicle>, dealershipId: number): Promise<Vehicle | undefined> {
    // Only update vehicles belonging to this dealership
    
    // CRITICAL: If images are being updated, clear localImages to prevent stale cache
    // This ensures the new images from the database are used instead of cached local copies
    const updateData: any = { ...vehicle };
    if (vehicle.images && Array.isArray(vehicle.images) && vehicle.images.length > 0) {
      updateData.localImages = null;
      console.log(`[Storage] Clearing localImages for vehicle ${id} because images are being updated`);
    }
    
    const result = await db.update(vehicles)
      .set(updateData)
      .where(and(
        eq(vehicles.id, id),
        eq(vehicles.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteVehicle(id: number, dealershipId: number): Promise<boolean> {
    // Only delete vehicles belonging to this dealership
    await db.delete(vehicles).where(and(
      eq(vehicles.id, id),
      eq(vehicles.dealershipId, dealershipId)
    ));
    return true;
  }

  // ====== VIEW TRACKING (Multi-Tenant - CRITICAL for analytics security) ======
  async trackVehicleView(view: InsertVehicleView): Promise<VehicleView> {
    // Validate dealershipId is present before insert
    if (!view.dealershipId) {
      throw new Error('dealershipId is required when tracking vehicle views');
    }
    const result = await db.insert(vehicleViews).values(view).returning();
    return result[0];
  }

  async getVehicleViews(vehicleId: number, dealershipId: number, hours: number = 24): Promise<number> {
    // CRITICAL: Join with vehicles table to enforce dealership isolation
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(vehicleViews)
      .innerJoin(vehicles, eq(vehicleViews.vehicleId, vehicles.id))
      .where(
        and(
          eq(vehicleViews.vehicleId, vehicleId),
          eq(vehicles.dealershipId, dealershipId), // ENFORCE dealership filtering
          sql`${vehicleViews.viewedAt} >= ${cutoffTime}`
        )
      );
    return Number(result[0]?.count || 0);
  }
  
  async getAllVehicleViews(dealershipId: number, hours: number = 24): Promise<Map<number, number>> {
    // CRITICAL: Only return views for vehicles belonging to this dealership
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const result = await db
      .select({
        vehicleId: vehicleViews.vehicleId,
        count: sql<number>`count(*)`
      })
      .from(vehicleViews)
      .innerJoin(vehicles, eq(vehicleViews.vehicleId, vehicles.id))
      .where(and(
        eq(vehicles.dealershipId, dealershipId), // ENFORCE dealership filtering
        sql`${vehicleViews.viewedAt} >= ${cutoffTime}`
      ))
      .groupBy(vehicleViews.vehicleId);
    
    const viewsMap = new Map<number, number>();
    result.forEach(row => {
      viewsMap.set(row.vehicleId, Number(row.count));
    });
    return viewsMap;
  }

  // Facebook pages
  async getFacebookPages(dealershipId?: number): Promise<FacebookPage[]> {
    if (dealershipId) {
      return await db.select().from(facebookPages).where(
        and(eq(facebookPages.dealershipId, dealershipId), eq(facebookPages.isActive, true))
      );
    }
    return await db.select().from(facebookPages).where(eq(facebookPages.isActive, true));
  }

  async getFacebookPageByPageId(pageId: string): Promise<FacebookPage | undefined> {
    const result = await db.select().from(facebookPages).where(eq(facebookPages.pageId, pageId));
    return result[0];
  }

  async createFacebookPage(page: InsertFacebookPage): Promise<FacebookPage> {
    const result = await db.insert(facebookPages).values(page).returning();
    return result[0];
  }

  async updateFacebookPage(id: number, page: Partial<InsertFacebookPage>): Promise<FacebookPage | undefined> {
    const result = await db.update(facebookPages).set(page).where(eq(facebookPages.id, id)).returning();
    return result[0];
  }

  // Facebook Catalog Config (for Automotive Inventory Ads)
  async getFacebookCatalogConfig(dealershipId: number): Promise<FacebookCatalogConfig | undefined> {
    const result = await db.select().from(facebookCatalogConfig).where(eq(facebookCatalogConfig.dealershipId, dealershipId));
    return result[0];
  }

  async getAllFacebookCatalogConfigs(): Promise<(FacebookCatalogConfig & { dealershipName?: string })[]> {
    const result = await db.select({
      id: facebookCatalogConfig.id,
      dealershipId: facebookCatalogConfig.dealershipId,
      catalogId: facebookCatalogConfig.catalogId,
      accessToken: facebookCatalogConfig.accessToken,
      catalogName: facebookCatalogConfig.catalogName,
      isActive: facebookCatalogConfig.isActive,
      lastSyncAt: facebookCatalogConfig.lastSyncAt,
      lastSyncStatus: facebookCatalogConfig.lastSyncStatus,
      lastSyncMessage: facebookCatalogConfig.lastSyncMessage,
      vehiclesSynced: facebookCatalogConfig.vehiclesSynced,
      autoSyncEnabled: facebookCatalogConfig.autoSyncEnabled,
      createdAt: facebookCatalogConfig.createdAt,
      updatedAt: facebookCatalogConfig.updatedAt,
      dealershipName: dealerships.name,
    }).from(facebookCatalogConfig)
      .leftJoin(dealerships, eq(facebookCatalogConfig.dealershipId, dealerships.id));
    return result.map(r => ({
      ...r,
      dealershipName: r.dealershipName ?? undefined,
    }));
  }

  async saveFacebookCatalogConfig(config: InsertFacebookCatalogConfig): Promise<FacebookCatalogConfig> {
    const result = await db.insert(facebookCatalogConfig).values(config)
      .onConflictDoUpdate({
        target: facebookCatalogConfig.dealershipId,
        set: {
          catalogId: config.catalogId,
          accessToken: config.accessToken,
          catalogName: config.catalogName,
          isActive: config.isActive,
          autoSyncEnabled: config.autoSyncEnabled,
          updatedAt: new Date(),
        }
      })
      .returning();
    return result[0];
  }

  async updateFacebookCatalogConfig(dealershipId: number, config: Partial<InsertFacebookCatalogConfig>): Promise<FacebookCatalogConfig | undefined> {
    const result = await db.update(facebookCatalogConfig)
      .set({ ...config, updatedAt: new Date() })
      .where(eq(facebookCatalogConfig.dealershipId, dealershipId))
      .returning();
    return result[0];
  }

  async updateCatalogSyncStatus(dealershipId: number, status: { lastSyncAt?: Date; lastSyncStatus?: string; lastSyncMessage?: string; vehiclesSynced?: number }): Promise<FacebookCatalogConfig | undefined> {
    const result = await db.update(facebookCatalogConfig)
      .set({ ...status, updatedAt: new Date() })
      .where(eq(facebookCatalogConfig.dealershipId, dealershipId))
      .returning();
    return result[0];
  }

  async deleteFacebookCatalogConfig(dealershipId: number): Promise<boolean> {
    const result = await db.delete(facebookCatalogConfig)
      .where(eq(facebookCatalogConfig.dealershipId, dealershipId))
      .returning();
    return result.length > 0;
  }

  // Priority vehicles
  async getPagePriorityVehicles(pageId: number, dealershipId: number): Promise<PagePriorityVehicle[]> {
    return await db.select().from(pagePriorityVehicles).where(
      and(eq(pagePriorityVehicles.pageId, pageId), eq(pagePriorityVehicles.dealershipId, dealershipId))
    );
  }

  async setPagePriorityVehicles(pageId: number, vehicleIds: number[], dealershipId: number): Promise<void> {
    // LEGACY/DEPRECATED: Page priority vehicles are being replaced by remarketing system
    
    // Delete existing priorities for this page and dealership
    await db.delete(pagePriorityVehicles).where(
      and(eq(pagePriorityVehicles.pageId, pageId), eq(pagePriorityVehicles.dealershipId, dealershipId))
    );
    
    // Insert new priorities
    if (vehicleIds.length > 0) {
      await db.insert(pagePriorityVehicles).values(
        vehicleIds.map((vehicleId, index) => ({
          dealershipId,
          pageId,
          vehicleId,
          priority: index + 1
        }))
      );
    }
  }

  // GoHighLevel config (Legacy - use createGhlConfig for new code)
  async saveGHLConfig(config: InsertGhlConfig): Promise<GhlConfig> {
    // Check if config exists for this dealership, upsert if so
    if (config.dealershipId) {
      const existing = await this.getGhlConfig(config.dealershipId);
      if (existing) {
        const updated = await this.updateGhlConfig(existing.id, config.dealershipId, config);
        if (updated) return updated;
      }
    }
    
    // Insert new config
    const result = await db.insert(ghlConfig).values(config).returning();
    return result[0];
  }

  // GHL Webhook config
  async saveGHLWebhookConfig(config: InsertGhlWebhookConfig): Promise<GhlWebhookConfig> {
    // Deactivate all existing webhook configs
    await db.update(ghlWebhookConfig).set({ isActive: false });
    
    // Insert new active config
    const result = await db.insert(ghlWebhookConfig).values(config).returning();
    return result[0];
  }

  async getActiveGHLWebhookConfig(dealershipId: number): Promise<GhlWebhookConfig | undefined> {
    const result = await db.select().from(ghlWebhookConfig)
      .where(and(
        eq(ghlWebhookConfig.dealershipId, dealershipId),
        eq(ghlWebhookConfig.isActive, true)
      ))
      .limit(1);
    return result[0];
  }

  // AI prompt templates
  async saveAIPromptTemplate(template: InsertAiPromptTemplate): Promise<AiPromptTemplate> {
    // Deactivate all existing templates if this one is active
    if (template.isActive) {
      await db.update(aiPromptTemplates).set({ isActive: false });
    }
    
    // Insert new template
    const result = await db.insert(aiPromptTemplates).values(template).returning();
    return result[0];
  }

  // ====== CHAT CONVERSATIONS (Multi-Tenant) ======
  async saveChatConversation(conversation: InsertChatConversation): Promise<ChatConversation> {
    // Validate dealershipId is present before insert
    if (!conversation.dealershipId) {
      throw new Error('dealershipId is required when creating a chat conversation');
    }
    const result = await db.insert(chatConversations).values(conversation).returning();
    return result[0];
  }

  async getAllConversations(dealershipId: number, category?: string, limit: number = 50, offset: number = 0): Promise<{ conversations: ChatConversation[]; total: number }> {
    // REQUIRED: Only return conversations from specific dealership
    const conditions = category
      ? and(eq(chatConversations.dealershipId, dealershipId), eq(chatConversations.category, category))
      : eq(chatConversations.dealershipId, dealershipId);
    
    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(chatConversations)
      .where(conditions);
    
    // Get paginated conversations
    const conversations = await db.select().from(chatConversations)
      .where(conditions)
      .orderBy(desc(chatConversations.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      conversations,
      total: count
    };
  }

  async getConversationById(id: number, dealershipId: number): Promise<ChatConversation | undefined> {
    // REQUIRED: Filter by dealership to prevent cross-tenant access
    const result = await db.select().from(chatConversations)
      .where(and(
        eq(chatConversations.id, id),
        eq(chatConversations.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async updateConversationHandoff(id: number, dealershipId: number, data: { 
    handoffRequested?: boolean; 
    handoffPhone?: string; 
    handoffEmail?: string;
    handoffName?: string;
    handoffSent?: boolean; 
    handoffSentAt?: Date;
    ghlContactId?: string;
  }): Promise<ChatConversation | undefined> {
    // REQUIRED: Only update conversations from this dealership
    const result = await db.update(chatConversations)
      .set(data)
      .where(and(
        eq(chatConversations.id, id),
        eq(chatConversations.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async getConversationByGhlContactId(dealershipId: number, ghlContactId: string): Promise<ChatConversation | undefined> {
    const result = await db.select().from(chatConversations)
      .where(and(
        eq(chatConversations.dealershipId, dealershipId),
        eq(chatConversations.ghlContactId, ghlContactId)
      ))
      .orderBy(desc(chatConversations.createdAt))
      .limit(1);
    return result[0];
  }

  async appendMessageToConversation(id: number, dealershipId: number, message: { 
    role: string; 
    content: string; 
    timestamp: string; 
    channel?: string; 
    direction?: string; 
    ghlMessageId?: string 
  }): Promise<ChatConversation | undefined> {
    const conversation = await this.getConversationById(id, dealershipId);
    if (!conversation) return undefined;

    let messages: any[] = [];
    try {
      messages = JSON.parse(conversation.messages || '[]');
    } catch (e) {
      console.error('Failed to parse conversation messages, starting fresh:', e);
      messages = [];
    }
    messages.push(message);

    const result = await db.update(chatConversations)
      .set({ messages: JSON.stringify(messages) })
      .where(and(
        eq(chatConversations.id, id),
        eq(chatConversations.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  // Messenger conversations (Multi-Tenant with role-based filtering)
  async getMessengerConversations(dealershipId: number, userId?: number, userRole?: string): Promise<(MessengerConversation & { ownerName?: string; assignedTo?: { id: number; name: string } })[]> {
    // For managers (manager, general_manager, super_admin), show all conversations
    // For salespeople, only show conversations from their connected Facebook accounts
    if (userRole === 'salesperson' && userId) {
      // Get Facebook accounts owned by this salesperson
      const userAccounts = await db.select()
        .from(facebookAccounts)
        .where(and(
          eq(facebookAccounts.userId, userId),
          eq(facebookAccounts.dealershipId, dealershipId)
        ));
      
      if (userAccounts.length === 0) {
        return [];
      }
      
      const accountIds = userAccounts.map(a => a.id);
      
      // Get conversations only from those accounts - select all MessengerConversation fields
      const conversations = await db.select()
        .from(messengerConversations)
        .innerJoin(facebookAccounts, eq(messengerConversations.facebookAccountId, facebookAccounts.id))
        .innerJoin(users, eq(facebookAccounts.userId, users.id))
        .where(and(
          eq(messengerConversations.dealershipId, dealershipId),
          inArray(messengerConversations.facebookAccountId, accountIds)
        ))
        .orderBy(desc(messengerConversations.lastMessageAt));
      
      return conversations.map(row => ({
        ...row.messenger_conversations,
        ownerName: row.users.name
      }));
    }
    
    // Managers see all conversations in the dealership - select all MessengerConversation fields
    const conversations = await db.select()
      .from(messengerConversations)
      .innerJoin(facebookAccounts, eq(messengerConversations.facebookAccountId, facebookAccounts.id))
      .innerJoin(users, eq(facebookAccounts.userId, users.id))
      .where(eq(messengerConversations.dealershipId, dealershipId))
      .orderBy(desc(messengerConversations.lastMessageAt));
    
    return conversations.map(row => ({
      ...row.messenger_conversations,
      ownerName: row.users.name
    }));
  }

  async createMessengerConversation(conversation: InsertMessengerConversation): Promise<MessengerConversation> {
    if (!conversation.dealershipId) {
      throw new Error('dealershipId is required when creating messenger conversations');
    }
    const result = await db.insert(messengerConversations).values(conversation).returning();
    return result[0];
  }

  async updateMessengerConversation(id: number, dealershipId: number, data: Partial<InsertMessengerConversation>): Promise<MessengerConversation | undefined> {
    const result = await db.update(messengerConversations)
      .set({ ...data, updatedAt: new Date() })
      .where(and(
        eq(messengerConversations.id, id),
        eq(messengerConversations.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async getMessengerConversationById(id: number, dealershipId: number): Promise<(MessengerConversation & { pageAccessToken: string }) | undefined> {
    const result = await db.select()
      .from(messengerConversations)
      .innerJoin(facebookAccounts, eq(messengerConversations.facebookAccountId, facebookAccounts.id))
      .where(and(
        eq(messengerConversations.id, id),
        eq(messengerConversations.dealershipId, dealershipId)
      ))
      .limit(1);
    
    if (!result[0] || !result[0].facebook_accounts.accessToken) {
      return undefined;
    }
    
    return {
      ...result[0].messenger_conversations,
      pageAccessToken: result[0].facebook_accounts.accessToken
    };
  }

  // Messenger messages (Multi-Tenant)
  async getMessengerMessages(dealershipId: number, conversationId: number): Promise<MessengerMessage[]> {
    return await db.select()
      .from(messengerMessages)
      .where(and(
        eq(messengerMessages.dealershipId, dealershipId),
        eq(messengerMessages.conversationId, conversationId)
      ))
      .orderBy(messengerMessages.sentAt);
  }

  async createMessengerMessage(message: InsertMessengerMessage): Promise<MessengerMessage> {
    if (!message.dealershipId) {
      throw new Error('dealershipId is required when creating messenger messages');
    }
    const result = await db.insert(messengerMessages).values(message).returning();
    return result[0];
  }

  async markMessagesAsRead(dealershipId: number, conversationId: number): Promise<void> {
    await db.update(messengerMessages)
      .set({ isRead: true })
      .where(and(
        eq(messengerMessages.dealershipId, dealershipId),
        eq(messengerMessages.conversationId, conversationId),
        eq(messengerMessages.isRead, false)
      ));
    
    // Reset unread count on conversation
    await db.update(messengerConversations)
      .set({ unreadCount: 0 })
      .where(and(
        eq(messengerConversations.id, conversationId),
        eq(messengerConversations.dealershipId, dealershipId)
      ));
  }

  async getMessengerMessageByGhlId(dealershipId: number, ghlMessageId: string): Promise<MessengerMessage | undefined> {
    const result = await db.select()
      .from(messengerMessages)
      .where(and(
        eq(messengerMessages.dealershipId, dealershipId),
        eq(messengerMessages.ghlMessageId, ghlMessageId)
      ))
      .limit(1);
    return result[0];
  }

  async getMessengerConversationByGhlId(dealershipId: number, ghlConversationId: string): Promise<MessengerConversation | undefined> {
    const result = await db.select()
      .from(messengerConversations)
      .where(and(
        eq(messengerConversations.dealershipId, dealershipId),
        eq(messengerConversations.ghlConversationId, ghlConversationId)
      ))
      .limit(1);
    return result[0];
  }

  async getMessengerConversationByGhlContactId(dealershipId: number, ghlContactId: string): Promise<MessengerConversation | undefined> {
    const result = await db.select()
      .from(messengerConversations)
      .where(and(
        eq(messengerConversations.dealershipId, dealershipId),
        eq(messengerConversations.ghlContactId, ghlContactId)
      ))
      .limit(1);
    return result[0];
  }

  async getMessengerConversationWithTokenByGhlId(dealershipId: number, ghlConversationId: string): Promise<(MessengerConversation & { pageAccessToken: string; participantId: string }) | undefined> {
    const result = await db.select()
      .from(messengerConversations)
      .innerJoin(facebookAccounts, eq(messengerConversations.facebookAccountId, facebookAccounts.id))
      .where(and(
        eq(messengerConversations.dealershipId, dealershipId),
        eq(messengerConversations.ghlConversationId, ghlConversationId)
      ))
      .limit(1);
    
    if (!result[0] || !result[0].facebook_accounts.accessToken) {
      return undefined;
    }
    
    return {
      ...result[0].messenger_conversations,
      pageAccessToken: result[0].facebook_accounts.accessToken,
      participantId: result[0].messenger_conversations.participantId
    };
  }

  async updateMessengerMessage(id: number, dealershipId: number, data: Partial<InsertMessengerMessage>): Promise<MessengerMessage | undefined> {
    const result = await db.update(messengerMessages)
      .set(data)
      .where(and(
        eq(messengerMessages.id, id),
        eq(messengerMessages.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  // Scheduled messages (Multi-Tenant)
  async getScheduledMessages(dealershipId: number, status?: string): Promise<ScheduledMessage[]> {
    if (status) {
      return await db.select()
        .from(scheduledMessages)
        .where(and(
          eq(scheduledMessages.dealershipId, dealershipId),
          eq(scheduledMessages.status, status)
        ))
        .orderBy(asc(scheduledMessages.scheduledAt));
    }
    return await db.select()
      .from(scheduledMessages)
      .where(eq(scheduledMessages.dealershipId, dealershipId))
      .orderBy(asc(scheduledMessages.scheduledAt));
  }

  async getScheduledMessagesByConversation(dealershipId: number, conversationId: number): Promise<ScheduledMessage[]> {
    return await db.select()
      .from(scheduledMessages)
      .where(and(
        eq(scheduledMessages.dealershipId, dealershipId),
        eq(scheduledMessages.conversationId, conversationId),
        eq(scheduledMessages.status, 'pending')
      ))
      .orderBy(asc(scheduledMessages.scheduledAt));
  }

  async getPendingScheduledMessages(dealershipId: number): Promise<ScheduledMessage[]> {
    return await db.select()
      .from(scheduledMessages)
      .where(and(
        eq(scheduledMessages.dealershipId, dealershipId),
        eq(scheduledMessages.status, 'pending')
      ))
      .orderBy(asc(scheduledMessages.scheduledAt));
  }

  async getDueScheduledMessages(): Promise<ScheduledMessage[]> {
    const now = new Date();
    return await db.select()
      .from(scheduledMessages)
      .where(and(
        eq(scheduledMessages.status, 'pending'),
        lte(scheduledMessages.scheduledAt, now)
      ))
      .orderBy(asc(scheduledMessages.scheduledAt));
  }

  async createScheduledMessage(message: InsertScheduledMessage): Promise<ScheduledMessage> {
    if (!message.dealershipId) {
      throw new Error('dealershipId is required when creating scheduled messages');
    }
    const result = await db.insert(scheduledMessages).values(message).returning();
    return result[0];
  }

  async updateScheduledMessage(id: number, dealershipId: number, data: Partial<InsertScheduledMessage>): Promise<ScheduledMessage | undefined> {
    const result = await db.update(scheduledMessages)
      .set(data)
      .where(and(
        eq(scheduledMessages.id, id),
        eq(scheduledMessages.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async cancelScheduledMessage(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.update(scheduledMessages)
      .set({ status: 'cancelled' })
      .where(and(
        eq(scheduledMessages.id, id),
        eq(scheduledMessages.dealershipId, dealershipId),
        eq(scheduledMessages.status, 'pending')
      ))
      .returning();
    return result.length > 0;
  }

  // Conversation assignments (Multi-Tenant)
  async getConversationAssignment(dealershipId: number, conversationId: number): Promise<ConversationAssignment | undefined> {
    const result = await db.select()
      .from(conversationAssignments)
      .where(and(
        eq(conversationAssignments.dealershipId, dealershipId),
        eq(conversationAssignments.conversationId, conversationId)
      ))
      .limit(1);
    return result[0];
  }

  async assignConversation(assignment: InsertConversationAssignment): Promise<ConversationAssignment> {
    if (!assignment.dealershipId) {
      throw new Error('dealershipId is required when creating conversation assignments');
    }
    const result = await db.insert(conversationAssignments).values(assignment).returning();
    return result[0];
  }

  async updateConversationAssignment(dealershipId: number, conversationId: number, assignedToUserId: number, assignedByUserId?: number): Promise<ConversationAssignment | undefined> {
    // Try to update existing assignment
    const existing = await this.getConversationAssignment(dealershipId, conversationId);
    
    if (existing) {
      const result = await db.update(conversationAssignments)
        .set({ 
          assignedToUserId, 
          assignedByUserId: assignedByUserId || null,
          assignedAt: new Date()
        })
        .where(and(
          eq(conversationAssignments.dealershipId, dealershipId),
          eq(conversationAssignments.conversationId, conversationId)
        ))
        .returning();
      return result[0];
    } else {
      // Create new assignment
      return await this.assignConversation({
        dealershipId,
        conversationId,
        assignedToUserId,
        assignedByUserId
      });
    }
  }

  // Chat prompts (Multi-Tenant)
  async getChatPrompts(dealershipId: number): Promise<ChatPrompt[]> {
    // REQUIRED: Filter by dealership to prevent cross-tenant access
    return await db.select().from(chatPrompts)
      .where(and(
        eq(chatPrompts.isActive, true),
        eq(chatPrompts.dealershipId, dealershipId)
      ));
  }

  async getChatPromptByScenario(scenario: string, dealershipId: number): Promise<ChatPrompt | undefined> {
    // REQUIRED: Filter by dealership to prevent cross-tenant access
    const result = await db.select().from(chatPrompts)
      .where(and(
        eq(chatPrompts.scenario, scenario),
        eq(chatPrompts.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async saveChatPrompt(prompt: InsertChatPrompt): Promise<ChatPrompt> {
    // Validate dealershipId is present before insert
    if (!prompt.dealershipId) {
      throw new Error('dealershipId is required when creating chat prompts');
    }
    const result = await db.insert(chatPrompts).values(prompt).returning();
    return result[0];
  }

  async getActivePromptForScenario(dealershipId: number, scenario: string): Promise<ChatPrompt | undefined> {
    // REQUIRED: Filter by dealership to prevent cross-tenant access
    const result = await db.select().from(chatPrompts)
      .where(and(
        eq(chatPrompts.dealershipId, dealershipId),
        eq(chatPrompts.scenario, scenario),
        eq(chatPrompts.isActive, true)
      ))
      .limit(1);
    return result[0];
  }

  async updateChatPrompt(scenario: string, dealershipId: number, prompt: Partial<InsertChatPrompt>): Promise<ChatPrompt | undefined> {
    // REQUIRED: Only update prompts for this dealership
    const result = await db.update(chatPrompts).set(prompt)
      .where(and(
        eq(chatPrompts.scenario, scenario),
        eq(chatPrompts.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async updateChatPromptById(id: number, dealershipId: number, prompt: Partial<InsertChatPrompt>): Promise<ChatPrompt | undefined> {
    // REQUIRED: Filter by dealership to prevent cross-tenant access
    const result = await db.update(chatPrompts).set({ ...prompt, updatedAt: new Date() })
      .where(and(
        eq(chatPrompts.id, id),
        eq(chatPrompts.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async getAllChatPrompts(dealershipId: number): Promise<ChatPrompt[]> {
    // REQUIRED: Filter by dealership - includes inactive prompts for admin
    return await db.select().from(chatPrompts)
      .where(eq(chatPrompts.dealershipId, dealershipId))
      .orderBy(chatPrompts.scenario);
  }

  async getChatPromptById(id: number, dealershipId: number): Promise<ChatPrompt | undefined> {
    // REQUIRED: Filter by dealership to prevent cross-tenant access
    const result = await db.select().from(chatPrompts)
      .where(and(
        eq(chatPrompts.id, id),
        eq(chatPrompts.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async deleteChatPrompt(id: number, dealershipId: number): Promise<boolean> {
    // REQUIRED: Filter by dealership to prevent cross-tenant deletion
    const result = await db.delete(chatPrompts)
      .where(and(
        eq(chatPrompts.id, id),
        eq(chatPrompts.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }

  // Admin
  async getAdminConfig(): Promise<AdminConfig | undefined> {
    const result = await db.select().from(adminConfig).limit(1);
    return result[0];
  }

  async setAdminPassword(passwordHash: string): Promise<AdminConfig> {
    // Delete any existing config
    await db.delete(adminConfig);
    // Insert new config
    const result = await db.insert(adminConfig).values({ passwordHash }).returning();
    return result[0];
  }

  // ====== USER MANAGEMENT (Multi-Tenant) ======
  async getUserByEmail(email: string, dealershipId?: number): Promise<User | undefined> {
    // dealershipId is optional for authentication - we need to find user first, then check dealership
    // If dealershipId is provided, filter by it; otherwise allow login and check access separately
    const conditions = dealershipId 
      ? and(eq(users.email, email), eq(users.dealershipId, dealershipId))
      : eq(users.email, email);
    
    const result = await db.select().from(users).where(conditions).limit(1);
    return result[0];
  }

  async getUserById(id: number, dealershipId?: number): Promise<User | undefined> {
    // Allow looking up user by ID with optional dealership filtering
    // Master users (dealershipId = null) can access any user
    const conditions = dealershipId
      ? and(eq(users.id, id), eq(users.dealershipId, dealershipId))
      : eq(users.id, id);
    
    const result = await db.select().from(users).where(conditions).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    // Ensure dealershipId is set for non-privileged users
    // super_admin and master users can have null dealershipId
    if (!user.dealershipId && user.role !== 'master' && user.role !== 'super_admin') {
      throw new Error('dealershipId is required when creating a non-privileged user');
    }
    const result = await db.insert(users).values(user).returning();
    return result[0];
  }

  async updateUser(id: number, user: Partial<InsertUser>, dealershipId?: number): Promise<User | undefined> {
    // If dealershipId is provided, only update users from that dealership
    const conditions = dealershipId
      ? and(eq(users.id, id), eq(users.dealershipId, dealershipId))
      : eq(users.id, id);
    
    const result = await db.update(users).set(user).where(conditions).returning();
    return result[0];
  }

  async getAllUsers(dealershipId: number): Promise<User[]> {
    // REQUIRED: only return users from specific dealership
    return await db.select().from(users)
      .where(eq(users.dealershipId, dealershipId))
      .orderBy(desc(users.createdAt));
  }

  async getUsersByRole(role: string, dealershipId: number): Promise<User[]> {
    return await db.select().from(users)
      .where(and(eq(users.role, role), eq(users.dealershipId, dealershipId)))
      .orderBy(desc(users.createdAt));
  }

  async getUsersByDealership(dealershipId: number): Promise<User[]> {
    return await db.select().from(users)
      .where(eq(users.dealershipId, dealershipId))
      .orderBy(desc(users.createdAt));
  }
  
  // ====== SUPER ADMIN USER MANAGEMENT ======
  async getAllUsersForSuperAdmin(filters?: { dealershipId?: number; role?: string; search?: string }): Promise<(User & { dealershipName?: string })[]> {
    // Build dynamic conditions
    const conditions = [];
    
    if (filters?.dealershipId) {
      conditions.push(eq(users.dealershipId, filters.dealershipId));
    }
    
    if (filters?.role) {
      conditions.push(eq(users.role, filters.role));
    }
    
    // Get all users with dealership info
    const allUsers = await db
      .select({
        user: users,
        dealershipName: dealerships.name
      })
      .from(users)
      .leftJoin(dealerships, eq(users.dealershipId, dealerships.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(users.dealershipId, users.role, desc(users.createdAt));
    
    // Filter by search if provided
    let result = allUsers.map(row => ({
      ...row.user,
      dealershipName: row.dealershipName || undefined
    }));
    
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(u => 
        u.email.toLowerCase().includes(searchLower) ||
        u.name.toLowerCase().includes(searchLower)
      );
    }
    
    return result;
  }
  
  async deleteUser(userId: number): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, userId)).returning();
    return result.length > 0;
  }
  
  async updateUserStatus(userId: number, isActive: boolean): Promise<User | undefined> {
    const result = await db.update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return result[0];
  }
  
  async updateUserPassword(userId: number, passwordHash: string): Promise<boolean> {
    const result = await db.update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return result.length > 0;
  }

  // ====== FINANCING RULES - CREDIT SCORE TIERS (Multi-Tenant) ======
  async getCreditScoreTiers(dealershipId: number): Promise<CreditScoreTier[]> {
    // REQUIRED: Only return credit score tiers for specific dealership
    return await db.select().from(creditScoreTiers)
      .where(and(
        eq(creditScoreTiers.dealershipId, dealershipId),
        eq(creditScoreTiers.isActive, true)
      ))
      .orderBy(creditScoreTiers.minScore);
  }

  async createCreditScoreTier(tier: InsertCreditScoreTier): Promise<CreditScoreTier> {
    // Validate dealershipId is present before insert
    if (!tier.dealershipId) {
      throw new Error('dealershipId is required when creating a credit score tier');
    }
    const result = await db.insert(creditScoreTiers).values(tier).returning();
    return result[0];
  }

  async updateCreditScoreTier(id: number, dealershipId: number, tier: Partial<InsertCreditScoreTier>): Promise<CreditScoreTier | undefined> {
    // REQUIRED: Only update tiers for this dealership
    const result = await db.update(creditScoreTiers)
      .set({ ...tier, updatedAt: new Date() })
      .where(and(
        eq(creditScoreTiers.id, id),
        eq(creditScoreTiers.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteCreditScoreTier(id: number, dealershipId: number): Promise<boolean> {
    // REQUIRED: Soft delete only for this dealership
    await db.update(creditScoreTiers)
      .set({ isActive: false })
      .where(and(
        eq(creditScoreTiers.id, id),
        eq(creditScoreTiers.dealershipId, dealershipId)
      ));
    return true;
  }

  async getInterestRateForCreditScore(dealershipId: number, score: number): Promise<number | null> {
    // REQUIRED: Only check tiers for specific dealership
    const result = await db
      .select()
      .from(creditScoreTiers)
      .where(
        and(
          eq(creditScoreTiers.dealershipId, dealershipId),
          eq(creditScoreTiers.isActive, true),
          lte(creditScoreTiers.minScore, score),
          gte(creditScoreTiers.maxScore, score)
        )
      )
      .limit(1);
    
    return result[0]?.interestRate ?? null;
  }

  // ====== FINANCING RULES - MODEL YEAR TERMS (Multi-Tenant) ======
  async getModelYearTerms(dealershipId: number): Promise<ModelYearTerm[]> {
    // REQUIRED: Only return model year terms for specific dealership
    return await db.select().from(modelYearTerms)
      .where(and(
        eq(modelYearTerms.dealershipId, dealershipId),
        eq(modelYearTerms.isActive, true)
      ))
      .orderBy(modelYearTerms.minModelYear);
  }

  async createModelYearTerm(term: InsertModelYearTerm): Promise<ModelYearTerm> {
    // Validate dealershipId is present before insert
    if (!term.dealershipId) {
      throw new Error('dealershipId is required when creating a model year term');
    }
    const result = await db.insert(modelYearTerms).values(term).returning();
    return result[0];
  }

  async updateModelYearTerm(id: number, dealershipId: number, term: Partial<InsertModelYearTerm>): Promise<ModelYearTerm | undefined> {
    // REQUIRED: Only update terms for this dealership
    const result = await db.update(modelYearTerms)
      .set({ ...term, updatedAt: new Date() })
      .where(and(
        eq(modelYearTerms.id, id),
        eq(modelYearTerms.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteModelYearTerm(id: number, dealershipId: number): Promise<boolean> {
    // REQUIRED: Soft delete only for this dealership
    await db.update(modelYearTerms)
      .set({ isActive: false })
      .where(and(
        eq(modelYearTerms.id, id),
        eq(modelYearTerms.dealershipId, dealershipId)
      ));
    return true;
  }

  async getAvailableTermsForYear(dealershipId: number, modelYear: number): Promise<string[]> {
    // REQUIRED: Only check terms for specific dealership
    const result = await db
      .select()
      .from(modelYearTerms)
      .where(
        and(
          eq(modelYearTerms.dealershipId, dealershipId),
          eq(modelYearTerms.isActive, true),
          lte(modelYearTerms.minModelYear, modelYear),
          gte(modelYearTerms.maxModelYear, modelYear)
        )
      )
      .limit(1);
    
    return result[0]?.availableTerms ?? ["36", "48", "60"]; // Default terms if no rule found
  }

  // ====== DEALERSHIP FEES (Multi-Tenant) ======
  async getDealershipFees(dealershipId: number): Promise<DealershipFee[]> {
    return await db.select().from(dealershipFees)
      .where(eq(dealershipFees.dealershipId, dealershipId))
      .orderBy(dealershipFees.displayOrder);
  }

  async createDealershipFee(fee: InsertDealershipFee): Promise<DealershipFee> {
    if (!fee.dealershipId) {
      throw new Error('dealershipId is required when creating a dealership fee');
    }
    const result = await db.insert(dealershipFees).values(fee).returning();
    return result[0];
  }

  async updateDealershipFee(id: number, dealershipId: number, fee: Partial<InsertDealershipFee>): Promise<DealershipFee | undefined> {
    const result = await db.update(dealershipFees)
      .set({ ...fee, updatedAt: new Date() })
      .where(and(
        eq(dealershipFees.id, id),
        eq(dealershipFees.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteDealershipFee(id: number, dealershipId: number): Promise<boolean> {
    await db.delete(dealershipFees)
      .where(and(
        eq(dealershipFees.id, id),
        eq(dealershipFees.dealershipId, dealershipId)
      ));
    return true;
  }

  async getActiveDealershipFees(dealershipId: number): Promise<DealershipFee[]> {
    return await db.select().from(dealershipFees)
      .where(and(
        eq(dealershipFees.dealershipId, dealershipId),
        eq(dealershipFees.isActive, true),
        eq(dealershipFees.includeInPayment, true)
      ))
      .orderBy(dealershipFees.displayOrder);
  }

  // ====== FILTER GROUPS (Multi-Tenant) ======
  async getFilterGroups(dealershipId: number): Promise<FilterGroup[]> {
    return await db.select().from(filterGroups)
      .where(eq(filterGroups.dealershipId, dealershipId))
      .orderBy(filterGroups.displayOrder);
  }

  async getFilterGroupById(id: number, dealershipId: number): Promise<FilterGroup | undefined> {
    const result = await db.select().from(filterGroups)
      .where(and(
        eq(filterGroups.id, id),
        eq(filterGroups.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async createFilterGroup(group: InsertFilterGroup): Promise<FilterGroup> {
    if (!group.dealershipId) {
      throw new Error('dealershipId is required when creating a filter group');
    }
    const result = await db.insert(filterGroups).values(group).returning();
    return result[0];
  }

  async updateFilterGroup(id: number, dealershipId: number, group: Partial<InsertFilterGroup>): Promise<FilterGroup | undefined> {
    const result = await db.update(filterGroups)
      .set({ ...group, updatedAt: new Date() })
      .where(and(
        eq(filterGroups.id, id),
        eq(filterGroups.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteFilterGroup(id: number, dealershipId: number): Promise<boolean> {
    await db.delete(filterGroups)
      .where(and(
        eq(filterGroups.id, id),
        eq(filterGroups.dealershipId, dealershipId)
      ));
    return true;
  }

  async getActiveFilterGroups(dealershipId: number): Promise<FilterGroup[]> {
    return await db.select().from(filterGroups)
      .where(and(
        eq(filterGroups.dealershipId, dealershipId),
        eq(filterGroups.isActive, true)
      ))
      .orderBy(filterGroups.displayOrder);
  }

  async getAllFilterGroups(): Promise<FilterGroup[]> {
    return await db.select().from(filterGroups)
      .orderBy(filterGroups.displayOrder);
  }

  async getFilterGroupBySlug(dealershipId: number, slug: string): Promise<FilterGroup | undefined> {
    const result = await db.select().from(filterGroups)
      .where(and(
        eq(filterGroups.dealershipId, dealershipId),
        eq(filterGroups.groupSlug, slug)
      ))
      .limit(1);
    return result[0];
  }

  // ====== SCRAPE SOURCES (Multi-Tenant) ======
  async getScrapeSources(dealershipId: number): Promise<ScrapeSource[]> {
    return await db.select().from(scrapeSources)
      .where(eq(scrapeSources.dealershipId, dealershipId))
      .orderBy(scrapeSources.sourceName);
  }

  async createScrapeSource(source: InsertScrapeSource): Promise<ScrapeSource> {
    if (!source.dealershipId) {
      throw new Error('dealershipId is required when creating a scrape source');
    }
    const result = await db.insert(scrapeSources).values(source).returning();
    return result[0];
  }

  async updateScrapeSource(id: number, dealershipId: number, source: Partial<InsertScrapeSource>): Promise<ScrapeSource | undefined> {
    const result = await db.update(scrapeSources)
      .set({ ...source, updatedAt: new Date() })
      .where(and(
        eq(scrapeSources.id, id),
        eq(scrapeSources.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteScrapeSource(id: number, dealershipId: number): Promise<boolean> {
    await db.delete(scrapeSources)
      .where(and(
        eq(scrapeSources.id, id),
        eq(scrapeSources.dealershipId, dealershipId)
      ));
    return true;
  }

  async getActiveScrapeSources(dealershipId: number): Promise<ScrapeSource[]> {
    return await db.select().from(scrapeSources)
      .where(and(
        eq(scrapeSources.dealershipId, dealershipId),
        eq(scrapeSources.isActive, true)
      ))
      .orderBy(scrapeSources.sourceName);
  }

  async getAllActiveScrapeSources(): Promise<ScrapeSource[]> {
    return await db.select().from(scrapeSources)
      .where(eq(scrapeSources.isActive, true))
      .orderBy(scrapeSources.sourceName);
  }

  async getAllScrapeSources(): Promise<ScrapeSource[]> {
    return await db.select().from(scrapeSources)
      .orderBy(scrapeSources.sourceName);
  }

  async updateScrapeSourceAdmin(id: number, source: Partial<InsertScrapeSource>): Promise<ScrapeSource | undefined> {
    const result = await db.update(scrapeSources)
      .set({ ...source, updatedAt: new Date() })
      .where(eq(scrapeSources.id, id))
      .returning();
    return result[0];
  }

  async deleteScrapeSourceAdmin(id: number): Promise<boolean> {
    await db.delete(scrapeSources)
      .where(eq(scrapeSources.id, id));
    return true;
  }

  async updateScrapeSourceStats(id: number, vehicleCount: number): Promise<void> {
    await db.update(scrapeSources)
      .set({ 
        vehicleCount, 
        lastScrapedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(scrapeSources.id, id));
  }

  // ====== FACEBOOK ACCOUNTS (Multi-Tenant - Defense-in-Depth) ======
  async getFacebookAccountsByUser(userId: number, dealershipId: number): Promise<FacebookAccount[]> {
    // Defense-in-depth: Filter by both userId AND dealershipId
    return await db.select().from(facebookAccounts).where(and(
      eq(facebookAccounts.userId, userId),
      eq(facebookAccounts.dealershipId, dealershipId)
    ));
  }

  async getFacebookAccountById(id: number, userId: number, dealershipId: number): Promise<FacebookAccount | undefined> {
    // Defense-in-depth: Validate both userId AND dealershipId
    const result = await db.select().from(facebookAccounts).where(
      and(
        eq(facebookAccounts.id, id), 
        eq(facebookAccounts.userId, userId),
        eq(facebookAccounts.dealershipId, dealershipId)
      )
    ).limit(1);
    return result[0];
  }

  async createFacebookAccount(account: InsertFacebookAccount): Promise<FacebookAccount> {
    // Validate both userId and dealershipId are present
    if (!account.dealershipId) {
      throw new Error('dealershipId is required when creating a Facebook account');
    }
    const result = await db.insert(facebookAccounts).values(account).returning();
    return result[0];
  }

  async updateFacebookAccount(id: number, userId: number, dealershipId: number, account: Partial<InsertFacebookAccount>): Promise<FacebookAccount | undefined> {
    // Defense-in-depth: Validate both userId AND dealershipId
    const result = await db.update(facebookAccounts)
      .set({ ...account, updatedAt: new Date() })
      .where(and(
        eq(facebookAccounts.id, id), 
        eq(facebookAccounts.userId, userId),
        eq(facebookAccounts.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteFacebookAccount(id: number, userId: number, dealershipId: number): Promise<boolean> {
    // Defense-in-depth: Validate both userId AND dealershipId
    const result = await db.delete(facebookAccounts).where(and(
      eq(facebookAccounts.id, id), 
      eq(facebookAccounts.userId, userId),
      eq(facebookAccounts.dealershipId, dealershipId)
    )).returning();
    return result.length > 0;
  }

  async getAllFacebookAccountsByDealership(dealershipId: number): Promise<FacebookAccount[]> {
    // Get all Facebook accounts for a dealership (both user-scoped and dealership-level)
    return await db.select().from(facebookAccounts).where(
      eq(facebookAccounts.dealershipId, dealershipId)
    );
  }

  async updateFacebookAccountDirect(id: number, account: Partial<InsertFacebookAccount>): Promise<FacebookAccount | undefined> {
    // Direct update by ID only - used for system operations like token refresh
    const result = await db.update(facebookAccounts)
      .set({ ...account, updatedAt: new Date() })
      .where(eq(facebookAccounts.id, id))
      .returning();
    return result[0];
  }

  async getFacebookAccountByIdDirect(id: number, dealershipId: number): Promise<FacebookAccount | undefined> {
    // Get Facebook account by ID with dealership validation only
    // Used for system operations like messaging where userId isn't available
    const result = await db.select().from(facebookAccounts).where(
      and(
        eq(facebookAccounts.id, id),
        eq(facebookAccounts.dealershipId, dealershipId)
      )
    ).limit(1);
    return result[0];
  }

  // ====== AD TEMPLATES (Multi-Tenant - Defense-in-Depth) ======
  async getAdTemplatesByUser(userId: number, dealershipId: number): Promise<AdTemplate[]> {
    // Defense-in-depth: Filter by both userId AND dealershipId
    return await db.select().from(adTemplates).where(and(
      eq(adTemplates.userId, userId),
      eq(adTemplates.dealershipId, dealershipId)
    ));
  }

  async getAdTemplatesByDealership(dealershipId: number): Promise<AdTemplate[]> {
    // Get all templates for a dealership (for salespeople to use manager-created templates)
    return await db.select().from(adTemplates).where(
      eq(adTemplates.dealershipId, dealershipId)
    );
  }

  async getAdTemplateById(id: number, userId: number, dealershipId: number): Promise<AdTemplate | undefined> {
    // Defense-in-depth: Validate both userId AND dealershipId
    const result = await db.select().from(adTemplates).where(
      and(
        eq(adTemplates.id, id), 
        eq(adTemplates.userId, userId),
        eq(adTemplates.dealershipId, dealershipId)
      )
    ).limit(1);
    return result[0];
  }

  async createAdTemplate(template: InsertAdTemplate): Promise<AdTemplate> {
    // Validate both userId and dealershipId are present
    if (!template.dealershipId) {
      throw new Error('dealershipId is required when creating an ad template');
    }
    const result = await db.insert(adTemplates).values(template).returning();
    return result[0];
  }

  async updateAdTemplate(id: number, userId: number, dealershipId: number, template: Partial<InsertAdTemplate>): Promise<AdTemplate | undefined> {
    // Defense-in-depth: Validate both userId AND dealershipId
    const result = await db.update(adTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(and(
        eq(adTemplates.id, id), 
        eq(adTemplates.userId, userId),
        eq(adTemplates.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteAdTemplate(id: number, userId: number, dealershipId: number): Promise<boolean> {
    // Defense-in-depth: Validate both userId AND dealershipId
    const result = await db.delete(adTemplates).where(and(
      eq(adTemplates.id, id), 
      eq(adTemplates.userId, userId),
      eq(adTemplates.dealershipId, dealershipId)
    )).returning();
    return result.length > 0;
  }

  async getSharedAdTemplates(dealershipId: number): Promise<AdTemplate[]> {
    // Get all shared templates for a dealership (manager-created, visible to all)
    return await db.select().from(adTemplates).where(and(
      eq(adTemplates.dealershipId, dealershipId),
      eq(adTemplates.isShared, true)
    ));
  }

  async getUserPersonalAdTemplates(userId: number, dealershipId: number): Promise<AdTemplate[]> {
    // Get personal templates for a user (not shared)
    return await db.select().from(adTemplates).where(and(
      eq(adTemplates.dealershipId, dealershipId),
      eq(adTemplates.userId, userId),
      eq(adTemplates.isShared, false)
    ));
  }

  async getAdTemplatesForUser(userId: number, dealershipId: number): Promise<AdTemplate[]> {
    // Get combined list: shared templates + user's personal templates
    const shared = await this.getSharedAdTemplates(dealershipId);
    const personal = await this.getUserPersonalAdTemplates(userId, dealershipId);
    return [...shared, ...personal];
  }

  async getSharedAdTemplateById(id: number, dealershipId: number): Promise<AdTemplate | undefined> {
    // Get a shared template by ID (no userId check - visible to all)
    const result = await db.select().from(adTemplates).where(and(
      eq(adTemplates.id, id),
      eq(adTemplates.dealershipId, dealershipId),
      eq(adTemplates.isShared, true)
    )).limit(1);
    return result[0];
  }

  async updateSharedAdTemplate(id: number, dealershipId: number, template: Partial<InsertAdTemplate>): Promise<AdTemplate | undefined> {
    // Update a shared template (manager-only operation, no userId check)
    const result = await db.update(adTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(and(
        eq(adTemplates.id, id),
        eq(adTemplates.dealershipId, dealershipId),
        eq(adTemplates.isShared, true)
      ))
      .returning();
    return result[0];
  }

  async deleteSharedAdTemplate(id: number, dealershipId: number): Promise<boolean> {
    // Delete a shared template (manager-only operation)
    const result = await db.delete(adTemplates).where(and(
      eq(adTemplates.id, id),
      eq(adTemplates.dealershipId, dealershipId),
      eq(adTemplates.isShared, true)
    )).returning();
    return result.length > 0;
  }

  async forkAdTemplate(templateId: number, userId: number, dealershipId: number): Promise<AdTemplate> {
    // Create a personal copy of a shared template
    const original = await db.select().from(adTemplates).where(and(
      eq(adTemplates.id, templateId),
      eq(adTemplates.dealershipId, dealershipId),
      eq(adTemplates.isShared, true)
    )).limit(1);
    
    if (!original[0]) {
      throw new Error('Shared template not found');
    }

    // Create the fork
    const result = await db.insert(adTemplates).values({
      dealershipId,
      userId,
      templateName: `${original[0].templateName} (My Copy)`,
      titleTemplate: original[0].titleTemplate,
      descriptionTemplate: original[0].descriptionTemplate,
      isDefault: false,
      isShared: false,
      parentTemplateId: templateId
    }).returning();
    return result[0];
  }

  // ====== POSTING QUEUE (Multi-Tenant - Defense-in-Depth) ======
  async getPostingQueueByUser(userId: number, dealershipId: number): Promise<PostingQueue[]> {
    // Defense-in-depth: Filter by both userId AND dealershipId
    return await db.select().from(postingQueue)
      .where(and(
        eq(postingQueue.userId, userId),
        eq(postingQueue.dealershipId, dealershipId)
      ))
      .orderBy(postingQueue.queueOrder);
  }

  async getPostingQueueItem(id: number, dealershipId: number): Promise<PostingQueue | undefined> {
    // Filter by dealershipId for security
    const result = await db.select().from(postingQueue)
      .where(and(
        eq(postingQueue.id, id),
        eq(postingQueue.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async createPostingQueueItem(item: InsertPostingQueue): Promise<PostingQueue> {
    // Validate both userId and dealershipId are present
    if (!item.dealershipId) {
      throw new Error('dealershipId is required when creating a posting queue item');
    }
    const result = await db.insert(postingQueue).values(item).returning();
    return result[0];
  }

  async updatePostingQueueItem(id: number, userId: number, dealershipId: number, item: Partial<InsertPostingQueue>): Promise<PostingQueue | undefined> {
    // Defense-in-depth: Validate both userId AND dealershipId
    const result = await db.update(postingQueue)
      .set({ ...item, updatedAt: new Date() })
      .where(and(
        eq(postingQueue.id, id), 
        eq(postingQueue.userId, userId),
        eq(postingQueue.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deletePostingQueueItem(id: number, userId: number, dealershipId: number): Promise<boolean> {
    // Defense-in-depth: Validate both userId AND dealershipId
    const result = await db.delete(postingQueue).where(and(
      eq(postingQueue.id, id), 
      eq(postingQueue.userId, userId),
      eq(postingQueue.dealershipId, dealershipId)
    )).returning();
    return result.length > 0;
  }

  async getNextQueuedPost(userId: number, dealershipId: number): Promise<PostingQueue | undefined> {
    // Defense-in-depth: Filter by both userId AND dealershipId
    const result = await db
      .select()
      .from(postingQueue)
      .where(
        and(
          eq(postingQueue.userId, userId),
          eq(postingQueue.dealershipId, dealershipId),
          eq(postingQueue.status, 'queued')
        )
      )
      .orderBy(postingQueue.queueOrder)
      .limit(1);
    
    return result[0];
  }

  // ====== POSTING SCHEDULE (Multi-Tenant - Defense-in-Depth) ======
  async getPostingScheduleByUser(userId: number, dealershipId: number): Promise<PostingSchedule | undefined> {
    // Defense-in-depth: Validate both userId AND dealershipId
    const result = await db.select().from(postingSchedule)
      .where(and(
        eq(postingSchedule.userId, userId),
        eq(postingSchedule.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async getAllPostingSchedules(dealershipId: number): Promise<PostingSchedule[]> {
    // REQUIRED: Only return schedules for specific dealership
    return await db.select().from(postingSchedule)
      .where(eq(postingSchedule.dealershipId, dealershipId));
  }

  async createPostingSchedule(schedule: InsertPostingSchedule): Promise<PostingSchedule> {
    // Validate both userId and dealershipId are present
    if (!schedule.dealershipId) {
      throw new Error('dealershipId is required when creating a posting schedule');
    }
    const result = await db.insert(postingSchedule).values(schedule).returning();
    return result[0];
  }

  async updatePostingSchedule(userId: number, dealershipId: number, schedule: Partial<InsertPostingSchedule>): Promise<PostingSchedule | undefined> {
    // Defense-in-depth: Validate both userId AND dealershipId
    const result = await db.update(postingSchedule)
      .set({ ...schedule, updatedAt: new Date() })
      .where(and(
        eq(postingSchedule.userId, userId),
        eq(postingSchedule.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  // ====== REMARKETING VEHICLES (Multi-Tenant) ======
  async getRemarketingVehicles(dealershipId: number): Promise<RemarketingVehicle[]> {
    // REQUIRED: Only return remarketing vehicles from specific dealership
    return await db
      .select()
      .from(remarketingVehicles)
      .where(and(
        eq(remarketingVehicles.dealershipId, dealershipId),
        eq(remarketingVehicles.isActive, true)
      ))
      .orderBy(desc(remarketingVehicles.budgetPriority));
  }

  async addRemarketingVehicle(vehicle: InsertRemarketingVehicle): Promise<RemarketingVehicle> {
    // Validate dealershipId is present before insert
    if (!vehicle.dealershipId) {
      throw new Error('dealershipId is required when adding a remarketing vehicle');
    }
    const result = await db.insert(remarketingVehicles).values(vehicle).returning();
    return result[0];
  }

  async updateRemarketingVehicle(id: number, dealershipId: number, vehicle: Partial<InsertRemarketingVehicle>): Promise<RemarketingVehicle | undefined> {
    // REQUIRED: Only update remarketing vehicles from this dealership
    const result = await db
      .update(remarketingVehicles)
      .set(vehicle)
      .where(and(
        eq(remarketingVehicles.id, id),
        eq(remarketingVehicles.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async removeRemarketingVehicle(id: number, dealershipId: number): Promise<boolean> {
    // REQUIRED: Soft delete only for this dealership
    const result = await db
      .update(remarketingVehicles)
      .set({ isActive: false })
      .where(and(
        eq(remarketingVehicles.id, id),
        eq(remarketingVehicles.dealershipId, dealershipId),
        eq(remarketingVehicles.isActive, true)
      ))
      .returning();
    return result.length > 0;
  }

  async getRemarketingVehicleCount(dealershipId: number): Promise<number> {
    // REQUIRED: Count only for specific dealership
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(remarketingVehicles)
      .where(and(
        eq(remarketingVehicles.dealershipId, dealershipId),
        eq(remarketingVehicles.isActive, true)
      ));
    return Number(result[0]?.count || 0);
  }

  // ====== PBS DMS INTEGRATION (Multi-Tenant) ======
  async getPbsConfig(dealershipId: number): Promise<PbsConfig | undefined> {
    // REQUIRED: Only return PBS config for specific dealership
    const result = await db
      .select()
      .from(pbsConfig)
      .where(and(
        eq(pbsConfig.dealershipId, dealershipId),
        eq(pbsConfig.isActive, true)
      ))
      .limit(1);
    return result[0];
  }

  async createPbsConfig(config: InsertPbsConfig): Promise<PbsConfig> {
    // Validate dealershipId is present before insert
    if (!config.dealershipId) {
      throw new Error('dealershipId is required when creating PBS config');
    }
    const result = await db.insert(pbsConfig).values(config).returning();
    return result[0];
  }

  async updatePbsConfig(id: number, dealershipId: number, config: Partial<InsertPbsConfig>): Promise<PbsConfig | undefined> {
    // REQUIRED: Only update PBS config for this dealership
    const result = await db
      .update(pbsConfig)
      .set({ ...config, updatedAt: new Date() })
      .where(and(
        eq(pbsConfig.id, id),
        eq(pbsConfig.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deletePbsConfig(id: number, dealershipId: number): Promise<boolean> {
    // REQUIRED: Only delete PBS config for this dealership
    await db.delete(pbsConfig).where(and(
      eq(pbsConfig.id, id),
      eq(pbsConfig.dealershipId, dealershipId)
    ));
    return true;
  }

  // ====== PBS WEBHOOK EVENTS (Multi-Tenant) ======
  async getPbsWebhookEvents(dealershipId: number, limit: number = 100): Promise<PbsWebhookEvent[]> {
    // REQUIRED: Only return webhook events for specific dealership
    return await db
      .select()
      .from(pbsWebhookEvents)
      .where(eq(pbsWebhookEvents.dealershipId, dealershipId))
      .orderBy(desc(pbsWebhookEvents.receivedAt))
      .limit(limit);
  }

  async getPbsWebhookEventById(id: number, dealershipId: number): Promise<PbsWebhookEvent | undefined> {
    // REQUIRED: Filter by dealership
    const result = await db
      .select()
      .from(pbsWebhookEvents)
      .where(and(
        eq(pbsWebhookEvents.id, id),
        eq(pbsWebhookEvents.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async createPbsWebhookEvent(event: InsertPbsWebhookEvent): Promise<PbsWebhookEvent> {
    // Validate dealershipId is present before insert
    if (!event.dealershipId) {
      throw new Error('dealershipId is required when creating PBS webhook event');
    }
    const result = await db.insert(pbsWebhookEvents).values(event).returning();
    return result[0];
  }

  async updatePbsWebhookEvent(id: number, dealershipId: number, event: Partial<InsertPbsWebhookEvent>): Promise<PbsWebhookEvent | undefined> {
    // REQUIRED: Only update events for this dealership
    const result = await db
      .update(pbsWebhookEvents)
      .set(event)
      .where(and(
        eq(pbsWebhookEvents.id, id),
        eq(pbsWebhookEvents.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  // ====== PBS SESSIONS (Multi-Tenant) ======
  async getPbsSession(dealershipId: number): Promise<PbsSession | undefined> {
    // Get active, non-expired session for this dealership
    const result = await db
      .select()
      .from(pbsSessions)
      .where(and(
        eq(pbsSessions.dealershipId, dealershipId),
        eq(pbsSessions.isActive, true),
        gt(pbsSessions.expiresAt, new Date())
      ))
      .orderBy(desc(pbsSessions.lastUsedAt))
      .limit(1);
    return result[0];
  }

  async createPbsSession(session: InsertPbsSession): Promise<PbsSession> {
    if (!session.dealershipId) {
      throw new Error('dealershipId is required when creating PBS session');
    }
    const result = await db.insert(pbsSessions).values(session).returning();
    return result[0];
  }

  async updatePbsSessionLastUsed(id: number, dealershipId: number): Promise<void> {
    await db
      .update(pbsSessions)
      .set({ lastUsedAt: new Date() })
      .where(and(
        eq(pbsSessions.id, id),
        eq(pbsSessions.dealershipId, dealershipId)
      ));
  }

  async deletePbsSession(id: number, dealershipId: number): Promise<boolean> {
    const result = await db
      .delete(pbsSessions)
      .where(and(
        eq(pbsSessions.id, id),
        eq(pbsSessions.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }

  async deleteExpiredPbsSessions(dealershipId: number): Promise<number> {
    const result = await db
      .delete(pbsSessions)
      .where(and(
        eq(pbsSessions.dealershipId, dealershipId),
        lt(pbsSessions.expiresAt, new Date())
      ))
      .returning();
    return result.length;
  }

  // ====== PBS CONTACT CACHE (Multi-Tenant) ======
  async getPbsContactByPbsId(dealershipId: number, pbsContactId: string): Promise<PbsContactCache | undefined> {
    const result = await db
      .select()
      .from(pbsContactCache)
      .where(and(
        eq(pbsContactCache.dealershipId, dealershipId),
        eq(pbsContactCache.pbsContactId, pbsContactId),
        gt(pbsContactCache.expiresAt, new Date())
      ))
      .limit(1);
    return result[0];
  }

  async getPbsContactByPhone(dealershipId: number, phone: string): Promise<PbsContactCache | undefined> {
    // Normalize phone number for lookup
    const normalizedPhone = phone.replace(/\D/g, '');
    const result = await db
      .select()
      .from(pbsContactCache)
      .where(and(
        eq(pbsContactCache.dealershipId, dealershipId),
        gt(pbsContactCache.expiresAt, new Date())
      ))
      .limit(100);
    
    // Check if any cached contact's phone matches (normalized)
    return result.find(c => 
      (c.phone?.replace(/\D/g, '') === normalizedPhone) ||
      (c.cellPhone?.replace(/\D/g, '') === normalizedPhone)
    );
  }

  async getPbsContactByEmail(dealershipId: number, email: string): Promise<PbsContactCache | undefined> {
    const result = await db
      .select()
      .from(pbsContactCache)
      .where(and(
        eq(pbsContactCache.dealershipId, dealershipId),
        eq(pbsContactCache.email, email.toLowerCase()),
        gt(pbsContactCache.expiresAt, new Date())
      ))
      .limit(1);
    return result[0];
  }

  async createPbsContactCache(contact: InsertPbsContactCache): Promise<PbsContactCache> {
    if (!contact.dealershipId) {
      throw new Error('dealershipId is required when caching PBS contact');
    }
    const result = await db.insert(pbsContactCache).values({
      ...contact,
      email: contact.email?.toLowerCase()
    }).returning();
    return result[0];
  }

  async updatePbsContactCache(id: number, dealershipId: number, contact: Partial<InsertPbsContactCache>): Promise<PbsContactCache | undefined> {
    const result = await db
      .update(pbsContactCache)
      .set({
        ...contact,
        email: contact.email?.toLowerCase(),
        fetchedAt: new Date()
      })
      .where(and(
        eq(pbsContactCache.id, id),
        eq(pbsContactCache.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteExpiredPbsContactCache(dealershipId: number): Promise<number> {
    const result = await db
      .delete(pbsContactCache)
      .where(and(
        eq(pbsContactCache.dealershipId, dealershipId),
        lt(pbsContactCache.expiresAt, new Date())
      ))
      .returning();
    return result.length;
  }

  // ====== PBS APPOINTMENT CACHE (Multi-Tenant) ======
  async getPbsAppointmentByPbsId(dealershipId: number, pbsAppointmentId: string): Promise<PbsAppointmentCache | undefined> {
    const result = await db
      .select()
      .from(pbsAppointmentCache)
      .where(and(
        eq(pbsAppointmentCache.dealershipId, dealershipId),
        eq(pbsAppointmentCache.pbsAppointmentId, pbsAppointmentId),
        gt(pbsAppointmentCache.expiresAt, new Date())
      ))
      .limit(1);
    return result[0];
  }

  async getPbsAppointmentsByContact(dealershipId: number, pbsContactId: string): Promise<PbsAppointmentCache[]> {
    return await db
      .select()
      .from(pbsAppointmentCache)
      .where(and(
        eq(pbsAppointmentCache.dealershipId, dealershipId),
        eq(pbsAppointmentCache.pbsContactId, pbsContactId),
        gt(pbsAppointmentCache.expiresAt, new Date())
      ))
      .orderBy(desc(pbsAppointmentCache.scheduledDate));
  }

  async getUpcomingPbsAppointments(dealershipId: number, hoursAhead: number = 48): Promise<PbsAppointmentCache[]> {
    const now = new Date();
    const futureLimit = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
    
    return await db
      .select()
      .from(pbsAppointmentCache)
      .where(and(
        eq(pbsAppointmentCache.dealershipId, dealershipId),
        gte(pbsAppointmentCache.scheduledDate, now),
        lte(pbsAppointmentCache.scheduledDate, futureLimit),
        gt(pbsAppointmentCache.expiresAt, now)
      ))
      .orderBy(pbsAppointmentCache.scheduledDate);
  }

  async createPbsAppointmentCache(appointment: InsertPbsAppointmentCache): Promise<PbsAppointmentCache> {
    if (!appointment.dealershipId) {
      throw new Error('dealershipId is required when caching PBS appointment');
    }
    const result = await db.insert(pbsAppointmentCache).values(appointment).returning();
    return result[0];
  }

  async updatePbsAppointmentCache(id: number, dealershipId: number, appointment: Partial<InsertPbsAppointmentCache>): Promise<PbsAppointmentCache | undefined> {
    const result = await db
      .update(pbsAppointmentCache)
      .set({
        ...appointment,
        fetchedAt: new Date()
      })
      .where(and(
        eq(pbsAppointmentCache.id, id),
        eq(pbsAppointmentCache.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteExpiredPbsAppointmentCache(dealershipId: number): Promise<number> {
    const result = await db
      .delete(pbsAppointmentCache)
      .where(and(
        eq(pbsAppointmentCache.dealershipId, dealershipId),
        lt(pbsAppointmentCache.expiresAt, new Date())
      ))
      .returning();
    return result.length;
  }

  // ====== PBS PARTS CACHE (Multi-Tenant) ======
  async getPbsPartByNumber(dealershipId: number, partNumber: string): Promise<PbsPartsCache | undefined> {
    const result = await db
      .select()
      .from(pbsPartsCache)
      .where(and(
        eq(pbsPartsCache.dealershipId, dealershipId),
        eq(pbsPartsCache.partNumber, partNumber.toUpperCase()),
        gt(pbsPartsCache.expiresAt, new Date())
      ))
      .limit(1);
    return result[0];
  }

  async searchPbsParts(dealershipId: number, query: string): Promise<PbsPartsCache[]> {
    const searchPattern = `%${query.toUpperCase()}%`;
    return await db
      .select()
      .from(pbsPartsCache)
      .where(and(
        eq(pbsPartsCache.dealershipId, dealershipId),
        gt(pbsPartsCache.expiresAt, new Date()),
        or(
          ilike(pbsPartsCache.partNumber, searchPattern),
          ilike(pbsPartsCache.description, searchPattern)
        )
      ))
      .limit(50);
  }

  async createPbsPartsCache(part: InsertPbsPartsCache): Promise<PbsPartsCache> {
    if (!part.dealershipId) {
      throw new Error('dealershipId is required when caching PBS part');
    }
    const result = await db.insert(pbsPartsCache).values({
      ...part,
      partNumber: part.partNumber.toUpperCase()
    }).returning();
    return result[0];
  }

  async updatePbsPartsCache(id: number, dealershipId: number, part: Partial<InsertPbsPartsCache>): Promise<PbsPartsCache | undefined> {
    const result = await db
      .update(pbsPartsCache)
      .set({
        ...part,
        partNumber: part.partNumber?.toUpperCase(),
        fetchedAt: new Date()
      })
      .where(and(
        eq(pbsPartsCache.id, id),
        eq(pbsPartsCache.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteExpiredPbsPartsCache(dealershipId: number): Promise<number> {
    const result = await db
      .delete(pbsPartsCache)
      .where(and(
        eq(pbsPartsCache.dealershipId, dealershipId),
        lt(pbsPartsCache.expiresAt, new Date())
      ))
      .returning();
    return result.length;
  }

  // ====== PBS API LOGS (Multi-Tenant) ======
  async createPbsApiLog(log: InsertPbsApiLog): Promise<PbsApiLog> {
    if (!log.dealershipId) {
      throw new Error('dealershipId is required when creating PBS API log');
    }
    const result = await db.insert(pbsApiLogs).values(log).returning();
    return result[0];
  }

  async getPbsApiLogs(dealershipId: number, limit: number = 100): Promise<PbsApiLog[]> {
    return await db
      .select()
      .from(pbsApiLogs)
      .where(eq(pbsApiLogs.dealershipId, dealershipId))
      .orderBy(desc(pbsApiLogs.createdAt))
      .limit(limit);
  }

  // ====== GOHIGHLEVEL ACCOUNTS (Multi-Tenant) ======
  async getGhlAccountByDealership(dealershipId: number): Promise<GhlAccount | undefined> {
    const result = await db
      .select()
      .from(ghlAccounts)
      .where(and(
        eq(ghlAccounts.dealershipId, dealershipId),
        eq(ghlAccounts.isActive, true)
      ))
      .orderBy(desc(ghlAccounts.createdAt))
      .limit(1);
    return result[0];
  }

  async getGhlAccountById(id: number, dealershipId: number): Promise<GhlAccount | undefined> {
    const result = await db
      .select()
      .from(ghlAccounts)
      .where(and(
        eq(ghlAccounts.id, id),
        eq(ghlAccounts.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async createGhlAccount(account: InsertGhlAccount): Promise<GhlAccount> {
    if (!account.dealershipId) {
      throw new Error('dealershipId is required when creating GHL account');
    }
    // Deactivate any existing accounts for this dealership
    await db
      .update(ghlAccounts)
      .set({ isActive: false })
      .where(eq(ghlAccounts.dealershipId, account.dealershipId));
    
    const result = await db.insert(ghlAccounts).values(account).returning();
    return result[0];
  }

  async updateGhlAccount(id: number, dealershipId: number, updates: Partial<InsertGhlAccount>): Promise<GhlAccount | undefined> {
    const result = await db
      .update(ghlAccounts)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(ghlAccounts.id, id),
        eq(ghlAccounts.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteGhlAccount(id: number, dealershipId: number): Promise<boolean> {
    const result = await db
      .delete(ghlAccounts)
      .where(and(
        eq(ghlAccounts.id, id),
        eq(ghlAccounts.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }

  // ====== GOHIGHLEVEL CONFIG (Multi-Tenant) ======
  async getGhlConfig(dealershipId: number): Promise<GhlConfig | undefined> {
    const result = await db
      .select()
      .from(ghlConfig)
      .where(eq(ghlConfig.dealershipId, dealershipId))
      .limit(1);
    return result[0];
  }

  async createGhlConfig(config: InsertGhlConfig): Promise<GhlConfig> {
    if (!config.dealershipId) {
      throw new Error('dealershipId is required when creating GHL config');
    }
    const result = await db.insert(ghlConfig).values(config).returning();
    return result[0];
  }

  async updateGhlConfig(id: number, dealershipId: number, updates: Partial<InsertGhlConfig>): Promise<GhlConfig | undefined> {
    const result = await db
      .update(ghlConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(
        eq(ghlConfig.id, id),
        eq(ghlConfig.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  // ====== GOHIGHLEVEL WEBHOOK EVENTS (Multi-Tenant) ======
  async createGhlWebhookEvent(event: InsertGhlWebhookEvent): Promise<GhlWebhookEvent> {
    if (!event.dealershipId) {
      throw new Error('dealershipId is required when creating GHL webhook event');
    }
    const result = await db.insert(ghlWebhookEvents).values(event).returning();
    return result[0];
  }

  async getGhlWebhookEvents(dealershipId: number, status?: string, limit: number = 100): Promise<GhlWebhookEvent[]> {
    const conditions = [eq(ghlWebhookEvents.dealershipId, dealershipId)];
    if (status) {
      conditions.push(eq(ghlWebhookEvents.status, status));
    }
    
    return await db
      .select()
      .from(ghlWebhookEvents)
      .where(and(...conditions))
      .orderBy(desc(ghlWebhookEvents.receivedAt))
      .limit(limit);
  }

  async updateGhlWebhookEvent(id: number, dealershipId: number, updates: Partial<InsertGhlWebhookEvent>): Promise<GhlWebhookEvent | undefined> {
    const result = await db
      .update(ghlWebhookEvents)
      .set(updates)
      .where(and(
        eq(ghlWebhookEvents.id, id),
        eq(ghlWebhookEvents.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async getGhlWebhookEventByEventId(dealershipId: number, eventId: string): Promise<GhlWebhookEvent | undefined> {
    const result = await db
      .select()
      .from(ghlWebhookEvents)
      .where(and(
        eq(ghlWebhookEvents.dealershipId, dealershipId),
        eq(ghlWebhookEvents.eventId, eventId)
      ))
      .limit(1);
    return result[0];
  }

  // ====== GOHIGHLEVEL CONTACT SYNC (Multi-Tenant) ======
  async getGhlContactSync(dealershipId: number, ghlContactId: string): Promise<GhlContactSync | undefined> {
    const result = await db
      .select()
      .from(ghlContactSync)
      .where(and(
        eq(ghlContactSync.dealershipId, dealershipId),
        eq(ghlContactSync.ghlContactId, ghlContactId)
      ))
      .limit(1);
    return result[0];
  }

  async getGhlContactSyncByPbsId(dealershipId: number, pbsContactId: string): Promise<GhlContactSync | undefined> {
    const result = await db
      .select()
      .from(ghlContactSync)
      .where(and(
        eq(ghlContactSync.dealershipId, dealershipId),
        eq(ghlContactSync.pbsContactId, pbsContactId)
      ))
      .limit(1);
    return result[0];
  }

  async createGhlContactSync(sync: InsertGhlContactSync): Promise<GhlContactSync> {
    if (!sync.dealershipId) {
      throw new Error('dealershipId is required when creating GHL contact sync');
    }
    const result = await db.insert(ghlContactSync).values(sync).returning();
    return result[0];
  }

  async updateGhlContactSync(id: number, dealershipId: number, updates: Partial<InsertGhlContactSync>): Promise<GhlContactSync | undefined> {
    const result = await db
      .update(ghlContactSync)
      .set({ ...updates, lastSyncAt: new Date() })
      .where(and(
        eq(ghlContactSync.id, id),
        eq(ghlContactSync.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async getPendingGhlContactSyncs(dealershipId: number, limit: number = 100): Promise<GhlContactSync[]> {
    return await db
      .select()
      .from(ghlContactSync)
      .where(and(
        eq(ghlContactSync.dealershipId, dealershipId),
        eq(ghlContactSync.syncStatus, 'pending')
      ))
      .orderBy(ghlContactSync.createdAt)
      .limit(limit);
  }

  // ====== GOHIGHLEVEL APPOINTMENT SYNC (Multi-Tenant) ======
  async getGhlAppointmentSync(dealershipId: number, ghlAppointmentId: string): Promise<GhlAppointmentSync | undefined> {
    const result = await db
      .select()
      .from(ghlAppointmentSync)
      .where(and(
        eq(ghlAppointmentSync.dealershipId, dealershipId),
        eq(ghlAppointmentSync.ghlAppointmentId, ghlAppointmentId)
      ))
      .limit(1);
    return result[0];
  }

  async createGhlAppointmentSync(sync: InsertGhlAppointmentSync): Promise<GhlAppointmentSync> {
    if (!sync.dealershipId) {
      throw new Error('dealershipId is required when creating GHL appointment sync');
    }
    const result = await db.insert(ghlAppointmentSync).values(sync).returning();
    return result[0];
  }

  async updateGhlAppointmentSync(id: number, dealershipId: number, updates: Partial<InsertGhlAppointmentSync>): Promise<GhlAppointmentSync | undefined> {
    const result = await db
      .update(ghlAppointmentSync)
      .set({ ...updates, lastSyncAt: new Date() })
      .where(and(
        eq(ghlAppointmentSync.id, id),
        eq(ghlAppointmentSync.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async getPendingGhlAppointmentSyncs(dealershipId: number, limit: number = 100): Promise<GhlAppointmentSync[]> {
    return await db
      .select()
      .from(ghlAppointmentSync)
      .where(and(
        eq(ghlAppointmentSync.dealershipId, dealershipId),
        eq(ghlAppointmentSync.syncStatus, 'pending')
      ))
      .orderBy(ghlAppointmentSync.createdAt)
      .limit(limit);
  }

  // ====== GOHIGHLEVEL API LOGS (Multi-Tenant) ======
  async createGhlApiLog(log: InsertGhlApiLog): Promise<GhlApiLog> {
    if (!log.dealershipId) {
      throw new Error('dealershipId is required when creating GHL API log');
    }
    const result = await db.insert(ghlApiLogs).values(log).returning();
    return result[0];
  }

  async getGhlApiLogs(dealershipId: number, limit: number = 100): Promise<GhlApiLog[]> {
    return await db
      .select()
      .from(ghlApiLogs)
      .where(eq(ghlApiLogs.dealershipId, dealershipId))
      .orderBy(desc(ghlApiLogs.createdAt))
      .limit(limit);
  }

  // ====== MANAGER SETTINGS (Multi-Tenant via User) ======
  async getManagerSettings(userId: number, dealershipId: number): Promise<ManagerSettings | undefined> {
    // Multi-tenant through user - verify user belongs to dealership first, then get settings
    const user = await this.getUserById(userId, dealershipId);
    if (!user) {
      return undefined; // User doesn't belong to this dealership
    }
    
    const result = await db
      .select()
      .from(managerSettings)
      .where(eq(managerSettings.userId, userId))
      .limit(1);
    return result[0];
  }

  async getManagerSettingsByDealership(dealershipId: number): Promise<ManagerSettings | undefined> {
    // Get any manager settings for this dealership (used for scheduled jobs)
    // Join with users to filter by dealership
    const result = await db
      .select({ settings: managerSettings })
      .from(managerSettings)
      .innerJoin(users, eq(users.id, managerSettings.userId))
      .where(eq(users.dealershipId, dealershipId))
      .limit(1);
    return result[0]?.settings;
  }

  async createManagerSettings(settings: InsertManagerSettings): Promise<ManagerSettings> {
    const result = await db.insert(managerSettings).values(settings).returning();
    return result[0];
  }

  async updateManagerSettings(userId: number, dealershipId: number, settings: Partial<InsertManagerSettings>): Promise<ManagerSettings | undefined> {
    // Multi-tenant through user - verify user belongs to dealership first
    const user = await this.getUserById(userId, dealershipId);
    if (!user) {
      return undefined; // User doesn't belong to this dealership
    }
    
    const result = await db
      .update(managerSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(managerSettings.userId, userId))
      .returning();
    return result[0];
  }

  // ====== MARKET LISTINGS (Multi-Tenant) ======
  async getMarketListings(dealershipId: number, filters: { make?: string; model?: string; yearMin?: number; yearMax?: number; source?: string; trim?: string }, limit: number = 50, offset: number = 0): Promise<{ listings: MarketListing[]; total: number }> {
    const conditions = [];
    
    // REQUIRED: Always filter by dealership
    conditions.push(eq(marketListings.dealershipId, dealershipId));
    
    // Always filter for active listings
    conditions.push(eq(marketListings.isActive, true));
    
    if (filters.make) {
      // Use parameterized case-insensitive comparison
      conditions.push(sql`LOWER(${marketListings.make}) = LOWER(${filters.make})`);
    }
    if (filters.model) {
      conditions.push(sql`LOWER(${marketListings.model}) = LOWER(${filters.model})`);
    }
    if (filters.yearMin) {
      conditions.push(gte(marketListings.year, filters.yearMin));
    }
    if (filters.yearMax) {
      conditions.push(lte(marketListings.year, filters.yearMax));
    }
    if (filters.source) {
      conditions.push(eq(marketListings.source, filters.source));
    }
    if (filters.trim) {
      // Case-insensitive partial match for trim level
      conditions.push(sql`LOWER(${marketListings.trim}) LIKE LOWER(${'%' + filters.trim + '%'})`);
    }
    
    const whereClause = and(...conditions);
    
    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketListings)
      .where(whereClause);
    
    // Get paginated listings
    const listings = await db
      .select()
      .from(marketListings)
      .where(whereClause)
      .orderBy(desc(marketListings.scrapedAt))
      .limit(limit)
      .offset(offset);
    
    return {
      listings,
      total: count
    };
  }

  async getMarketListingById(id: number, dealershipId: number): Promise<MarketListing | undefined> {
    // REQUIRED: Filter by dealership
    const result = await db
      .select()
      .from(marketListings)
      .where(and(
        eq(marketListings.id, id),
        eq(marketListings.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async getMarketListingsByUrls(dealershipId: number, urls: string[]): Promise<MarketListing[]> {
    if (urls.length === 0) {
      return [];
    }
    
    // Filter out any empty or invalid URLs
    const validUrls = urls.filter(url => url && typeof url === 'string' && url.length > 0);
    if (validUrls.length === 0) {
      return [];
    }
    
    // REQUIRED: Filter by dealership
    // Use proper PostgreSQL array syntax
    const result = await db
      .select()
      .from(marketListings)
      .where(and(
        eq(marketListings.dealershipId, dealershipId),
        inArray(marketListings.listingUrl, validUrls)
      ));
    return result;
  }

  async createMarketListing(listing: InsertMarketListing): Promise<MarketListing> {
    // Validate dealershipId is present before insert
    if (!listing.dealershipId) {
      throw new Error('dealershipId is required when creating a market listing');
    }
    const result = await db.insert(marketListings).values(listing).returning();
    return result[0];
  }

  async updateMarketListing(id: number, dealershipId: number, listing: Partial<InsertMarketListing>): Promise<MarketListing | undefined> {
    // REQUIRED: Only update listings for this dealership
    const result = await db
      .update(marketListings)
      .set(listing)
      .where(and(
        eq(marketListings.id, id),
        eq(marketListings.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async updateMarketListingColors(id: number, dealershipId: number, colors: { interiorColor?: string; exteriorColor?: string; vin?: string }): Promise<MarketListing | undefined> {
    const result = await db
      .update(marketListings)
      .set({
        interiorColor: colors.interiorColor,
        exteriorColor: colors.exteriorColor,
        vin: colors.vin,
        colorScrapedAt: new Date()
      })
      .where(and(
        eq(marketListings.id, id),
        eq(marketListings.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async getCargurusColorByVin(vin: string): Promise<CargurusColorCache | undefined> {
    const result = await db
      .select()
      .from(cargurusColorCache)
      .where(eq(cargurusColorCache.vin, vin))
      .limit(1);
    return result[0];
  }

  async upsertCargurusColorCache(data: InsertCargurusColorCache): Promise<CargurusColorCache> {
    const result = await db
      .insert(cargurusColorCache)
      .values(data)
      .onConflictDoUpdate({
        target: cargurusColorCache.vin,
        set: {
          interiorColor: data.interiorColor,
          exteriorColor: data.exteriorColor,
          cargurusListingId: data.cargurusListingId,
          cargurusUrl: data.cargurusUrl,
          expiresAt: data.expiresAt,
          scrapedAt: new Date()
        }
      })
      .returning();
    return result[0];
  }

  async getExpiredCargurusColors(): Promise<CargurusColorCache[]> {
    return await db
      .select()
      .from(cargurusColorCache)
      .where(sql`${cargurusColorCache.expiresAt} < NOW()`);
  }

  async deactivateMarketListing(dealershipId: number, url: string): Promise<boolean> {
    // REQUIRED: Only deactivate listings for this dealership
    await db
      .update(marketListings)
      .set({ isActive: false })
      .where(and(
        eq(marketListings.listingUrl, url),
        eq(marketListings.dealershipId, dealershipId)
      ));
    return true;
  }

  async deleteOldMarketListings(dealershipId: number, daysOld: number): Promise<number> {
    // REQUIRED: Only delete old listings for this dealership
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    await db
      .delete(marketListings)
      .where(and(
        eq(marketListings.dealershipId, dealershipId),
        lte(marketListings.scrapedAt, cutoffDate)
      ));
    
    return 0; // Drizzle doesn't return count for deletes
  }

  // ====== SUPER ADMIN - GLOBAL SETTINGS ======
  async getGlobalSetting(key: string): Promise<GlobalSetting | undefined> {
    const result = await db.select().from(globalSettings).where(eq(globalSettings.key, key)).limit(1);
    return result[0];
  }

  async getAllGlobalSettings(): Promise<GlobalSetting[]> {
    return await db.select().from(globalSettings).orderBy(globalSettings.key);
  }

  async setGlobalSetting(setting: InsertGlobalSetting): Promise<GlobalSetting> {
    const result = await db
      .insert(globalSettings)
      .values(setting)
      .onConflictDoUpdate({
        target: globalSettings.key,
        set: {
          value: setting.value,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  }

  async deleteGlobalSetting(key: string): Promise<boolean> {
    await db.delete(globalSettings).where(eq(globalSettings.key, key));
    return true;
  }

  // ====== SUPER ADMIN - CONFIG (secrets password, etc) ======
  async getSuperAdminConfig(key: string): Promise<SuperAdminConfig | undefined> {
    const result = await db.select().from(superAdminConfigs).where(eq(superAdminConfigs.key, key)).limit(1);
    return result[0];
  }

  async setSuperAdminConfig(key: string, value: string, updatedBy: number | null): Promise<SuperAdminConfig> {
    const existing = await this.getSuperAdminConfig(key);
    
    if (existing) {
      const result = await db.update(superAdminConfigs)
        .set({ value, updatedBy, updatedAt: new Date() })
        .where(eq(superAdminConfigs.key, key))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(superAdminConfigs)
        .values({ key, value, updatedBy })
        .returning();
      return result[0];
    }
  }

  // ====== SUPER ADMIN - AUDIT LOGGING ======
  async logAuditAction(log: InsertAuditLog): Promise<AuditLog> {
    const result = await db.insert(auditLogs).values(log).returning();
    return result[0];
  }

  async getAuditLogs(limit: number = 50, offset: number = 0): Promise<{ logs: AuditLog[]; total: number }> {
    // Get total count
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs);
    
    // Get paginated logs, ordered by createdAt DESC
    const logs = await db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);
    
    return {
      logs,
      total: count
    };
  }

  // ====== SUPER ADMIN - DEALERSHIP PROVISIONING ======
  async createDealershipWithSetup(params: {
    name: string;
    slug: string;
    subdomain: string;
    address?: string;
    city?: string;
    province?: string;
    postalCode?: string;
    phone?: string;
    timezone?: string;
    defaultCurrency?: string;
    masterAdminEmail: string;
    masterAdminName: string;
    masterAdminPassword: string;
    // API Keys (optional)
    openaiApiKey?: string;
    marketcheckKey?: string;
    apifyToken?: string;
    apifyActorId?: string;
    geminiApiKey?: string;
    ghlApiKey?: string;
    ghlLocationId?: string;
    facebookAppId?: string;
    facebookAppSecret?: string;
  }): Promise<{ dealership: Dealership; masterAdmin: User }> {
    return await db.transaction(async (tx) => {
      // a) Create dealership
      const [dealership] = await tx
        .insert(dealerships)
        .values({
          name: params.name,
          slug: params.slug,
          subdomain: params.subdomain,
          address: params.address,
          city: params.city,
          province: params.province,
          postalCode: params.postalCode,
          phone: params.phone,
          timezone: params.timezone || 'America/Vancouver',
          defaultCurrency: params.defaultCurrency || 'CAD',
          isActive: true,
        })
        .returning();

      // b) Create master admin user with hashed password
      const passwordHash = await hashPassword(params.masterAdminPassword);
      const [masterAdmin] = await tx
        .insert(users)
        .values({
          dealershipId: dealership.id,
          email: params.masterAdminEmail,
          passwordHash: passwordHash,
          name: params.masterAdminName,
          role: 'master',
          isActive: true,
          createdBy: null,
        })
        .returning();

      // c) Create 5 credit score tiers
      const creditTiers = [
        {
          dealershipId: dealership.id,
          tierName: "Excellent",
          minScore: 750,
          maxScore: 850,
          interestRate: 399,
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          tierName: "Very Good",
          minScore: 700,
          maxScore: 749,
          interestRate: 499,
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          tierName: "Good",
          minScore: 650,
          maxScore: 699,
          interestRate: 699,
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          tierName: "Fair",
          minScore: 600,
          maxScore: 649,
          interestRate: 999,
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          tierName: "Poor",
          minScore: 300,
          maxScore: 599,
          interestRate: 1499,
          isActive: true,
        },
      ];
      await tx.insert(creditScoreTiers).values(creditTiers);

      // d) Create 4 model year financing terms
      const currentYear = new Date().getFullYear();
      const yearTerms = [
        {
          dealershipId: dealership.id,
          minModelYear: currentYear,
          maxModelYear: currentYear + 1,
          availableTerms: ["24", "36", "48", "60", "72", "84"],
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          minModelYear: currentYear - 3,
          maxModelYear: currentYear - 1,
          availableTerms: ["24", "36", "48", "60", "72"],
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          minModelYear: currentYear - 7,
          maxModelYear: currentYear - 4,
          availableTerms: ["24", "36", "48", "60"],
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          minModelYear: 2010,
          maxModelYear: currentYear - 8,
          availableTerms: ["24", "36", "48"],
          isActive: true,
        },
      ];
      await tx.insert(modelYearTerms).values(yearTerms);

      // e) Create 5 chat prompts
      const chatPromptData = [
        {
          dealershipId: dealership.id,
          name: "Test Drive Scheduling",
          scenario: "test-drive",
          systemPrompt: `You are a helpful assistant for ${params.name}. Help customers schedule test drives. Be friendly, professional, and gather: preferred date/time, contact information, and which vehicle they're interested in. If they have questions about the vehicle, answer them enthusiastically.`,
          greeting: `Hi! I'd love to help you schedule a test drive at ${params.name}. Which vehicle are you interested in?`,
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          name: "Financing Pre-Approval",
          scenario: "get-approved",
          systemPrompt: `You are a financing specialist for ${params.name}. Help customers understand their financing options and pre-approval process. Gather: employment status, credit score range, down payment amount, and monthly budget. Explain the benefits of getting pre-approved and how it speeds up the buying process.`,
          greeting: `Welcome to ${params.name}! Let's explore your financing options. Getting pre-approved is quick and won't affect your credit score. What vehicle are you interested in financing?`,
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          name: "Trade-In Valuation",
          scenario: "value-trade",
          systemPrompt: `You are a trade-in specialist for ${params.name}. Help customers get a trade-in valuation for their current vehicle. Gather: year, make, model, trim, odometer reading, condition, and any issues. Explain that we offer competitive trade-in values and can provide an instant estimate.`,
          greeting: `Hi! I can help you get a trade-in value for your current vehicle. What are you driving right now?`,
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          name: "Vehicle Reservation",
          scenario: "reserve",
          systemPrompt: `You are a reservation specialist for ${params.name}. Help customers reserve vehicles with a refundable deposit. Gather: which vehicle they want to reserve, contact information, and preferred payment method. Explain that reservations are fully refundable and hold the vehicle for 48 hours.`,
          greeting: `Great choice! I can help you reserve this vehicle. Reservations are fully refundable and hold the vehicle for 48 hours. Let me get a few details from you.`,
          isActive: true,
        },
        {
          dealershipId: dealership.id,
          name: "General Assistance",
          scenario: "general",
          systemPrompt: `You are a knowledgeable sales assistant for ${params.name}. Answer questions about vehicles, inventory, features, pricing, and dealership services. Be helpful, enthusiastic, and guide customers toward booking a test drive or speaking with a sales specialist for specific pricing questions.`,
          greeting: `Welcome to ${params.name}! How can I help you today? Are you looking for something specific or would you like to browse our inventory?`,
          isActive: true,
        },
      ];
      await tx.insert(chatPrompts).values(chatPromptData);

      // f) Create API keys entry if any keys are provided
      const hasApiKeys = params.openaiApiKey || params.marketcheckKey || params.apifyToken || 
                        params.apifyActorId || params.geminiApiKey || params.ghlApiKey || 
                        params.ghlLocationId || params.facebookAppId || params.facebookAppSecret;
      
      if (hasApiKeys) {
        await tx.insert(dealershipApiKeys).values({
          dealershipId: dealership.id,
          openaiApiKey: params.openaiApiKey || null,
          marketcheckKey: params.marketcheckKey || null,
          apifyToken: params.apifyToken || null,
          apifyActorId: params.apifyActorId || null,
          geminiApiKey: params.geminiApiKey || null,
          ghlApiKey: params.ghlApiKey || null,
          ghlLocationId: params.ghlLocationId || null,
          facebookAppId: params.facebookAppId || null,
          facebookAppSecret: params.facebookAppSecret || null,
        });
      }

      // g) Return created dealership and master admin
      return { dealership, masterAdmin };
    });
  }

  // ====== EXTERNAL API TOKENS (Multi-Tenant) ======
  async getExternalApiTokens(dealershipId: number): Promise<ExternalApiToken[]> {
    return await db.select().from(externalApiTokens)
      .where(eq(externalApiTokens.dealershipId, dealershipId))
      .orderBy(desc(externalApiTokens.createdAt));
  }

  async getExternalApiTokenById(id: number, dealershipId: number): Promise<ExternalApiToken | undefined> {
    const result = await db.select().from(externalApiTokens)
      .where(and(
        eq(externalApiTokens.id, id),
        eq(externalApiTokens.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async getExternalApiTokenByPrefix(prefix: string): Promise<ExternalApiToken | undefined> {
    const result = await db.select().from(externalApiTokens)
      .where(eq(externalApiTokens.tokenPrefix, prefix))
      .limit(1);
    return result[0];
  }

  async createExternalApiToken(token: InsertExternalApiToken): Promise<ExternalApiToken> {
    const result = await db.insert(externalApiTokens).values(token).returning();
    return result[0];
  }

  async updateExternalApiToken(id: number, dealershipId: number, token: Partial<InsertExternalApiToken>): Promise<ExternalApiToken | undefined> {
    const result = await db.update(externalApiTokens)
      .set(token)
      .where(and(
        eq(externalApiTokens.id, id),
        eq(externalApiTokens.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteExternalApiToken(id: number, dealershipId: number): Promise<boolean> {
    // Always require dealershipId match for security - prevents cross-tenant deletion
    const result = await db.delete(externalApiTokens)
      .where(and(
        eq(externalApiTokens.id, id),
        eq(externalApiTokens.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }

  async updateExternalApiTokenLastUsed(id: number): Promise<void> {
    await db.update(externalApiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(externalApiTokens.id, id));
  }
  
  // ====== STAFF INVITES ======
  async getStaffInviteByToken(token: string): Promise<StaffInvite | undefined> {
    const result = await db.select().from(staffInvites)
      .where(eq(staffInvites.inviteToken, token))
      .limit(1);
    return result[0];
  }
  
  async acceptStaffInvite(id: number): Promise<void> {
    await db.update(staffInvites)
      .set({ 
        status: 'accepted',
        acceptedAt: new Date(),
      })
      .where(eq(staffInvites.id, id));
  }
  
  async getDealershipById(id: number): Promise<Dealership | undefined> {
    const result = await db.select().from(dealerships)
      .where(eq(dealerships.id, id))
      .limit(1);
    return result[0];
  }
  
  // ====== PASSWORD RESET TOKENS ======
  async createPasswordResetToken(userId: number, tokenHash: string, expiresAt: Date): Promise<PasswordResetToken> {
    const result = await db.insert(passwordResetTokens)
      .values({ userId, tokenHash, expiresAt })
      .returning();
    return result[0];
  }
  
  async getAllValidPasswordResetTokens(): Promise<PasswordResetToken[]> {
    return await db.select().from(passwordResetTokens)
      .where(and(
        gt(passwordResetTokens.expiresAt, new Date()),
        isNull(passwordResetTokens.usedAt)
      ));
  }
  
  async markPasswordResetTokenUsed(id: number): Promise<void> {
    await db.update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, id));
  }
  
  async deleteExpiredPasswordResetTokens(): Promise<number> {
    const result = await db.delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()))
      .returning();
    return result.length;
  }
  
  // ====== LAUNCH CHECKLIST ======
  async getLaunchChecklist(dealershipId: number): Promise<LaunchChecklist[]> {
    return await db.select().from(launchChecklist)
      .where(eq(launchChecklist.dealershipId, dealershipId))
      .orderBy(launchChecklist.category, launchChecklist.sortOrder);
  }
  
  async getLaunchChecklistByCategory(dealershipId: number, category: string): Promise<LaunchChecklist[]> {
    return await db.select().from(launchChecklist)
      .where(and(
        eq(launchChecklist.dealershipId, dealershipId),
        eq(launchChecklist.category, category)
      ))
      .orderBy(launchChecklist.sortOrder);
  }
  
  async getLaunchChecklistProgress(dealershipId: number): Promise<{ total: number; completed: number; required: number; requiredCompleted: number }> {
    const items = await db.select().from(launchChecklist)
      .where(eq(launchChecklist.dealershipId, dealershipId));
    
    const total = items.length;
    const completed = items.filter(i => i.status === 'completed' || i.status === 'skipped').length;
    const required = items.filter(i => i.isRequired).length;
    const requiredCompleted = items.filter(i => i.isRequired && (i.status === 'completed' || i.status === 'skipped')).length;
    
    return { total, completed, required, requiredCompleted };
  }
  
  async createLaunchChecklistItem(item: InsertLaunchChecklist): Promise<LaunchChecklist> {
    const result = await db.insert(launchChecklist).values(item).returning();
    return result[0];
  }
  
  async createLaunchChecklistItems(items: InsertLaunchChecklist[]): Promise<LaunchChecklist[]> {
    if (items.length === 0) return [];
    const result = await db.insert(launchChecklist).values(items).returning();
    return result;
  }
  
  async updateLaunchChecklistItem(id: number, dealershipId: number, item: Partial<InsertLaunchChecklist>): Promise<LaunchChecklist | undefined> {
    const result = await db.update(launchChecklist)
      .set({ ...item, updatedAt: new Date() })
      .where(and(
        eq(launchChecklist.id, id),
        eq(launchChecklist.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async completeLaunchChecklistItem(id: number, dealershipId: number, userId: number): Promise<LaunchChecklist | undefined> {
    const result = await db.update(launchChecklist)
      .set({ 
        status: 'completed', 
        completedBy: userId, 
        completedAt: new Date(),
        updatedAt: new Date() 
      })
      .where(and(
        eq(launchChecklist.id, id),
        eq(launchChecklist.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async skipLaunchChecklistItem(id: number, dealershipId: number, notes?: string): Promise<LaunchChecklist | undefined> {
    const result = await db.update(launchChecklist)
      .set({ 
        status: 'skipped', 
        notes: notes || null,
        updatedAt: new Date() 
      })
      .where(and(
        eq(launchChecklist.id, id),
        eq(launchChecklist.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async deleteLaunchChecklistItem(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(launchChecklist)
      .where(and(
        eq(launchChecklist.id, id),
        eq(launchChecklist.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }
  
  // ====== PRICE HISTORY ======
  async getPriceHistory(dealershipId: number, filters: { make?: string; model?: string; externalId?: string }, limit: number = 100): Promise<PriceHistory[]> {
    const conditions = [eq(priceHistory.dealershipId, dealershipId)];
    
    if (filters.make) {
      conditions.push(sql`LOWER(${priceHistory.make}) = LOWER(${filters.make})`);
    }
    if (filters.model) {
      conditions.push(sql`LOWER(${priceHistory.model}) = LOWER(${filters.model})`);
    }
    if (filters.externalId) {
      conditions.push(eq(priceHistory.externalId, filters.externalId));
    }
    
    return await db.select().from(priceHistory)
      .where(and(...conditions))
      .orderBy(desc(priceHistory.recordedAt))
      .limit(limit);
  }
  
  async createPriceHistory(record: InsertPriceHistory): Promise<PriceHistory> {
    const result = await db.insert(priceHistory).values(record).returning();
    return result[0];
  }
  
  async createPriceHistoryBatch(records: InsertPriceHistory[]): Promise<PriceHistory[]> {
    if (records.length === 0) return [];
    const result = await db.insert(priceHistory).values(records).returning();
    return result;
  }
  
  async getPriceHistoryForListing(dealershipId: number, externalId: string): Promise<PriceHistory[]> {
    return await db.select().from(priceHistory)
      .where(and(
        eq(priceHistory.dealershipId, dealershipId),
        eq(priceHistory.externalId, externalId)
      ))
      .orderBy(desc(priceHistory.recordedAt));
  }
  
  // ====== COMPETITOR DEALERS ======
  async getCompetitorDealers(dealershipId: number): Promise<CompetitorDealer[]> {
    return await db.select().from(competitorDealers)
      .where(and(
        eq(competitorDealers.dealershipId, dealershipId),
        eq(competitorDealers.isActive, true)
      ))
      .orderBy(competitorDealers.competitorName);
  }
  
  async getCompetitorDealerById(id: number, dealershipId: number): Promise<CompetitorDealer | undefined> {
    const result = await db.select().from(competitorDealers)
      .where(and(
        eq(competitorDealers.id, id),
        eq(competitorDealers.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }
  
  async createCompetitorDealer(dealer: InsertCompetitorDealer): Promise<CompetitorDealer> {
    const result = await db.insert(competitorDealers).values(dealer).returning();
    return result[0];
  }
  
  async updateCompetitorDealer(id: number, dealershipId: number, dealer: Partial<InsertCompetitorDealer>): Promise<CompetitorDealer | undefined> {
    const result = await db.update(competitorDealers)
      .set(dealer)
      .where(and(
        eq(competitorDealers.id, id),
        eq(competitorDealers.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async deleteCompetitorDealer(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(competitorDealers)
      .where(and(
        eq(competitorDealers.id, id),
        eq(competitorDealers.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }
  
  // ====== MARKET SNAPSHOTS ======
  async getMarketSnapshots(dealershipId: number, filters: { make?: string; model?: string; limit?: number }): Promise<MarketSnapshot[]> {
    const conditions = [eq(marketSnapshots.dealershipId, dealershipId)];
    
    if (filters.make) {
      conditions.push(sql`LOWER(${marketSnapshots.make}) = LOWER(${filters.make})`);
    }
    if (filters.model) {
      conditions.push(sql`LOWER(${marketSnapshots.model}) = LOWER(${filters.model})`);
    }
    
    return await db.select().from(marketSnapshots)
      .where(and(...conditions))
      .orderBy(desc(marketSnapshots.snapshotDate))
      .limit(filters.limit || 30);
  }
  
  async createMarketSnapshot(snapshot: InsertMarketSnapshot): Promise<MarketSnapshot> {
    const result = await db.insert(marketSnapshots).values(snapshot).returning();
    return result[0];
  }
  
  async getLatestMarketSnapshot(dealershipId: number, make: string, model: string): Promise<MarketSnapshot | undefined> {
    const result = await db.select().from(marketSnapshots)
      .where(and(
        eq(marketSnapshots.dealershipId, dealershipId),
        sql`LOWER(${marketSnapshots.make}) = LOWER(${make})`,
        sql`LOWER(${marketSnapshots.model}) = LOWER(${model})`
      ))
      .orderBy(desc(marketSnapshots.snapshotDate))
      .limit(1);
    return result[0];
  }
  
  async getLatestMarketSnapshotDate(dealershipId: number): Promise<Date | null> {
    // Get the most recent market listing scraped date for this dealership
    const result = await db.select({ scrapedAt: marketListings.scrapedAt })
      .from(marketListings)
      .where(eq(marketListings.dealershipId, dealershipId))
      .orderBy(desc(marketListings.scrapedAt))
      .limit(1);
    return result[0]?.scrapedAt || null;
  }
  
  // ====== SCRAPER ACTIVITY LOGS ======
  async createScraperActivityLog(log: InsertScraperActivityLog): Promise<ScraperActivityLog> {
    const result = await db.insert(scraperActivityLogs).values(log).returning();
    return result[0];
  }
  
  async updateScraperActivityLog(id: number, updates: Partial<InsertScraperActivityLog>): Promise<ScraperActivityLog | undefined> {
    const result = await db.update(scraperActivityLogs)
      .set(updates)
      .where(eq(scraperActivityLogs.id, id))
      .returning();
    return result[0];
  }
  
  async getScraperActivityLogs(dealershipId?: number, limit: number = 50): Promise<ScraperActivityLog[]> {
    if (dealershipId) {
      return await db.select().from(scraperActivityLogs)
        .where(eq(scraperActivityLogs.dealershipId, dealershipId))
        .orderBy(desc(scraperActivityLogs.startedAt))
        .limit(limit);
    }
    return await db.select().from(scraperActivityLogs)
      .orderBy(desc(scraperActivityLogs.startedAt))
      .limit(limit);
  }
  
  async getLatestScraperLog(dealershipId: number, sourceType?: string): Promise<ScraperActivityLog | undefined> {
    const conditions = [eq(scraperActivityLogs.dealershipId, dealershipId)];
    if (sourceType) {
      conditions.push(eq(scraperActivityLogs.sourceType, sourceType));
    }
    const result = await db.select().from(scraperActivityLogs)
      .where(and(...conditions))
      .orderBy(desc(scraperActivityLogs.startedAt))
      .limit(1);
    return result[0];
  }
  
  // ====== DEALERSHIP BRANDING ======
  async getDealershipBranding(dealershipId: number): Promise<DealershipBranding | undefined> {
    const result = await db.select().from(dealershipBranding)
      .where(eq(dealershipBranding.dealershipId, dealershipId))
      .limit(1);
    return result[0];
  }
  
  async upsertDealershipBranding(branding: InsertDealershipBranding): Promise<DealershipBranding> {
    const existing = await this.getDealershipBranding(branding.dealershipId);
    if (existing) {
      const result = await db.update(dealershipBranding)
        .set({ ...branding, updatedAt: new Date() })
        .where(eq(dealershipBranding.dealershipId, branding.dealershipId))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(dealershipBranding).values(branding).returning();
      return result[0];
    }
  }
  
  // ====== SYSTEM HEALTH COUNTS ======
  async getTotalVehicleCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(vehicles);
    return Number(result[0]?.count || 0);
  }
  
  async getAllConversationsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(chatConversations);
    return Number(result[0]?.count || 0);
  }
  
  async getAllChatPromptsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(chatPrompts);
    return Number(result[0]?.count || 0);
  }
  
  async getAllFilterGroupsCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(filterGroups);
    return Number(result[0]?.count || 0);
  }
  
  async getApiKeysConfiguredCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(dealershipApiKeys);
    return Number(result[0]?.count || 0);
  }
  
  async getTotalRemarketingVehicleCount(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(remarketingVehicles);
    return Number(result[0]?.count || 0);
  }
  
  // ====== CALL ANALYSIS SYSTEM ======
  async getCallAnalysisCriteria(dealershipId: number): Promise<CallAnalysisCriteria[]> {
    return await db.select().from(callAnalysisCriteria)
      .where(eq(callAnalysisCriteria.dealershipId, dealershipId))
      .orderBy(callAnalysisCriteria.category, callAnalysisCriteria.name);
  }
  
  async getActiveCallAnalysisCriteria(dealershipId: number): Promise<CallAnalysisCriteria[]> {
    return await db.select().from(callAnalysisCriteria)
      .where(and(
        eq(callAnalysisCriteria.dealershipId, dealershipId),
        eq(callAnalysisCriteria.isActive, true)
      ))
      .orderBy(callAnalysisCriteria.category, callAnalysisCriteria.name);
  }
  
  async createCallAnalysisCriteria(criteria: InsertCallAnalysisCriteria): Promise<CallAnalysisCriteria> {
    const result = await db.insert(callAnalysisCriteria).values(criteria).returning();
    return result[0];
  }
  
  async updateCallAnalysisCriteria(id: number, dealershipId: number, criteria: Partial<InsertCallAnalysisCriteria>): Promise<CallAnalysisCriteria | undefined> {
    const result = await db.update(callAnalysisCriteria)
      .set({ ...criteria, updatedAt: new Date() })
      .where(and(eq(callAnalysisCriteria.id, id), eq(callAnalysisCriteria.dealershipId, dealershipId)))
      .returning();
    return result[0];
  }
  
  async deleteCallAnalysisCriteria(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(callAnalysisCriteria)
      .where(and(eq(callAnalysisCriteria.id, id), eq(callAnalysisCriteria.dealershipId, dealershipId)));
    return true;
  }
  
  async getCallRecordings(dealershipId: number, filters?: { 
    salespersonId?: number; 
    startDate?: Date; 
    endDate?: Date; 
    analysisStatus?: string;
    needsReview?: boolean;
    minScore?: number;
    maxScore?: number;
  }, limit: number = 50, offset: number = 0): Promise<{ recordings: CallRecording[]; total: number }> {
    const conditions = [eq(callRecordings.dealershipId, dealershipId)];
    
    if (filters?.salespersonId) {
      conditions.push(eq(callRecordings.salespersonId, filters.salespersonId));
    }
    if (filters?.startDate) {
      conditions.push(gte(callRecordings.callStartedAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(callRecordings.callStartedAt, filters.endDate));
    }
    if (filters?.analysisStatus) {
      conditions.push(eq(callRecordings.analysisStatus, filters.analysisStatus));
    }
    if (filters?.needsReview !== undefined) {
      conditions.push(eq(callRecordings.needsReview, filters.needsReview));
    }
    if (filters?.minScore !== undefined) {
      conditions.push(gte(callRecordings.overallScore, filters.minScore));
    }
    if (filters?.maxScore !== undefined) {
      conditions.push(lte(callRecordings.overallScore, filters.maxScore));
    }
    
    const whereClause = and(...conditions);
    
    const [recordings, countResult] = await Promise.all([
      db.select().from(callRecordings)
        .where(whereClause)
        .orderBy(desc(callRecordings.callStartedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(callRecordings).where(whereClause)
    ]);
    
    return { recordings, total: Number(countResult[0]?.count || 0) };
  }
  
  async getCallRecordingById(id: number, dealershipId: number): Promise<CallRecording | undefined> {
    const result = await db.select().from(callRecordings)
      .where(and(eq(callRecordings.id, id), eq(callRecordings.dealershipId, dealershipId)))
      .limit(1);
    return result[0];
  }
  
  async getCallRecordingByGhlCallId(ghlCallId: string, dealershipId: number): Promise<CallRecording | undefined> {
    const result = await db.select().from(callRecordings)
      .where(and(eq(callRecordings.ghlCallId, ghlCallId), eq(callRecordings.dealershipId, dealershipId)))
      .limit(1);
    return result[0];
  }
  
  async createCallRecording(recording: InsertCallRecording): Promise<CallRecording> {
    const result = await db.insert(callRecordings).values(recording).returning();
    return result[0];
  }
  
  async updateCallRecording(id: number, dealershipId: number, recording: Partial<InsertCallRecording>): Promise<CallRecording | undefined> {
    const result = await db.update(callRecordings)
      .set({ ...recording, updatedAt: new Date() })
      .where(and(eq(callRecordings.id, id), eq(callRecordings.dealershipId, dealershipId)))
      .returning();
    return result[0];
  }
  
  async getPendingCallRecordings(dealershipId: number, limit: number = 10): Promise<CallRecording[]> {
    return await db.select().from(callRecordings)
      .where(and(
        eq(callRecordings.dealershipId, dealershipId),
        eq(callRecordings.analysisStatus, 'pending')
      ))
      .orderBy(callRecordings.callStartedAt)
      .limit(limit);
  }
  
  async getCallRecordingsNeedingReview(dealershipId: number, limit: number = 20): Promise<CallRecording[]> {
    return await db.select().from(callRecordings)
      .where(and(
        eq(callRecordings.dealershipId, dealershipId),
        eq(callRecordings.needsReview, true),
        sql`${callRecordings.reviewedAt} IS NULL`
      ))
      .orderBy(desc(callRecordings.callStartedAt))
      .limit(limit);
  }
  
  async getCallRecordingStats(dealershipId: number, startDate?: Date, endDate?: Date): Promise<{
    totalCalls: number;
    analyzedCalls: number;
    averageScore: number;
    callsNeedingReview: number;
    sentimentBreakdown: { positive: number; neutral: number; negative: number };
  }> {
    const conditions = [eq(callRecordings.dealershipId, dealershipId)];
    if (startDate) conditions.push(gte(callRecordings.callStartedAt, startDate));
    if (endDate) conditions.push(lte(callRecordings.callStartedAt, endDate));
    const whereClause = and(...conditions);
    
    const [totalResult, analyzedResult, avgScoreResult, reviewResult, sentimentResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(callRecordings).where(whereClause),
      db.select({ count: sql<number>`count(*)` }).from(callRecordings)
        .where(and(whereClause, eq(callRecordings.analysisStatus, 'completed'))),
      db.select({ avg: sql<number>`AVG(${callRecordings.overallScore})` }).from(callRecordings)
        .where(and(whereClause, eq(callRecordings.analysisStatus, 'completed'))),
      db.select({ count: sql<number>`count(*)` }).from(callRecordings)
        .where(and(whereClause, eq(callRecordings.needsReview, true), sql`${callRecordings.reviewedAt} IS NULL`)),
      db.select({ 
        sentiment: callRecordings.sentiment, 
        count: sql<number>`count(*)` 
      }).from(callRecordings)
        .where(and(whereClause, sql`${callRecordings.sentiment} IS NOT NULL`))
        .groupBy(callRecordings.sentiment)
    ]);
    
    const sentimentBreakdown = { positive: 0, neutral: 0, negative: 0 };
    sentimentResult.forEach(r => {
      if (r.sentiment === 'positive') sentimentBreakdown.positive = Number(r.count);
      else if (r.sentiment === 'neutral') sentimentBreakdown.neutral = Number(r.count);
      else if (r.sentiment === 'negative') sentimentBreakdown.negative = Number(r.count);
    });
    
    return {
      totalCalls: Number(totalResult[0]?.count || 0),
      analyzedCalls: Number(analyzedResult[0]?.count || 0),
      averageScore: Math.round(Number(avgScoreResult[0]?.avg || 0)),
      callsNeedingReview: Number(reviewResult[0]?.count || 0),
      sentimentBreakdown
    };
  }
  
  // ====== SUPER ADMIN IMPERSONATION ======
  async createImpersonationSession(session: InsertImpersonationSession): Promise<ImpersonationSession> {
    const result = await db.insert(impersonationSessions).values(session).returning();
    return result[0];
  }
  
  async getActiveImpersonationSession(superAdminId: number): Promise<ImpersonationSession | undefined> {
    const result = await db.select().from(impersonationSessions)
      .where(and(
        eq(impersonationSessions.superAdminId, superAdminId),
        sql`${impersonationSessions.endedAt} IS NULL`
      ))
      .orderBy(desc(impersonationSessions.startedAt))
      .limit(1);
    return result[0];
  }
  
  async endImpersonationSession(id: number, superAdminId: number): Promise<ImpersonationSession | undefined> {
    const result = await db.update(impersonationSessions)
      .set({ endedAt: new Date() })
      .where(and(eq(impersonationSessions.id, id), eq(impersonationSessions.superAdminId, superAdminId)))
      .returning();
    return result[0];
  }
  
  async getImpersonationSessions(limit: number = 50, offset: number = 0): Promise<{ 
    sessions: (ImpersonationSession & { superAdminName?: string; targetUserName?: string; targetDealershipName?: string })[]; 
    total: number 
  }> {
    const superAdminAlias = sql`sa`;
    const targetUserAlias = sql`tu`;
    
    const [sessions, countResult] = await Promise.all([
      db.select({
        id: impersonationSessions.id,
        superAdminId: impersonationSessions.superAdminId,
        targetUserId: impersonationSessions.targetUserId,
        targetDealershipId: impersonationSessions.targetDealershipId,
        reason: impersonationSessions.reason,
        ipAddress: impersonationSessions.ipAddress,
        userAgent: impersonationSessions.userAgent,
        startedAt: impersonationSessions.startedAt,
        endedAt: impersonationSessions.endedAt,
        actionsPerformed: impersonationSessions.actionsPerformed,
        superAdminName: sql<string>`(SELECT name FROM users WHERE id = ${impersonationSessions.superAdminId})`,
        targetUserName: sql<string>`(SELECT name FROM users WHERE id = ${impersonationSessions.targetUserId})`,
        targetDealershipName: sql<string>`(SELECT name FROM dealerships WHERE id = ${impersonationSessions.targetDealershipId})`
      }).from(impersonationSessions)
        .orderBy(desc(impersonationSessions.startedAt))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(impersonationSessions)
    ]);
    
    return { sessions: sessions as any, total: Number(countResult[0]?.count || 0) };
  }
  
  async incrementImpersonationActions(id: number): Promise<void> {
    await db.update(impersonationSessions)
      .set({ actionsPerformed: sql`${impersonationSessions.actionsPerformed} + 1` })
      .where(eq(impersonationSessions.id, id));
  }

  // ====== AUTOMATION ENGINE ======
  
  // Follow-up Sequences
  async getFollowUpSequences(dealershipId: number): Promise<FollowUpSequence[]> {
    return await db.select().from(followUpSequences)
      .where(eq(followUpSequences.dealershipId, dealershipId))
      .orderBy(desc(followUpSequences.createdAt));
  }
  
  async getActiveFollowUpSequences(dealershipId: number): Promise<FollowUpSequence[]> {
    return await db.select().from(followUpSequences)
      .where(and(
        eq(followUpSequences.dealershipId, dealershipId),
        eq(followUpSequences.isActive, true)
      ))
      .orderBy(followUpSequences.name);
  }
  
  async getFollowUpSequenceById(id: number, dealershipId: number): Promise<FollowUpSequence | undefined> {
    const result = await db.select().from(followUpSequences)
      .where(and(
        eq(followUpSequences.id, id),
        eq(followUpSequences.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }
  
  async createFollowUpSequence(sequence: InsertFollowUpSequence): Promise<FollowUpSequence> {
    if (!sequence.dealershipId) {
      throw new Error('dealershipId is required when creating follow-up sequences');
    }
    const result = await db.insert(followUpSequences).values(sequence).returning();
    return result[0];
  }
  
  async updateFollowUpSequence(id: number, dealershipId: number, sequence: Partial<InsertFollowUpSequence>): Promise<FollowUpSequence | undefined> {
    const result = await db.update(followUpSequences)
      .set({ ...sequence, updatedAt: new Date() })
      .where(and(
        eq(followUpSequences.id, id),
        eq(followUpSequences.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async deleteFollowUpSequence(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(followUpSequences)
      .where(and(
        eq(followUpSequences.id, id),
        eq(followUpSequences.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }
  
  // Follow-up Queue
  async getFollowUpQueueItems(dealershipId: number, status?: string, limit: number = 50): Promise<FollowUpQueue[]> {
    const conditions = [eq(followUpQueue.dealershipId, dealershipId)];
    if (status) {
      conditions.push(eq(followUpQueue.status, status));
    }
    return await db.select().from(followUpQueue)
      .where(and(...conditions))
      .orderBy(followUpQueue.nextSendAt)
      .limit(limit);
  }
  
  async getFollowUpQueueById(id: number, dealershipId: number): Promise<FollowUpQueue | undefined> {
    const result = await db.select().from(followUpQueue)
      .where(and(
        eq(followUpQueue.id, id),
        eq(followUpQueue.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }
  
  async getPendingFollowUpsByContact(dealershipId: number, contactPhone: string): Promise<FollowUpQueue[]> {
    return await db.select().from(followUpQueue)
      .where(and(
        eq(followUpQueue.dealershipId, dealershipId),
        eq(followUpQueue.contactPhone, contactPhone),
        eq(followUpQueue.status, 'pending')
      ))
      .orderBy(followUpQueue.nextSendAt);
  }
  
  async getDueFollowUpItems(dealershipId: number, limit: number = 100): Promise<FollowUpQueue[]> {
    return await db.select().from(followUpQueue)
      .where(and(
        eq(followUpQueue.dealershipId, dealershipId),
        eq(followUpQueue.status, 'pending'),
        lte(followUpQueue.nextSendAt, new Date())
      ))
      .orderBy(followUpQueue.nextSendAt)
      .limit(limit);
  }
  
  async createFollowUpQueueItem(item: InsertFollowUpQueue): Promise<FollowUpQueue> {
    if (!item.dealershipId) {
      throw new Error('dealershipId is required when creating follow-up queue items');
    }
    const result = await db.insert(followUpQueue).values(item).returning();
    return result[0];
  }
  
  async updateFollowUpQueueItem(id: number, dealershipId: number, item: Partial<InsertFollowUpQueue>): Promise<FollowUpQueue | undefined> {
    const result = await db.update(followUpQueue)
      .set({ ...item, updatedAt: new Date() })
      .where(and(
        eq(followUpQueue.id, id),
        eq(followUpQueue.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async deleteFollowUpQueueItem(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(followUpQueue)
      .where(and(
        eq(followUpQueue.id, id),
        eq(followUpQueue.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }
  
  // Price Watches
  async getPriceWatches(dealershipId: number, vehicleId?: number): Promise<PriceWatch[]> {
    const conditions = [eq(priceWatches.dealershipId, dealershipId)];
    if (vehicleId) {
      conditions.push(eq(priceWatches.vehicleId, vehicleId));
    }
    return await db.select().from(priceWatches)
      .where(and(...conditions))
      .orderBy(desc(priceWatches.createdAt));
  }
  
  async getActivePriceWatches(dealershipId: number): Promise<PriceWatch[]> {
    return await db.select().from(priceWatches)
      .where(and(
        eq(priceWatches.dealershipId, dealershipId),
        eq(priceWatches.isActive, true)
      ))
      .orderBy(desc(priceWatches.createdAt));
  }
  
  async getPriceWatchesByVehicle(dealershipId: number, vehicleId: number): Promise<PriceWatch[]> {
    return await db.select().from(priceWatches)
      .where(and(
        eq(priceWatches.dealershipId, dealershipId),
        eq(priceWatches.vehicleId, vehicleId),
        eq(priceWatches.isActive, true)
      ));
  }
  
  async getPriceWatchById(id: number, dealershipId: number): Promise<PriceWatch | undefined> {
    const result = await db.select().from(priceWatches)
      .where(and(
        eq(priceWatches.id, id),
        eq(priceWatches.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }
  
  async getPriceWatchByContact(dealershipId: number, vehicleId: number, contactPhone: string): Promise<PriceWatch | undefined> {
    const result = await db.select().from(priceWatches)
      .where(and(
        eq(priceWatches.dealershipId, dealershipId),
        eq(priceWatches.vehicleId, vehicleId),
        eq(priceWatches.contactPhone, contactPhone)
      ))
      .limit(1);
    return result[0];
  }
  
  async createPriceWatch(watch: InsertPriceWatch): Promise<PriceWatch> {
    if (!watch.dealershipId) {
      throw new Error('dealershipId is required when creating price watches');
    }
    const result = await db.insert(priceWatches).values(watch).returning();
    return result[0];
  }
  
  async updatePriceWatch(id: number, dealershipId: number, watch: Partial<InsertPriceWatch>): Promise<PriceWatch | undefined> {
    const result = await db.update(priceWatches)
      .set({ ...watch, updatedAt: new Date() })
      .where(and(
        eq(priceWatches.id, id),
        eq(priceWatches.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async deletePriceWatch(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(priceWatches)
      .where(and(
        eq(priceWatches.id, id),
        eq(priceWatches.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }
  
  async incrementPriceWatchViewCount(id: number, dealershipId: number): Promise<void> {
    await db.update(priceWatches)
      .set({ 
        viewCount: sql`${priceWatches.viewCount} + 1`,
        updatedAt: new Date()
      })
      .where(and(
        eq(priceWatches.id, id),
        eq(priceWatches.dealershipId, dealershipId)
      ));
  }
  
  async getPriceWatchesWithPriceDrops(dealershipId: number): Promise<(PriceWatch & { vehicle: Vehicle; dropPercent: number })[]> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const activePriceWatches = await db.select()
      .from(priceWatches)
      .innerJoin(vehicles, and(
        eq(priceWatches.vehicleId, vehicles.id),
        eq(vehicles.dealershipId, dealershipId)
      ))
      .where(and(
        eq(priceWatches.dealershipId, dealershipId),
        eq(priceWatches.isActive, true),
        eq(priceWatches.notifyOnPriceDrop, true),
        gt(priceWatches.priceWhenSubscribed, 0),
        or(
          sql`${priceWatches.lastNotifiedAt} IS NULL`,
          lt(priceWatches.lastNotifiedAt, twentyFourHoursAgo)
        )
      ));
    
    const result: (PriceWatch & { vehicle: Vehicle; dropPercent: number })[] = [];
    
    for (const row of activePriceWatches) {
      const watch = row.price_watches;
      const vehicle = row.vehicles;
      
      const currentPrice = vehicle.price;
      const originalPrice = watch.priceWhenSubscribed!;
      
      if (currentPrice >= originalPrice) continue;
      
      const dropPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
      const minDropPercent = watch.minPriceDropPercent || 5;
      
      if (dropPercent < minDropPercent) continue;
      
      result.push({
        ...watch,
        vehicle,
        dropPercent
      });
    }
    
    return result;
  }
  
  // Competitor Price Alerts
  async getCompetitorPriceAlerts(dealershipId: number, filters?: { status?: string; severity?: string; vehicleId?: number }, limit: number = 50): Promise<CompetitorPriceAlert[]> {
    const conditions = [eq(competitorPriceAlerts.dealershipId, dealershipId)];
    if (filters?.status) {
      conditions.push(eq(competitorPriceAlerts.status, filters.status));
    }
    if (filters?.severity) {
      conditions.push(eq(competitorPriceAlerts.severity, filters.severity));
    }
    if (filters?.vehicleId) {
      conditions.push(eq(competitorPriceAlerts.vehicleId, filters.vehicleId));
    }
    return await db.select().from(competitorPriceAlerts)
      .where(and(...conditions))
      .orderBy(desc(competitorPriceAlerts.detectedAt))
      .limit(limit);
  }
  
  async getCompetitorPriceAlertById(id: number, dealershipId: number): Promise<CompetitorPriceAlert | undefined> {
    const result = await db.select().from(competitorPriceAlerts)
      .where(and(
        eq(competitorPriceAlerts.id, id),
        eq(competitorPriceAlerts.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }
  
  async createCompetitorPriceAlert(alert: InsertCompetitorPriceAlert): Promise<CompetitorPriceAlert> {
    if (!alert.dealershipId) {
      throw new Error('dealershipId is required when creating competitor price alerts');
    }
    const result = await db.insert(competitorPriceAlerts).values(alert).returning();
    return result[0];
  }
  
  async updateCompetitorPriceAlert(id: number, dealershipId: number, alert: Partial<InsertCompetitorPriceAlert>): Promise<CompetitorPriceAlert | undefined> {
    const result = await db.update(competitorPriceAlerts)
      .set(alert)
      .where(and(
        eq(competitorPriceAlerts.id, id),
        eq(competitorPriceAlerts.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async acknowledgeCompetitorPriceAlert(id: number, dealershipId: number, userId: number): Promise<CompetitorPriceAlert | undefined> {
    const result = await db.update(competitorPriceAlerts)
      .set({ 
        status: 'acknowledged', 
        acknowledgedBy: userId,
        acknowledgedAt: new Date()
      })
      .where(and(
        eq(competitorPriceAlerts.id, id),
        eq(competitorPriceAlerts.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async resolveCompetitorPriceAlert(id: number, dealershipId: number, note?: string): Promise<CompetitorPriceAlert | undefined> {
    const result = await db.update(competitorPriceAlerts)
      .set({ 
        status: 'resolved', 
        resolvedAt: new Date(),
        resolutionNote: note
      })
      .where(and(
        eq(competitorPriceAlerts.id, id),
        eq(competitorPriceAlerts.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  // Automation Logs
  async getAutomationLogs(dealershipId: number, filters?: { automationType?: string; actionType?: string; startDate?: Date; endDate?: Date }, limit: number = 100): Promise<AutomationLog[]> {
    const conditions = [eq(automationLogs.dealershipId, dealershipId)];
    if (filters?.automationType) {
      conditions.push(eq(automationLogs.automationType, filters.automationType));
    }
    if (filters?.actionType) {
      conditions.push(eq(automationLogs.actionType, filters.actionType));
    }
    if (filters?.startDate) {
      conditions.push(gte(automationLogs.executedAt, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(automationLogs.executedAt, filters.endDate));
    }
    return await db.select().from(automationLogs)
      .where(and(...conditions))
      .orderBy(desc(automationLogs.executedAt))
      .limit(limit);
  }
  
  async createAutomationLog(log: InsertAutomationLog): Promise<AutomationLog> {
    if (!log.dealershipId) {
      throw new Error('dealershipId is required when creating automation logs');
    }
    const result = await db.insert(automationLogs).values(log).returning();
    return result[0];
  }
  
  // Appointment Reminders
  async getAppointmentReminders(dealershipId: number, status?: string): Promise<AppointmentReminder[]> {
    const conditions = [eq(appointmentReminders.dealershipId, dealershipId)];
    if (status) {
      conditions.push(eq(appointmentReminders.status, status));
    }
    return await db.select().from(appointmentReminders)
      .where(and(...conditions))
      .orderBy(appointmentReminders.scheduledSendAt);
  }
  
  async getDueAppointmentReminders(dealershipId: number, limit: number = 100): Promise<AppointmentReminder[]> {
    return await db.select().from(appointmentReminders)
      .where(and(
        eq(appointmentReminders.dealershipId, dealershipId),
        eq(appointmentReminders.status, 'pending'),
        lte(appointmentReminders.scheduledSendAt, new Date())
      ))
      .orderBy(appointmentReminders.scheduledSendAt)
      .limit(limit);
  }
  
  async getAppointmentRemindersByAppointment(dealershipId: number, appointmentId: string): Promise<AppointmentReminder[]> {
    return await db.select().from(appointmentReminders)
      .where(and(
        eq(appointmentReminders.dealershipId, dealershipId),
        eq(appointmentReminders.appointmentId, appointmentId)
      ))
      .orderBy(appointmentReminders.scheduledSendAt);
  }
  
  async createAppointmentReminder(reminder: InsertAppointmentReminder): Promise<AppointmentReminder> {
    if (!reminder.dealershipId) {
      throw new Error('dealershipId is required when creating appointment reminders');
    }
    const result = await db.insert(appointmentReminders).values(reminder).returning();
    return result[0];
  }
  
  async updateAppointmentReminder(id: number, dealershipId: number, reminder: Partial<InsertAppointmentReminder>): Promise<AppointmentReminder | undefined> {
    const result = await db.update(appointmentReminders)
      .set({ ...reminder, updatedAt: new Date() })
      .where(and(
        eq(appointmentReminders.id, id),
        eq(appointmentReminders.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async lockAppointmentReminderForProcessing(id: number, dealershipId: number): Promise<AppointmentReminder | undefined> {
    const result = await db.update(appointmentReminders)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(and(
        eq(appointmentReminders.id, id),
        eq(appointmentReminders.dealershipId, dealershipId),
        eq(appointmentReminders.status, 'pending')
      ))
      .returning();
    return result[0];
  }
  
  async deleteAppointmentReminder(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(appointmentReminders)
      .where(and(
        eq(appointmentReminders.id, id),
        eq(appointmentReminders.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }

  // ====== SEQUENCE ANALYTICS & RE-ENGAGEMENT ======
  
  // Sequence Executions
  async getSequenceExecutions(dealershipId: number, sequenceId?: number, status?: string, limit: number = 100): Promise<SequenceExecution[]> {
    const conditions = [eq(sequenceExecutions.dealershipId, dealershipId)];
    if (sequenceId) conditions.push(eq(sequenceExecutions.sequenceId, sequenceId));
    if (status) conditions.push(eq(sequenceExecutions.status, status));
    
    return await db.select().from(sequenceExecutions)
      .where(and(...conditions))
      .orderBy(desc(sequenceExecutions.startedAt))
      .limit(limit);
  }

  async getSequenceExecutionById(id: number, dealershipId: number): Promise<SequenceExecution | undefined> {
    const result = await db.select().from(sequenceExecutions)
      .where(and(
        eq(sequenceExecutions.id, id),
        eq(sequenceExecutions.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async getActiveExecutionsByContact(dealershipId: number, contactPhone: string): Promise<SequenceExecution[]> {
    return await db.select().from(sequenceExecutions)
      .where(and(
        eq(sequenceExecutions.dealershipId, dealershipId),
        eq(sequenceExecutions.contactPhone, contactPhone),
        eq(sequenceExecutions.status, 'active')
      ));
  }

  async createSequenceExecution(execution: InsertSequenceExecution): Promise<SequenceExecution> {
    if (!execution.dealershipId) {
      throw new Error('dealershipId is required when creating sequence executions');
    }
    const result = await db.insert(sequenceExecutions).values(execution).returning();
    return result[0];
  }

  async updateSequenceExecution(id: number, dealershipId: number, execution: Partial<InsertSequenceExecution>): Promise<SequenceExecution | undefined> {
    const result = await db.update(sequenceExecutions)
      .set({ ...execution, lastActivityAt: new Date() })
      .where(and(
        eq(sequenceExecutions.id, id),
        eq(sequenceExecutions.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async incrementExecutionMetric(id: number, dealershipId: number, metric: 'messagesDelivered' | 'messagesOpened' | 'responsesReceived' | 'appointmentsBooked'): Promise<void> {
    await db.update(sequenceExecutions)
      .set({ 
        [metric]: sql`${sequenceExecutions[metric]} + 1`,
        lastActivityAt: new Date()
      })
      .where(and(
        eq(sequenceExecutions.id, id),
        eq(sequenceExecutions.dealershipId, dealershipId)
      ));
  }

  // Sequence Messages
  async getSequenceMessages(dealershipId: number, executionId: number): Promise<SequenceMessage[]> {
    return await db.select().from(sequenceMessages)
      .where(and(
        eq(sequenceMessages.dealershipId, dealershipId),
        eq(sequenceMessages.executionId, executionId)
      ))
      .orderBy(sequenceMessages.stepNumber);
  }

  async getSequenceMessageById(id: number, dealershipId: number): Promise<SequenceMessage | undefined> {
    const result = await db.select().from(sequenceMessages)
      .where(and(
        eq(sequenceMessages.id, id),
        eq(sequenceMessages.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async getPendingSequenceMessages(dealershipId: number, limit: number = 50): Promise<SequenceMessage[]> {
    return await db.select().from(sequenceMessages)
      .where(and(
        eq(sequenceMessages.dealershipId, dealershipId),
        eq(sequenceMessages.status, 'pending'),
        lte(sequenceMessages.scheduledAt, new Date())
      ))
      .orderBy(sequenceMessages.scheduledAt)
      .limit(limit);
  }

  async createSequenceMessage(message: InsertSequenceMessage): Promise<SequenceMessage> {
    if (!message.dealershipId) {
      throw new Error('dealershipId is required when creating sequence messages');
    }
    const result = await db.insert(sequenceMessages).values(message).returning();
    return result[0];
  }

  async updateSequenceMessage(id: number, dealershipId: number, message: Partial<InsertSequenceMessage>): Promise<SequenceMessage | undefined> {
    const result = await db.update(sequenceMessages)
      .set(message)
      .where(and(
        eq(sequenceMessages.id, id),
        eq(sequenceMessages.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  // Sequence Conversions
  async getSequenceConversions(dealershipId: number, sequenceId?: number, startDate?: Date, endDate?: Date): Promise<SequenceConversion[]> {
    const conditions = [eq(sequenceConversions.dealershipId, dealershipId)];
    if (sequenceId) conditions.push(eq(sequenceConversions.sequenceId, sequenceId));
    if (startDate) conditions.push(gte(sequenceConversions.convertedAt, startDate));
    if (endDate) conditions.push(lte(sequenceConversions.convertedAt, endDate));
    
    return await db.select().from(sequenceConversions)
      .where(and(...conditions))
      .orderBy(desc(sequenceConversions.convertedAt));
  }

  async createSequenceConversion(conversion: InsertSequenceConversion): Promise<SequenceConversion> {
    if (!conversion.dealershipId) {
      throw new Error('dealershipId is required when creating sequence conversions');
    }
    const result = await db.insert(sequenceConversions).values(conversion).returning();
    return result[0];
  }

  // Contact Activity
  async getContactActivity(dealershipId: number, contactPhone?: string, contactEmail?: string): Promise<ContactActivity | undefined> {
    const conditions = [eq(contactActivity.dealershipId, dealershipId)];
    if (contactPhone) conditions.push(eq(contactActivity.contactPhone, contactPhone));
    if (contactEmail) conditions.push(eq(contactActivity.contactEmail, contactEmail));
    
    const result = await db.select().from(contactActivity)
      .where(and(...conditions))
      .limit(1);
    return result[0];
  }

  async getInactiveContacts(dealershipId: number, inactiveDays: number, limit: number = 50): Promise<ContactActivity[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);
    
    return await db.select().from(contactActivity)
      .where(and(
        eq(contactActivity.dealershipId, dealershipId),
        lt(contactActivity.lastActivityAt, cutoffDate),
        eq(contactActivity.reengagementStatus, 'cold')
      ))
      .orderBy(contactActivity.lastActivityAt)
      .limit(limit);
  }

  async getAllContactActivity(dealershipId: number, limit: number = 100, offset: number = 0): Promise<{ contacts: ContactActivity[]; total: number }> {
    const contacts = await db.select().from(contactActivity)
      .where(eq(contactActivity.dealershipId, dealershipId))
      .orderBy(desc(contactActivity.lastActivityAt))
      .limit(limit)
      .offset(offset);
    
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(contactActivity)
      .where(eq(contactActivity.dealershipId, dealershipId));
    
    return { contacts, total: Number(countResult[0]?.count || 0) };
  }

  async upsertContactActivity(activity: InsertContactActivity): Promise<ContactActivity> {
    if (!activity.dealershipId) {
      throw new Error('dealershipId is required when creating contact activity');
    }
    
    const existing = await this.getContactActivity(
      activity.dealershipId,
      activity.contactPhone || undefined,
      activity.contactEmail || undefined
    );
    
    if (existing) {
      const result = await db.update(contactActivity)
        .set({
          ...activity,
          totalVehicleViews: (existing.totalVehicleViews || 0) + (activity.totalVehicleViews || 0),
          totalChatSessions: (existing.totalChatSessions || 0) + (activity.totalChatSessions || 0),
          totalAppointments: (existing.totalAppointments || 0) + (activity.totalAppointments || 0),
          updatedAt: new Date()
        })
        .where(eq(contactActivity.id, existing.id))
        .returning();
      return result[0];
    }
    
    const result = await db.insert(contactActivity).values(activity).returning();
    return result[0];
  }

  async updateContactActivity(id: number, dealershipId: number, activity: Partial<InsertContactActivity>): Promise<ContactActivity | undefined> {
    const result = await db.update(contactActivity)
      .set({ ...activity, updatedAt: new Date() })
      .where(and(
        eq(contactActivity.id, id),
        eq(contactActivity.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  // Re-engagement Campaigns
  async getReengagementCampaigns(dealershipId: number): Promise<ReengagementCampaign[]> {
    return await db.select().from(reengagementCampaigns)
      .where(eq(reengagementCampaigns.dealershipId, dealershipId))
      .orderBy(desc(reengagementCampaigns.createdAt));
  }

  async getActiveReengagementCampaigns(dealershipId: number): Promise<ReengagementCampaign[]> {
    return await db.select().from(reengagementCampaigns)
      .where(and(
        eq(reengagementCampaigns.dealershipId, dealershipId),
        eq(reengagementCampaigns.isActive, true)
      ))
      .orderBy(reengagementCampaigns.name);
  }

  async getReengagementCampaignById(id: number, dealershipId: number): Promise<ReengagementCampaign | undefined> {
    const result = await db.select().from(reengagementCampaigns)
      .where(and(
        eq(reengagementCampaigns.id, id),
        eq(reengagementCampaigns.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }

  async getDueReengagementCampaigns(): Promise<ReengagementCampaign[]> {
    return await db.select().from(reengagementCampaigns)
      .where(and(
        eq(reengagementCampaigns.isActive, true),
        or(
          lte(reengagementCampaigns.nextRunAt, new Date()),
          sql`${reengagementCampaigns.nextRunAt} IS NULL`
        )
      ));
  }

  async createReengagementCampaign(campaign: InsertReengagementCampaign): Promise<ReengagementCampaign> {
    if (!campaign.dealershipId) {
      throw new Error('dealershipId is required when creating re-engagement campaigns');
    }
    const result = await db.insert(reengagementCampaigns).values(campaign).returning();
    return result[0];
  }

  async updateReengagementCampaign(id: number, dealershipId: number, campaign: Partial<InsertReengagementCampaign>): Promise<ReengagementCampaign | undefined> {
    const result = await db.update(reengagementCampaigns)
      .set({ ...campaign, updatedAt: new Date() })
      .where(and(
        eq(reengagementCampaigns.id, id),
        eq(reengagementCampaigns.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }

  async deleteReengagementCampaign(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(reengagementCampaigns)
      .where(and(
        eq(reengagementCampaigns.id, id),
        eq(reengagementCampaigns.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }

  // Sequence Analytics
  async getSequenceAnalytics(dealershipId: number, sequenceId?: number, startDate?: Date, endDate?: Date): Promise<SequenceAnalytics[]> {
    const conditions = [eq(sequenceAnalytics.dealershipId, dealershipId)];
    if (sequenceId) conditions.push(eq(sequenceAnalytics.sequenceId, sequenceId));
    if (startDate) conditions.push(gte(sequenceAnalytics.date, startDate));
    if (endDate) conditions.push(lte(sequenceAnalytics.date, endDate));
    
    return await db.select().from(sequenceAnalytics)
      .where(and(...conditions))
      .orderBy(desc(sequenceAnalytics.date));
  }

  async upsertSequenceAnalytics(analytics: InsertSequenceAnalytics): Promise<SequenceAnalytics> {
    if (!analytics.dealershipId) {
      throw new Error('dealershipId is required when creating sequence analytics');
    }
    
    const dateStart = new Date(analytics.date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(dateStart);
    dateEnd.setHours(23, 59, 59, 999);
    
    const existing = await db.select().from(sequenceAnalytics)
      .where(and(
        eq(sequenceAnalytics.dealershipId, analytics.dealershipId),
        eq(sequenceAnalytics.sequenceId, analytics.sequenceId),
        gte(sequenceAnalytics.date, dateStart),
        lte(sequenceAnalytics.date, dateEnd)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      const result = await db.update(sequenceAnalytics)
        .set(analytics)
        .where(eq(sequenceAnalytics.id, existing[0].id))
        .returning();
      return result[0];
    }
    
    const result = await db.insert(sequenceAnalytics).values(analytics).returning();
    return result[0];
  }

  async getSequencePerformanceSummary(dealershipId: number, startDate?: Date, endDate?: Date): Promise<{
    totalExecutions: number;
    totalConversions: number;
    totalMessagesSent: number;
    averageOpenRate: number;
    averageReplyRate: number;
    averageConversionRate: number;
    topPerformingSequences: { sequenceId: number; name: string; conversionRate: number }[];
  }> {
    const conditions = [eq(sequenceAnalytics.dealershipId, dealershipId)];
    if (startDate) conditions.push(gte(sequenceAnalytics.date, startDate));
    if (endDate) conditions.push(lte(sequenceAnalytics.date, endDate));
    
    const aggregates = await db.select({
      totalExecutions: sql<number>`COALESCE(SUM(${sequenceAnalytics.executionsStarted}), 0)`,
      totalConversions: sql<number>`COALESCE(SUM(${sequenceAnalytics.executionsConverted}), 0)`,
      totalMessagesSent: sql<number>`COALESCE(SUM(${sequenceAnalytics.messagesSent}), 0)`,
      totalMessagesDelivered: sql<number>`COALESCE(SUM(${sequenceAnalytics.messagesDelivered}), 0)`,
      totalMessagesOpened: sql<number>`COALESCE(SUM(${sequenceAnalytics.messagesOpened}), 0)`,
      totalMessagesReplied: sql<number>`COALESCE(SUM(${sequenceAnalytics.messagesReplied}), 0)`,
    }).from(sequenceAnalytics).where(and(...conditions));
    
    const stats = aggregates[0] || {
      totalExecutions: 0,
      totalConversions: 0,
      totalMessagesSent: 0,
      totalMessagesDelivered: 0,
      totalMessagesOpened: 0,
      totalMessagesReplied: 0
    };
    
    const avgOpenRate = stats.totalMessagesDelivered > 0 
      ? (Number(stats.totalMessagesOpened) / Number(stats.totalMessagesDelivered)) * 100 
      : 0;
    const avgReplyRate = stats.totalMessagesDelivered > 0 
      ? (Number(stats.totalMessagesReplied) / Number(stats.totalMessagesDelivered)) * 100 
      : 0;
    const avgConversionRate = Number(stats.totalExecutions) > 0 
      ? (Number(stats.totalConversions) / Number(stats.totalExecutions)) * 100 
      : 0;
    
    const topSequences = await db.select({
      sequenceId: sequenceAnalytics.sequenceId,
      totalStarted: sql<number>`COALESCE(SUM(${sequenceAnalytics.executionsStarted}), 0)`,
      totalConverted: sql<number>`COALESCE(SUM(${sequenceAnalytics.executionsConverted}), 0)`,
    })
    .from(sequenceAnalytics)
    .where(and(...conditions))
    .groupBy(sequenceAnalytics.sequenceId)
    .orderBy(sql`CASE WHEN SUM(${sequenceAnalytics.executionsStarted}) > 0 THEN SUM(${sequenceAnalytics.executionsConverted})::float / SUM(${sequenceAnalytics.executionsStarted}) ELSE 0 END DESC`)
    .limit(5);
    
    const sequenceIds = topSequences.map(s => s.sequenceId);
    const sequenceNames = sequenceIds.length > 0 
      ? await db.select({ id: followUpSequences.id, name: followUpSequences.name })
          .from(followUpSequences)
          .where(inArray(followUpSequences.id, sequenceIds))
      : [];
    
    const sequenceNameMap = new Map(sequenceNames.map(s => [s.id, s.name]));
    
    return {
      totalExecutions: Number(stats.totalExecutions),
      totalConversions: Number(stats.totalConversions),
      totalMessagesSent: Number(stats.totalMessagesSent),
      averageOpenRate: Math.round(avgOpenRate * 10) / 10,
      averageReplyRate: Math.round(avgReplyRate * 10) / 10,
      averageConversionRate: Math.round(avgConversionRate * 10) / 10,
      topPerformingSequences: topSequences.map(s => ({
        sequenceId: s.sequenceId,
        name: sequenceNameMap.get(s.sequenceId) || 'Unknown',
        conversionRate: Number(s.totalStarted) > 0 
          ? Math.round((Number(s.totalConverted) / Number(s.totalStarted)) * 1000) / 10 
          : 0
      }))
    };
  }
  
  // ====== VEHICLE APPRAISALS ======
  async getVehicleAppraisals(dealershipId: number, filters?: { status?: string; search?: string; createdBy?: number }, limit: number = 50, offset: number = 0): Promise<{ appraisals: VehicleAppraisal[]; total: number }> {
    const conditions: SQL[] = [eq(vehicleAppraisals.dealershipId, dealershipId)];
    
    if (filters?.status) {
      conditions.push(eq(vehicleAppraisals.status, filters.status));
    }
    
    if (filters?.createdBy) {
      conditions.push(eq(vehicleAppraisals.createdBy, filters.createdBy));
    }
    
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(or(
        ilike(vehicleAppraisals.vin, searchTerm),
        ilike(vehicleAppraisals.make, searchTerm),
        ilike(vehicleAppraisals.model, searchTerm)
      )!);
    }
    
    const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];
    
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(vehicleAppraisals)
      .where(whereClause);
    
    const appraisals = await db.select()
      .from(vehicleAppraisals)
      .where(whereClause)
      .orderBy(desc(vehicleAppraisals.updatedAt))
      .limit(limit)
      .offset(offset);
    
    return { appraisals, total: Number(countResult[0]?.count || 0) };
  }
  
  async getAppraisalStats(dealershipId: number): Promise<{ purchased: number; passed: number; lookToBookRatio: string; totalQuoted: number; totalActual: number; accuracyVariance: number }> {
    const result = await db.select({
      purchased: sql<number>`COUNT(*) FILTER (WHERE ${vehicleAppraisals.status} = 'purchased')`,
      passed: sql<number>`COUNT(*) FILTER (WHERE ${vehicleAppraisals.status} = 'passed')`,
      totalQuoted: sql<number>`COALESCE(SUM(${vehicleAppraisals.quotedPrice}), 0)`,
      totalActual: sql<number>`COALESCE(SUM(${vehicleAppraisals.actualSalePrice}) FILTER (WHERE ${vehicleAppraisals.status} = 'purchased'), 0)`,
    })
    .from(vehicleAppraisals)
    .where(eq(vehicleAppraisals.dealershipId, dealershipId));
    
    const stats = result[0];
    const purchased = Number(stats?.purchased || 0);
    const passed = Number(stats?.passed || 0);
    const totalDecided = purchased + passed;
    const lookToBookRatio = totalDecided > 0 ? ((purchased / totalDecided) * 100).toFixed(1) : "0";
    const totalQuoted = Number(stats?.totalQuoted || 0);
    const totalActual = Number(stats?.totalActual || 0);
    const accuracyVariance = totalQuoted > 0 ? ((totalActual - totalQuoted) / totalQuoted * 100) : 0;
    
    return { purchased, passed, lookToBookRatio, totalQuoted, totalActual, accuracyVariance };
  }
  
  async getMissedTradesStats(dealershipId: number): Promise<{ 
    totalMissed: number; 
    totalLostValue: number;
    byReason: { reason: string; count: number; totalValue: number }[];
    recentMissed: { id: number; vin: string; year: number; make: string; model: string; quotedPrice: number; missedReason: string; missedNotes: string | null; createdAt: Date }[];
  }> {
    const missedAppraisals = await db.select()
      .from(vehicleAppraisals)
      .where(and(
        eq(vehicleAppraisals.dealershipId, dealershipId),
        eq(vehicleAppraisals.status, 'passed')
      ))
      .orderBy(desc(vehicleAppraisals.createdAt));
    
    const totalMissed = missedAppraisals.length;
    const totalLostValue = missedAppraisals.reduce((sum, a) => sum + (a.quotedPrice || 0), 0);
    
    const reasonCounts: Record<string, { count: number; totalValue: number }> = {};
    for (const appraisal of missedAppraisals) {
      const reason = appraisal.missedReason || 'other';
      if (!reasonCounts[reason]) {
        reasonCounts[reason] = { count: 0, totalValue: 0 };
      }
      reasonCounts[reason].count++;
      reasonCounts[reason].totalValue += appraisal.quotedPrice || 0;
    }
    
    const byReason = Object.entries(reasonCounts).map(([reason, data]) => ({
      reason,
      count: data.count,
      totalValue: data.totalValue,
    })).sort((a, b) => b.count - a.count);
    
    const recentMissed = missedAppraisals.slice(0, 10).map(a => ({
      id: a.id,
      vin: a.vin,
      year: a.year ?? 0,
      make: a.make ?? 'Unknown',
      model: a.model ?? 'Unknown',
      quotedPrice: a.quotedPrice || 0,
      missedReason: a.missedReason || 'other',
      missedNotes: a.missedNotes,
      createdAt: a.createdAt,
    }));
    
    return { totalMissed, totalLostValue, byReason, recentMissed };
  }
  
  async getAppraisalAccuracyReport(dealershipId: number): Promise<{
    totalPurchased: number;
    averageVariance: number;
    overPaidCount: number;
    underPaidCount: number;
    exactCount: number;
    totalOverpaid: number;
    totalUnderpaid: number;
    monthlyTrend: { month: string; avgVariance: number; count: number }[];
    recentPurchases: { id: number; vin: string; year: number; make: string; model: string; quotedPrice: number; actualSalePrice: number; variance: number; createdAt: Date }[];
  }> {
    const purchasedAppraisals = await db.select()
      .from(vehicleAppraisals)
      .where(and(
        eq(vehicleAppraisals.dealershipId, dealershipId),
        eq(vehicleAppraisals.status, 'purchased'),
        isNotNull(vehicleAppraisals.actualSalePrice),
        isNotNull(vehicleAppraisals.quotedPrice)
      ))
      .orderBy(desc(vehicleAppraisals.createdAt));
    
    const totalPurchased = purchasedAppraisals.length;
    
    let totalVariance = 0;
    let overPaidCount = 0;
    let underPaidCount = 0;
    let exactCount = 0;
    let totalOverpaid = 0;
    let totalUnderpaid = 0;
    
    const monthlyData: Record<string, { totalVariance: number; count: number }> = {};
    
    for (const appraisal of purchasedAppraisals) {
      const quoted = appraisal.quotedPrice || 0;
      const actual = appraisal.actualSalePrice || 0;
      const variance = quoted > 0 ? ((actual - quoted) / quoted) * 100 : 0;
      const diff = actual - quoted;
      
      totalVariance += variance;
      
      if (diff > 100) { // More than $1 overpaid (in cents)
        overPaidCount++;
        totalOverpaid += diff;
      } else if (diff < -100) { // More than $1 underpaid (in cents)
        underPaidCount++;
        totalUnderpaid += Math.abs(diff);
      } else {
        exactCount++;
      }
      
      const monthKey = appraisal.createdAt.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { totalVariance: 0, count: 0 };
      }
      monthlyData[monthKey].totalVariance += variance;
      monthlyData[monthKey].count++;
    }
    
    const averageVariance = totalPurchased > 0 ? totalVariance / totalPurchased : 0;
    
    const monthlyTrend = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12) // Last 12 months
      .map(([month, data]) => ({
        month,
        avgVariance: data.count > 0 ? data.totalVariance / data.count : 0,
        count: data.count,
      }));
    
    const recentPurchases = purchasedAppraisals.slice(0, 10).map(a => ({
      id: a.id,
      vin: a.vin,
      year: a.year ?? 0,
      make: a.make ?? 'Unknown',
      model: a.model ?? 'Unknown',
      quotedPrice: a.quotedPrice || 0,
      actualSalePrice: a.actualSalePrice || 0,
      variance: a.quotedPrice && a.quotedPrice > 0 
        ? (((a.actualSalePrice || 0) - a.quotedPrice) / a.quotedPrice) * 100 
        : 0,
      createdAt: a.createdAt,
    }));
    
    return {
      totalPurchased,
      averageVariance,
      overPaidCount,
      underPaidCount,
      exactCount,
      totalOverpaid,
      totalUnderpaid,
      monthlyTrend,
      recentPurchases,
    };
  }
  
  async getVehicleAppraisalById(id: number, dealershipId: number): Promise<VehicleAppraisal | undefined> {
    const result = await db.select()
      .from(vehicleAppraisals)
      .where(and(
        eq(vehicleAppraisals.id, id),
        eq(vehicleAppraisals.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }
  
  async getVehicleAppraisalByVin(vin: string, dealershipId: number): Promise<VehicleAppraisal | undefined> {
    const normalizedVin = vin.trim().toUpperCase();
    const result = await db.select()
      .from(vehicleAppraisals)
      .where(and(
        sql`UPPER(${vehicleAppraisals.vin}) = ${normalizedVin}`,
        eq(vehicleAppraisals.dealershipId, dealershipId)
      ))
      .orderBy(desc(vehicleAppraisals.updatedAt))
      .limit(1);
    return result[0];
  }
  
  async searchVehicleAppraisals(dealershipId: number, query: string, limit: number = 20): Promise<VehicleAppraisal[]> {
    const searchTerm = `%${query}%`;
    return await db.select()
      .from(vehicleAppraisals)
      .where(and(
        eq(vehicleAppraisals.dealershipId, dealershipId),
        or(
          ilike(vehicleAppraisals.vin, searchTerm),
          ilike(vehicleAppraisals.make, searchTerm),
          ilike(vehicleAppraisals.model, searchTerm),
          ilike(vehicleAppraisals.notes, searchTerm)
        )
      ))
      .orderBy(desc(vehicleAppraisals.updatedAt))
      .limit(limit);
  }
  
  async createVehicleAppraisal(appraisal: InsertVehicleAppraisal): Promise<VehicleAppraisal> {
    const result = await db.insert(vehicleAppraisals).values(appraisal).returning();
    return result[0];
  }
  
  async updateVehicleAppraisal(id: number, dealershipId: number, appraisal: Partial<InsertVehicleAppraisal>): Promise<VehicleAppraisal | undefined> {
    const result = await db.update(vehicleAppraisals)
      .set({ ...appraisal, updatedAt: new Date() })
      .where(and(
        eq(vehicleAppraisals.id, id),
        eq(vehicleAppraisals.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async deleteVehicleAppraisal(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(vehicleAppraisals)
      .where(and(
        eq(vehicleAppraisals.id, id),
        eq(vehicleAppraisals.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }
  
  // ====== CRM CONTACTS ======
  async getCrmContacts(
    dealershipId: number, 
    filters?: { 
      ownerId?: number;
      status?: string;
      leadSource?: string;
      search?: string;
      tagIds?: number[];
    }, 
    pagination?: { limit?: number; offset?: number }, 
    sorting?: { field?: string; direction?: 'asc' | 'desc' }
  ): Promise<{ contacts: CrmContact[]; total: number }> {
    const conditions: any[] = [eq(crmContacts.dealershipId, dealershipId)];
    
    if (filters?.ownerId) {
      conditions.push(eq(crmContacts.ownerId, filters.ownerId));
    }
    if (filters?.status) {
      conditions.push(eq(crmContacts.status, filters.status));
    }
    if (filters?.leadSource) {
      conditions.push(eq(crmContacts.leadSource, filters.leadSource));
    }
    if (filters?.search) {
      const searchTerm = `%${filters.search}%`;
      conditions.push(
        or(
          ilike(crmContacts.firstName, searchTerm),
          ilike(crmContacts.lastName, searchTerm),
          ilike(crmContacts.email, searchTerm),
          ilike(crmContacts.phone, searchTerm)
        )
      );
    }
    
    const countResult = await db.select({ count: sql<number>`count(*)` })
      .from(crmContacts)
      .where(and(...conditions));
    
    const limit = pagination?.limit || 50;
    const offset = pagination?.offset || 0;
    
    let query = db.select()
      .from(crmContacts)
      .where(and(...conditions))
      .limit(limit)
      .offset(offset);
    
    const contacts = await query.orderBy(desc(crmContacts.createdAt));
    
    return { contacts, total: Number(countResult[0]?.count || 0) };
  }
  
  async getCrmContactById(id: number, dealershipId: number): Promise<CrmContact | undefined> {
    const result = await db.select()
      .from(crmContacts)
      .where(and(
        eq(crmContacts.id, id),
        eq(crmContacts.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }
  
  async createCrmContact(contact: InsertCrmContact): Promise<CrmContact> {
    const result = await db.insert(crmContacts).values(contact).returning();
    return result[0];
  }
  
  async updateCrmContact(id: number, dealershipId: number, contact: Partial<InsertCrmContact>): Promise<CrmContact | undefined> {
    const result = await db.update(crmContacts)
      .set({ ...contact, updatedAt: new Date() })
      .where(and(
        eq(crmContacts.id, id),
        eq(crmContacts.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async deleteCrmContact(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(crmContacts)
      .where(and(
        eq(crmContacts.id, id),
        eq(crmContacts.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }
  
  // ====== CRM TAGS ======
  async getCrmTags(dealershipId: number): Promise<CrmTag[]> {
    return await db.select()
      .from(crmTags)
      .where(eq(crmTags.dealershipId, dealershipId))
      .orderBy(crmTags.name);
  }
  
  async createCrmTag(tag: InsertCrmTag): Promise<CrmTag> {
    const result = await db.insert(crmTags).values(tag).returning();
    return result[0];
  }
  
  async updateCrmTag(id: number, dealershipId: number, tag: Partial<InsertCrmTag>): Promise<CrmTag | undefined> {
    const result = await db.update(crmTags)
      .set(tag)
      .where(and(
        eq(crmTags.id, id),
        eq(crmTags.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async deleteCrmTag(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(crmTags)
      .where(and(
        eq(crmTags.id, id),
        eq(crmTags.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }
  
  async addTagToContact(contactId: number, tagId: number, addedById?: number): Promise<CrmContactTag> {
    const result = await db.insert(crmContactTags).values({
      contactId,
      tagId,
      addedById
    }).returning();
    return result[0];
  }
  
  async removeTagFromContact(contactId: number, tagId: number): Promise<boolean> {
    const result = await db.delete(crmContactTags)
      .where(and(
        eq(crmContactTags.contactId, contactId),
        eq(crmContactTags.tagId, tagId)
      ))
      .returning();
    return result.length > 0;
  }
  
  async getContactTags(contactId: number): Promise<CrmTag[]> {
    const result = await db.select({ tag: crmTags })
      .from(crmContactTags)
      .innerJoin(crmTags, eq(crmContactTags.tagId, crmTags.id))
      .where(eq(crmContactTags.contactId, contactId));
    return result.map(r => r.tag);
  }
  
  // ====== CRM ACTIVITIES ======
  async getCrmActivities(contactId: number, dealershipId: number, limit: number = 50): Promise<CrmActivity[]> {
    return await db.select()
      .from(crmActivities)
      .where(and(
        eq(crmActivities.contactId, contactId),
        eq(crmActivities.dealershipId, dealershipId)
      ))
      .orderBy(desc(crmActivities.createdAt))
      .limit(limit);
  }
  
  async createCrmActivity(activity: InsertCrmActivity): Promise<CrmActivity> {
    const result = await db.insert(crmActivities).values(activity).returning();
    return result[0];
  }
  
  // ====== CRM TASKS ======
  async getCrmTasks(
    dealershipId: number, 
    filters?: {
      assignedToId?: number;
      contactId?: number;
      status?: string;
      priority?: string;
      dueAfter?: Date;
      dueBefore?: Date;
    }, 
    limit: number = 100
  ): Promise<CrmTask[]> {
    const conditions: any[] = [eq(crmTasks.dealershipId, dealershipId)];
    
    if (filters?.assignedToId) {
      conditions.push(eq(crmTasks.assignedToId, filters.assignedToId));
    }
    if (filters?.contactId) {
      conditions.push(eq(crmTasks.contactId, filters.contactId));
    }
    if (filters?.status) {
      conditions.push(eq(crmTasks.status, filters.status));
    }
    if (filters?.priority) {
      conditions.push(eq(crmTasks.priority, filters.priority));
    }
    if (filters?.dueAfter) {
      conditions.push(gte(crmTasks.dueAt, filters.dueAfter));
    }
    if (filters?.dueBefore) {
      conditions.push(lte(crmTasks.dueAt, filters.dueBefore));
    }
    
    return await db.select()
      .from(crmTasks)
      .where(and(...conditions))
      .orderBy(crmTasks.dueAt)
      .limit(limit);
  }
  
  async getCrmTaskById(id: number, dealershipId: number): Promise<CrmTask | undefined> {
    const result = await db.select()
      .from(crmTasks)
      .where(and(
        eq(crmTasks.id, id),
        eq(crmTasks.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }
  
  async createCrmTask(task: InsertCrmTask): Promise<CrmTask> {
    const result = await db.insert(crmTasks).values(task).returning();
    return result[0];
  }
  
  async updateCrmTask(id: number, dealershipId: number, task: Partial<InsertCrmTask>): Promise<CrmTask | undefined> {
    const result = await db.update(crmTasks)
      .set({ ...task, updatedAt: new Date() })
      .where(and(
        eq(crmTasks.id, id),
        eq(crmTasks.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async deleteCrmTask(id: number, dealershipId: number): Promise<boolean> {
    const result = await db.delete(crmTasks)
      .where(and(
        eq(crmTasks.id, id),
        eq(crmTasks.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }
  
  // ====== CRM MESSAGES ======
  async createCrmMessage(message: InsertCrmMessage): Promise<CrmMessage> {
    const result = await db.insert(crmMessages).values(message).returning();
    return result[0];
  }
  
  async updateCrmMessage(id: number, dealershipId: number, message: Partial<InsertCrmMessage>): Promise<CrmMessage | undefined> {
    const result = await db.update(crmMessages)
      .set(message)
      .where(and(
        eq(crmMessages.id, id),
        eq(crmMessages.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async getCrmMessages(contactId: number, dealershipId: number, limit: number = 50): Promise<CrmMessage[]> {
    return await db.select()
      .from(crmMessages)
      .where(and(
        eq(crmMessages.contactId, contactId),
        eq(crmMessages.dealershipId, dealershipId)
      ))
      .orderBy(desc(crmMessages.createdAt))
      .limit(limit);
  }
  
  // ====== CRM MESSAGE TEMPLATES ======
  async getCrmMessageTemplates(dealershipId: number, channel?: string): Promise<CrmMessageTemplate[]> {
    const conditions: any[] = [
      eq(crmMessageTemplates.dealershipId, dealershipId),
      eq(crmMessageTemplates.isActive, true)
    ];
    if (channel) {
      conditions.push(eq(crmMessageTemplates.channel, channel));
    }
    return await db.select()
      .from(crmMessageTemplates)
      .where(and(...conditions))
      .orderBy(desc(crmMessageTemplates.createdAt));
  }
  
  async getCrmMessageTemplateById(id: number, dealershipId: number): Promise<CrmMessageTemplate | undefined> {
    const result = await db.select()
      .from(crmMessageTemplates)
      .where(and(
        eq(crmMessageTemplates.id, id),
        eq(crmMessageTemplates.dealershipId, dealershipId)
      ))
      .limit(1);
    return result[0];
  }
  
  async createCrmMessageTemplate(template: InsertCrmMessageTemplate): Promise<CrmMessageTemplate> {
    if (!template.dealershipId) {
      throw new Error('dealershipId is required when creating message templates');
    }
    const result = await db.insert(crmMessageTemplates).values(template).returning();
    return result[0];
  }
  
  async updateCrmMessageTemplate(id: number, dealershipId: number, template: Partial<InsertCrmMessageTemplate>): Promise<CrmMessageTemplate | undefined> {
    const result = await db.update(crmMessageTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(and(
        eq(crmMessageTemplates.id, id),
        eq(crmMessageTemplates.dealershipId, dealershipId)
      ))
      .returning();
    return result[0];
  }
  
  async deleteCrmMessageTemplate(id: number, dealershipId: number): Promise<boolean> {
    // Soft delete by setting isActive to false
    const result = await db.update(crmMessageTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(crmMessageTemplates.id, id),
        eq(crmMessageTemplates.dealershipId, dealershipId)
      ))
      .returning();
    return result.length > 0;
  }
  
  async incrementTemplateUsage(id: number, dealershipId: number): Promise<void> {
    await db.update(crmMessageTemplates)
      .set({ timesUsed: sql`${crmMessageTemplates.timesUsed} + 1` })
      .where(and(
        eq(crmMessageTemplates.id, id),
        eq(crmMessageTemplates.dealershipId, dealershipId)
      ));
  }
  
  // ====== MESSENGER HELPERS ======
  async getMessengerConversationsByContactFacebookId(dealershipId: number, facebookId: string): Promise<MessengerConversation[]> {
    return await db.select()
      .from(messengerConversations)
      .where(and(
        eq(messengerConversations.dealershipId, dealershipId),
        eq(messengerConversations.participantId, facebookId)
      ));
  }
  
  // ====== CALL SCORING SYSTEM ======
  
  // Templates
  async getCallScoringTemplates(dealershipId: number | null): Promise<CallScoringTemplate[]> {
    if (dealershipId === null) {
      return await db.select()
        .from(callScoringTemplates)
        .where(sql`${callScoringTemplates.dealershipId} IS NULL`)
        .orderBy(callScoringTemplates.department, callScoringTemplates.name);
    }
    return await db.select()
      .from(callScoringTemplates)
      .where(or(
        sql`${callScoringTemplates.dealershipId} IS NULL`,
        eq(callScoringTemplates.dealershipId, dealershipId)
      ))
      .orderBy(callScoringTemplates.department, callScoringTemplates.name);
  }
  
  async getCallScoringTemplate(id: number): Promise<CallScoringTemplate | undefined> {
    const result = await db.select()
      .from(callScoringTemplates)
      .where(eq(callScoringTemplates.id, id))
      .limit(1);
    return result[0];
  }
  
  async createCallScoringTemplate(template: InsertCallScoringTemplate): Promise<CallScoringTemplate> {
    const result = await db.insert(callScoringTemplates).values(template).returning();
    return result[0];
  }
  
  async updateCallScoringTemplate(id: number, template: Partial<InsertCallScoringTemplate>): Promise<CallScoringTemplate | undefined> {
    const result = await db.update(callScoringTemplates)
      .set({ ...template, updatedAt: new Date() })
      .where(eq(callScoringTemplates.id, id))
      .returning();
    return result[0];
  }
  
  async deleteCallScoringTemplate(id: number): Promise<boolean> {
    const result = await db.delete(callScoringTemplates)
      .where(eq(callScoringTemplates.id, id))
      .returning();
    return result.length > 0;
  }
  
  async cloneTemplateForDealership(templateId: number, dealershipId: number, userId: number): Promise<CallScoringTemplate> {
    const originalTemplate = await this.getCallScoringTemplate(templateId);
    if (!originalTemplate) {
      throw new Error('Template not found');
    }
    
    const newTemplate = await this.createCallScoringTemplate({
      dealershipId,
      department: originalTemplate.department,
      name: `${originalTemplate.name} (Custom)`,
      description: originalTemplate.description,
      isActive: true,
      isDefault: false,
      version: 1,
      createdById: userId,
    });
    
    const criteria = await this.getTemplateCriteria(templateId);
    for (const criterion of criteria) {
      await this.createCriterion({
        templateId: newTemplate.id,
        category: criterion.category,
        label: criterion.label,
        description: criterion.description,
        weight: criterion.weight,
        maxScore: criterion.maxScore,
        ratingType: criterion.ratingType,
        sortOrder: criterion.sortOrder,
        aiInstruction: criterion.aiInstruction,
        isRequired: criterion.isRequired,
      });
    }
    
    return newTemplate;
  }
  
  // Criteria
  async getTemplateCriteria(templateId: number): Promise<CallScoringCriterion[]> {
    return await db.select()
      .from(callScoringCriteria)
      .where(eq(callScoringCriteria.templateId, templateId))
      .orderBy(callScoringCriteria.sortOrder, callScoringCriteria.id);
  }
  
  async createCriterion(criterion: InsertCallScoringCriterion): Promise<CallScoringCriterion> {
    const result = await db.insert(callScoringCriteria).values(criterion).returning();
    return result[0];
  }
  
  async updateCriterion(id: number, criterion: Partial<InsertCallScoringCriterion>): Promise<CallScoringCriterion | undefined> {
    const result = await db.update(callScoringCriteria)
      .set(criterion)
      .where(eq(callScoringCriteria.id, id))
      .returning();
    return result[0];
  }
  
  async deleteCriterion(id: number): Promise<boolean> {
    const result = await db.delete(callScoringCriteria)
      .where(eq(callScoringCriteria.id, id))
      .returning();
    return result.length > 0;
  }
  
  async reorderCriteria(templateId: number, criteriaIds: number[]): Promise<void> {
    for (let i = 0; i < criteriaIds.length; i++) {
      await db.update(callScoringCriteria)
        .set({ sortOrder: i })
        .where(and(
          eq(callScoringCriteria.id, criteriaIds[i]),
          eq(callScoringCriteria.templateId, templateId)
        ));
    }
  }
  
  // Scoring Sheets
  async getCallScoringSheet(callRecordingId: number): Promise<CallScoringSheet | undefined> {
    const result = await db.select()
      .from(callScoringSheets)
      .where(eq(callScoringSheets.callRecordingId, callRecordingId))
      .limit(1);
    return result[0];
  }
  
  async getCallScoringSheetWithResponses(callRecordingId: number): Promise<{ sheet: CallScoringSheet; responses: CallScoringResponse[] } | undefined> {
    const sheet = await this.getCallScoringSheet(callRecordingId);
    if (!sheet) return undefined;
    
    const responses = await this.getCallScoringResponses(sheet.id);
    return { sheet, responses };
  }
  
  async createCallScoringSheet(sheet: InsertCallScoringSheet): Promise<CallScoringSheet> {
    const result = await db.insert(callScoringSheets).values(sheet).returning();
    return result[0];
  }
  
  async updateCallScoringSheet(id: number, sheet: Partial<InsertCallScoringSheet>): Promise<CallScoringSheet | undefined> {
    const result = await db.update(callScoringSheets)
      .set({ ...sheet, updatedAt: new Date() })
      .where(eq(callScoringSheets.id, id))
      .returning();
    return result[0];
  }
  
  // Scoring Responses
  async getCallScoringResponses(sheetId: number): Promise<CallScoringResponse[]> {
    return await db.select()
      .from(callScoringResponses)
      .where(eq(callScoringResponses.sheetId, sheetId))
      .orderBy(callScoringResponses.id);
  }
  
  async upsertCallScoringResponse(response: InsertCallScoringResponse): Promise<CallScoringResponse> {
    const existing = await db.select()
      .from(callScoringResponses)
      .where(and(
        eq(callScoringResponses.sheetId, response.sheetId),
        eq(callScoringResponses.criterionId, response.criterionId)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      const result = await db.update(callScoringResponses)
        .set({ ...response, updatedAt: new Date() })
        .where(eq(callScoringResponses.id, existing[0].id))
        .returning();
      return result[0];
    }
    
    const result = await db.insert(callScoringResponses).values(response).returning();
    return result[0];
  }
  
  async bulkUpsertCallScoringResponses(responses: InsertCallScoringResponse[]): Promise<CallScoringResponse[]> {
    const results: CallScoringResponse[] = [];
    for (const response of responses) {
      const result = await this.upsertCallScoringResponse(response);
      results.push(result);
    }
    return results;
  }
  
  // Call Participants
  async getCallParticipants(callRecordingId: number): Promise<CallParticipant[]> {
    return await db.select()
      .from(callParticipants)
      .where(eq(callParticipants.callRecordingId, callRecordingId))
      .orderBy(callParticipants.speakerLabel);
  }
  
  async createCallParticipant(participant: InsertCallParticipant): Promise<CallParticipant> {
    const result = await db.insert(callParticipants).values(participant).returning();
    return result[0];
  }
  
  async updateCallParticipant(id: number, participant: Partial<InsertCallParticipant>): Promise<CallParticipant | undefined> {
    const result = await db.update(callParticipants)
      .set(participant)
      .where(eq(callParticipants.id, id))
      .returning();
    return result[0];
  }

  // ====== SCRAPE RUNS ======
  async createScrapeRun(run: InsertScrapeRun): Promise<ScrapeRun> {
    const result = await db.insert(scrapeRuns).values(run).returning();
    return result[0];
  }

  async updateScrapeRun(id: number, updates: Partial<InsertScrapeRun>): Promise<ScrapeRun | undefined> {
    const result = await db.update(scrapeRuns)
      .set(updates)
      .where(eq(scrapeRuns.id, id))
      .returning();
    return result[0];
  }

  async getScrapeRuns(dealershipId?: number, limit: number = 20): Promise<ScrapeRun[]> {
    if (dealershipId) {
      return await db.select()
        .from(scrapeRuns)
        .where(eq(scrapeRuns.dealershipId, dealershipId))
        .orderBy(desc(scrapeRuns.startedAt))
        .limit(limit);
    }
    return await db.select()
      .from(scrapeRuns)
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(limit);
  }

  async getLatestScrapeRun(dealershipId?: number): Promise<ScrapeRun | undefined> {
    const runs = await this.getScrapeRuns(dealershipId, 1);
    return runs[0];
  }

  // ====== SCRAPE QUEUE ======
  async createScrapeQueueBatch(items: InsertScrapeQueue[]): Promise<ScrapeQueue[]> {
    if (items.length === 0) return [];
    const result = await db.insert(scrapeQueue).values(items).returning();
    return result;
  }

  async getPendingScrapeQueueItems(scrapeRunId: number): Promise<ScrapeQueue[]> {
    return await db.select()
      .from(scrapeQueue)
      .where(
        and(
          eq(scrapeQueue.scrapeRunId, scrapeRunId),
          or(
            eq(scrapeQueue.status, "pending"),
            eq(scrapeQueue.status, "processing")
          )
        )
      )
      .orderBy(asc(scrapeQueue.position));
  }

  async getIncompleteScrapeQueue(dealershipId: number): Promise<{ scrapeRunId: number; items: ScrapeQueue[] } | null> {
    // Find the most recent scrape run with pending queue items
    const recentRuns = await db.select()
      .from(scrapeRuns)
      .where(
        and(
          eq(scrapeRuns.dealershipId, dealershipId),
          eq(scrapeRuns.status, "running")
        )
      )
      .orderBy(desc(scrapeRuns.startedAt))
      .limit(1);

    if (recentRuns.length === 0) return null;

    const run = recentRuns[0];
    const pendingItems = await db.select()
      .from(scrapeQueue)
      .where(
        and(
          eq(scrapeQueue.scrapeRunId, run.id),
          or(
            eq(scrapeQueue.status, "pending"),
            eq(scrapeQueue.status, "processing")
          )
        )
      )
      .orderBy(asc(scrapeQueue.position));

    if (pendingItems.length === 0) return null;

    return { scrapeRunId: run.id, items: pendingItems };
  }

  async updateScrapeQueueItem(id: number, updates: Partial<InsertScrapeQueue>): Promise<ScrapeQueue | undefined> {
    const result = await db.update(scrapeQueue)
      .set(updates)
      .where(eq(scrapeQueue.id, id))
      .returning();
    return result[0];
  }

  async markScrapeQueueCompleted(id: number, vehicleId: number): Promise<void> {
    await db.update(scrapeQueue)
      .set({
        status: "completed",
        vehicleId,
        processedAt: new Date()
      })
      .where(eq(scrapeQueue.id, id));
  }

  async markScrapeQueueFailed(id: number, errorMessage: string): Promise<void> {
    await db.update(scrapeQueue)
      .set({
        status: "failed",
        errorMessage,
        processedAt: new Date()
      })
      .where(eq(scrapeQueue.id, id));
  }

  async clearScrapeQueue(scrapeRunId: number): Promise<void> {
    await db.delete(scrapeQueue)
      .where(eq(scrapeQueue.scrapeRunId, scrapeRunId));
  }

  // ====== CARFAX REPORTS ======
  async getCarfaxReport(vehicleId: number): Promise<CarfaxReport | undefined> {
    const result = await db.select().from(carfaxReports)
      .where(eq(carfaxReports.vehicleId, vehicleId))
      .limit(1);
    return result[0];
  }

  async getCarfaxReportByVin(vin: string): Promise<CarfaxReport | undefined> {
    const result = await db.select().from(carfaxReports)
      .where(eq(carfaxReports.vin, vin))
      .orderBy(desc(carfaxReports.scrapedAt))
      .limit(1);
    return result[0];
  }

  async upsertCarfaxReport(data: InsertCarfaxReport): Promise<CarfaxReport> {
    // Check if report exists for this VIN
    const existing = data.vin ? await this.getCarfaxReportByVin(data.vin) : undefined;

    if (existing) {
      const result = await db.update(carfaxReports)
        .set({ ...data, updatedAt: new Date(), scrapedAt: new Date() })
        .where(eq(carfaxReports.id, existing.id))
        .returning();
      return result[0];
    } else {
      const result = await db.insert(carfaxReports)
        .values(data)
        .returning();
      return result[0];
    }
  }
}

export const storage = new DatabaseStorage();
