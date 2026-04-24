import { Express, Request, Response } from "express";
import { db } from "./db";
import { users, dealerships, scrapeSources } from "@shared/schema";
import { eq } from "drizzle-orm";

// ===== PASSWORD UTILS (async, so module load is safe) =====
async function hashPassword(password: string): Promise<string> {
  try {
    const bcrypt = await import("bcrypt");
    return await bcrypt.default.hash(password, 10);
  } catch {
    // Fallback when bcrypt not available
    const { createHash } = await import("crypto");
    return createHash("sha256").update(password + "lotview-salt").digest("hex");
  }
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    const bcrypt = await import("bcrypt");
    return await bcrypt.default.compare(password, hash);
  } catch {
    const { createHash } = await import("crypto");
    const test = createHash("sha256").update(password + "lotview-salt").digest("hex");
    return test === hash;
  }
}

// ===== JWT UTILS =====
function generateToken(user: any): string {
  const jwt = require("jsonwebtoken");
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || "lotview-dev-secret-CHANGE-ME";
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: "7d", issuer: "lotview", audience: "lotview-users" }
  );
}

function verifyToken(token: string): any {
  try {
    const jwt = require("jsonwebtoken");
    const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || "lotview-dev-secret-CHANGE-ME";
    return jwt.verify(token, secret, { issuer: "lotview", audience: "lotview-users" });
  } catch {
    return null;
  }
}

// ===== AUTH MIDDLEWARE =====
function authMiddleware(req: Request, res: Response, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  (req as any).user = decoded;
  next();
}

function superAdminOnly(req: Request, res: Response, next: any) {
  const user = (req as any).user;
  if (!user || user.role !== "super_admin") {
    return res.status(403).json({ error: "Super admin access required" });
  }
  next();
}

/**
 * Minimal safe routes — Phase 2
 * Includes auth, setup, password change, dealership, scrape sources
 */

export default async function registerMinimalRoutes(app: Express) {
  // ===== HEALTH =====
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", time: new Date().toISOString(), uptime: process.uptime() });
  });

  // ===== AUTH: LOGIN =====
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

      const isValid = await verifyPassword(password, user[0].passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user[0].isActive) {
        return res.status(403).json({ error: "Account deactivated" });
      }

      const token = generateToken(user[0]);

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

  // ===== AUTH: CHANGE PASSWORD =====
  app.post("/api/auth/change-password", authMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current password and new password required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ error: "New password must be at least 8 characters" });
      }

      const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const isValid = await verifyPassword(currentPassword, user[0].passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const newHash = await hashPassword(newPassword);
      await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, userId));

      res.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
      console.error("[Change Password Error]", error);
      res.status(500).json({ error: "Failed to change password" });
    }
  });

  // ===== SETUP: FIRST-RUN =====
  app.post("/api/setup/first-run", async (req: Request, res: Response) => {
    try {
      const results: any = {};

      // 1. Check if super_admin exists
      const admins = await db.select().from(users).where(eq(users.role, "super_admin"));
      results.superAdminExists = admins.length > 0;

      if (admins.length === 0) {
        const email = (process.env.SUPER_ADMIN_EMAIL || req.body?.email || "").trim().toLowerCase();
        const password = process.env.SUPER_ADMIN_PASSWORD || req.body?.password;
        const name = process.env.SUPER_ADMIN_NAME || req.body?.name || "Super Admin";

        if (!email || !password) {
          return res.status(400).json({
            error: "No super_admin configured. Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD env vars, or provide in request body.",
          });
        }

        const passwordHash = await hashPassword(password);
        const [admin] = await db.insert(users).values({
          email,
          name,
          passwordHash,
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

  // ===== USERS =====
  app.get("/api/users", authMiddleware, superAdminOnly, async (_req: Request, res: Response) => {
    try {
      const allUsers = await db.select().from(users);
      res.json(allUsers);
    } catch (error) {
      console.error("[Users Error]", error);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // ===== DEALERSHIPS =====
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

  app.post("/api/scrape-sources", authMiddleware, superAdminOnly, async (req: Request, res: Response) => {
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
        "POST /api/auth/change-password",
        "POST /api/setup/first-run",
        "GET /api/users",
        "GET /api/dealerships",
        "GET /api/scrape-sources",
        "POST /api/scrape-sources",
      ],
    });
  });

  console.log("[Routes] Phase 2 routes registered (auth + setup + password change)");
}
