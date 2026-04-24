import { Express, Request, Response } from "express";
import { db } from "./db";
import { users, dealerships, scrapeSources } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Minimal safe routes — Phase 1 of bulletproof rebuild.
 * Only includes endpoints that don't import crash-prone modules.
 */

export default async function registerMinimalRoutes(app: Express) {
  // ===== HEALTH =====
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // ===== AUTH =====
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }

      const user = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (user.length === 0) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      // Simple password check (in production, use bcrypt)
      // For now, just check if user exists and is active
      if (!user[0].isActive) {
        return res.status(403).json({ error: "Account deactivated" });
      }

      // Generate simple JWT (in production, use proper JWT library)
      const token = "placeholder-token-" + user[0].id + "-" + Date.now();

      res.json({
        token,
        user: {
          id: user[0].id,
          email: user[0].email,
          name: user[0].name,
          role: user[0].role,
        },
      });
    } catch (error) {
      console.error("[Login Error]", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // ===== FIRST-RUN SETUP =====
  app.post("/api/setup/first-run", async (req: Request, res: Response) => {
    try {
      const results: any = {};

      // 1. Check if super_admin exists
      const admins = await db.select().from(users).where(eq(users.role, "super_admin"));
      results.superAdminExists = admins.length > 0;

      if (admins.length === 0) {
        const email = process.env.SUPER_ADMIN_EMAIL || req.body?.email;
        const password = process.env.SUPER_ADMIN_PASSWORD || req.body?.password;
        const name = process.env.SUPER_ADMIN_NAME || "Super Admin";

        if (!email || !password) {
          return res.status(400).json({
            error: "No super_admin configured. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars, or provide in request body.",
          });
        }

        const [admin] = await db.insert(users).values({
          email,
          name,
          passwordHash: "placeholder-hash-" + Date.now(),
          role: "super_admin",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        results.superAdminCreated = true;
        results.superAdminEmail = admin.email;
      }

      // 2. Check if dealership exists
      const dealer = await db.select().from(dealerships).where(eq(dealerships.slug, "olympic-hyundai"));
      results.dealershipExists = dealer.length > 0;

      if (dealer.length === 0) {
        const [newDealer] = await db.insert(dealerships).values({
          name: "Olympic Hyundai Vancouver",
          slug: "olympic-hyundai",
          subdomain: "olympic-hyundai",
          city: "Vancouver",
          province: "BC",
          timezone: "America/Vancouver",
          defaultCurrency: "CAD",
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }).returning();

        results.dealershipCreated = true;
        results.dealershipId = newDealer.id;

        // 3. Create scrape source
        const inventoryUrl = process.env.DEALERSHIP_INVENTORY_URL || "https://www.olympichyundaivancouver.com/inventory";
        await db.insert(scrapeSources).values({
          dealershipId: newDealer.id,
          sourceName: "Olympic Hyundai Vancouver",
          sourceUrl: inventoryUrl,
          sourceType: "dealer_website",
          isActive: true,
          scrapeFrequency: "daily",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        results.scrapeSourceCreated = true;
      }

      res.json({ success: true, results, message: "Setup complete. Check results." });
    } catch (error) {
      console.error("[Setup Error]", error);
      res.status(500).json({ error: "Setup failed", details: error instanceof Error ? error.message : String(error) });
    }
  });

  // ===== DEALERSHIP INFO =====
  app.get("/api/dealerships", async (_req: Request, res: Response) => {
    try {
      const all = await db.select().from(dealerships);
      res.json(all);
    } catch (error) {
      console.error("[Dealerships Error]", error);
      res.status(500).json({ error: "Failed to fetch dealerships" });
    }
  });

  // ===== SCRAPE SOURCES =====
  app.get("/api/scrape-sources", async (_req: Request, res: Response) => {
    try {
      const sources = await db.select().from(scrapeSources);
      res.json(sources);
    } catch (error) {
      console.error("[Scrape Sources Error]", error);
      res.status(500).json({ error: "Failed to fetch scrape sources" });
    }
  });

  app.post("/api/scrape-sources", async (req: Request, res: Response) => {
    try {
      const { dealershipId, sourceName, sourceUrl, sourceType } = req.body;
      const [source] = await db.insert(scrapeSources).values({
        dealershipId,
        sourceName,
        sourceUrl,
        sourceType: sourceType || "dealer_website",
        isActive: true,
        scrapeFrequency: "daily",
        createdAt: new Date(),
        updatedAt: new Date(),
      }).returning();
      res.json(source);
    } catch (error) {
      console.error("[Create Scrape Source Error]", error);
      res.status(500).json({ error: "Failed to create scrape source" });
    }
  });

  // ===== FALLBACK =====
  app.use("/api/*", (req: Request, res: Response) => {
    res.status(404).json({
      error: "Endpoint not yet implemented",
      path: req.path,
      available: [
        "POST /api/auth/login",
        "POST /api/setup/first-run",
        "GET /api/dealerships",
        "GET /api/scrape-sources",
        "POST /api/scrape-sources",
      ],
    });
  });

  console.log("[Routes] Minimal routes registered");
}
