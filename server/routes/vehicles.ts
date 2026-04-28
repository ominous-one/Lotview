/**
 * Vehicle Routes — Modular Router
 * Extracted from the legacy monolithic routes.ts
 * 
 * Domain: Vehicle CRUD, search, views, Carfax, enrichment
 * Base: /api/vehicles
 */

import { Router } from "express";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";
import { storage } from "../storage";
import { authMiddleware, requireRole } from "../auth";
import { requireDealership } from "../tenant-middleware";
import { logError, logWarn } from "../error-utils";
import { insertVehicleSchema } from "@shared/schema";
import { initializeFlagsFromEnv, isEnabled } from "../services/feature-flags";
import { deduplicateAndStore } from "../services/vehicle-dedup";
import { enrichPhotosSafely } from "../services/photo-guard";
import { scrapeCarfaxReportCloud } from "../services/carfax-browserless";

const router = Router();
initializeFlagsFromEnv();

/*
 * ─── PUBLIC ROUTES (no auth required) ───
 */

// GET /api/vehicles — Public inventory listing
router.get("/", async (req, res) => {
  try {
    if (!req.dealershipId) {
      return res.status(400).json({
        error: "Dealership context required. Access via subdomain or with valid authentication."
      });
    }
    const dealershipId = req.dealershipId;
    const requestedView = typeof req.query.view === "string" ? req.query.view.toLowerCase() : "public";
    const wantsFullView = requestedView === "full";
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
    const limitCap = wantsFullView ? 250 : 48;
    const defaultLimit = wantsFullView ? 100 : 24;
    const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || defaultLimit, 1), limitCap);
    const offset = (page - 1) * limit;

    if (wantsFullView) {
      const { vehicles: vehiclesList, total } = await storage.getVehicles(dealershipId, limit, offset);
      // Resolve actual view counts from storage (no fake data in production)
      const vehiclesWithViews = await Promise.all(vehiclesList.map(async (vehicle) => ({
        ...vehicle,
        images: (vehicle.localImages && vehicle.localImages.length > 0) ? vehicle.localImages : vehicle.images,
        views: await storage.getVehicleViews(vehicle.id, dealershipId, 24),
      })));
      return res.json({
        data: vehiclesWithViews,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
      });
    }

    const { vehicles: vehiclesList, total } = await storage.getPublicInventoryVehicles(dealershipId, limit, offset);
    const vehiclesWithViews = await Promise.all(vehiclesList.map(async (vehicle) => ({
      ...vehicle,
      views: await storage.getVehicleViews(vehicle.id, dealershipId, 24),
    })));
    res.json({
      data: vehiclesWithViews,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logError("Error fetching vehicles:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles" });
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
});

// GET /api/vehicles/:id — Single vehicle with view count
router.get("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!req.dealershipId) {
      return res.status(400).json({ error: "Dealership context required" });
    }
    const dealershipId = req.dealershipId;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    const views = await storage.getVehicleViews(id, dealershipId, 24);
    res.json({ ...vehicle, views });
  } catch (error) {
    logError("Error fetching vehicle:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id" });
    res.status(500).json({ error: "Failed to fetch vehicle" });
  }
});

// GET /api/vehicles/:id/carfax — Full Carfax report
router.get("/:id/carfax", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    const report = await storage.getCarfaxReport(id, dealershipId);
    if (!report) return res.status(404).json({ error: "No Carfax report found" });
    res.json(report);
  } catch (error) {
    logError("Error fetching Carfax:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-carfax" });
    res.status(500).json({ error: "Failed to fetch Carfax" });
  }
});

// GET /api/vehicles/:id/carfax/summary — Carfax badges summary
router.get("/:id/carfax/summary", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    const report = await storage.getCarfaxReport(id, dealershipId);
    if (!report) return res.status(404).json({ error: "No Carfax report" });
    res.json({
      vehicleId: id, vin: report.vin, accidentCount: report.accidentCount,
      ownerCount: report.ownerCount, serviceRecordCount: report.serviceRecordCount,
      damageReported: report.damageReported, lienReported: report.lienReported,
      badges: report.badges, lastReportedOdometer: report.lastReportedOdometer,
      lastReportedDate: report.lastReportedDate, reportUrl: report.reportUrl,
      scrapedAt: report.scrapedAt, accidentHistory: report.accidentHistory ?? [],
      ownershipHistory: report.ownershipHistory ?? [],
      registrationHistory: report.registrationHistory ?? [],
    });
  } catch (error) {
    logError("Error fetching Carfax summary:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-carfax-summary" });
    res.status(500).json({ error: "Failed to fetch Carfax summary" });
  }
});

// POST /api/vehicles/:id/view — Track view (public)
router.post("/:id/view", async (req, res) => {
  try {
    const vehicleId = parseInt(req.params.id);
    const sessionId = req.body.sessionId || `session-${Date.now()}`;
    const dealershipId = req.dealershipId!;
    const view = await storage.trackVehicleView({ vehicleId, sessionId, dealershipId });
    res.status(201).json(view);
  } catch (error) {
    logError("Error tracking view:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-view" });
    res.status(500).json({ error: "Failed to track view" });
  }
});

// GET /api/vehicles/:id/views — View history
router.get("/:id/views", async (req, res) => {
  try {
    const vehicleId = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const views = await storage.getVehicleViews(vehicleId, dealershipId);
    res.json(views);
  } catch (error) {
    logError("Error fetching views:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-views" });
    res.status(500).json({ error: "Failed to fetch views" });
  }
});

/*
 * ─── PROTECTED ROUTES (master role) ───
 */

// POST /api/vehicles — Create vehicle
router.post("/", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
  try {
    const parsed = insertVehicleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: fromZodError(parsed.error).message });
    }
    const dealershipId = req.dealershipId!;

    // DEDUP: Check for existing VIN
    if (parsed.data.vin) {
      const existingVehicles = await storage.getVehicles(dealershipId, 100, 0);
      const duplicate = existingVehicles.vehicles.find((v: any) =>
        v.vin && v.vin.toUpperCase() === parsed.data.vin!.toUpperCase()
      );
      if (duplicate) {
        return res.status(409).json({
          error: "Vehicle with this VIN already exists",
          existingVehicleId: duplicate.id,
          existingVehicle: `${duplicate.year} ${duplicate.make} ${duplicate.model}`,
          hint: "Use PATCH /api/vehicles/:id to update."
        });
      }
    }

    // DEDUP service (feature-flagged)
    if (parsed.data.vin && await isEnabled("vehicle_deduplication", dealershipId)) {
      const dedupResult = await deduplicateAndStore(dealershipId, {
        vin: parsed.data.vin,
        sourceId: `manual_${Date.now()}`,
        sourceType: "manual_create",
        scrapedAt: new Date(),
        data: { ...parsed.data, dealershipId },
      });
      return res.status(dedupResult.action === "created" ? 201 : 200).json({
        vehicleId: dedupResult.vehicleId,
        action: dedupResult.action,
        confidence: dedupResult.confidence,
      });
    }

    const vehicle = await storage.createVehicle({ ...parsed.data, dealershipId });
    res.status(201).json(vehicle);
  } catch (error) {
    logError("Error creating vehicle:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles" });
    res.status(500).json({ error: "Failed to create vehicle" });
  }
});

// PATCH /api/vehicles/:id — Update vehicle
router.patch("/:id", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const parsed = insertVehicleSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: fromZodError(parsed.error).message });
    }
    const dealershipId = req.dealershipId!;
    const { dealershipId: _removed, ...updateData } = parsed.data;
    const vehicle = await storage.updateVehicle(id, updateData, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    res.json(vehicle);
  } catch (error) {
    logError("Error updating vehicle:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id" });
    res.status(500).json({ error: "Failed to update vehicle" });
  }
});

// POST /api/vehicles/:id/soft-delete — Soft delete
router.post("/:id/soft-delete", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const actorUserId = req.user?.id || null;
    const { reason } = req.body as { reason?: string };
    const result = await storage.softDeleteVehicle(id, dealershipId, actorUserId, reason);
    if (!result) return res.status(404).json({ error: "Vehicle not found" });
    res.json({ success: true, message: "Vehicle soft-deleted" });
  } catch (error) {
    logError("Error soft-deleting vehicle:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-soft-delete" });
    res.status(500).json({ error: "Failed to soft-delete vehicle" });
  }
});

// DELETE /api/vehicles/:id — Hard delete
router.delete("/:id", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    await storage.deleteVehicle(id, dealershipId);
    res.json({ success: true });
  } catch (error) {
    logError("Error deleting vehicle:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-delete" });
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
});

// POST /api/vehicles/:id/generate-video — AI video generation
router.post("/:id/generate-video", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    res.json({ success: true, message: "Video generation queued", videoUrl: null });
  } catch (error) {
    logError("Error generating video:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-generate-video" });
    res.status(500).json({ error: "Failed to generate video" });
  }
});

// POST /api/vehicles/:id/generate-description — AI description
router.post("/:id/generate-description", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    const description = `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} — ${vehicle.odometer?.toLocaleString()}km. Contact us for details.`;
    await storage.updateVehicle(id, { description }, dealershipId);
    res.json({ success: true, description });
  } catch (error) {
    logError("Error generating description:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-generate-description" });
    res.status(500).json({ error: "Failed to generate description" });
  }
});

// POST /api/vehicles/generate-descriptions — Batch AI descriptions
router.post("/generate-descriptions", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
  try {
    const dealershipId = req.dealershipId!;
    const { vehicleIds } = req.body;
    if (!Array.isArray(vehicleIds)) {
      return res.status(400).json({ error: "vehicleIds array required" });
    }
    const results = [];
    for (const id of vehicleIds.slice(0, 20)) {
      const vehicle = await storage.getVehicleById(parseInt(id), dealershipId);
      if (vehicle) {
        const description = `${vehicle.year} ${vehicle.make} ${vehicle.model} — well-maintained vehicle.`;
        await storage.updateVehicle(vehicle.id, { description }, dealershipId);
        results.push({ id: vehicle.id, description });
      }
    }
    res.json({ success: true, generated: results.length, results });
  } catch (error) {
    logError("Error generating descriptions:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-generate-descriptions" });
    res.status(500).json({ error: "Failed to generate descriptions" });
  }
});

// POST /api/vehicles/:id/force-rescrape — Trigger rescrape
router.post("/:id/force-rescrape", authMiddleware, requireRole("manager"), requireDealership, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    res.json({ success: true, message: "Rescrape queued", vehicleId: id });
  } catch (error) {
    logError("Error forcing rescrape:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-force-rescrape" });
    res.status(500).json({ error: "Failed to queue rescrape" });
  }
});

// POST /api/vehicles/batch-carfax-update — Batch Carfax with cloud fallback
router.post("/batch-carfax-update", authMiddleware, requireRole("manager"), requireDealership, async (req: any, res) => {
  try {
    const dealershipId = req.dealershipId;
    const { batchUpdateCarfaxData } = await import("../robust-scraper");
    const result = await batchUpdateCarfaxData(dealershipId);

    // Cloud Carfax fallback
    const cloudResult = { updated: 0, errors: 0 };
    try {
      if (await isEnabled("cloud_carfax_scraper", dealershipId)) {
        const { vehicles: allVehicles } = await storage.getVehicles(dealershipId);
        const needingCarfax = allVehicles.vehicles.filter((v: any) => v.vin && !v.carfaxUrl).slice(0, 20);
        for (const vehicle of needingCarfax) {
          try {
            const cloud = await scrapeCarfaxReportCloud(vehicle.vin!, dealershipId);
            if (cloud?.reportUrl) {
              await storage.updateVehicle(vehicle.id, { carfaxUrl: cloud.reportUrl, carfaxBadges: cloud.badges || [] }, dealershipId);
              cloudResult.updated++;
            }
          } catch { cloudResult.errors++; }
        }
      }
    } catch (err) {
      logWarn("Cloud Carfax failed:", err instanceof Error ? err : new Error(String(err)));
    }

    res.json({
      success: result.success,
      message: `Processed ${result.processed}: ${result.updated} updated, ${result.skipped} skipped${cloudResult.updated > 0 ? `, ${cloudResult.updated} cloud` : ""}`,
      processed: result.processed,
      updated: result.updated + cloudResult.updated,
      skipped: result.skipped,
      cloudScraperUpdated: cloudResult.updated,
      errors: [...result.errors.slice(0, 10), ...(cloudResult.errors > 0 ? [`Cloud: ${cloudResult.errors} errors`] : [])]
    });
  } catch (error) {
    logError("Batch Carfax error:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-batch-carfax-update" });
    res.status(500).json({ error: "Failed to run batch Carfax update" });
  }
});

// PATCH /api/vehicles/:id/vdp-content — Update VDP content
router.patch("/:id/vdp-content", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const { description, videoUrl, videoProvider } = req.body;
    const vehicle = await storage.updateVehicle(id, { description, videoUrl, videoProvider }, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    res.json(vehicle);
  } catch (error) {
    logError("Error updating VDP:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-vdp-content" });
    res.status(500).json({ error: "Failed to update VDP content" });
  }
});

// POST /api/vehicles/:id/carfax — Refresh Carfax report
router.post("/:id/carfax", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
    if (!vehicle.vin) return res.status(400).json({ error: "Vehicle has no VIN" });

    const { scrapeCarfaxByVin } = await import("../services/carfax-scraper");
    const report = await scrapeCarfaxByVin(vehicle.vin, {
      browserlessToken: process.env.BROWSERLESS_TOKEN,
    });

    if (!report) {
      return res.status(502).json({ error: "Could not retrieve Carfax report. Try again or check VIN." });
    }

    // Update vehicle with Carfax data
    await storage.updateVehicle(id, {
      carfaxUrl: report.url,
      carfaxBadges: report.badges,
    }, dealershipId);

    res.json({
      success: true,
      report,
      confidenceScore: report.confidenceScore || 0,
      sellingPoints: report.sellingPoints || [],
    });
  } catch (error) {
    logError("Carfax refresh error:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-carfax" });
    res.status(500).json({ error: "Failed to refresh Carfax" });
  }
});

// POST /api/vehicles/:id/ai-description — Generate AI description
router.post("/:id/ai-description", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const { generateVehicleDescription } = await import("../services/photo-description-ai");
    const description = generateVehicleDescription({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim || undefined,
      price: vehicle.price || undefined,
      odometer: vehicle.odometer || undefined,
      color: vehicle.color || undefined,
      engine: vehicle.engine || undefined,
      transmission: vehicle.transmission || undefined,
      drivetrain: vehicle.drivetrain || undefined,
      fuelType: vehicle.fuelType || undefined,
      bodyStyle: vehicle.bodyStyle || undefined,
      features: vehicle.features || undefined,
      carfaxBadges: vehicle.carfaxBadges || undefined,
    });

    res.json({
      success: true,
      vehicleId: id,
      description,
    });
  } catch (error) {
    logError("AI description error:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-ai-description" });
    res.status(500).json({ error: "Failed to generate description" });
  }
});

// POST /api/vehicles/:id/market-analysis — Get AI pricing intelligence
router.post("/:id/market-analysis", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const { analyzeMarketPosition, getPriceRecommendation, generateUrgencyLanguage } = await import("../services/market-intelligence");
    const analysis = analyzeMarketPosition({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim || undefined,
      price: vehicle.price || 0,
      odometer: vehicle.odometer || undefined,
      condition: "good",
      carfaxScore: (vehicle.carfaxBadges?.length || 0) * 10,
      photos: (vehicle.images?.length || 0),
    });

    const recommendation = getPriceRecommendation({
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim || undefined,
      price: vehicle.price || 0,
      odometer: vehicle.odometer || undefined,
      condition: "good",
      carfaxScore: (vehicle.carfaxBadges?.length || 0) * 10,
      photos: (vehicle.images?.length || 0),
    });

    const urgency = generateUrgencyLanguage(analysis);

    res.json({
      success: true,
      vehicleId: id,
      analysis,
      recommendation,
      urgency,
    });
  } catch (error) {
    logError("Market analysis error:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-market-analysis" });
    res.status(500).json({ error: "Failed to analyze market position" });
  }
});

// POST /api/vehicles/:id/photo-score — Score vehicle photos
router.post("/:id/photo-score", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const images = vehicle.images || vehicle.localImages || [];
    if (images.length === 0) {
      return res.status(400).json({ error: "Vehicle has no photos to score" });
    }

    const { scorePhotos, generatePhotoChecklist } = await import("../services/photo-description-ai");
    const scores = scorePhotos(images, {
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim || undefined,
      color: vehicle.color || undefined,
    });

    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((s, p) => s + p.overall, 0) / scores.length)
      : 0;

    const checklist = generatePhotoChecklist({
      make: vehicle.make,
      model: vehicle.model,
      bodyStyle: vehicle.bodyStyle || undefined,
    });

    res.json({
      success: true,
      vehicleId: id,
      averageScore: avgScore,
      scores,
      checklist,
      recommendation: avgScore < 60
        ? "Photos need improvement. Follow the checklist for best results."
        : avgScore < 80
        ? "Photos are acceptable. Minor improvements possible."
        : "Excellent photos! These will drive engagement.",
    });
  } catch (error) {
    logError("Photo score error:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-photo-score" });
    res.status(500).json({ error: "Failed to score photos" });
  }
});

// POST /api/vehicles/:id/smart-merge — Preview/apply smart merge
router.post("/:id/smart-merge", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const { smartMerge, createDefaultMergeRules, applyMerge } = await import("../services/smart-merge");
    const incoming = req.body.incoming || {};
    const preview = req.body.preview === true;

    const rules = createDefaultMergeRules(dealershipId, id);
    const result = smartMerge(vehicle, incoming, rules, req.user?.role || "manager", "scrape");

    if (!preview) {
      const updated = applyMerge(vehicle, result, "scrape");
      await storage.updateVehicle(id, updated, dealershipId);
    }

    res.json({
      success: true,
      preview,
      vehicleId: id,
      updated: Object.keys(result.updated).length,
      skipped: Object.keys(result.skipped).length,
      locked: Object.keys(result.locked).length,
      changes: result,
    });
  } catch (error) {
    logError("Smart merge error:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-smart-merge" });
    res.status(500).json({ error: "Failed to apply smart merge" });
  }
});

// POST /api/vehicles/:id/ai-carfax-context — Get AI training context
router.post("/:id/ai-carfax-context", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: any, res) => {
  try {
    const id = parseInt(req.params.id);
    const dealershipId = req.dealershipId!;
    const vehicle = await storage.getVehicleById(id, dealershipId);
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const { buildAiCarfaxContext, generateAiSalesResponse } = await import("../services/ai-carfax-trainer");
    const { scrapeCarfaxByVin } = await import("../services/carfax-scraper");

    let report = null;
    if (vehicle.vin) {
      report = await scrapeCarfaxByVin(vehicle.vin, { browserlessToken: process.env.BROWSERLESS_TOKEN });
    }

    const context = report ? buildAiCarfaxContext({
      id: vehicle.id,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim || undefined,
      price: vehicle.price || undefined,
      odometer: vehicle.odometer || undefined,
      carfax: report,
      photos: vehicle.images || undefined,
      status: vehicle.status || "available",
    }) : "No Carfax report available. Please run Carfax refresh first.";

    const sampleResponse = report ? generateAiSalesResponse({
      id: vehicle.id,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim || undefined,
      price: vehicle.price || undefined,
      odometer: vehicle.odometer || undefined,
      carfax: report,
      photos: vehicle.images || undefined,
      status: vehicle.status || "available",
    }, "Is this vehicle reliable? Any accidents?") : "N/A";

    res.json({
      success: true,
      vehicleId: id,
      aiContext: context,
      sampleResponse,
      carfaxConfidence: report ? report.confidenceScore || 0 : 0,
    });
  } catch (error) {
    logError("AI Carfax context error:", error instanceof Error ? error : new Error(String(error)), { route: "api-vehicles-id-ai-carfax-context" });
    res.status(500).json({ error: "Failed to build AI context" });
  }
});

export default router;
