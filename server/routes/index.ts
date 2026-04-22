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

/**
 * Register all modular routes on the Express app.
 * Call this from app.ts instead of the monolithic registerRoutes.
 */
export function registerModularRoutes(app: Express): void {
  // Auth routes (extracted from monolithic routes.ts)
  app.use("/api/auth", authRouter);
  app.use("/api/e2e", authRouter);
  app.use("/api/invites", authRouter);

  // TODO: Mount additional modular routers as they are extracted:
  // app.use("/api/vehicles", vehiclesRouter);
  // app.use("/api/facebook-pages", facebookRouter);
  // app.use("/api/scraper", scrapingRouter);
  // app.use("/api/chat", aiChatRouter);
  // app.use("/api/conversations", conversationsRouter);
  // app.use("/api/super-admin", adminRouter);
  // app.use("/api/webhooks", webhooksRouter);
}
