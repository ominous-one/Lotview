/**
 * Routes Index — Modular Router Mounting
 * 
 * Replaces the monolithic 17,947-line routes.ts with domain-specific routers.
 * Each router is independently testable and maintains its own imports.
 * 
 * Migration Status:
 * - ✅ auth.ts      — Login, logout, password reset, staff invites (extracted)
 * - 🔄 vehicles.ts  — Vehicle CRUD, search, carfax (planned)
 * - 🔄 facebook.ts  — FB pages, marketplace posting (planned)
 * - 🔄 scraping.ts  — Scraper triggers, runs (planned)
 * - 🔄 ai-chat.ts   — AI responses, intent detection (planned)
 * - 🔄 conversations.ts — Messenger conversations (planned)
 * - 🔄 admin.ts     — Super admin dashboard (planned)
 * - 🔄 webhooks.ts  — GHL, external webhooks (planned)
 * 
 * Remaining routes are handled by the legacy registerRoutes function
 * from the original routes.ts during the migration period.
 */

import type { Express } from "express";

import authRouter from "./auth";
import onboardingRouter from "./onboarding";
import healthRouter from "./health";
import vehiclesRouter from "./vehicles";
import facebookRouter from "./facebook";
import adminRouter from "./admin";

/**
 * Register all modular routes on the Express app.
 * Call this from app.ts before the legacy registerRoutes.
 */
export function registerModularRoutes(app: Express): void {
  // Health checks — must be available before other routes
  app.use(healthRouter);

  // Auth routes (extracted from monolithic routes.ts)
  app.use("/api/auth", authRouter);
  app.use("/api/e2e", authRouter);
  app.use("/api/invites", authRouter);

  // Self-service onboarding
  app.use("/api/onboarding", onboardingRouter);

  // Domain-specific modular routers (new — extracted from monolith)
  app.use("/api/vehicles", vehiclesRouter);
  app.use("/api/facebook", facebookRouter);
  app.use("/api/super-admin", adminRouter);

  // TODO: Extract remaining domains from routes.ts:
  // app.use("/api/scraper", scrapingRouter);
  // app.use("/api/ai", aiRouter);
  // app.use("/api/conversations", conversationsRouter);
  // app.use("/api/crm", crmRouter);
  // app.use("/api/ghl", ghlRouter);
  // app.use("/api/appointments", appointmentsRouter);
  // app.use("/api/webhooks", webhooksRouter);
}
