/**
 * Facebook Routes — Modular Router
 * Facebook Pages, Accounts, Marketplace Posting, Templates, Queue, Schedule
 * Base: /api/facebook
 */

import { Router } from "express";
import { storage } from "../storage";
import { authMiddleware, requirePermission, requireRole } from "../auth";
import { requireDealership } from "../tenant-middleware";
import { logError, logWarn } from "../error-utils";
import { checkAccountHealth, getCurrentPostingLimit, recordPostAttempt } from "../services/fb-ban-recovery";
import { getOptimizedPosting } from "../services/ai-posting-optimizer";
import { isEnabled } from "../services/feature-flags";
import { facebookService } from "../facebook-service";

const router = Router();

/* ─── Facebook Pages ─── */

router.get("/pages", authMiddleware, requirePermission("integrations.read"), requireDealership, async (req, res) => {
  try {
    const pages = await storage.getFacebookPages(req.dealershipId!);
    res.json(pages);
  } catch (error) {
    logError("Error fetching FB pages:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-pages" });
    res.status(500).json({ error: "Failed to fetch pages" });
  }
});

router.post("/pages", authMiddleware, requirePermission("integrations.write"), requireDealership, async (req, res) => {
  try {
    const page = await storage.createFacebookPage({ ...req.body, dealershipId: req.dealershipId! });
    res.status(201).json(page);
  } catch (error) {
    logError("Error creating FB page:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-pages" });
    res.status(500).json({ error: "Failed to create page" });
  }
});

router.patch("/pages/:id", authMiddleware, requirePermission("integrations.write"), requireDealership, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Invalid page id" });
    }
    const requestBody = typeof req.body === "object" && req.body !== null ? req.body : {};
    const { dealershipId: _ignoredDealershipId, ...updates } = requestBody;
    const page = await storage.updateFacebookPage(id, updates, req.dealershipId!);
    if (!page) return res.status(404).json({ error: "Page not found" });
    res.json(page);
  } catch (error) {
    logError("Error updating FB page:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-pages-id" });
    res.status(500).json({ error: "Failed to update page" });
  }
});

/* ─── Facebook Accounts ─── */

router.get("/accounts", authMiddleware, requireRole("salesperson"), requireDealership, async (req, res) => {
  try {
    const accounts = await storage.getFacebookAccountsByUser(req.user!.id, req.dealershipId!);
    res.json(accounts);
  } catch (error) {
    logError("Error fetching FB accounts:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-accounts" });
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

router.post("/accounts", authMiddleware, requireRole("salesperson"), requireDealership, async (req, res) => {
  try {
    const account = await storage.createFacebookAccount({ ...req.body, userId: req.user!.id, dealershipId: req.dealershipId! });
    res.status(201).json(account);
  } catch (error) {
    logError("Error creating FB account:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-accounts" });
    res.status(500).json({ error: "Failed to create account" });
  }
});

router.patch("/accounts/:id", authMiddleware, requireRole("salesperson"), requireDealership, async (req, res) => {
  try {
    const account = await storage.updateFacebookAccount(parseInt(req.params.id), req.user!.id, req.dealershipId!, req.body);
    res.json(account);
  } catch (error) {
    logError("Error updating FB account:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-accounts-id" });
    res.status(500).json({ error: "Failed to update account" });
  }
});

router.delete("/accounts/:id", authMiddleware, requireRole("salesperson"), requireDealership, async (req, res) => {
  try {
    await storage.deleteFacebookAccount(parseInt(req.params.id), req.user!.id, req.dealershipId!);
    res.json({ success: true });
  } catch (error) {
    logError("Error deleting FB account:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-accounts-id" });
    res.status(500).json({ error: "Failed to delete account" });
  }
});

/* ─── Templates ─── */

router.get("/templates", authMiddleware, requireRole("salesperson"), requireDealership, async (req, res) => {
  try {
    const templates = await storage.getAdTemplatesByUser(req.user!.id, req.dealershipId!);
    res.json(templates);
  } catch (error) {
    logError("Error fetching templates:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-templates" });
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.post("/templates", authMiddleware, requireRole("salesperson"), requireDealership, async (req, res) => {
  try {
    const template = await storage.createAdTemplate({ ...req.body, userId: req.user!.id, dealershipId: req.dealershipId! });
    res.status(201).json(template);
  } catch (error) {
    logError("Error creating template:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-templates" });
    res.status(500).json({ error: "Failed to create template" });
  }
});

/* ─── Posting Queue ─── */

router.get("/queue", authMiddleware, requireRole("salesperson"), requireDealership, async (req, res) => {
  try {
    const items = await storage.getPostingQueueByUser(req.user!.id, req.dealershipId!);
    res.json(items);
  } catch (error) {
    logError("Error fetching queue:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-queue" });
    res.status(500).json({ error: "Failed to fetch queue" });
  }
});

router.post("/queue", authMiddleware, requireRole("salesperson"), requireDealership, async (req, res) => {
  try {
    const item = await storage.createPostingQueueItem({ ...req.body, userId: req.user!.id, dealershipId: req.dealershipId! });
    res.status(201).json(item);
  } catch (error) {
    logError("Error adding to queue:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-queue" });
    res.status(500).json({ error: "Failed to add to queue" });
  }
});

/* ─── Manual Post to Marketplace (with ban detection + AI optimizer) ─── */

router.post("/post/:queueId", authMiddleware, requireRole("salesperson"), requireDealership, async (req, res) => {
  try {
    const queueId = parseInt(req.params.queueId);
    const userId = req.user!.id;
    const dealershipId = req.dealershipId!;

    const queueItem = (await storage.getPostingQueueByUser(userId, dealershipId)).find(item => item.id === queueId);
    if (!queueItem) return res.status(404).json({ error: "Queue item not found" });

    const vehicle = await storage.getVehicleById(queueItem.vehicleId, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    let account;
    if (queueItem.facebookAccountId) {
      account = await storage.getFacebookAccountById(queueItem.facebookAccountId, userId, dealershipId);
    } else {
      const accounts = await storage.getFacebookAccountsByUser(userId, dealershipId);
      account = accounts[0];
    }
    if (!account?.accessToken) return res.status(400).json({ error: "No Facebook account connected" });

    // BAN DETECTION
    try {
      const health = await checkAccountHealth(dealershipId, account.id, { success: true });
      if (["confirmed_ban", "suspected_ban"].includes(health.status)) {
        return res.status(403).json({ error: `Account ${health.status}: ${health.reason}`, status: health.status });
      }
      const postingLimit = await getCurrentPostingLimit(account.id);
      if (health.postsToday >= postingLimit) {
        return res.status(429).json({ error: `Daily limit reached (${health.postsToday}/${postingLimit})`, limit: postingLimit });
      }
    } catch { /* continue if health check fails */ }

    // AI OPTIMIZER
    const template = queueItem.templateId
      ? await storage.getAdTemplateById(queueItem.templateId, userId, dealershipId)
      : (await storage.getAdTemplatesByUser(userId, dealershipId)).find(t => t.isDefault) || (await storage.getAdTemplatesByUser(userId, dealershipId))[0];

    let titleTemplate = template?.titleTemplate || "{{year}} {{make}} {{model}}";
    let descriptionTemplate = template?.descriptionTemplate || "{{description}}";

    try {
      if (await isEnabled("ai_posting_optimizer", dealershipId)) {
        const optimized = await getOptimizedPosting(dealershipId, {
          vehicleId: vehicle.id, year: vehicle.year, make: vehicle.make,
          model: vehicle.model, trim: vehicle.trim || "", price: vehicle.price,
          odometer: vehicle.odometer, description: vehicle.description || "", images: vehicle.images || [],
        }, titleTemplate, descriptionTemplate);
        titleTemplate = optimized.title;
        descriptionTemplate = optimized.description;
      }
    } catch (optErr) {
      logWarn("AI optimizer failed (non-blocking):", optErr instanceof Error ? optErr : new Error(String(optErr)));
    }

    await storage.updatePostingQueueItem(queueId, userId, dealershipId, { status: "posting" });

    try {
      const { postId } = await facebookService.postToMarketplace(account.accessToken, vehicle, {
        titleTemplate, descriptionTemplate
      });
      await storage.updatePostingQueueItem(queueId, userId, dealershipId, {
        status: "posted", facebookPostId: postId, postedAt: new Date()
      });
      try { await recordPostAttempt(account.id); } catch { /* non-critical */ }
      res.json({ success: true, postId });
    } catch (error) {
      try { await checkAccountHealth(dealershipId, account.id, { success: false, error: error instanceof Error ? error.message : "Unknown" }); } catch { /* non-critical */ }
      await storage.updatePostingQueueItem(queueId, userId, dealershipId, {
        status: "failed", errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
      throw error;
    }
  } catch (error) {
    logError("Error posting to FB:", error instanceof Error ? error : new Error(String(error)), { route: "api-facebook-post-queueId" });
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to post" });
  }
});

/* ─── Config Status ─── */

router.get("/config/status", authMiddleware, requireRole("salesperson"), requireDealership, (req, res) => {
  res.json({ configured: true, dealershipId: req.dealershipId });
});

export default router;
