/**
 * Self-Service Onboarding Routes
 * Allows new dealerships to sign up without super admin intervention.
 * Auto-detects website platform and assigns default extraction scripts.
 */

import { Router } from "express";
import { hashPassword } from "../utils/crypto";
import { storage } from "../storage";
import { logInfo, logError } from "../error-utils";

const router = Router();

// ---- Website Platform Detection ----

interface PlatformDetection {
  platform: string;
  confidence: number;
  defaultScript: string;
}

function detectPlatform(websiteUrl: string): PlatformDetection {
  const url = websiteUrl.toLowerCase();

  // Dealer.com indicators
  if (url.includes("dealer.com") || url.includes("dealeron")) {
    return {
      platform: "dealer_com",
      confidence: 0.95,
      defaultScript: DEFAULT_SCRIPTS.dealer_com,
    };
  }

  // DealerInspire indicators
  if (url.includes("dealerinspire") || url.includes("di-theme")) {
    return {
      platform: "dealer_inspire",
      confidence: 0.95,
      defaultScript: DEFAULT_SCRIPTS.dealer_inspire,
    };
  }

  // WordPress / custom
  if (url.includes("wp-content") || url.includes("wordpress")) {
    return {
      platform: "wordpress",
      confidence: 0.7,
      defaultScript: DEFAULT_SCRIPTS.generic,
    };
  }

  // Default: generic scraper
  return {
    platform: "generic",
    confidence: 0.5,
    defaultScript: DEFAULT_SCRIPTS.generic,
  };
}

// ---- Default Extraction Scripts ----

const DEFAULT_SCRIPTS: Record<string, string> = {
  dealer_com: `
    // Dealer.com extraction script
    function extractVehicles() {
      const vehicles = [];
      const items = document.querySelectorAll('.vehicle-item, .inventory-item, [data-vehicle]');
      items.forEach(item => {
        const vin = item.querySelector('[data-vin], .vin')?.textContent?.trim();
        const price = item.querySelector('.price, [data-price]')?.textContent?.replace(/[^0-9]/g, '');
        const year = item.querySelector('.year, [data-year]')?.textContent?.trim();
        const make = item.querySelector('.make, [data-make]')?.textContent?.trim();
        const model = item.querySelector('.model, [data-model]')?.textContent?.trim();
        const mileage = item.querySelector('.mileage, [data-mileage], .odometer')?.textContent?.replace(/[^0-9]/g, '');
        const photos = Array.from(item.querySelectorAll('img')).map(img => img.src).filter(src => src && !src.includes('placeholder'));
        if (vin) vehicles.push({ vin, price: parseInt(price) || 0, year: parseInt(year) || 0, make, model, mileage: parseInt(mileage) || 0, photos });
      });
      return vehicles;
    }
    return extractVehicles();
  `,

  dealer_inspire: `
    // DealerInspire extraction script
    function extractVehicles() {
      const vehicles = [];
      const items = document.querySelectorAll('.vehicle-card, .inventory-card');
      items.forEach(item => {
        const vin = item.dataset.vin || item.querySelector('.vin')?.textContent?.trim();
        const priceText = item.querySelector('.price')?.textContent || '';
        const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;
        const title = item.querySelector('.title, h2, h3')?.textContent?.trim() || '';
        const titleMatch = title.match(/(\\d{4})\\s+(\\w+)\\s+(\\w+)/);
        const year = titleMatch ? parseInt(titleMatch[1]) : 0;
        const make = titleMatch ? titleMatch[2] : '';
        const model = titleMatch ? titleMatch[3] : '';
        const mileageText = item.querySelector('.mileage')?.textContent || '';
        const mileage = parseInt(mileageText.replace(/[^0-9]/g, '')) || 0;
        const photos = Array.from(item.querySelectorAll('img')).map(img => img.dataset.src || img.src).filter(Boolean);
        if (vin) vehicles.push({ vin, price, year, make, model, mileage, photos });
      });
      return vehicles;
    }
    return extractVehicles();
  `,

  generic: `
    // Generic inventory extraction script
    function extractVehicles() {
      const vehicles = [];
      // Try common selectors
      const selectors = ['.vehicle', '.car-item', '.inventory-item', '[data-vehicle]', '.listing-item'];
      let items = [];
      for (const sel of selectors) {
        items = document.querySelectorAll(sel);
        if (items.length > 0) break;
      }
      items.forEach(item => {
        const vin = item.querySelector('[data-vin], .vin')?.textContent?.trim() || 
                   item.textContent?.match(/[A-HJ-NPR-Z0-9]{17}/i)?.[0];
        const priceText = item.querySelector('.price, [data-price]')?.textContent || item.textContent?.match(/\\$[\\d,]+/)?.[0] || '';
        const price = parseInt(priceText.replace(/[^0-9]/g, '')) || 0;
        const titleEl = item.querySelector('h2, h3, .title, [data-title]');
        const title = titleEl?.textContent?.trim() || '';
        const yearMatch = title.match(/(\\d{4})/);
        const year = yearMatch ? parseInt(yearMatch[1]) : 0;
        const makeModelMatch = title.match(/\\d{4}\\s+(\\w+)\\s+(\\w+)/);
        const make = makeModelMatch ? makeModelMatch[1] : '';
        const model = makeModelMatch ? makeModelMatch[2] : '';
        const mileageText = item.querySelector('.mileage, [data-mileage]')?.textContent || '';
        const mileage = parseInt(mileageText.replace(/[^0-9]/g, '')) || 0;
        const photos = Array.from(item.querySelectorAll('img')).map(img => img.dataset.src || img.src).filter(src => src && !src.includes('placeholder') && !src.includes('icon'));
        if (vin && vin.length === 17) vehicles.push({ vin: vin.toUpperCase(), price, year, make, model, mileage, photos, sourceUrl: window.location.href });
      });
      return vehicles;
    }
    return extractVehicles();
  `,
};

// ---- Routes ----

/**
 * POST /api/onboarding/signup
 * Self-service dealership signup.
 */
router.post("/signup", async (req, res) => {
  try {
    const {
      dealershipName,
      websiteUrl,
      managerEmail,
      managerName,
      managerPassword,
      phone,
      address,
      city,
      province,
      postalCode,
    } = req.body;

    // Validation
    if (!dealershipName || !websiteUrl || !managerEmail || !managerPassword) {
      return res.status(400).json({ error: "Dealership name, website URL, manager email, and password are required" });
    }

    if (managerPassword.length < 12) {
      return res.status(400).json({ error: "Password must be at least 12 characters" });
    }

    // Check if email already exists
    const existingUser = await storage.getUserByEmail(managerEmail);
    if (existingUser) {
      return res.status(400).json({ error: "An account with this email already exists" });
    }

    // Generate subdomain from dealership name
    const subdomain = dealershipName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .substring(0, 30);

    // Check subdomain uniqueness
    const existingDealerships = await storage.getAllDealerships?.() || [];
    const subdomainExists = existingDealerships.some((d: any) => d.subdomain === subdomain);
    if (subdomainExists) {
      return res.status(400).json({ error: "Dealership name already taken, please try a different name" });
    }

    // Detect website platform
    const detection = detectPlatform(websiteUrl);

    // Create dealership
    const dealership = await storage.createDealership({
      name: dealershipName,
      slug: subdomain,
      subdomain,
      websiteUrl,
      phone: phone || null,
      address: address || null,
      city: city || null,
      province: province || null,
      postalCode: postalCode || null,
      status: "active",
      settings: {
        timezone: "America/Toronto",
        currency: "CAD",
        dateFormat: "YYYY-MM-DD",
        language: "en",
        autoPublish: true,
        scrapingEnabled: true,
        platformDetected: detection.platform,
        platformConfidence: detection.confidence,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create master admin user
    const passwordHash = await hashPassword(managerPassword);
    const masterUser = await storage.createUser({
      email: managerEmail,
      name: managerName || managerEmail.split("@")[0],
      passwordHash,
      role: "master",
      dealershipId: dealership.id,
      isActive: true,
      createdAt: new Date(),
    });

    // Create scrape source
    await storage.createScrapeSource({
      dealershipId: dealership.id,
      sourceName: `${dealershipName} Website`,
      sourceUrl: websiteUrl,
      isActive: true,
      priority: 1,
      schedule: "daily",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Store default browser script
    await storage.setBrowserScript?.(dealership.id, {
      script: detection.defaultScript,
      platform: detection.platform,
      autoDetected: true,
      confidence: detection.confidence,
      createdAt: new Date(),
    });

    // Generate JWT token
    const { generateToken } = await import("../auth");
    const token = generateToken(masterUser);

    logInfo(`[Onboarding] New dealership created: ${dealershipName} (ID: ${dealership.id})`, {
      platform: detection.platform,
      confidence: detection.confidence,
    });

    res.status(201).json({
      success: true,
      message: "Dealership created successfully",
      dealership: {
        id: dealership.id,
        name: dealership.name,
        subdomain: dealership.subdomain,
        websiteUrl: dealership.websiteUrl,
      },
      user: {
        id: masterUser.id,
        email: masterUser.email,
        name: masterUser.name,
        role: masterUser.role,
      },
      token,
      platform: {
        detected: detection.platform,
        confidence: detection.confidence,
      },
      nextSteps: [
        "Connect your Facebook account for Marketplace posting",
        "Connect your GoHighLevel account for CRM sync",
        "Review and customize your browser extraction script",
        "Run your first inventory sync",
      ],
    });
  } catch (error) {
    logError(`[Onboarding] Signup failed: ${error}`, error instanceof Error ? error : null);
    res.status(500).json({ error: "Failed to create dealership" });
  }
});

/**
 * POST /api/onboarding/validate-url
 * Validate a dealership website URL before signup.
 */
router.post("/validate-url", async (req, res) => {
  try {
    const { websiteUrl } = req.body;
    if (!websiteUrl) {
      return res.status(400).json({ error: "Website URL is required" });
    }

    // Basic URL validation
    let parsed: URL;
    try {
      parsed = new URL(websiteUrl);
    } catch {
      return res.status(400).json({ error: "Invalid URL format" });
    }

    if (!parsed.protocol.startsWith("http")) {
      return res.status(400).json({ error: "URL must start with http:// or https://" });
    }

    // Detect platform
    const detection = detectPlatform(websiteUrl);

    // Check if URL is accessible (optional, can be slow)
    let accessible = false;
    try {
      const response = await fetch(websiteUrl, { method: "HEAD", timeout: 5000 } as any);
      accessible = response.ok;
    } catch {
      accessible = false;
    }

    res.json({
      valid: true,
      url: websiteUrl,
      platform: detection.platform,
      confidence: detection.confidence,
      accessible,
      message: accessible
        ? `Website accessible. Detected platform: ${detection.platform} (${Math.round(detection.confidence * 100)}% confidence)`
        : `Website may not be accessible, but you can still proceed. Detected platform: ${detection.platform}`,
    });
  } catch (error) {
    logError(`[Onboarding] URL validation failed: ${error}`, error instanceof Error ? error : null);
    res.status(500).json({ error: "Validation failed" });
  }
});

export default router;
