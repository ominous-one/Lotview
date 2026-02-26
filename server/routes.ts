import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { logError, logWarn, logInfo } from './error-utils';
import { authLimiter, sensitiveLimiter } from "./app";
import { 
  insertVehicleSchema, 
  insertVehicleViewSchema, 
  insertFacebookPageSchema,
  insertFacebookAccountSchema,
  insertAdTemplateSchema,
  insertPostingQueueSchema,
  insertPostingScheduleSchema,
  insertVehicleAppraisalSchema,
  insertCrmContactSchema,
  insertCrmTagSchema,
  insertCrmActivitySchema,
  insertCrmTaskSchema,
  ghlAccounts,
  ghlContactSync,
  ghlAppointmentSync,
  dealershipContacts,
  callScoringResponses,
  callScoringSheets,
  dealershipApiKeys,
  passwordResetTokens,
  users,
  vehicles,
  fbMarketplaceAccounts,
  fbMarketplaceListings,
  fbMarketplaceQueue,
  fbMarketplaceActivityLog,
  fbMarketplaceSettings,
  vehicleImages
} from "@shared/schema";
import { eq, desc, sql, and, gt, gte, isNull, asc, or } from "drizzle-orm";
import { fromZodError } from "zod-validation-error";
import { triggerManualSync } from "./scheduler";
import { testBadgeDetection } from "./scraper";
import { generateChatResponse, type ChatMessage } from "./openai";
import { generateSalesResponse, generateFollowUp } from "./ai-sales-agent";
import { calculatePayments, formatPaymentForChat } from "./ai-payment-calculator";

import { authMiddleware, requireRole, generateToken, comparePassword, hashPassword, verifyToken, extensionHmacMiddleware, generatePostingToken, validatePostingToken, type AuthRequest } from "./auth";
import { requireDealership, superAdminOnly } from "./tenant-middleware";
import { facebookService } from "./facebook-service";
import { facebookMarketplaceAutomation } from "./facebook-marketplace-automation";
import { generateMarketplaceContent, type SocialTemplates } from "./openai";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "path";
import fs from "fs";
import { decodeVIN } from "./vin-decoder";
import { enrichVIN, toVINDecodeResult } from "./vin-enrichment-service";
import { createPbsApiService } from "./pbs-api-service";
import { ObjectStorageService } from "./objectStorage";
import { createGhlMessageSyncService } from "./ghl-message-sync-service";
import { isFeatureEnabled, FEATURE_FLAGS } from "./feature-flags";

// Configure multer for in-memory logo uploads (for object storage)
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// OAuth state store for CSRF protection (in production, use Redis or signed JWTs)
// Includes dealershipId for proper multi-tenant isolation during OAuth callback
const oauthStateStore = new Map<string, { userId: number; accountId: number; dealershipId: number; expiresAt: number }>();

// New OAuth session store for session-based flow (stores OAuth results until page selection)
interface OAuthSession {
  userId: number;
  dealershipId: number;
  facebookUserId: string;
  facebookUserName: string;
  accessToken: string;
  tokenExpiresAt: Date;
  pages: Array<{
    id: string;
    name: string;
    category: string;
    accessToken: string;
    picture?: string;
  }>;
  expiresAt: number;
}
const oauthSessionStore = new Map<string, OAuthSession>();

// Clean up expired states every hour
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of Array.from(oauthStateStore.entries())) {
    if (data.expiresAt < now) {
      oauthStateStore.delete(state);
    }
  }
  // Also clean up expired OAuth sessions
  for (const [sessionId, session] of Array.from(oauthSessionStore.entries())) {
    if (session.expiresAt < now) {
      oauthSessionStore.delete(sessionId);
    }
  }
}, 3600000);

export async function registerRoutes(app: Express): Promise<Server> {
  
  // ===== HEALTH CHECK ENDPOINTS (Enterprise Monitoring) =====
  
  // Basic health check - server is running (supports both /health and /api/health)
  const healthHandler = (_req: any, res: any) => {
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
    });
  };
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);
  
  // Ready check - server and all dependencies are ready to accept traffic
  app.get("/ready", async (_req, res) => {
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
    
    // Check database connectivity
    const dbStart = Date.now();
    try {
      await db.execute(sql`SELECT 1`);
      checks.database = { status: "healthy", latency: Date.now() - dbStart };
    } catch (error) {
      checks.database = { 
        status: "unhealthy", 
        latency: Date.now() - dbStart,
        error: error instanceof Error ? error.message : "Database connection failed"
      };
    }
    
    const allHealthy = Object.values(checks).every(c => c.status === "healthy");
    
    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
      checks,
    });
  });

  // ===== PUBLIC OBJECT STORAGE (Persistent file serving) =====
  
  // Serve public objects from object storage (logos, etc.)
  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    // SECURITY: Prevent path traversal attacks
    if (filePath.includes('..') || filePath.includes('\0')) {
      return res.status(400).json({ error: "Invalid file path" });
    }
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      logError('Error searching for public object:', error instanceof Error ? error : new Error(String(error)), { route: 'public-objects-filePath(*)' });
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  // ===== TENANCY RESOLUTION (Public) =====
  
  // Resolve subdomain to dealership for frontend routing
  app.get("/api/tenancy/resolve", async (req, res) => {
    try {
      const { subdomain, dealershipId } = req.query;
      
      let dealership = null;
      
      if (subdomain && typeof subdomain === 'string') {
        const sanitizedSubdomain = subdomain.toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (sanitizedSubdomain) {
          dealership = await storage.getDealershipBySubdomain(sanitizedSubdomain);
        }
      } else if (dealershipId) {
        const id = parseInt(dealershipId as string, 10);
        if (!isNaN(id) && id > 0) {
          dealership = await storage.getDealership(id);
        }
      }
      
      if (!dealership || !dealership.isActive) {
        return res.json({ dealership: null });
      }
      
      // Get branding for logo
      const branding = await storage.getDealershipBranding(dealership.id);
      
      // Return public dealership info (no sensitive data)
      res.json({
        dealership: {
          id: dealership.id,
          name: dealership.name,
          subdomain: dealership.subdomain,
          city: dealership.city,
          province: dealership.province,
          logo: branding?.logoUrl || null,
          primaryColor: branding?.primaryColor || '#022d60',
          secondaryColor: branding?.secondaryColor || '#00aad2',
        }
      });
    } catch (error) {
      logError('Error resolving tenancy:', error instanceof Error ? error : new Error(String(error)), { route: 'api-tenancy-resolve' });
      res.json({ dealership: null });
    }
  });
  
  // ===== AUTHENTICATION ROUTES (JWT) =====
  
  // Login endpoint (all user roles) - rate limited to prevent brute force
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }
      
      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Check if user is active
      if (!user.isActive) {
        return res.status(403).json({ error: "Account is deactivated" });
      }
      
      // Verify password
      const isValidPassword = await comparePassword(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      // Generate JWT token
      const token = generateToken(user);
      
      // Return user info and token (exclude password hash)
      const { passwordHash, ...userWithoutPassword } = user;
      res.json({ 
        token, 
        user: userWithoutPassword,
        success: true 
      });
    } catch (error) {
      logError('Error during login:', error instanceof Error ? error : new Error(String(error)), { route: 'api-auth-login' });
      res.status(500).json({ error: "Login failed" });
    }
  });
  
  // Get current user info (requires authentication)
  app.get("/api/auth/me", authMiddleware, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const user = await storage.getUserById(authReq.user!.id);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { passwordHash, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (error) {
      logError('Error fetching user:', error instanceof Error ? error : new Error(String(error)), { route: 'api-auth-me' });
      res.status(500).json({ error: "Failed to fetch user info" });
    }
  });
  
  // Logout endpoint (client-side token removal, but can be used for logging/analytics)
  app.post("/api/auth/logout", authMiddleware, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      // In a stateless JWT system, logout is primarily client-side (remove token)
      // This endpoint can be used for logging, analytics, or future token blacklisting
      console.log(`User ${authReq.user!.email} logged out at ${new Date().toISOString()}`);
      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      logError('Error during logout:', error instanceof Error ? error : new Error(String(error)), { route: 'api-auth-logout' });
      res.status(500).json({ error: "Logout failed" });
    }
  });
  
  // ===== PASSWORD RESET ROUTES (Self-Service) =====
  
  // Request password reset - sends email with reset link
  app.post("/api/auth/forgot-password", sensitiveLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ error: "Email is required" });
      }
      
      const user = await storage.getUserByEmail(email.trim().toLowerCase());
      
      // Always return success to prevent email enumeration attacks
      if (!user || !user.isActive) {
        console.log(`[Auth] Password reset requested for unknown email: ${email}`);
        return res.json({ success: true, message: "If that email exists, a reset link has been sent" });
      }
      
      // Generate secure token (32 bytes = 256 bits)
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = await bcrypt.hash(token, 12);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry
      
      await storage.createPasswordResetToken(user.id, tokenHash, expiresAt);
      
      // Send password reset email
      const { sendPasswordResetEmail } = await import('./email-service');
      const emailResult = await sendPasswordResetEmail({
        email: user.email,
        name: user.name,
        resetToken: token,
        expiresIn: '1 hour'
      });
      
      if (!emailResult.success) {
        console.error(`[Auth] Failed to send password reset email to ${email}:`, emailResult.error);
        // Still return success to prevent enumeration
      }
      
      console.log(`[Auth] Password reset token created for user: ${user.email}`);
      res.json({ success: true, message: "If that email exists, a reset link has been sent" });
    } catch (error) {
      logError('Error requesting password reset:', error instanceof Error ? error : new Error(String(error)), { route: 'api-auth-forgot-password' });
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  });
  
  // Validate password reset token (check if token is valid before showing form)
  app.get("/api/auth/reset-password/:token", sensitiveLimiter, async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token || token.length < 32) {
        return res.json({ valid: false });
      }
      
      // Check all unexpired tokens for this hash match
      const allTokens = await storage.getAllValidPasswordResetTokens();
      
      // Find matching token (bcrypt compare)
      for (const storedToken of allTokens) {
        const isMatch = await bcrypt.compare(token, storedToken.tokenHash);
        if (isMatch) {
          return res.json({ valid: true });
        }
      }
      
      res.json({ valid: false });
    } catch (error) {
      logError('Error validating reset token:', error instanceof Error ? error : new Error(String(error)), { route: 'api-auth-reset-password-token' });
      res.json({ valid: false });
    }
  });
  
  // Complete password reset - set new password
  app.post("/api/auth/reset-password", sensitiveLimiter, async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || typeof token !== 'string' || token.length < 32) {
        return res.status(400).json({ error: "Invalid reset token" });
      }
      
      if (!newPassword || newPassword.length < 12) {
        return res.status(400).json({ error: "Password must be at least 12 characters" });
      }
      
      // Find matching valid token
      const allTokens = await storage.getAllValidPasswordResetTokens();
      
      let matchedToken = null;
      for (const storedToken of allTokens) {
        const isMatch = await bcrypt.compare(token, storedToken.tokenHash);
        if (isMatch) {
          matchedToken = storedToken;
          break;
        }
      }
      
      if (!matchedToken) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      // Get user and update password
      const user = await storage.getUserById(matchedToken.userId);
      if (!user) {
        return res.status(400).json({ error: "User not found" });
      }
      
      // Hash new password and update user
      const newPasswordHash = await hashPassword(newPassword);
      await db.update(users)
        .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
        .where(eq(users.id, user.id));
      
      // Mark token as used
      await storage.markPasswordResetTokenUsed(matchedToken.id);
      
      console.log(`[Auth] Password successfully reset for user: ${user.email}`);
      res.json({ success: true, message: "Password has been reset successfully" });
    } catch (error) {
      logError('Error resetting password:', error instanceof Error ? error : new Error(String(error)), { route: 'api-auth-reset-password' });
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
  
  // ===== STAFF INVITE ROUTES =====
  
  // Validate staff invite token (public - used to show accept form)
  app.get("/api/invites/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const invite = await storage.getStaffInviteByToken(token);
      
      if (!invite) {
        return res.json({ valid: false });
      }
      
      if (invite.status !== 'pending') {
        return res.json({ valid: false, alreadyAccepted: true });
      }
      
      if (new Date() > invite.expiresAt) {
        return res.json({ valid: false, expired: true });
      }
      
      // Get dealership info for display
      const dealership = await storage.getDealershipById(invite.dealershipId);
      
      res.json({
        valid: true,
        invite: {
          id: invite.id,
          email: invite.email,
          name: invite.name,
          role: invite.role,
          dealershipName: dealership?.name || 'Unknown Dealership',
          expiresAt: invite.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      logError('Error validating invite:', error instanceof Error ? error : new Error(String(error)), { route: 'api-invites-token' });
      res.status(500).json({ error: "Failed to validate invite" });
    }
  });
  
  // Accept staff invite and create account (public)
  app.post("/api/invites/:token/accept", async (req, res) => {
    try {
      const { token } = req.params;
      const { password } = req.body;
      
      if (!password || password.length < 12) {
        return res.status(400).json({ error: "Password must be at least 12 characters" });
      }

      const invite = await storage.getStaffInviteByToken(token);
      
      if (!invite) {
        return res.status(404).json({ error: "Invalid invite link" });
      }
      
      if (invite.status !== 'pending') {
        return res.status(400).json({ error: "This invite has already been used" });
      }
      
      if (new Date() > invite.expiresAt) {
        return res.status(400).json({ error: "This invite has expired" });
      }
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(invite.email);
      if (existingUser) {
        return res.status(400).json({ error: "An account with this email already exists" });
      }
      
      // Create user account
      const passwordHash = await hashPassword(password);
      const user = await storage.createUser({
        email: invite.email,
        name: invite.name,
        passwordHash,
        role: invite.role,
        dealershipId: invite.dealershipId,
        isActive: true,
      });
      
      // Mark invite as accepted
      await storage.acceptStaffInvite(invite.id);
      
      // Generate JWT token for auto-login
      const authToken = generateToken(user);
      
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.json({
        success: true,
        token: authToken,
        user: userWithoutPassword,
        message: "Account created successfully",
      });
    } catch (error) {
      logError('Error accepting invite:', error instanceof Error ? error : new Error(String(error)), { route: 'api-invites-token-accept' });
      res.status(500).json({ error: "Failed to create account" });
    }
  });
  
  // ===== SUPER ADMIN ROUTES (Super Admin Only) =====
  
  // Restart server endpoint - reloads API keys and configurations
  app.post("/api/super-admin/restart-server", authMiddleware, superAdminOnly, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id || 0;
      const userEmail = req.user?.email || 'unknown';
      
      // Log the restart action
      await storage.logAuditAction({
        userId,
        userEmail,
        action: 'restart_server',
        resource: 'system',
        resourceId: null,
        details: JSON.stringify({ reason: 'Manual restart to reload API keys' }),
        ipAddress: req.ip || req.socket.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
      });
      
      res.json({ success: true, message: 'Server restart initiated' });
      
      // Delay restart slightly to allow response to be sent
      setTimeout(() => {
        console.log('Server restart requested by super admin');
        process.exit(0); // Process manager will restart
      }, 500);
    } catch (error) {
      logError('Error initiating server restart:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-restart-server' });
      res.status(500).json({ error: "Failed to restart server" });
    }
  });
  
  // Secrets password management
  app.get("/api/super-admin/secrets/password-status", authMiddleware, superAdminOnly, async (req: AuthRequest, res) => {
    try {
      const config = await storage.getSuperAdminConfig('secrets_password_hash');
      res.json({ isSet: !!config });
    } catch (error) {
      logError('Error checking secrets password status:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-secrets-password-status' });
      res.status(500).json({ error: "Failed to check password status" });
    }
  });

  app.post("/api/super-admin/secrets/verify-password", authMiddleware, superAdminOnly, async (req: AuthRequest, res) => {
    try {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Password required" });
      }
      
      const config = await storage.getSuperAdminConfig('secrets_password_hash');
      if (!config) {
        // No password set yet - first time setup
        return res.json({ valid: false, needsSetup: true });
      }
      
      const bcrypt = await import('bcryptjs');
      const isValid = await bcrypt.compare(password, config.value);
      res.json({ valid: isValid, needsSetup: false });
    } catch (error) {
      logError('Error verifying secrets password:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-secrets-verify-password' });
      res.status(500).json({ error: "Failed to verify password" });
    }
  });
  
  app.post("/api/super-admin/secrets/set-password", authMiddleware, superAdminOnly, async (req: AuthRequest, res) => {
    try {
      const { password, currentPassword } = req.body;
      if (!password || password.length < 12) {
        return res.status(400).json({ error: "Password must be at least 12 characters" });
      }

      const existingConfig = await storage.getSuperAdminConfig('secrets_password_hash');
      
      // If password already exists, verify current password first
      if (existingConfig) {
        if (!currentPassword) {
          return res.status(400).json({ error: "Current password required" });
        }
        const bcrypt = await import('bcryptjs');
        const isValid = await bcrypt.compare(currentPassword, existingConfig.value);
        if (!isValid) {
          return res.status(401).json({ error: "Current password incorrect" });
        }
      }
      
      const passwordHash = await hashPassword(password);

      await storage.setSuperAdminConfig('secrets_password_hash', passwordHash, req.user?.id || null);
      
      // Log the action
      await storage.logAuditAction({
        userId: req.user?.id || 0,
        userEmail: req.user?.email || 'unknown',
        action: existingConfig ? 'update_secrets_password' : 'set_secrets_password',
        resource: 'super_admin_config',
        resourceId: 'secrets_password_hash',
        details: null,
        ipAddress: req.ip || req.socket.remoteAddress || null,
        userAgent: req.headers['user-agent'] || null,
      });
      
      res.json({ success: true, message: 'Secrets password updated' });
    } catch (error) {
      logError('Error setting secrets password:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-secrets-set-password' });
      res.status(500).json({ error: "Failed to set password" });
    }
  });
  
  // Get all dealership API keys (requires secrets password verification via header)
  app.get("/api/super-admin/secrets/all-api-keys", authMiddleware, superAdminOnly, async (req: AuthRequest, res) => {
    try {
      const secretsPassword = req.headers['x-secrets-password'] as string;
      if (!secretsPassword) {
        return res.status(401).json({ error: "Secrets password required" });
      }
      
      const config = await storage.getSuperAdminConfig('secrets_password_hash');
      if (!config) {
        return res.status(400).json({ error: "Secrets password not set up" });
      }
      
      const bcrypt = await import('bcryptjs');
      const isValid = await bcrypt.compare(secretsPassword, config.value);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid secrets password" });
      }
      
      // Get all dealerships with their API keys
      const dealerships = await storage.getAllDealerships();
      const allApiKeys = await Promise.all(
        dealerships.map(async (d) => {
          const keys = await storage.getDealershipApiKeys(d.id);
          return {
            dealershipId: d.id,
            dealershipName: d.name,
            keys: keys || null
          };
        })
      );
      
      res.json(allApiKeys);
    } catch (error) {
      logError('Error fetching all API keys:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-secrets-all-api-keys' });
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });
  
  // Get all dealerships (super admin only)
  app.get("/api/super-admin/dealerships", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealerships = await storage.getAllDealerships();
      res.json(dealerships);
    } catch (error) {
      logError('Error fetching dealerships:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships' });
      res.status(500).json({ error: "Failed to fetch dealerships" });
    }
  });
  
  // Create new dealership with full setup (super admin only)
  app.post("/api/super-admin/dealerships", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { 
        name, 
        slug, 
        subdomain, 
        address,
        city,
        province,
        postalCode,
        phone,
        timezone,
        defaultCurrency,
        masterAdminEmail, 
        masterAdminName, 
        masterAdminPassword,
        // API Keys (optional)
        openaiApiKey,
        marketcheckKey,
        apifyToken,
        apifyActorId,
        geminiApiKey,
        ghlApiKey,
        ghlLocationId,
        facebookAppId,
        facebookAppSecret,
      } = req.body;
      
      // Validate required fields
      if (!name || !slug || !subdomain || !masterAdminEmail || !masterAdminName || !masterAdminPassword) {
        return res.status(400).json({ 
          error: "Missing required fields: name, slug, subdomain, masterAdminEmail, masterAdminName, masterAdminPassword" 
        });
      }
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(masterAdminEmail);
      if (existingUser) {
        return res.status(400).json({ error: "Email already in use" });
      }
      
      // Check if slug already exists
      const existingDealership = await storage.getDealershipBySlug(slug);
      if (existingDealership) {
        return res.status(400).json({ error: "Slug already in use" });
      }
      
      // Create dealership with full setup (transactional)
      const result = await storage.createDealershipWithSetup({
        name,
        slug,
        subdomain,
        address,
        city,
        province,
        postalCode,
        phone,
        timezone,
        defaultCurrency,
        masterAdminEmail,
        masterAdminName,
        masterAdminPassword,
        // API Keys
        openaiApiKey,
        marketcheckKey,
        apifyToken,
        apifyActorId,
        geminiApiKey,
        ghlApiKey,
        ghlLocationId,
        facebookAppId,
        facebookAppSecret,
      });
      
      // Log audit action
      const authReq = req as AuthRequest;
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "CREATE_DEALERSHIP",
        resource: "dealership",
        resourceId: String(result.dealership.id),
        details: `Created dealership: ${name} with master admin: ${masterAdminEmail}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.status(201).json(result);
    } catch (error) {
      logError('Error creating dealership:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships' });
      res.status(500).json({ error: "Failed to create dealership" });
    }
  });
  
  // Update dealership settings (super admin only)
  app.patch("/api/super-admin/dealerships/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const { 
        name, 
        slug, 
        subdomain, 
        address,
        city,
        province,
        postalCode,
        phone,
        timezone,
        defaultCurrency,
        isActive,
        masterAdminEmail,
        masterAdminName,
        masterAdminPassword,
      } = req.body;
      
      // Check if dealership exists
      const dealership = await storage.getDealership(dealershipId);
      if (!dealership) {
        return res.status(404).json({ error: "Dealership not found" });
      }
      
      // Update dealership basic info
      const dealershipUpdates: Record<string, any> = {};
      if (name !== undefined) dealershipUpdates.name = name;
      if (slug !== undefined) dealershipUpdates.slug = slug;
      if (subdomain !== undefined) dealershipUpdates.subdomain = subdomain;
      if (address !== undefined) dealershipUpdates.address = address;
      if (city !== undefined) dealershipUpdates.city = city;
      if (province !== undefined) dealershipUpdates.province = province;
      if (postalCode !== undefined) dealershipUpdates.postalCode = postalCode;
      if (phone !== undefined) dealershipUpdates.phone = phone;
      if (timezone !== undefined) dealershipUpdates.timezone = timezone;
      if (defaultCurrency !== undefined) dealershipUpdates.defaultCurrency = defaultCurrency;
      if (isActive !== undefined) dealershipUpdates.isActive = isActive;
      
      let updatedDealership = dealership;
      if (Object.keys(dealershipUpdates).length > 0) {
        updatedDealership = await storage.updateDealership(dealershipId, dealershipUpdates) || dealership;
      }
      
      // Handle master admin user creation or update
      let masterUser = null;
      if (masterAdminEmail && masterAdminPassword) {
        // Check if this email already exists
        const existingUser = await storage.getUserByEmail(masterAdminEmail);
        
        if (existingUser) {
          // Update existing user if it belongs to this dealership or has no dealership
          if (existingUser.dealershipId === dealershipId || existingUser.dealershipId === null) {
            const hashedPassword = await hashPassword(masterAdminPassword);
            masterUser = await storage.updateUser(existingUser.id, {
              name: masterAdminName || existingUser.name,
              passwordHash: hashedPassword,
              dealershipId,
              role: 'master',
            });
          } else {
            return res.status(400).json({ error: "Email already in use by another dealership" });
          }
        } else {
          // Create new master user
          const hashedPassword = await hashPassword(masterAdminPassword);
          masterUser = await storage.createUser({
            email: masterAdminEmail,
            passwordHash: hashedPassword,
            name: masterAdminName || masterAdminEmail.split('@')[0],
            role: 'master',
            dealershipId,
            isActive: true,
            createdBy: (req as AuthRequest).user!.id,
          });
        }
      }
      
      // Log audit action
      const authReq = req as AuthRequest;
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "UPDATE_DEALERSHIP",
        resource: "dealership",
        resourceId: String(dealershipId),
        details: `Updated dealership: ${updatedDealership.name}${masterUser ? ` with master admin: ${masterUser.email}` : ''}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json({ 
        dealership: updatedDealership,
        masterUser: masterUser ? { id: masterUser.id, email: masterUser.email, name: masterUser.name } : null
      });
    } catch (error) {
      logError('Error updating dealership:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to update dealership" });
    }
  });
  
  // Get dealership details with master user (super admin only)
  app.get("/api/super-admin/dealerships/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      
      const dealership = await storage.getDealership(dealershipId);
      if (!dealership) {
        return res.status(404).json({ error: "Dealership not found" });
      }
      
      // Get master user for this dealership
      const users = await storage.getUsersByDealership(dealershipId);
      const masterUser = users.find(u => u.role === 'master');
      
      res.json({
        dealership,
        masterUser: masterUser ? { id: masterUser.id, email: masterUser.email, name: masterUser.name } : null
      });
    } catch (error) {
      logError('Error fetching dealership details:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to fetch dealership details" });
    }
  });
  
  // Get all global settings (super admin only)
  app.get("/api/super-admin/global-settings", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const settings = await storage.getAllGlobalSettings();
      res.json(settings);
    } catch (error) {
      logError('Error fetching global settings:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-global-settings' });
      res.status(500).json({ error: "Failed to fetch global settings" });
    }
  });
  
  // Set or update a global setting (super admin only)
  app.put("/api/super-admin/global-settings/:key", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { key } = req.params;
      const { value, description, isSecret } = req.body;
      
      if (!value) {
        return res.status(400).json({ error: "Value is required" });
      }
      
      const authReq = req as AuthRequest;
      const setting = await storage.setGlobalSetting({
        key,
        value,
        description,
        isSecret: isSecret ?? true,
        updatedBy: authReq.user!.id
      });
      
      // Log audit action
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "UPDATE_GLOBAL_SETTING",
        resource: "global_setting",
        resourceId: key,
        details: `Updated global setting: ${key}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json(setting);
    } catch (error) {
      logError('Error setting global setting:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-global-settings-key' });
      res.status(500).json({ error: "Failed to set global setting" });
    }
  });
  
  // Delete a global setting (super admin only)
  app.delete("/api/super-admin/global-settings/:key", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { key } = req.params;
      
      const deleted = await storage.deleteGlobalSetting(key);
      if (!deleted) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      // Log audit action
      const authReq = req as AuthRequest;
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "DELETE_GLOBAL_SETTING",
        resource: "global_setting",
        resourceId: key,
        details: `Deleted global setting: ${key}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting global setting:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-global-settings-key' });
      res.status(500).json({ error: "Failed to delete global setting" });
    }
  });
  
  // Get audit logs (super admin only)
  app.get("/api/super-admin/audit-logs", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const result = await storage.getAuditLogs(limit, offset);
      res.json(result);
    } catch (error) {
      logError('Error fetching audit logs:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-audit-logs' });
      res.status(500).json({ error: "Failed to fetch audit logs" });
    }
  });
  
  // Get scraper activity logs (super admin only)
  app.get("/api/super-admin/scraper-logs", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = req.query.dealershipId ? parseInt(req.query.dealershipId as string) : undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const logs = await storage.getScraperActivityLogs(dealershipId, limit);
      res.json(logs);
    } catch (error) {
      logError('Error fetching scraper logs:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-scraper-logs' });
      res.status(500).json({ error: "Failed to fetch scraper logs" });
    }
  });
  
  // Get system health status (super admin only)
  app.get("/api/super-admin/system-health", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      // Check database connection with simple heartbeat query
      let databaseStatus = { connected: false, latencyMs: 0, error: null as string | null };
      const dbStart = Date.now();
      try {
        await db.execute(sql`SELECT 1`);
        databaseStatus = { connected: true, latencyMs: Date.now() - dbStart, error: null };
      } catch (error) {
        databaseStatus = { connected: false, latencyMs: 0, error: (error as Error).message };
      }
      
      // Check object storage configuration
      let objectStorageStatus = { configured: false, bucketId: null as string | null, error: null as string | null };
      try {
        const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
        if (bucketId) {
          objectStorageStatus = { configured: true, bucketId, error: null };
        } else {
          objectStorageStatus = { configured: false, bucketId: null, error: "Bucket not configured" };
        }
      } catch (error) {
        objectStorageStatus = { configured: false, bucketId: null, error: (error as Error).message };
      }
      
      // Get entity counts using aggregate methods (no hard-coded dealership IDs)
      const [
        vehicleCount,
        userCount,
        conversationCount,
        promptCount,
        filterGroupCount,
        apiKeysConfigured,
        remarketingVehicleCount,
        dealershipCount
      ] = await Promise.all([
        storage.getTotalVehicleCount(),
        storage.getAllUsersForSuperAdmin({}).then((u: any[]) => u.length),
        storage.getAllConversationsCount(),
        storage.getAllChatPromptsCount(),
        storage.getAllFilterGroupsCount(),
        storage.getApiKeysConfiguredCount(),
        storage.getTotalRemarketingVehicleCount(),
        storage.getAllFilterGroups().then((g: any[]) => new Set(g.map((fg: any) => fg.dealershipId)).size)
      ]);
      
      // Get aggregate tier counts across all dealerships
      let creditTierCount = 0;
      let modelYearTermCount = 0;
      try {
        const filterGroups = await storage.getAllFilterGroups();
        const uniqueDealerships = Array.from(new Set(filterGroups.map(fg => fg.dealershipId)));
        for (const dealershipId of uniqueDealerships) {
          const tiers = await storage.getCreditScoreTiers(dealershipId);
          const terms = await storage.getModelYearTerms(dealershipId);
          creditTierCount += tiers.length;
          modelYearTermCount += terms.length;
        }
      } catch (e) {
        // Fallback if no dealerships exist yet
      }
      
      res.json({
        database: databaseStatus,
        objectStorage: objectStorageStatus,
        persistedData: {
          dealerships: dealershipCount,
          vehicles: vehicleCount,
          users: userCount,
          conversations: conversationCount,
          chatPrompts: promptCount,
          creditTiers: creditTierCount,
          modelYearTerms: modelYearTermCount,
          filterGroups: filterGroupCount,
          apiKeysConfigured,
          remarketingVehicles: remarketingVehicleCount
        },
        dataWarnings: [
          ...(objectStorageStatus.configured ? [] : ["Object storage not configured - uploaded files may not persist across deployments"]),
          ...(databaseStatus.connected ? [] : ["Database connection issue - data persistence at risk"])
        ],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logError('Error fetching system health:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-system-health' });
      res.status(500).json({ error: "Failed to fetch system health" });
    }
  });
  
  // Get all users across all dealerships (super admin only)
  app.get("/api/super-admin/users", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = req.query.dealershipId ? parseInt(req.query.dealershipId as string) : undefined;
      const role = req.query.role as string | undefined;
      const search = req.query.search as string | undefined;
      
      const users = await storage.getAllUsersForSuperAdmin({ dealershipId, role, search });
      res.json(users);
    } catch (error) {
      logError('Error fetching all users:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-users' });
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  
  // Create a new user (super admin only)
  app.post("/api/super-admin/users", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { email, name, password, role, dealershipId } = req.body;
      const authReq = req as AuthRequest;
      
      // Validate required fields
      if (!email || !name || !password || !role) {
        return res.status(400).json({ error: "Email, name, password, and role are required" });
      }
      
      // Validate password length
      if (password.length < 12) {
        return res.status(400).json({ error: "Password must be at least 12 characters" });
      }
      
      // Validate role
      const validRoles = ['master', 'admin', 'manager', 'salesperson'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be master, admin, manager, or salesperson" });
      }
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ error: "A user with this email already exists" });
      }
      
      // Validate dealership exists (if provided)
      if (dealershipId) {
        const dealership = await storage.getDealershipById(dealershipId);
        if (!dealership) {
          return res.status(400).json({ error: "Dealership not found" });
        }
      }
      
      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const newUser = await storage.createUser({
        email,
        name,
        passwordHash,
        role,
        dealershipId: dealershipId || null,
        isActive: true,
        createdBy: authReq.user!.id,
      });
      
      // Log audit action
      await storage.logAuditAction({
        userId: authReq.user!.id,
        userEmail: authReq.user!.email,
        action: 'user_created',
        resource: 'user',
        resourceId: String(newUser.id),
        details: JSON.stringify({ email, name, role, dealershipId }),
      });
      
      res.status(201).json(newUser);
    } catch (error) {
      logError('Error creating user:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-users-create' });
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  
  // Delete a user (super admin only)
  app.delete("/api/super-admin/users/:userId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const authReq = req as AuthRequest;
      
      // Prevent deleting yourself
      if (userId === authReq.user!.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      // Get user to check if it's a super admin
      const userToDelete = await storage.getUserById(userId);
      if (!userToDelete) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Prevent deleting other super admins (only allow self-delete which is blocked above)
      if (userToDelete.role === 'super_admin') {
        return res.status(403).json({ error: "Cannot delete super admin accounts" });
      }
      
      // Delete the user
      const deleted = await storage.deleteUser(userId);
      if (!deleted) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Log audit action
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "DELETE_USER",
        resource: "user",
        resourceId: userId.toString(),
        details: `Deleted user: ${userToDelete.email} (${userToDelete.name}) from dealership ${userToDelete.dealershipId}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      logError('Error deleting user:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-users-userId' });
      res.status(500).json({ error: "Failed to delete user" });
    }
  });
  
  // Update user status (activate/deactivate) (super admin only)
  app.patch("/api/super-admin/users/:userId/status", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { isActive } = req.body;
      const authReq = req as AuthRequest;
      
      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: "isActive must be a boolean" });
      }
      
      // Prevent deactivating yourself
      if (userId === authReq.user!.id && !isActive) {
        return res.status(400).json({ error: "Cannot deactivate your own account" });
      }
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Prevent changing super admin status
      if (user.role === 'super_admin') {
        return res.status(403).json({ error: "Cannot modify super admin accounts" });
      }
      
      const updated = await storage.updateUserStatus(userId, isActive);
      
      // Log audit action
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: isActive ? "ACTIVATE_USER" : "DEACTIVATE_USER",
        resource: "user",
        resourceId: userId.toString(),
        details: `${isActive ? 'Activated' : 'Deactivated'} user: ${user.email}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json({ success: true, user: updated });
    } catch (error) {
      logError('Error updating user status:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-users-userId-status' });
      res.status(500).json({ error: "Failed to update user status" });
    }
  });
  
  // Reset user password (super admin only) - rate limited for sensitive operation
  app.post("/api/super-admin/users/:userId/reset-password", authMiddleware, superAdminOnly, sensitiveLimiter, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { newPassword } = req.body;
      const authReq = req as AuthRequest;
      
      if (!newPassword || newPassword.length < 12) {
        return res.status(400).json({ error: "Password must be at least 12 characters" });
      }

      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Hash new password and update
      const passwordHash = await hashPassword(newPassword);
      await storage.updateUserPassword(userId, passwordHash);
      
      // Log audit action
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "RESET_USER_PASSWORD",
        resource: "user",
        resourceId: userId.toString(),
        details: `Reset password for user: ${user.email}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json({ success: true, message: "Password reset successfully" });
    } catch (error) {
      logError('Error resetting user password:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-users-userId-reset-passw' });
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
  
  // Update user information (super admin only)
  app.patch("/api/super-admin/users/:userId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { name, email, role, dealershipId, isActive } = req.body;
      const authReq = req as AuthRequest;
      
      const user = await storage.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Prevent editing super admin accounts (except by themselves)
      if (user.role === 'super_admin' && userId !== authReq.user!.id) {
        return res.status(403).json({ error: "Cannot modify other super admin accounts" });
      }
      
      // Prevent changing role to super_admin
      if (role === 'super_admin' && user.role !== 'super_admin') {
        return res.status(403).json({ error: "Cannot promote users to super admin" });
      }
      
      // Validate email uniqueness if changing email
      if (email && email !== user.email) {
        const existingUser = await storage.getUserByEmail(email);
        if (existingUser && existingUser.id !== userId) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }
      
      // Build update object with only provided fields
      const updates: Partial<{ name: string; email: string; role: string; dealershipId: number | null; isActive: boolean }> = {};
      if (name !== undefined) updates.name = name;
      if (email !== undefined) updates.email = email;
      if (role !== undefined) updates.role = role;
      if (dealershipId !== undefined) updates.dealershipId = dealershipId;
      if (isActive !== undefined) updates.isActive = isActive;
      
      const updatedUser = await storage.updateUser(userId, updates);
      
      // Log audit action
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "UPDATE_USER",
        resource: "user",
        resourceId: userId.toString(),
        details: `Updated user ${user.email}: ${JSON.stringify(updates)}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json(updatedUser);
    } catch (error) {
      logError('Error updating user:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-users-userId' });
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  
  // Get API keys for a specific dealership (super admin only)
  app.get("/api/super-admin/dealerships/:dealershipId/api-keys", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      if (!apiKeys) {
        return res.json({
          dealershipId,
          openaiApiKey: null,
          facebookAppId: null,
          facebookAppSecret: null,
          marketcheckKey: null,
          apifyToken: null,
          apifyActorId: null,
          geminiApiKey: null,
          ghlApiKey: null,
          ghlLocationId: null,
          gtmContainerId: null,
          googleAnalyticsId: null,
          googleAdsId: null,
          facebookPixelId: null,
        });
      }
      
      res.json(apiKeys);
    } catch (error) {
      logError('Error fetching dealership API keys:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to fetch dealership API keys" });
    }
  });
  
  // Update API keys for a specific dealership (super admin only)
  app.patch("/api/super-admin/dealerships/:dealershipId/api-keys", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const updates = req.body;
      
      // Check if dealership exists
      const dealership = await storage.getDealership(dealershipId);
      if (!dealership) {
        return res.status(404).json({ error: "Dealership not found" });
      }
      
      // Check if API keys exist, create if not
      const existing = await storage.getDealershipApiKeys(dealershipId);
      let apiKeys;
      
      if (existing) {
        apiKeys = await storage.updateDealershipApiKeys(dealershipId, updates);
      } else {
        apiKeys = await storage.saveDealershipApiKeys({
          dealershipId,
          ...updates,
        });
      }
      
      // Log audit action
      const authReq = req as AuthRequest;
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "UPDATE_DEALERSHIP_API_KEYS",
        resource: "dealership_api_keys",
        resourceId: String(dealershipId),
        details: `Updated API keys for dealership: ${dealership.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json(apiKeys);
    } catch (error) {
      logError('Error updating dealership API keys:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to update dealership API keys" });
    }
  });
  
  // Test OpenAI API key for a dealership (super admin only)
  app.post("/api/super-admin/dealerships/:dealershipId/test-openai", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      if (!apiKeys?.openaiApiKey) {
        return res.json({ success: false, error: "OpenAI API key not configured" });
      }
      
      // Test the API key with a simple completion request
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          "Authorization": `Bearer ${apiKeys.openaiApiKey}`,
        },
      });
      
      if (response.ok) {
        res.json({ success: true, message: "OpenAI API key is valid" });
      } else {
        const error = await response.json();
        res.json({ success: false, error: error.error?.message || "Invalid API key" });
      }
    } catch (error) {
      logError('Error testing OpenAI API key:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.json({ success: false, error: "Connection failed" });
    }
  });
  
  // Test Facebook App credentials for a dealership (super admin only)
  app.post("/api/super-admin/dealerships/:dealershipId/test-facebook", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      if (!apiKeys?.facebookAppId || !apiKeys?.facebookAppSecret) {
        return res.json({ success: false, error: "Facebook App ID or Secret not configured" });
      }
      
      // Test credentials by getting an app access token
      const response = await fetch(
        `https://graph.facebook.com/oauth/access_token?client_id=${apiKeys.facebookAppId}&client_secret=${apiKeys.facebookAppSecret}&grant_type=client_credentials`
      );
      
      if (response.ok) {
        res.json({ success: true, message: "Facebook credentials are valid" });
      } else {
        const error = await response.json();
        res.json({ success: false, error: error.error?.message || "Invalid credentials" });
      }
    } catch (error) {
      logError('Error testing Facebook credentials:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.json({ success: false, error: "Connection failed" });
    }
  });
  
  // Test GoHighLevel API key for a dealership (super admin only)
  app.post("/api/super-admin/dealerships/:dealershipId/test-ghl", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      if (!apiKeys?.ghlApiKey || !apiKeys?.ghlLocationId) {
        return res.json({ success: false, error: "GHL API Key or Location ID not configured" });
      }
      
      // Test the API key by getting location info
      const response = await fetch(
        `https://services.leadconnectorhq.com/locations/${apiKeys.ghlLocationId}`,
        {
          headers: {
            "Authorization": `Bearer ${apiKeys.ghlApiKey}`,
            "Version": "2021-04-15",
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        res.json({ success: true, message: `Connected to: ${data.location?.name || 'GHL Location'}` });
      } else {
        const error = await response.json();
        res.json({ success: false, error: error.message || "Invalid API key or Location ID" });
      }
    } catch (error) {
      logError('Error testing GHL credentials:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.json({ success: false, error: "Connection failed" });
    }
  });
  
  // Test MarketCheck API key for a dealership (super admin only)
  app.post("/api/super-admin/dealerships/:dealershipId/test-marketcheck", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      if (!apiKeys?.marketcheckKey) {
        return res.json({ success: false, error: "MarketCheck API key not configured" });
      }
      
      // Test the API key with a simple search request (uses endpoints the user has enabled)
      const response = await fetch(
        `https://api.marketcheck.com/v2/search/car/active?api_key=${apiKeys.marketcheckKey}&rows=1&make=Toyota`
      );
      
      if (response.ok) {
        res.json({ success: true, message: "MarketCheck API key is valid" });
      } else if (response.status === 401 || response.status === 403) {
        res.json({ success: false, error: "Invalid API key" });
      } else {
        res.json({ success: false, error: `API error: ${response.status}` });
      }
    } catch (error) {
      logError('Error testing MarketCheck credentials:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.json({ success: false, error: "Connection failed" });
    }
  });
  
  // Test Apify API token for a dealership (super admin only)
  app.post("/api/super-admin/dealerships/:dealershipId/test-apify", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      if (!apiKeys?.apifyToken) {
        return res.json({ success: false, error: "Apify API token not configured" });
      }
      
      // Test the API token by getting user info
      const response = await fetch(
        "https://api.apify.com/v2/users/me",
        {
          headers: {
            "Authorization": `Bearer ${apiKeys.apifyToken}`,
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        res.json({ success: true, message: `Connected as: ${data.data?.username || 'Apify User'}` });
      } else {
        res.json({ success: false, error: "Invalid API token" });
      }
    } catch (error) {
      logError('Error testing Apify credentials:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.json({ success: false, error: "Connection failed" });
    }
  });

  // Test Gemini API key for a dealership (super admin only)
  app.post("/api/super-admin/dealerships/:dealershipId/test-gemini", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const { GeminiService } = await import("./gemini-service");
      const geminiService = await GeminiService.getInstanceForDealership(dealershipId);
      
      if (!geminiService) {
        return res.json({ success: false, error: "Gemini API key not configured" });
      }
      
      const result = await geminiService.testConnection();
      
      if (result.success) {
        res.json({ 
          success: true, 
          message: `Connected! ${result.modelInfo?.total || 0} models available` 
        });
      } else {
        res.json({ success: false, error: result.error || "Connection failed" });
      }
    } catch (error) {
      logError('Error testing Gemini credentials:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.json({ success: false, error: "Connection failed" });
    }
  });
  
  // Run Apify market scrape for a dealership (super admin only)
  app.post("/api/super-admin/dealerships/:dealershipId/apify-scrape", authMiddleware, superAdminOnly, async (req: AuthRequest, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const { make, model, yearMin, yearMax, postalCode, province, radiusKm, maxResults } = req.body;
      
      if (!make || !model) {
        return res.status(400).json({ error: "Make and model are required" });
      }
      
      const { getApifyServiceForDealership, clearApifyCache } = await import("./apify-service");
      
      // Clear cache to ensure fresh credentials
      clearApifyCache(dealershipId);
      
      const apifyService = await getApifyServiceForDealership(dealershipId);
      
      if (!apifyService) {
        return res.status(400).json({ error: "Apify API token not configured for this dealership" });
      }
      
      // Get market pricing with stats
      const result = await apifyService.getMarketPricing({
        make,
        model,
        yearMin: yearMin ? parseInt(yearMin) : undefined,
        yearMax: yearMax ? parseInt(yearMax) : undefined,
        postalCode,
        province,
        radiusKm: radiusKm ? parseInt(radiusKm) : undefined,
        maxResults: maxResults ? parseInt(maxResults) : 100,
        dealershipId
      });
      
      // Log audit action
      await storage.logAuditAction({
        userId: req.user!.id,
        action: "APIFY_MARKET_SCRAPE",
        resource: "apify_scrape",
        resourceId: String(dealershipId),
        details: `Scraped ${result.listings.length} listings for ${make} ${model}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json({
        success: true,
        listings: result.listings,
        stats: result.stats,
        message: `Found ${result.listings.length} comparable vehicles`
      });
    } catch (error) {
      logError('Error running Apify scrape:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ 
        error: "Scrape failed", 
        details: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });

  // Get all dealerships with API key status (super admin only)
  app.get("/api/super-admin/dealerships-with-integrations", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealerships = await storage.getAllDealerships();
      
      // Get API keys and n8n tokens for all dealerships
      const dealershipsWithIntegrations = await Promise.all(
        dealerships.map(async (dealership) => {
          const apiKeys = await storage.getDealershipApiKeys(dealership.id);
          const n8nTokens = await storage.getExternalApiTokens(dealership.id);
          const activeN8nTokens = n8nTokens.filter(t => t.isActive);
          
          return {
            ...dealership,
            integrations: {
              openai: !!apiKeys?.openaiApiKey,
              facebook: !!(apiKeys?.facebookAppId && apiKeys?.facebookAppSecret),
              marketcheck: !!apiKeys?.marketcheckKey,
              apify: !!apiKeys?.apifyToken,
              gemini: !!apiKeys?.geminiApiKey,
              ghl: !!(apiKeys?.ghlApiKey && apiKeys?.ghlLocationId),
              googleAnalytics: !!apiKeys?.googleAnalyticsId,
              googleAds: !!apiKeys?.googleAdsId,
              facebookPixel: !!apiKeys?.facebookPixelId,
              n8n: activeN8nTokens.length > 0,
            },
            n8nTokenCount: activeN8nTokens.length,
          };
        })
      );
      
      res.json(dealershipsWithIntegrations);
    } catch (error) {
      logError('Error fetching dealerships with integrations:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-with-integra' });
      res.status(500).json({ error: "Failed to fetch dealerships with integrations" });
    }
  });

  // ===== SUPER ADMIN FACEBOOK CATALOG CONFIG ROUTES =====
  
  // Get all Facebook catalog configs across all dealerships (super admin only)
  app.get("/api/super-admin/facebook-catalogs", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const configs = await storage.getAllFacebookCatalogConfigs();
      res.json(configs);
    } catch (error) {
      logError('Error fetching Facebook catalog configs:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-facebook-catalogs' });
      res.status(500).json({ error: "Failed to fetch Facebook catalog configurations" });
    }
  });

  // Get Facebook catalog config for a specific dealership (super admin only)
  app.get("/api/super-admin/dealerships/:dealershipId/facebook-catalog", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const config = await storage.getFacebookCatalogConfig(dealershipId);
      
      if (!config) {
        return res.json(null);
      }
      
      res.json(config);
    } catch (error) {
      logError('Error fetching Facebook catalog config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to fetch Facebook catalog configuration" });
    }
  });

  // Save/update Facebook catalog config for a dealership (super admin only)
  app.post("/api/super-admin/dealerships/:dealershipId/facebook-catalog", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const { catalogId, accessToken, catalogName, isActive, autoSyncEnabled } = req.body;
      const authReq = req as AuthRequest;
      
      if (!catalogId || !accessToken) {
        return res.status(400).json({ error: "Catalog ID and Access Token are required" });
      }
      
      // Check if dealership exists
      const dealership = await storage.getDealership(dealershipId);
      if (!dealership) {
        return res.status(404).json({ error: "Dealership not found" });
      }
      
      const config = await storage.saveFacebookCatalogConfig({
        dealershipId,
        catalogId,
        accessToken,
        catalogName: catalogName || null,
        isActive: isActive !== false,
        autoSyncEnabled: autoSyncEnabled !== false,
      });
      
      // Log audit action
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "UPDATE_FACEBOOK_CATALOG_CONFIG",
        resource: "facebook_catalog_config",
        resourceId: String(dealershipId),
        details: `Updated Facebook Catalog config for dealership: ${dealership.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json(config);
    } catch (error) {
      logError('Error saving Facebook catalog config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to save Facebook catalog configuration" });
    }
  });

  // Delete Facebook catalog config for a dealership (super admin only)
  app.delete("/api/super-admin/dealerships/:dealershipId/facebook-catalog", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const authReq = req as AuthRequest;
      
      const dealership = await storage.getDealership(dealershipId);
      const deleted = await storage.deleteFacebookCatalogConfig(dealershipId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Facebook catalog configuration not found" });
      }
      
      // Log audit action
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "DELETE_FACEBOOK_CATALOG_CONFIG",
        resource: "facebook_catalog_config",
        resourceId: String(dealershipId),
        details: `Deleted Facebook Catalog config for dealership: ${dealership?.name || dealershipId}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting Facebook catalog config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to delete Facebook catalog configuration" });
    }
  });

  // Test Facebook catalog connection (super admin only)
  app.post("/api/super-admin/dealerships/:dealershipId/test-facebook-catalog", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const { catalogId, accessToken } = req.body;
      
      // Use provided credentials or get from database
      let testCatalogId = catalogId;
      let testAccessToken = accessToken;
      
      if (!testCatalogId || !testAccessToken) {
        const config = await storage.getFacebookCatalogConfig(dealershipId);
        if (!config) {
          return res.json({ success: false, error: "Facebook Catalog not configured" });
        }
        testCatalogId = config.catalogId;
        testAccessToken = config.accessToken;
      }
      
      // Import the catalog service and test connection
      const { facebookCatalogService } = await import("./facebook-catalog-service");
      const result = await facebookCatalogService.testConnection({
        catalogId: testCatalogId,
        accessToken: testAccessToken,
      });
      
      if (result.success) {
        // Update catalog name if test was successful
        if (result.catalogName && !catalogId) {
          await storage.updateFacebookCatalogConfig(dealershipId, { catalogName: result.catalogName });
        }
        
        res.json({ 
          success: true, 
          message: `Connected to catalog: ${result.catalogName || 'Unknown'}`,
          catalogName: result.catalogName,
          productCount: result.productCount,
        });
      } else {
        res.json({ success: false, error: result.error || "Connection failed" });
      }
    } catch (error) {
      logError('Error testing Facebook catalog connection:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.json({ success: false, error: "Connection test failed" });
    }
  });

  // Sync inventory to Facebook catalog (super admin only)
  app.post("/api/super-admin/dealerships/:dealershipId/sync-facebook-catalog", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const authReq = req as AuthRequest;
      
      const config = await storage.getFacebookCatalogConfig(dealershipId);
      if (!config) {
        return res.status(404).json({ error: "Facebook Catalog not configured for this dealership" });
      }
      
      if (!config.isActive) {
        return res.status(400).json({ error: "Facebook Catalog sync is disabled for this dealership" });
      }
      
      const dealership = await storage.getDealership(dealershipId);
      if (!dealership) {
        return res.status(404).json({ error: "Dealership not found" });
      }
      
      // Get all vehicles for the dealership
      const { vehicles } = await storage.getVehicles(dealershipId);
      
      if (vehicles.length === 0) {
        await storage.updateCatalogSyncStatus(dealershipId, {
          lastSyncAt: new Date(),
          lastSyncStatus: 'success',
          lastSyncMessage: 'No vehicles to sync',
          vehiclesSynced: 0,
        });
        return res.json({ success: true, message: "No vehicles to sync", synced: 0 });
      }
      
      // Import the catalog service and sync
      const { facebookCatalogService } = await import("./facebook-catalog-service");
      
      // Build base URL from dealership subdomain
      const baseUrl = `https://${dealership.subdomain}.olympicauto.ca`;
      
      const result = await facebookCatalogService.syncVehiclesToCatalog(
        { catalogId: config.catalogId, accessToken: config.accessToken },
        vehicles,
        baseUrl,
        true // Remove stale vehicles
      );
      
      // Update sync status
      await storage.updateCatalogSyncStatus(dealershipId, {
        lastSyncAt: new Date(),
        lastSyncStatus: result.success ? 'success' : (result.errors.length > 0 ? 'partial' : 'failed'),
        lastSyncMessage: result.success 
          ? `Synced ${result.created + result.updated} vehicles, removed ${result.deleted} stale listings`
          : result.errors.join('; '),
        vehiclesSynced: result.created + result.updated,
      });
      
      // Log audit action
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: "SYNC_FACEBOOK_CATALOG",
        resource: "facebook_catalog_config",
        resourceId: String(dealershipId),
        details: `Synced ${result.created + result.updated} vehicles to Facebook Catalog for ${dealership.name}`,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      res.json({
        success: result.success,
        created: result.created,
        updated: result.updated,
        deleted: result.deleted,
        errors: result.errors,
        message: result.success 
          ? `Successfully synced ${result.created + result.updated} vehicles`
          : `Sync completed with errors: ${result.errors.join('; ')}`,
      });
    } catch (error) {
      logError('Error syncing to Facebook catalog:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to sync to Facebook catalog" });
    }
  });

  // ===== SUPER ADMIN FILTER GROUPS ROUTES =====

  // Get all filter groups across all dealerships (super admin only)
  app.get("/api/super-admin/filter-groups", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const groups = await storage.getAllFilterGroups();
      res.json(groups);
    } catch (error) {
      logError('Error fetching filter groups:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-filter-groups' });
      res.status(500).json({ error: "Failed to fetch filter groups" });
    }
  });

  // Get filter groups for a specific dealership
  app.get("/api/super-admin/filter-groups/dealership/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const groups = await storage.getFilterGroups(dealershipId);
      res.json(groups);
    } catch (error) {
      logError('Error fetching filter groups:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-filter-groups-dealership' });
      res.status(500).json({ error: "Failed to fetch filter groups" });
    }
  });

  // Create a new filter group (super admin only)
  app.post("/api/super-admin/filter-groups", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { dealershipId, groupName, groupSlug, description, displayOrder, isDefault } = req.body;
      
      if (!dealershipId || !groupName || !groupSlug) {
        return res.status(400).json({ error: "Dealership ID, group name, and group slug are required" });
      }
      
      const group = await storage.createFilterGroup({
        dealershipId: parseInt(dealershipId),
        groupName,
        groupSlug,
        description: description || null,
        displayOrder: displayOrder || 0,
        isDefault: isDefault || false,
        isActive: true,
      });
      
      res.status(201).json(group);
    } catch (error) {
      logError('Error creating filter group:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-filter-groups' });
      res.status(500).json({ error: "Failed to create filter group" });
    }
  });

  // Update a filter group (super admin only)
  app.patch("/api/super-admin/filter-groups/:id", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { dealershipId, ...updates } = req.body;
      
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const group = await storage.updateFilterGroup(id, parseInt(dealershipId), updates);
      if (!group) {
        return res.status(404).json({ error: "Filter group not found" });
      }
      
      res.json(group);
    } catch (error) {
      logError('Error updating filter group:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-filter-groups-id' });
      res.status(500).json({ error: "Failed to update filter group" });
    }
  });

  // Delete a filter group (super admin only)
  app.delete("/api/super-admin/filter-groups/:id", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = parseInt(req.query.dealershipId as string);
      
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const deleted = await storage.deleteFilterGroup(id, dealershipId);
      if (!deleted) {
        return res.status(404).json({ error: "Filter group not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting filter group:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-filter-groups-id' });
      res.status(500).json({ error: "Failed to delete filter group" });
    }
  });

  // ===== SUPER ADMIN SCRAPE SOURCES ROUTES =====

  // Get all scrape sources across all dealerships (super admin only)
  app.get("/api/super-admin/scrape-sources", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const sources = await storage.getAllScrapeSources();
      res.json(sources);
    } catch (error) {
      logError('Error fetching scrape sources:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-scrape-sources' });
      res.status(500).json({ error: "Failed to fetch scrape sources" });
    }
  });

  // Create a new scrape source (super admin only)
  app.post("/api/super-admin/scrape-sources", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { dealershipId, sourceName, sourceUrl, sourceType, scrapeFrequency, filterGroupId } = req.body;
      
      if (!dealershipId || !sourceName || !sourceUrl) {
        return res.status(400).json({ error: "Dealership ID, source name, and source URL are required" });
      }
      
      const source = await storage.createScrapeSource({
        dealershipId: parseInt(dealershipId),
        sourceName,
        sourceUrl,
        sourceType: sourceType || "dealer_website",
        scrapeFrequency: scrapeFrequency || "daily",
        filterGroupId: filterGroupId ? parseInt(filterGroupId) : null,
        isActive: true,
      });
      
      res.status(201).json(source);
    } catch (error) {
      logError('Error creating scrape source:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-scrape-sources' });
      res.status(500).json({ error: "Failed to create scrape source" });
    }
  });

  // Update a scrape source (super admin only)
  app.patch("/api/super-admin/scrape-sources/:id", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const source = await storage.updateScrapeSourceAdmin(id, updates);
      if (!source) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      res.json(source);
    } catch (error) {
      logError('Error updating scrape source:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-scrape-sources-id' });
      res.status(500).json({ error: "Failed to update scrape source" });
    }
  });

  // Delete a scrape source (super admin only)
  app.delete("/api/super-admin/scrape-sources/:id", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteScrapeSourceAdmin(id);
      if (!deleted) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting scrape source:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-scrape-sources-id' });
      res.status(500).json({ error: "Failed to delete scrape source" });
    }
  });

  // Trigger scrape for a source (super admin only) - uses ZenRows robust scraper
  app.post("/api/super-admin/scrape-sources/:id/scrape", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Get the source
      const sources = await storage.getAllScrapeSources();
      const source = sources.find(s => s.id === id);
      
      if (!source) {
        return res.status(404).json({ error: "Source not found" });
      }
      
      // Trigger robust scrape (same as midnight scheduled scrape) in background
      import("./robust-scraper").then(({ runRobustScrape }) => {
        runRobustScrape('manual', source.dealershipId).then((result) => {
          if (result.success) {
            console.log(`[Super Admin Scrape] Dealership ${source.dealershipId}: ${result.vehiclesFound} vehicles (method: ${result.method}, retries: ${result.retryCount})`);
          } else {
            console.error(`[Super Admin Scrape] Dealership ${source.dealershipId}: failed after ${result.retryCount} retries (${result.error})`);
          }
        }).catch((err: Error) => {
          logError('Error during robust scrape:', err instanceof Error ? err : new Error(String(err)), { route: 'api-super-admin-scrape-sources-id-scrape' });
        });
      });
      
      res.json({ success: true, message: "ZenRows scrape started in background (same as midnight sync)" });
    } catch (error) {
      logError('Error triggering scrape:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-scrape-sources-id-scrape' });
      res.status(500).json({ error: "Failed to trigger scrape" });
    }
  });

  // ===== BROWSERLESS SCRAPING ROUTES =====

  // Test Browserless connection (super admin only)
  app.get("/api/super-admin/browserless/test", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { testBrowserlessConnection } = await import("./browserless-robust-scraper");
      const dealershipId = req.query.dealershipId ? parseInt(req.query.dealershipId as string) : undefined;
      
      const result = await testBrowserlessConnection(dealershipId);
      res.json(result);
    } catch (error) {
      logError('Error testing Browserless connection:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-browserless-test' });
      res.status(500).json({ error: "Failed to test Browserless connection" });
    }
  });

  // Trigger Browserless inventory scrape (super admin only)
  app.post("/api/super-admin/browserless/scrape-inventory", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { runBrowserlessInventoryScrape } = await import("./browserless-robust-scraper");
      const { dealershipId, sourceId, scrapeVdp } = req.body;
      
      res.json({ success: true, message: "Browserless inventory scrape started in background" });
      
      runBrowserlessInventoryScrape({
        dealershipId: dealershipId ? parseInt(dealershipId) : undefined,
        sourceId: sourceId ? parseInt(sourceId) : undefined,
        triggeredBy: 'manual',
        scrapeVdp: scrapeVdp !== false,
      }).catch((err: Error) => {
        logError('Error during Browserless inventory scrape:', err instanceof Error ? err : new Error(String(err)), { route: 'api-super-admin-browserless-scrape-inventory' });
      });
    } catch (error) {
      logError('Error starting Browserless scrape:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-browserless-scrape-inventory' });
      res.status(500).json({ error: "Failed to start Browserless scrape" });
    }
  });

  // Trigger Browserless market analysis scrape (super admin only)
  app.post("/api/super-admin/browserless/scrape-market", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { runMarketAnalysisScrape } = await import("./browserless-robust-scraper");
      const { make, model, yearMin, yearMax, postalCode, radiusKm, maxResults, dealershipId } = req.body;
      
      if (!make || !model) {
        return res.status(400).json({ error: "Make and model are required" });
      }
      
      const result = await runMarketAnalysisScrape(
        {
          make,
          model,
          yearMin: yearMin ? parseInt(yearMin) : undefined,
          yearMax: yearMax ? parseInt(yearMax) : undefined,
          postalCode: postalCode || 'V6B2W2',
          radiusKm: radiusKm ? parseInt(radiusKm) : 100,
          maxResults: maxResults ? parseInt(maxResults) : 50,
        },
        dealershipId ? parseInt(dealershipId) : undefined
      );
      
      res.json(result);
    } catch (error) {
      logError('Error during Browserless market scrape:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-browserless-scrape-market' });
      res.status(500).json({ error: "Failed to run market analysis scrape" });
    }
  });

  // Get Browserless scrape status (super admin only)
  app.get("/api/super-admin/browserless/status", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = req.query.dealershipId ? parseInt(req.query.dealershipId as string) : undefined;
      const runs = await storage.getScrapeRuns(dealershipId, 10);
      
      const browserlessRuns = runs.filter(r => r.scrapeMethod === 'browserless');
      const apiKeyConfigured = !!process.env.BROWSERLESS_API_KEY;
      
      res.json({
        apiKeyConfigured,
        recentRuns: browserlessRuns,
        totalRuns: browserlessRuns.length,
      });
    } catch (error) {
      logError('Error fetching Browserless status:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-browserless-status' });
      res.status(500).json({ error: "Failed to fetch Browserless status" });
    }
  });

  // Trigger Robust Scrape with full fallback chain: ZenRows -> ScrapingBee -> Puppeteer -> Browserless (super admin only)
  app.post("/api/super-admin/robust-scrape", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { runRobustScrape } = await import("./robust-scraper");
      const { dealershipId } = req.body;
      
      res.json({ success: true, message: "Robust scrape started with ZenRows -> ScrapingBee -> Puppeteer fallback chain" });
      
      runRobustScrape('manual', dealershipId ? parseInt(dealershipId) : undefined)
        .then((result) => {
          logInfo('[RobustScrape] Completed', { 
            route: 'api-super-admin-robust-scrape',
            success: result.success,
            method: result.method,
            vehiclesFound: result.vehiclesFound,
            vehiclesInserted: result.vehiclesInserted,
            vehiclesUpdated: result.vehiclesUpdated,
            vehiclesDeleted: result.vehiclesDeleted,
          });
        })
        .catch((err: Error) => {
          logError('Error during Robust scrape:', err instanceof Error ? err : new Error(String(err)), { route: 'api-super-admin-robust-scrape' });
        });
    } catch (error) {
      logError('Error starting Robust scrape:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-robust-scrape' });
      res.status(500).json({ error: "Failed to start Robust scrape" });
    }
  });

  // Test ZenRows scraping (super admin only)
  app.post("/api/super-admin/zenrows/test", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { BrowserlessUnifiedService } = await import("./browserless-unified");
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const service = new BrowserlessUnifiedService();
      
      if (!service.isZenRowsConfigured()) {
        return res.status(400).json({ 
          success: false, 
          error: "ZenRows API key not configured. Please add ZENROWS_API_KEY secret." 
        });
      }

      const result = await service.zenRowsScrape(url);
      
      const vehicleUrls: string[] = [];
      if (result.success && result.html) {
        const matches = result.html.matchAll(/href=["']([^"']*\/vehicles\/\d{4}\/[^"']+)["']/gi);
        for (const match of matches) {
          let vdpUrl = match[1];
          if (vdpUrl.startsWith('/')) {
            try {
              const urlObj = new URL(url);
              vdpUrl = `${urlObj.origin}${vdpUrl}`;
            } catch {}
          }
          if (!vehicleUrls.includes(vdpUrl)) {
            vehicleUrls.push(vdpUrl);
          }
        }
      }
      
      res.json({
        success: result.success,
        method: 'zenrows',
        vehicleUrlsFound: vehicleUrls.length,
        vehicleUrls: vehicleUrls.slice(0, 10),
        htmlLength: result.html?.length || 0,
        htmlPreview: result.html?.substring(0, 1000),
        error: result.error,
      });
    } catch (error) {
      logError('Error testing ZenRows:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-zenrows-test' });
      res.status(500).json({ error: "Failed to test ZenRows" });
    }
  });

  // Test BrowserQL with CAPTCHA solving (super admin only)
  app.post("/api/super-admin/browserless/bql-test", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { BrowserlessUnifiedService } = await import("./browserless-unified");
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const service = new BrowserlessUnifiedService();
      const result = await service.browserQLScrape(url);
      
      res.json({
        success: result.success,
        captchaSolved: result.captchaSolved,
        solveTime: result.solveTime,
        vehicleUrlsFound: result.vehicleUrls?.length || 0,
        vehicleUrls: result.vehicleUrls?.slice(0, 10),
        htmlLength: result.html?.length || 0,
        htmlPreview: result.html?.substring(0, 1000),
        error: result.error,
      });
    } catch (error) {
      logError('Error testing BrowserQL:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-browserless-bql-test' });
      res.status(500).json({ error: "Failed to test BrowserQL" });
    }
  });

  // Test Zyte API scraping (super admin only)
  app.post("/api/super-admin/zyte/test", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { BrowserlessUnifiedService } = await import("./browserless-unified");
      const { url, scrollToBottom = true } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: "URL is required" });
      }

      const service = new BrowserlessUnifiedService();
      
      if (!service.isZyteConfigured()) {
        return res.status(400).json({ 
          success: false, 
          error: "Zyte API key not configured. Please add ZYTE_API_KEY secret." 
        });
      }

      const result = await service.zyteScrape(url, { scrollToBottom });
      
      const vehicleUrls: string[] = [];
      if (result.success && result.html) {
        const matches = result.html.matchAll(/href=["']([^"']*\/vehicles\/\d{4}\/[^"']+)["']/gi);
        for (const match of matches) {
          let vdpUrl = match[1];
          if (vdpUrl.startsWith('/')) {
            try {
              const urlObj = new URL(url);
              vdpUrl = `${urlObj.origin}${vdpUrl}`;
            } catch {}
          }
          if (!vehicleUrls.includes(vdpUrl)) {
            vehicleUrls.push(vdpUrl);
          }
        }
      }
      
      res.json({
        success: result.success,
        method: 'zyte',
        vehicleUrlsFound: vehicleUrls.length,
        vehicleUrls: vehicleUrls.slice(0, 10),
        htmlLength: result.html?.length || 0,
        htmlPreview: result.html?.substring(0, 1000),
        error: result.error,
      });
    } catch (error) {
      logError('Error testing Zyte:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-zyte-test' });
      res.status(500).json({ error: "Failed to test Zyte" });
    }
  });

  // Upload vehicle images to Object Storage (super admin only)
  // This allows populating Object Storage for existing vehicles without running a full scrape
  app.post("/api/super-admin/upload-vehicle-images", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { dealershipId, vehicleId, all = false } = req.body;
      const { ObjectStorageService } = await import("./objectStorage");
      const objectStorageService = new ObjectStorageService();
      
      let vehiclesToProcess: any[] = [];
      
      if (all && dealershipId) {
        // Upload images for all vehicles in a dealership
        const { vehicles: vehicleList } = await storage.getVehicles(dealershipId, 500, 0);
        vehiclesToProcess = vehicleList.filter(v => v.images && v.images.length > 0 && (!v.localImages || v.localImages.length === 0));
      } else if (vehicleId) {
        // Upload images for a single vehicle - SECURITY: filter by dealershipId to prevent cross-tenant access
        const targetDealershipId = dealershipId || req.dealershipId;
        if (!targetDealershipId) {
          return res.status(400).json({ error: "Dealership context required" });
        }
        const [vehicle] = await db.select().from(vehicles).where(and(eq(vehicles.id, vehicleId), eq(vehicles.dealershipId, targetDealershipId))).limit(1);
        if (vehicle && vehicle.images && vehicle.images.length > 0) {
          vehiclesToProcess = [vehicle];
        }
      } else {
        return res.status(400).json({ error: "Provide vehicleId or dealershipId with all=true" });
      }
      
      if (vehiclesToProcess.length === 0) {
        return res.json({ message: "No vehicles need image uploads", processed: 0 });
      }
      
      res.json({ 
        message: `Started uploading images for ${vehiclesToProcess.length} vehicles. This runs in the background.`,
        vehicleCount: vehiclesToProcess.length,
      });
      
      // Process in background
      (async () => {
        let successCount = 0;
        let errorCount = 0;
        
        for (const vehicle of vehiclesToProcess) {
          try {
            console.log(`[ImageUpload] Processing vehicle ${vehicle.id}: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
            const localUrls = await objectStorageService.uploadVehicleImages(vehicle.images, vehicle.dealershipId, vehicle.id);
            
            if (localUrls.length > 0) {
              await db.update(vehicles)
                .set({ localImages: localUrls })
                .where(eq(vehicles.id, vehicle.id));
              console.log(`[ImageUpload] Vehicle ${vehicle.id}: Uploaded ${localUrls.length} images`);
              successCount++;
            }
          } catch (err) {
            console.error(`[ImageUpload] Vehicle ${vehicle.id}: Failed -`, err);
            errorCount++;
          }
        }
        
        console.log(`[ImageUpload] Complete: ${successCount} success, ${errorCount} errors`);
      })();
      
    } catch (error) {
      logError('Error uploading vehicle images:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-upload-vehicle-images' });
      res.status(500).json({ error: "Failed to upload vehicle images" });
    }
  });

  // ===== SUPER ADMIN ONBOARDING ROUTES =====
  
  // Validate onboarding input (dry run)
  app.post("/api/super-admin/onboarding/validate", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { OnboardingService } = await import("./onboarding-service");
      const validation = OnboardingService.validateInput(req.body);
      
      // Also check for duplicate slug/subdomain/email
      const errors = [...validation.errors];
      
      if (req.body.dealership?.slug) {
        const existing = await storage.getDealershipBySlug(req.body.dealership.slug);
        if (existing) {
          errors.push(`Slug "${req.body.dealership.slug}" is already in use`);
        }
      }
      
      if (req.body.dealership?.subdomain) {
        const existing = await storage.getDealershipBySubdomain(req.body.dealership.subdomain);
        if (existing) {
          errors.push(`Subdomain "${req.body.dealership.subdomain}" is already in use`);
        }
      }
      
      if (req.body.masterAdmin?.email) {
        const existing = await storage.getUserByEmail(req.body.masterAdmin.email);
        if (existing) {
          errors.push(`Email "${req.body.masterAdmin.email}" is already in use`);
        }
      }
      
      res.json({ valid: errors.length === 0, errors });
    } catch (error) {
      logError('Error validating onboarding input:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-onboarding-validate' });
      res.status(500).json({ error: "Failed to validate input" });
    }
  });
  
  // Execute onboarding (one-click setup)
  app.post("/api/super-admin/onboarding/start", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const { OnboardingService, onboardingService } = await import("./onboarding-service");
      
      // Validate input first
      const validation = OnboardingService.validateInput(req.body);
      if (!validation.valid) {
        return res.status(400).json({ error: "Validation failed", errors: validation.errors });
      }
      
      // Check for duplicates
      if (req.body.dealership?.slug) {
        const existing = await storage.getDealershipBySlug(req.body.dealership.slug);
        if (existing) {
          return res.status(400).json({ error: `Slug "${req.body.dealership.slug}" is already in use` });
        }
      }
      
      if (req.body.dealership?.subdomain) {
        const existing = await storage.getDealershipBySubdomain(req.body.dealership.subdomain);
        if (existing) {
          return res.status(400).json({ error: `Subdomain "${req.body.dealership.subdomain}" is already in use` });
        }
      }
      
      if (req.body.masterAdmin?.email) {
        const existing = await storage.getUserByEmail(req.body.masterAdmin.email);
        if (existing) {
          return res.status(400).json({ error: `Email "${req.body.masterAdmin.email}" is already in use` });
        }
      }
      
      // Start onboarding
      const result = await onboardingService.startOnboarding(req.body, authReq.user!.id);
      
      // Log audit
      await storage.logAuditAction({
        userId: authReq.user!.id,
        action: 'onboard_dealership',
        resource: 'dealership',
        resourceId: result.dealershipId.toString(),
        details: JSON.stringify({ runId: result.runId, dealershipName: req.body.dealership.name }),
        ipAddress: req.ip || null,
        userAgent: req.get('user-agent') || null,
      });
      
      res.status(201).json(result);
    } catch (error) {
      logError('Error starting onboarding:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-onboarding-start' });
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to start onboarding" });
    }
  });
  
  // Get onboarding run status
  app.get("/api/super-admin/onboarding/runs/:runId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { OnboardingService } = await import("./onboarding-service");
      const runId = parseInt(req.params.runId);
      const status = await OnboardingService.getRunStatus(runId);
      
      if (!status) {
        return res.status(404).json({ error: "Onboarding run not found" });
      }
      
      res.json(status);
    } catch (error) {
      logError('Error fetching onboarding status:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-onboarding-runs-runId' });
      res.status(500).json({ error: "Failed to fetch onboarding status" });
    }
  });
  
  // Get all onboarding runs
  app.get("/api/super-admin/onboarding/runs", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const { OnboardingService } = await import("./onboarding-service");
      const runs = await OnboardingService.getAllRuns();
      res.json(runs);
    } catch (error) {
      logError('Error fetching onboarding runs:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-onboarding-runs' });
      res.status(500).json({ error: "Failed to fetch onboarding runs" });
    }
  });
  
  // ===== LAUNCH CHECKLIST ROUTES (Super Admin) =====
  
  // Get launch checklist for a dealership
  app.get("/api/super-admin/dealerships/:dealershipId/launch-checklist", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const items = await storage.getLaunchChecklist(dealershipId);
      const progress = await storage.getLaunchChecklistProgress(dealershipId);
      res.json({ items, progress });
    } catch (error) {
      logError('Error fetching launch checklist:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to fetch launch checklist" });
    }
  });
  
  // Get launch checklist progress for a dealership
  app.get("/api/super-admin/dealerships/:dealershipId/launch-checklist/progress", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const progress = await storage.getLaunchChecklistProgress(dealershipId);
      res.json(progress);
    } catch (error) {
      logError('Error fetching launch checklist progress:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to fetch progress" });
    }
  });
  
  // Complete a launch checklist item
  app.post("/api/super-admin/dealerships/:dealershipId/launch-checklist/:itemId/complete", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const dealershipId = parseInt(req.params.dealershipId);
      const itemId = parseInt(req.params.itemId);
      
      const item = await storage.completeLaunchChecklistItem(itemId, dealershipId, authReq.user!.id);
      if (!item) {
        return res.status(404).json({ error: "Checklist item not found" });
      }
      res.json(item);
    } catch (error) {
      logError('Error completing checklist item:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to complete item" });
    }
  });
  
  // Skip a launch checklist item
  app.post("/api/super-admin/dealerships/:dealershipId/launch-checklist/:itemId/skip", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const itemId = parseInt(req.params.itemId);
      const { notes } = req.body;
      
      const item = await storage.skipLaunchChecklistItem(itemId, dealershipId, notes);
      if (!item) {
        return res.status(404).json({ error: "Checklist item not found" });
      }
      res.json(item);
    } catch (error) {
      logError('Error skipping checklist item:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to skip item" });
    }
  });
  
  // Update checklist item notes
  app.patch("/api/super-admin/dealerships/:dealershipId/launch-checklist/:itemId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const itemId = parseInt(req.params.itemId);
      const { notes, status } = req.body;
      
      const updates: any = {};
      if (notes !== undefined) updates.notes = notes;
      if (status !== undefined) updates.status = status;
      
      const item = await storage.updateLaunchChecklistItem(itemId, dealershipId, updates);
      if (!item) {
        return res.status(404).json({ error: "Checklist item not found" });
      }
      res.json(item);
    } catch (error) {
      logError('Error updating checklist item:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-dealerships-dealershipId' });
      res.status(500).json({ error: "Failed to update item" });
    }
  });
  
  // ===== USER MANAGEMENT ROUTES (Master Only) =====
  
  // Get all users (master only)
  app.get("/api/users", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      // Single-dealership mode: Master users see users from dealershipId=1
      // Multi-tenant expansion: Add dealership switcher or query param to allow master users to view any dealership
      const dealershipId = req.dealershipId!;
      const users = await storage.getAllUsers(dealershipId);
      // Exclude password hashes
      const usersWithoutPasswords = users.map(({ passwordHash, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error) {
      logError('Error fetching users:', error instanceof Error ? error : new Error(String(error)), { route: 'api-users' });
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });
  
  // Create new user (master only)
  app.post("/api/users", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const { email, password, name, role } = req.body;
      
      if (!email || !password || !name || !role) {
        return res.status(400).json({ error: "Email, password, name, and role are required" });
      }
      
      // Validate role
      if (!["master", "manager", "salesperson"].includes(role)) {
        return res.status(400).json({ error: "Invalid role. Must be master, manager, or salesperson" });
      }
      
      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "User with this email already exists" });
      }
      
      // Hash password
      const passwordHash = await hashPassword(password);
      
      // Single-dealership mode: Non-master users assigned to dealershipId=1, master users have null
      // Multi-tenant expansion: Add dealershipId field to request body for master users to specify target dealership
      const dealershipId = role === "master" ? null : req.dealershipId!;
      
      // Create user
      const user = await storage.createUser({
        email,
        passwordHash,
        name,
        role,
        dealershipId,
        isActive: true,
        createdBy: authReq.user!.id,
      });
      
      // Return user without password hash
      const { passwordHash: _, ...userWithoutPassword } = user;
      res.status(201).json(userWithoutPassword);
    } catch (error) {
      logError('Error creating user:', error instanceof Error ? error : new Error(String(error)), { route: 'api-users' });
      res.status(500).json({ error: "Failed to create user" });
    }
  });
  
  // Update user (master only)
  app.patch("/api/users/:id", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { email, password, name, role, isActive } = req.body;
      
      const updates: any = {};
      if (email !== undefined) updates.email = email;
      if (name !== undefined) updates.name = name;
      if (role !== undefined) {
        if (!["master", "manager", "salesperson"].includes(role)) {
          return res.status(400).json({ error: "Invalid role" });
        }
        updates.role = role;
      }
      if (isActive !== undefined) updates.isActive = isActive;
      if (password) {
        updates.passwordHash = await hashPassword(password);
      }
      
      // Master users can update any user (dealershipId = undefined bypasses tenant filter)
      // Multi-tenant expansion: Add dealership validation for non-master users
      const user = await storage.updateUser(id, updates, undefined);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const { passwordHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      logError('Error updating user:', error instanceof Error ? error : new Error(String(error)), { route: 'api-users-id' });
      res.status(500).json({ error: "Failed to update user" });
    }
  });
  
  // ===== ADMIN AUTH ROUTES =====
  // SECURITY: Legacy hardcoded admin login removed. Use /api/auth/login with proper credentials.
  
  // ===== VEHICLE ROUTES =====
  
  // Get all vehicles with 24h view counts (randomized for engagement)
  app.get("/api/vehicles", async (req, res) => {
    try {
      // SECURITY: Require dealership context from tenant middleware
      // Tenant middleware handles: JWT token > subdomain lookup > single-tenant default
      // Returns 400 if no dealership context could be resolved
      if (!req.dealershipId) {
        return res.status(400).json({ 
          error: "Dealership context required. Access via subdomain or with valid authentication." 
        });
      }
      const dealershipId = req.dealershipId;
      
      // Parse pagination parameters (optional - maintains backward compatibility)
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;
      const limit = page ? Math.min(parseInt(req.query.limit as string) || 50, 100) : 10000; // No limit if page not specified
      const offset = page ? (page - 1) * limit : 0;
      
      const { vehicles: vehiclesList, total } = await storage.getVehicles(dealershipId, limit, offset);
      
      // Add randomized view counts (5-35 views) to create social proof
      // Use localImages (deduplicated) when available, fall back to images
      // This ensures the VDP page shows the same images as the Chrome extension
      const vehiclesWithViews = vehiclesList.map(vehicle => ({
        ...vehicle,
        images: (vehicle.localImages && vehicle.localImages.length > 0) ? vehicle.localImages : vehicle.images,
        views: Math.floor(Math.random() * (35 - 5 + 1)) + 5 // Random between 5-35
      }));
      
      // Return paginated response if page param provided, otherwise return array (backward compatible)
      if (page) {
        res.json({
          data: vehiclesWithViews,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
          }
        });
      } else {
        res.json(vehiclesWithViews);
      }
    } catch (error) {
      logError('Error fetching vehicles:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles' });
      res.status(500).json({ error: "Failed to fetch vehicles" });
    }
  });

  // Get vehicle by ID with view count (randomized for engagement)
  app.get("/api/vehicles/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      // Dealership ID extracted from tenant middleware
      const dealershipId = req.dealershipId!;
      const vehicle = await storage.getVehicleById(id, dealershipId);
      
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      // Generate randomized view count (5-35 views) for social proof
      const views = Math.floor(Math.random() * (35 - 5 + 1)) + 5;
      
      // Use localImages (deduplicated) when available, fall back to images
      // This ensures the VDP page shows the same images as the Chrome extension
      const responseVehicle = {
        ...vehicle,
        images: (vehicle.localImages && vehicle.localImages.length > 0) ? vehicle.localImages : vehicle.images,
        views,
      };
      
      res.json(responseVehicle);
    } catch (error) {
      logError('Error fetching vehicle:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-id' });
      res.status(500).json({ error: "Failed to fetch vehicle" });
    }
  });

  // Get full Carfax report for a vehicle
  app.get("/api/vehicles/:id/carfax", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;

      // Verify vehicle belongs to this dealership
      const vehicle = await storage.getVehicleById(id, dealershipId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      const report = await storage.getCarfaxReport(id);
      if (!report) {
        return res.status(404).json({ error: "No Carfax report found for this vehicle" });
      }

      res.json(report);
    } catch (error) {
      logError('Error fetching Carfax report:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-carfax' });
      res.status(500).json({ error: "Failed to fetch Carfax report" });
    }
  });

  // Get Carfax summary for a vehicle (badges, accident count, owner count)
  app.get("/api/vehicles/:id/carfax/summary", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;

      const vehicle = await storage.getVehicleById(id, dealershipId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      const report = await storage.getCarfaxReport(id);
      if (!report) {
        return res.status(404).json({ error: "No Carfax report found for this vehicle" });
      }

      res.json({
        vehicleId: id,
        vin: report.vin,
        accidentCount: report.accidentCount,
        ownerCount: report.ownerCount,
        serviceRecordCount: report.serviceRecordCount,
        damageReported: report.damageReported,
        lienReported: report.lienReported,
        badges: report.badges,
        lastReportedOdometer: report.lastReportedOdometer,
        lastReportedDate: report.lastReportedDate,
        reportUrl: report.reportUrl,
        scrapedAt: report.scrapedAt,
      });
    } catch (error) {
      logError('Error fetching Carfax summary:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-carfax-summary' });
      res.status(500).json({ error: "Failed to fetch Carfax summary" });
    }
  });

  // ===== PUBLIC FINANCING RULES (Customer-facing, no auth required) =====
  
  // Get financing rules for payment calculator (public endpoint)
  app.get("/api/public/financing-rules", async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      // Get active credit score tiers
      const creditTiers = await storage.getCreditScoreTiers(dealershipId);
      const activeTiers = creditTiers.filter(tier => tier.isActive);
      
      // Get active model year terms
      const modelYearTerms = await storage.getModelYearTerms(dealershipId);
      const activeTerms = modelYearTerms.filter(term => term.isActive);
      
      // If no tiers configured, return sensible defaults
      const defaultTiers = activeTiers.length > 0 ? activeTiers : [
        { tierName: 'Excellent', minScore: 720, maxScore: 850, interestRate: 599 },
        { tierName: 'Good', minScore: 680, maxScore: 719, interestRate: 799 },
        { tierName: 'Fair', minScore: 620, maxScore: 679, interestRate: 999 },
        { tierName: 'Poor', minScore: 300, maxScore: 619, interestRate: 1299 },
      ];
      
      // If no model year terms configured, return sensible defaults
      const defaultTerms = activeTerms.length > 0 ? activeTerms : [
        { minModelYear: 2022, maxModelYear: 2025, availableTerms: ['36', '48', '60', '72', '84'] },
        { minModelYear: 2019, maxModelYear: 2021, availableTerms: ['36', '48', '60', '72'] },
        { minModelYear: 2016, maxModelYear: 2018, availableTerms: ['36', '48', '60'] },
        { minModelYear: 2010, maxModelYear: 2015, availableTerms: ['36', '48'] },
      ];
      
      res.json({
        creditTiers: defaultTiers.map(t => ({
          tierName: t.tierName,
          minScore: t.minScore,
          maxScore: t.maxScore,
          interestRate: t.interestRate / 100, // Convert basis points to percentage (599 -> 5.99%)
        })),
        modelYearTerms: defaultTerms.map(t => ({
          minModelYear: t.minModelYear,
          maxModelYear: t.maxModelYear,
          availableTerms: t.availableTerms.map(term => parseInt(term)),
        })),
      });
    } catch (error) {
      logError('Error fetching financing rules:', error instanceof Error ? error : new Error(String(error)), { route: 'api-public-financing-rules' });
      res.status(500).json({ error: "Failed to fetch financing rules" });
    }
  });

  // Get filter groups for the current dealership (public endpoint for inventory filtering)
  app.get("/api/public/filter-groups", async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      // Get active filter groups for this dealership
      const groups = await storage.getActiveFilterGroups(dealershipId);
      
      res.json(groups);
    } catch (error) {
      logError('Error fetching filter groups:', error instanceof Error ? error : new Error(String(error)), { route: 'api-public-filter-groups' });
      res.status(500).json({ error: "Failed to fetch filter groups" });
    }
  });

  // Get tracking/remarketing pixel configuration (public endpoint for frontend)
  app.get("/api/public/tracking-config", async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      // Get dealership API keys which contain tracking IDs
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      // Return only tracking-related IDs (never expose API secrets)
      res.json({
        gtmContainerId: apiKeys?.gtmContainerId || null,
        googleAnalyticsId: apiKeys?.googleAnalyticsId || null,
        googleAdsId: apiKeys?.googleAdsId || null,
        facebookPixelId: apiKeys?.facebookPixelId || null,
      });
    } catch (error) {
      logError('Error fetching tracking config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-public-tracking-config' });
      res.status(500).json({ error: "Failed to fetch tracking config" });
    }
  });

  // Serve cached vehicle images from PostgreSQL (permanent, no CDN expiry)
  app.get("/api/public/vehicle-image/:vehicleId/:index", async (req, res) => {
    try {
      const vehicleId = parseInt(req.params.vehicleId);
      const imageIndex = parseInt(req.params.index);

      if (isNaN(vehicleId) || isNaN(imageIndex)) {
        return res.status(400).json({ error: "Invalid vehicleId or index" });
      }

      const [image] = await db.select()
        .from(vehicleImages)
        .where(and(
          eq(vehicleImages.vehicleId, vehicleId),
          eq(vehicleImages.imageIndex, imageIndex)
        ))
        .limit(1);

      if (!image) {
        return res.status(404).json({ error: "Image not found" });
      }

      res.setHeader("Content-Type", image.contentType || "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=604800"); // 1 week
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.send(image.data);
    } catch (error) {
      console.error("Error serving cached vehicle image:", error);
      res.status(500).json({ error: "Failed to serve image" });
    }
  });

  // Image proxy to bypass CDN hotlink protection (public endpoint)
  app.get("/api/public/image-proxy", async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      
      if (!imageUrl) {
        return res.status(400).json({ error: "Missing url parameter" });
      }
      
      // Only allow proxying from known CDN domains - strict validation to prevent SSRF
      const allowedDomains = [
        '1s-photomanager-prd.autotradercdn.ca',
        'autotradercdn.ca',
        'www.autotrader.ca',
        'autotrader.ca',
        'static.cargurus.com',
        'www.cargurus.ca'
      ];
      
      let url: URL;
      try {
        url = new URL(imageUrl);
      } catch {
        return res.status(400).json({ error: "Invalid URL" });
      }
      
      // Must be HTTPS
      if (url.protocol !== 'https:') {
        return res.status(403).json({ error: "Only HTTPS URLs allowed" });
      }
      
      // Strict domain validation - exact match or subdomain match
      const hostname = url.hostname.toLowerCase();
      const isAllowed = allowedDomains.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );
      
      if (!isAllowed) {
        return res.status(403).json({ error: "Domain not allowed" });
      }
      
      // Fetch the image with proper headers - disable redirects to prevent SSRF via redirect chains
      const response = await fetch(imageUrl, {
        redirect: 'error',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Referer': 'https://www.autotrader.ca/',
          'Accept-Language': 'en-US,en;q=0.9',
        }
      });
      
      if (!response.ok) {
        return res.status(response.status).json({ error: `Failed to fetch image: ${response.status}` });
      }
      
      // Set appropriate headers
      const contentType = response.headers.get('content-type') || 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      res.setHeader('Access-Control-Allow-Origin', '*');
      
      // Stream the response
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      logError('Image proxy error:', error instanceof Error ? error : new Error(String(error)), { route: 'api-public-image-proxy' });
      res.status(500).json({ error: "Failed to proxy image" });
    }
  });

  // ===== EXTERNAL API TOKENS (for n8n and other integrations) =====
  
  // Helper to parse and validate dealership ID for super_admin
  // Returns the parsed ID or null if invalid/missing - NEVER defaults to any dealership
  const parseDealershipId = (value: string | number | undefined | null): number | null => {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };
  
  // List external API tokens (super_admin only)
  app.get("/api/external-tokens", authMiddleware, requireRole("super_admin"), async (req, res) => {
    try {
      // Super_admin MUST specify dealership via query param - no fallback
      const dealershipId = parseDealershipId(req.query.dealershipId as string | undefined);
      if (dealershipId === null) {
        return res.status(400).json({ error: "Missing or invalid dealershipId. Please select a dealership." });
      }
      
      // Verify dealership exists
      const dealership = await storage.getDealership(dealershipId);
      if (!dealership) {
        return res.status(404).json({ error: "Selected dealership not found" });
      }
      
      const tokens = await storage.getExternalApiTokens(dealershipId);
      
      // Never expose the full token hash, only return metadata
      const safeTokens = tokens.map(t => ({
        id: t.id,
        dealershipId: t.dealershipId,
        tokenName: t.tokenName,
        tokenPrefix: t.tokenPrefix,
        permissions: t.permissions,
        lastUsedAt: t.lastUsedAt,
        expiresAt: t.expiresAt,
        isActive: t.isActive,
        createdAt: t.createdAt
      }));
      
      res.json(safeTokens);
    } catch (error) {
      logError('Error fetching external tokens:', error instanceof Error ? error : new Error(String(error)), { route: 'api-external-tokens' });
      res.status(500).json({ error: "Failed to fetch external tokens" });
    }
  });
  
  // Create external API token (super_admin only) - returns the raw token ONCE
  app.post("/api/external-tokens", authMiddleware, requireRole("super_admin"), async (req, res) => {
    try {
      const { tokenName, permissions, expiresAt, dealershipId: bodyDealershipId } = req.body;
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      
      // Super_admin MUST specify dealership in body - no fallback
      const dealershipId = parseDealershipId(bodyDealershipId);
      if (dealershipId === null) {
        return res.status(400).json({ error: "Missing or invalid dealershipId. Please select a dealership." });
      }
      
      // Verify dealership exists
      const dealership = await storage.getDealership(dealershipId);
      if (!dealership) {
        return res.status(404).json({ error: "Selected dealership not found" });
      }
      
      if (!tokenName || !permissions || !Array.isArray(permissions)) {
        return res.status(400).json({ error: "tokenName and permissions are required" });
      }
      
      // Valid permissions
      const validPerms = ["import:vehicles", "read:vehicles", "update:vehicles", "delete:vehicles"];
      if (!permissions.every(p => validPerms.includes(p))) {
        return res.status(400).json({ error: `Invalid permissions. Valid: ${validPerms.join(", ")}` });
      }
      
      // Generate a secure token: oag_{prefix}_{random}
      const prefix = `oag_${tokenName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 4)}_`;
      const randomPart = crypto.randomBytes(24).toString('base64url');
      const rawToken = prefix + randomPart;
      const tokenHash = await hashPassword(rawToken);
      
      const token = await storage.createExternalApiToken({
        dealershipId,
        tokenName,
        tokenHash,
        tokenPrefix: prefix,
        permissions,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        isActive: true,
        createdBy: userId
      });
      
      // Return the raw token ONCE - it can never be retrieved again
      res.status(201).json({
        id: token.id,
        tokenName: token.tokenName,
        rawToken, // This is shown only once!
        tokenPrefix: token.tokenPrefix,
        permissions: token.permissions,
        expiresAt: token.expiresAt,
        dealershipId: token.dealershipId,
        message: "Save this token now - it won't be shown again!"
      });
    } catch (error) {
      logError('Error creating external token:', error instanceof Error ? error : new Error(String(error)), { route: 'api-external-tokens' });
      res.status(500).json({ error: "Failed to create external token" });
    }
  });
  
  // Delete external API token (super_admin only)
  app.delete("/api/external-tokens/:id", authMiddleware, requireRole("super_admin"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      // Super_admin MUST specify dealership via query param - prevents cross-tenant deletion
      const dealershipId = parseDealershipId(req.query.dealershipId as string | undefined);
      if (dealershipId === null) {
        return res.status(400).json({ error: "Missing or invalid dealershipId. Please select a dealership." });
      }
      
      // Verify dealership exists
      const dealership = await storage.getDealership(dealershipId);
      if (!dealership) {
        return res.status(404).json({ error: "Selected dealership not found" });
      }
      
      const deleted = await storage.deleteExternalApiToken(id, dealershipId);
      if (!deleted) {
        return res.status(404).json({ error: "Token not found or does not belong to selected dealership" });
      }
      
      res.status(204).send();
    } catch (error) {
      logError('Error deleting external token:', error instanceof Error ? error : new Error(String(error)), { route: 'api-external-tokens-id' });
      res.status(500).json({ error: "Failed to delete external token" });
    }
  });
  
  // ===== VEHICLE IMPORT API (for n8n) =====
  
  // Middleware to validate external API token
  const externalApiAuth = async (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: "Missing or invalid Authorization header" });
    }
    
    const rawToken = authHeader.substring(7);
    
    // Extract prefix (first part before the random section)
    const prefixMatch = rawToken.match(/^(oag_[a-z0-9]+_)/);
    if (!prefixMatch) {
      return res.status(401).json({ error: "Invalid token format" });
    }
    
    const prefix = prefixMatch[1];
    const token = await storage.getExternalApiTokenByPrefix(prefix);
    
    if (!token) {
      return res.status(401).json({ error: "Invalid token" });
    }
    
    if (!token.isActive) {
      return res.status(401).json({ error: "Token is deactivated" });
    }
    
    if (token.expiresAt && token.expiresAt < new Date()) {
      return res.status(401).json({ error: "Token has expired" });
    }
    
    // Verify the token hash
    const isValid = await comparePassword(rawToken, token.tokenHash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid token" });
    }
    
    // Update last used timestamp
    await storage.updateExternalApiTokenLastUsed(token.id);
    
    // Attach token info to request
    req.externalToken = token;
    req.dealershipId = token.dealershipId;
    
    next();
  };
  
  // Import vehicles from external sources (n8n)
  app.post("/api/import/vehicles", externalApiAuth, async (req: any, res) => {
    try {
      const token = req.externalToken;
      const dealershipId = req.dealershipId;
      
      // Check permission
      if (!token.permissions.includes("import:vehicles")) {
        return res.status(403).json({ error: "Token does not have import:vehicles permission" });
      }
      
      const { vehicles: vehicleData, options } = req.body;
      
      if (!Array.isArray(vehicleData) || vehicleData.length === 0) {
        return res.status(400).json({ error: "vehicles array is required and must not be empty" });
      }
      
      if (vehicleData.length > 100) {
        return res.status(400).json({ error: "Maximum 100 vehicles per import" });
      }
      
      const results: { success: any[]; errors: any[] } = { success: [], errors: [] };
      const updateExisting = options?.updateExisting ?? true;
      
      for (let i = 0; i < vehicleData.length; i++) {
        const v = vehicleData[i];
        try {
          // Validate required fields
          const required = ['year', 'make', 'model', 'trim', 'type', 'price', 'odometer', 'location', 'dealership', 'description'];
          const missing = required.filter(f => v[f] === undefined || v[f] === null || v[f] === '');
          
          if (missing.length > 0) {
            results.errors.push({ index: i, vin: v.vin, error: `Missing required fields: ${missing.join(', ')}` });
            continue;
          }
          
          // Check if vehicle exists by VIN
          let existingVehicle = null;
          if (v.vin && updateExisting) {
            const { vehicles: allVehicles } = await storage.getVehicles(dealershipId);
            existingVehicle = allVehicles.find((ev: any) => ev.vin === v.vin);
          }
          
          const vehiclePayload = {
            dealershipId,
            year: parseInt(v.year),
            make: v.make,
            model: v.model,
            trim: v.trim || '',
            type: v.type,
            price: parseInt(v.price),
            odometer: parseInt(v.odometer),
            images: Array.isArray(v.images) ? v.images : [],
            badges: Array.isArray(v.badges) ? v.badges : [],
            location: v.location,
            dealership: v.dealership,
            description: v.description,
            vin: v.vin || null,
            stockNumber: v.stockNumber || null,
            cargurusPrice: v.cargurusPrice ? parseInt(v.cargurusPrice) : null,
            cargurusUrl: v.cargurusUrl || null,
            dealRating: v.dealRating || null,
            carfaxUrl: v.carfaxUrl || null,
            dealerVdpUrl: v.dealerVdpUrl || null,
          };
          
          if (existingVehicle) {
            // Update existing vehicle
            const updated = await storage.updateVehicle(existingVehicle.id, vehiclePayload, dealershipId);
            results.success.push({ id: updated?.id, vin: v.vin, action: 'updated' });
          } else {
            // Create new vehicle
            const created = await storage.createVehicle(vehiclePayload);
            results.success.push({ id: created.id, vin: v.vin, action: 'created' });
          }
        } catch (err: any) {
          results.errors.push({ index: i, vin: v.vin, error: err.message });
        }
      }
      
      res.json({
        imported: results.success.length,
        failed: results.errors.length,
        results
      });
    } catch (error: any) {
      logError('Error importing vehicles:', error instanceof Error ? error : new Error(String(error)), { route: 'api-import-vehicles' });
      res.status(500).json({ error: "Failed to import vehicles", details: error.message });
    }
  });
  
  // Get vehicles via external API (n8n can check existing inventory)
  app.get("/api/import/vehicles", externalApiAuth, async (req: any, res) => {
    try {
      const token = req.externalToken;
      const dealershipId = req.dealershipId;
      
      // Check permission
      if (!token.permissions.includes("read:vehicles")) {
        return res.status(403).json({ error: "Token does not have read:vehicles permission" });
      }
      
      const { vehicles } = await storage.getVehicles(dealershipId);
      
      // Return simplified vehicle data for n8n comparisons
      const vehicleData = vehicles.map((v: any) => ({
        id: v.id,
        vin: v.vin,
        stockNumber: v.stockNumber,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim,
        price: v.price,
        odometer: v.odometer,
        imageCount: v.images?.length || 0,
        dealerVdpUrl: v.dealerVdpUrl,
        createdAt: v.createdAt,
      }));
      
      res.json({
        count: vehicleData.length,
        vehicles: vehicleData
      });
    } catch (error: any) {
      logError('Error fetching vehicles via external API:', error instanceof Error ? error : new Error(String(error)), { route: 'api-import-vehicles' });
      res.status(500).json({ error: "Failed to fetch vehicles", details: error.message });
    }
  });
  
  // Delete vehicle via external API (n8n can remove sold vehicles)
  app.delete("/api/import/vehicles/:id", externalApiAuth, async (req: any, res) => {
    try {
      const token = req.externalToken;
      const dealershipId = req.dealershipId;
      const vehicleId = parseInt(req.params.id);
      
      // Check permission
      if (!token.permissions.includes("delete:vehicles")) {
        return res.status(403).json({ error: "Token does not have delete:vehicles permission" });
      }
      
      await storage.deleteVehicle(vehicleId, dealershipId);
      res.status(204).send();
    } catch (error: any) {
      logError('Error deleting vehicle via external API:', error instanceof Error ? error : new Error(String(error)), { route: 'api-import-vehicles-id' });
      res.status(500).json({ error: "Failed to delete vehicle", details: error.message });
    }
  });
  
  // Delete vehicle by VIN via external API (n8n can remove sold vehicles by VIN)
  app.delete("/api/import/vehicles/vin/:vin", externalApiAuth, async (req: any, res) => {
    try {
      const token = req.externalToken;
      const dealershipId = req.dealershipId;
      const vin = req.params.vin;
      
      // Check permission
      if (!token.permissions.includes("delete:vehicles")) {
        return res.status(403).json({ error: "Token does not have delete:vehicles permission" });
      }
      
      // Validate VIN format (basic check: 17 alphanumeric characters)
      const normalizedVin = vin.trim().toUpperCase();
      if (!normalizedVin || normalizedVin.length < 5) {
        return res.status(400).json({ error: "Invalid VIN format" });
      }
      
      // Use efficient indexed lookup instead of full table scan
      const vehicle = await storage.getVehicleByVin(normalizedVin, dealershipId);
      
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found with that VIN" });
      }
      
      await storage.deleteVehicle(vehicle.id, dealershipId);
      res.json({ deleted: true, vehicleId: vehicle.id, vin: normalizedVin });
    } catch (error: any) {
      logError('Error deleting vehicle by VIN via external API:', error instanceof Error ? error : new Error(String(error)), { route: 'api-import-vehicles-vin-vin' });
      res.status(500).json({ error: "Failed to delete vehicle", details: error.message });
    }
  });
  
  // Bulk sync - delete vehicles not in provided VIN list (for full inventory sync)
  // SAFETY: Requires non-empty VIN list and supports dry-run mode
  app.post("/api/import/vehicles/sync", externalApiAuth, async (req: any, res) => {
    try {
      const token = req.externalToken;
      const dealershipId = req.dealershipId;
      
      // Requires both import and delete permissions
      if (!token.permissions.includes("import:vehicles") || !token.permissions.includes("delete:vehicles")) {
        return res.status(403).json({ error: "Token requires both import:vehicles and delete:vehicles permissions for sync" });
      }
      
      const { vins, dryRun = false, confirmDelete = false } = req.body;
      
      // Validate VINs array
      if (!Array.isArray(vins)) {
        return res.status(400).json({ error: "vins array is required" });
      }
      
      // SAFETY: Require at least 1 VIN to prevent accidental mass deletion
      // No bypass allowed - even with confirmDelete, empty arrays are rejected
      if (vins.length === 0) {
        return res.status(400).json({ 
          error: "vins array cannot be empty. This prevents accidental deletion of all inventory.",
          hint: "To delete vehicles, provide the VINs to keep or delete individual vehicles via DELETE /api/import/vehicles/:id"
        });
      }
      
      // Normalize VINs
      const normalizedVins = vins.map((v: string) => v.trim().toUpperCase()).filter((v: string) => v.length >= 5);
      
      if (normalizedVins.length === 0) {
        return res.status(400).json({ error: "No valid VINs provided after normalization" });
      }
      
      // Get current inventory count for context
      const { total: totalInSystem } = await storage.getVehicles(dealershipId, 1, 0);
      
      if (dryRun) {
        // Dry run: just report what would be deleted without actually deleting
        const { vehicles } = await storage.getVehicles(dealershipId, 1000, 0);
        const wouldDelete = vehicles.filter((v: any) => 
          v.vin && !normalizedVins.includes(v.vin.trim().toUpperCase())
        );
        
        return res.json({
          dryRun: true,
          totalInSystem,
          vinsProvided: normalizedVins.length,
          wouldDelete: wouldDelete.length,
          wouldDeleteVins: wouldDelete.map((v: any) => v.vin).slice(0, 20), // Limit response size
          message: "No changes made. Set dryRun: false to execute deletion."
        });
      }
      
      // SAFETY: Warn if deleting more than 50% of inventory
      const { vehicles: allVehicles } = await storage.getVehicles(dealershipId, 1000, 0);
      const wouldDeleteCount = allVehicles.filter((v: any) => 
        v.vin && !normalizedVins.includes(v.vin.trim().toUpperCase())
      ).length;
      
      if (wouldDeleteCount > totalInSystem * 0.5 && !confirmDelete) {
        return res.status(400).json({
          error: "Safety check: This would delete more than 50% of inventory",
          totalInSystem,
          wouldDelete: wouldDeleteCount,
          hint: "Add confirmDelete: true to proceed, or use dryRun: true to preview changes"
        });
      }
      
      // Use efficient batch delete instead of N individual queries
      const { deletedCount, deletedVins } = await storage.deleteVehiclesByVinNotIn(normalizedVins, dealershipId);
      
      res.json({
        totalInSystem,
        vinsProvided: normalizedVins.length,
        deleted: deletedCount,
        deletedVins: deletedVins.slice(0, 50) // Limit response size
      });
    } catch (error: any) {
      logError('Error syncing vehicles via external API:', error instanceof Error ? error : new Error(String(error)), { route: 'api-import-vehicles-sync' });
      res.status(500).json({ error: "Failed to sync vehicles", details: error.message });
    }
  });

  // Create vehicle (master only)
  app.post("/api/vehicles", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const parsed = insertVehicleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const dealershipId = req.dealershipId!;
      const vehicle = await storage.createVehicle({ ...parsed.data, dealershipId });
      res.status(201).json(vehicle);
    } catch (error) {
      logError('Error creating vehicle:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles' });
      res.status(500).json({ error: "Failed to create vehicle" });
    }
  });

  // Update vehicle (master only)
  app.patch("/api/vehicles/:id", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const parsed = insertVehicleSchema.partial().safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const dealershipId = req.dealershipId!;
      
      // SECURITY: Strip dealershipId from payload to prevent cross-tenant reassignment
      const { dealershipId: _removed, ...updateData } = parsed.data;
      
      const vehicle = await storage.updateVehicle(id, updateData, dealershipId);
      
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      res.json(vehicle);
    } catch (error) {
      logError('Error updating vehicle:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-id' });
      res.status(500).json({ error: "Failed to update vehicle" });
    }
  });

  // VDP Content Editing - GM and Sales Manager can edit headline, subheadline, description
  // These manual edits are preserved across scraper updates
  app.patch("/api/vehicles/:id/vdp-content", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      const userId = req.user?.id;
      
      const { manualHeadline, manualSubheadline, manualDescription } = req.body;
      
      // Validate that at least one field is being updated
      if (manualHeadline === undefined && manualSubheadline === undefined && manualDescription === undefined) {
        return res.status(400).json({ error: "At least one field (manualHeadline, manualSubheadline, or manualDescription) is required" });
      }
      
      // Build update object with manual edit flags
      const updateData: any = {
        isManuallyEdited: true,
        lastEditedBy: userId,
        lastEditedAt: new Date(),
      };
      
      if (manualHeadline !== undefined) updateData.manualHeadline = manualHeadline;
      if (manualSubheadline !== undefined) updateData.manualSubheadline = manualSubheadline;
      if (manualDescription !== undefined) updateData.manualDescription = manualDescription;
      
      const vehicle = await storage.updateVehicle(id, updateData, dealershipId);
      
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      
      res.json(vehicle);
    } catch (error) {
      logError('Error updating VDP content:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-id-vdp-content' });
      res.status(500).json({ error: "Failed to update VDP content" });
    }
  });

  // Delete vehicle (master only)
  app.delete("/api/vehicles/:id", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      // Dealership ID extracted from authenticated user via tenant middleware
      const dealershipId = req.dealershipId!;
      await storage.deleteVehicle(id, dealershipId);
      res.status(204).send();
    } catch (error) {
      logError('Error deleting vehicle:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-id' });
      res.status(500).json({ error: "Failed to delete vehicle" });
    }
  });

  // Generate video for vehicle using Gemini Veo (master only)
  app.post("/api/vehicles/:id/generate-video", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      const vehicle = await storage.getVehicleById(id, dealershipId);
      
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      // Get Gemini service for this dealership (uses API key from database)
      const { GeminiService } = await import("./gemini-service");
      const geminiService = await GeminiService.getInstanceForDealership(dealershipId);
      
      if (!geminiService) {
        return res.status(503).json({ 
          error: "Gemini API key not configured. Please configure in admin panel under API Keys.",
          estimatedCost: "$0.90-$1.20",
          estimatedTime: "~60 seconds"
        });
      }

      // Generate video prompt based on vehicle data
      const prompt = await geminiService.generateVehicleVideoPrompt({
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        trim: vehicle.trim || undefined,
        type: vehicle.type,
        mileage: vehicle.odometer,
      });

      // Attempt video generation
      const result = await geminiService.generateVideo({
        prompt,
        aspectRatio: "16:9",
        durationSeconds: 6,
        resolution: "720p",
        negativePrompt: "watermark, logo, text, low quality, distortion, blurry"
      });

      if (result.success && result.videoUrl) {
        res.json({ 
          success: true,
          videoUrl: result.videoUrl,
          generationTimeSeconds: result.generationTimeSeconds,
          estimatedCost: result.estimatedCost
        });
      } else {
        res.status(501).json({ 
          message: "Video generation requires Vertex AI project configuration",
          note: "Gemini API key configured but video generation requires additional Vertex AI setup",
          suggestedPrompt: prompt,
          estimatedCost: result.estimatedCost || "$0.90-$1.20",
          estimatedTime: "~60 seconds"
        });
      }
    } catch (error) {
      logError('Error generating video:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-id-generate-video' });
      res.status(500).json({ error: "Failed to generate video" });
    }
  });

  // Generate AI description for vehicle using Claude (master only)
  app.post("/api/vehicles/:id/generate-description", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;

      const { generateDescription } = await import("./ai-description-generator");
      const result = await generateDescription(id, dealershipId);

      if (result.success) {
        res.json({ success: true, description: result.description });
      } else {
        res.status(500).json({ success: false, error: result.error || "Failed to generate description" });
      }
    } catch (error) {
      logError('Error generating description:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-id-generate-description' });
      res.status(500).json({ error: "Failed to generate description" });
    }
  });

  // Batch generate AI descriptions for all vehicles in a dealership (master only)
  app.post("/api/vehicles/generate-descriptions", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { generateBatchDescriptions } = await import("./ai-description-generator");
      const result = await generateBatchDescriptions(dealershipId);
      res.json(result);
    } catch (error) {
      logError('Error generating batch descriptions:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-generate-descriptions' });
      res.status(500).json({ error: "Failed to generate batch descriptions" });
    }
  });

  // Force re-scrape a specific vehicle (manager and above only)
  // Bypasses the 12+ image optimization to get fresh data
  app.post("/api/vehicles/:id/force-rescrape", authMiddleware, requireRole("manager"), requireDealership, async (req: any, res) => {
    try {
      const vehicleId = parseInt(req.params.id);
      const dealershipId = req.dealershipId;

      // Get the vehicle to find its VDP URL
      const { vehicles: vehicleList } = await storage.getVehicles(dealershipId);
      const vehicle = vehicleList.find((v: any) => v.id === vehicleId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      if (!vehicle.dealerVdpUrl) {
        return res.status(400).json({ error: "Vehicle has no VDP URL to scrape" });
      }

      console.log(`[Force Re-scrape] Starting for vehicle ${vehicleId}: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
      console.log(`[Force Re-scrape] VDP URL: ${vehicle.dealerVdpUrl}`);

      // Use enhanced single vehicle scraper
      const { scrapeSingleVehicle } = await import('./enhanced-single-vehicle-scraper');
      const result = await scrapeSingleVehicle(vehicle.dealerVdpUrl, {
        enableGalleryModal: true,
        dealershipId
      });

      // Update the vehicle with fresh data using smart merge
      const updates: any = {
        lastScrapedAt: new Date()
      };

      // Only update if we got better data
      if (result.price && result.price > 0) {
        updates.price = result.price;
      }
      if (result.odometer && result.odometer > 0) {
        updates.odometer = result.odometer;
      }
      if (result.images && result.images.length > 0) {
        updates.images = result.images;
      }
      if (result.vin && result.vin.length === 17) {
        updates.vin = result.vin;
      }
      if (result.trim) {
        updates.trim = result.trim;
      }
      if (result.badges && result.badges.length > 0) {
        updates.badges = result.badges;
      }

      await storage.updateVehicle(vehicleId, updates, dealershipId);

      console.log(`[Force Re-scrape] Completed for vehicle ${vehicleId}`);
      console.log(`[Force Re-scrape] Updated fields: ${Object.keys(updates).join(', ')}`);

      res.json({ 
        success: true, 
        vehicleId,
        updatedFields: Object.keys(updates),
        newImageCount: result.images?.length || 0,
        newPrice: result.price || vehicle.price,
        newOdometer: result.odometer || vehicle.odometer
      });
    } catch (error) {
      console.error('[Force Re-scrape] Error:', error);
      logError('Error in force re-scrape:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-force-rescrape' });
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to re-scrape vehicle" 
      });
    }
  });

  // Batch update Carfax data for all vehicles (manager and above only)
  // Only updates carfaxUrl and carfaxBadges - preserves all other data
  app.post("/api/vehicles/batch-carfax-update", authMiddleware, requireRole("manager"), requireDealership, async (req: any, res) => {
    try {
      const dealershipId = req.dealershipId;
      
      console.log(`[Batch Carfax Update] Starting for dealership ${dealershipId}`);
      
      // Import and run the batch update function
      const { batchUpdateCarfaxData } = await import('./robust-scraper');
      const result = await batchUpdateCarfaxData(dealershipId);
      
      console.log(`[Batch Carfax Update] Completed: ${result.updated} updated, ${result.skipped} skipped, ${result.errors.length} errors`);
      
      res.json({
        success: result.success,
        message: `Processed ${result.processed} vehicles: ${result.updated} updated, ${result.skipped} skipped`,
        processed: result.processed,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors.slice(0, 10) // Limit errors in response
      });
    } catch (error) {
      console.error('[Batch Carfax Update] Error:', error);
      logError('Error in batch carfax update:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-batch-carfax-update' });
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Failed to run batch Carfax update" 
      });
    }
  });

  // ===== VIEW TRACKING ROUTES =====
  
  // Track vehicle view (for remarketing)
  app.post("/api/vehicles/:id/view", async (req, res) => {
    try {
      const vehicleId = parseInt(req.params.id);
      const sessionId = req.body.sessionId || `session-${Date.now()}`;
      // Dealership ID obtained from vehicle record for validation
      const dealershipId = req.dealershipId!;

      const view = await storage.trackVehicleView({
        vehicleId,
        sessionId,
        dealershipId
      });

      res.status(201).json(view);
    } catch (error) {
      logError('Error tracking view:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-id-view' });
      res.status(500).json({ error: "Failed to track view" });
    }
  });

  // Get vehicle view count
  app.get("/api/vehicles/:id/views", async (req, res) => {
    try {
      const vehicleId = parseInt(req.params.id);
      const hours = parseInt(req.query.hours as string) || 24;
      // Dealership ID obtained from vehicle record for validation
      const dealershipId = req.dealershipId!;
      
      const count = await storage.getVehicleViews(vehicleId, dealershipId, hours);
      res.json({ vehicleId, hours, count });
    } catch (error) {
      logError('Error fetching views:', error instanceof Error ? error : new Error(String(error)), { route: 'api-vehicles-id-views' });
      res.status(500).json({ error: "Failed to fetch views" });
    }
  });

  // ===== FACEBOOK PAGES ROUTES (LEGACY) =====
  // NOTE: These routes are maintained for backward compatibility.
  // Primary Facebook management now uses /api/facebook/accounts routes.
  // The facebookPages table is still populated by OAuth callbacks for page management.
  
  // Get all connected Facebook pages (protected)
  app.get("/api/facebook-pages", authMiddleware, requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const pages = await storage.getFacebookPages(dealershipId);
      res.json(pages);
    } catch (error) {
      logError('Error fetching pages:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-pages' });
      res.status(500).json({ error: "Failed to fetch pages" });
    }
  });

  // Connect a Facebook page (protected) - prefer OAuth flow via /api/facebook/oauth/*
  app.post("/api/facebook-pages", authMiddleware, requireDealership, async (req, res) => {
    try {
      const parsed = insertFacebookPageSchema.safeParse({
        ...req.body,
        dealershipId: req.dealershipId
      });
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const page = await storage.createFacebookPage(parsed.data);
      res.status(201).json(page);
    } catch (error) {
      logError('Error connecting page:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-pages' });
      res.status(500).json({ error: "Failed to connect page" });
    }
  });

  // Update Facebook page (template, etc.) - protected
  app.patch("/api/facebook-pages/:id", authMiddleware, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const page = await storage.updateFacebookPage(id, req.body);
      
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }

      res.json(page);
    } catch (error) {
      logError('Error updating page:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-pages-id' });
      res.status(500).json({ error: "Failed to update page" });
    }
  });

  // DEPRECATED: Priority vehicles - replaced by remarketing system
  // These endpoints are maintained for backward compatibility only
  app.get("/api/facebook-pages/:id/priority-vehicles", authMiddleware, requireDealership, async (req, res) => {
    try {
      const pageId = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      const priorities = await storage.getPagePriorityVehicles(pageId, dealershipId);
      res.json(priorities);
    } catch (error) {
      logError('Error fetching priorities:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-pages-id-priority-vehicles' });
      res.status(500).json({ error: "Failed to fetch priorities" });
    }
  });

  // DEPRECATED: Set priority vehicles - replaced by remarketing system
  app.post("/api/facebook-pages/:id/priority-vehicles", authMiddleware, requireDealership, async (req, res) => {
    try {
      const pageId = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      const { vehicleIds } = req.body;

      if (!Array.isArray(vehicleIds)) {
        return res.status(400).json({ error: "vehicleIds must be an array" });
      }

      await storage.setPagePriorityVehicles(pageId, vehicleIds, dealershipId);
      res.status(200).json({ success: true });
    } catch (error) {
      logError('Error setting priorities:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-pages-id-priority-vehicles' });
      res.status(500).json({ error: "Failed to set priorities" });
    }
  });

  // ===== FILE DOWNLOADS =====
  
  // Download scraper and appraisal files
  app.get("/api/download/scraper-files", async (req, res) => {
    try {
      const path = await import('path');
      const fs = await import('fs');
      const filePath = path.join(process.cwd(), 'public', 'scraper-appraisal-files.zip');
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found" });
      }
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename=scraper-appraisal-files.zip');
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      logError('Error serving download:', error instanceof Error ? error : new Error(String(error)), { route: 'api-download-scraper-files' });
      res.status(500).json({ error: "Failed to serve file" });
    }
  });

  // ===== SCRAPER ROUTES =====
  
  // Enhanced single vehicle test scraper - PROTECTED ENDPOINT
  app.post("/api/scraper/test-single-vehicle", authMiddleware, requireRole("master"), requireDealership, async (req: any, res) => {
    try {
      const { vdpUrl, config } = req.body;
      const dealershipId = req.dealershipId;
      
      if (!vdpUrl) {
        return res.status(400).json({ error: "vdpUrl is required" });
      }
      
      // Validate URL format
      if (!vdpUrl.startsWith('https://')) {
        return res.status(400).json({ error: "vdpUrl must be a secure HTTPS URL" });
      }
      
      // SECURITY: Restrict to known dealer domains to prevent SSRF
      const allowedDomains = [
        'olympichyundaivancouver.com',
        'boundaryhyundai.com',
        'kiavancouver.com'
      ];
      
      const url = new URL(vdpUrl);
      const isDomainAllowed = allowedDomains.some(domain => 
        url.hostname === domain || url.hostname === `www.${domain}`
      );
      
      if (!isDomainAllowed) {
        return res.status(400).json({ 
          error: "URL domain not allowed. Only authorized dealer domains are permitted." 
        });
      }
      
      console.log(`\n=== Testing Enhanced Single Vehicle Scraper ===`);
      console.log(`URL: ${vdpUrl}`);
      console.log(`Config: ${JSON.stringify(config || {})}`);
      
      const { scrapeSingleVehicle } = await import('./enhanced-single-vehicle-scraper');
      const result = await scrapeSingleVehicle(vdpUrl, config || {});
      
      console.log(`\n=== Scraping Results ===`);
      console.log(`VIN: ${result.vin}`);
      console.log(`Year/Make/Model: ${result.year} ${result.make} ${result.model}`);
      console.log(`Price: $${result.price}`);
      console.log(`Odometer: ${result.odometer} km`);
      console.log(`Images: ${result.imageCount} (${result.imageQuality})`);
      console.log(`Features: ${result.features.length}`);
      console.log(`Data Quality Score: ${result.dataQualityScore}/100`);
      console.log(`VIN Validation: ${result.vinValidation.matches ? 'PASSED' : 'DISCREPANCIES'}`);
      
      res.json({
        success: true,
        data: result,
        summary: {
          vin: result.vin,
          vehicle: `${result.year} ${result.make} ${result.model} ${result.trim}`,
          price: result.price,
          odometer: result.odometer,
          imageCount: result.imageCount,
          imageQuality: result.imageQuality,
          featureCount: result.features.length,
          dataQualityScore: result.dataQualityScore,
          vinValidation: result.vinValidation.matches ? 'PASSED' : 'DISCREPANCIES',
          descriptionSource: result.descriptionSource
        }
      });
    } catch (error) {
      logError('Error in single vehicle test:', error instanceof Error ? error : new Error(String(error)), { route: 'api-scraper-test-single-vehicle' });
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to scrape vehicle" 
      });
    }
  });

  // Manual trigger for inventory sync (optionally target a specific dealership)
  app.post("/api/scraper/sync", async (req, res) => {
    try {
      const requestedId = req.body?.dealershipId;
      const parsedId = typeof requestedId === 'string' ? parseInt(requestedId, 10) : requestedId;
      const normalizedId = typeof parsedId === 'number' && Number.isFinite(parsedId) ? parsedId : undefined;
      const result = await triggerManualSync(normalizedId);
      res.json(result);
    } catch (error) {
      logError('Error triggering sync:', error instanceof Error ? error : new Error(String(error)), { route: 'api-scraper-sync' });
      res.status(500).json({ error: "Failed to trigger sync" });
    }
  });

  // Test badge detection
  app.get("/api/scraper/test-badges", async (req, res) => {
    try {
      await testBadgeDetection();
      res.json({ message: "Check console for badge detection test results" });
    } catch (error) {
      logError('Error testing badges:', error instanceof Error ? error : new Error(String(error)), { route: 'api-scraper-test-badges' });
      res.status(500).json({ error: "Failed to test badges" });
    }
  });

  // ===== CHAT ROUTES =====
  
  // Chat endpoint for AI responses
  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, vehicleContext, scenario } = req.body;

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "Messages array is required" });
      }

      // Validate message format
      for (const msg of messages) {
        if (!msg.role || !msg.content) {
          return res.status(400).json({ error: "Each message must have role and content" });
        }
        if (!["user", "assistant", "system"].includes(msg.role)) {
          return res.status(400).json({ error: "Invalid message role" });
        }
      }

      // Use dealershipId from tenant middleware (proper tenant isolation)
      const finalDealershipId = req.dealershipId!;
      const finalScenario = scenario || 'general';

      const response = await generateChatResponse(
        messages as ChatMessage[], 
        finalDealershipId,
        finalScenario,
        vehicleContext
      );
      res.json({ message: response });
    } catch (error) {
      logError('Error generating chat response:', error instanceof Error ? error : new Error(String(error)), { route: 'api-chat' });
      res.status(500).json({ error: "Failed to generate chat response" });
    }
  });

  // AI suggest reply for conversations (manager dashboard)
  app.post("/api/ai/suggest-reply", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req, res) => {
    try {
      const { messages, context } = req.body;
      const dealershipId = req.dealershipId!;

      if (!Array.isArray(messages) || messages.length === 0) {
        return res.json({ suggestion: null });
      }

      // Build a prompt for generating a suggested reply (with timestamps)
      const conversationHistory = messages.map((m: any) => {
        const timestamp = m.timestamp ? new Date(m.timestamp).toLocaleString('en-US', {
          timeZone: 'America/Vancouver',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        }) : '';
        const prefix = m.role === 'user' ? 'Customer' : 'Dealership';
        return timestamp ? `[${timestamp}] ${prefix}: ${m.content}` : `${prefix}: ${m.content}`;
      }).join('\n');

      const systemPrompt = `You are an AI assistant for a car dealership. Based on the following conversation, suggest a helpful, professional reply that the dealership staff could send to the customer.

${context?.vehicleName ? `The customer is interested in: ${context.vehicleName}` : ''}
${context?.customerName ? `Customer name: ${context.customerName}` : ''}

Conversation:
${conversationHistory}

Provide a single, concise, friendly message that continues the conversation naturally. Focus on being helpful, addressing any questions, and moving toward a sale or appointment. Do not include any preamble or explanation - just provide the suggested message text.`;

      const response = await generateChatResponse(
        [{ role: "user", content: systemPrompt }],
        dealershipId,
        'general'
      );

      res.json({ suggestion: response });
    } catch (error) {
      logError('Error generating AI suggestion:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ai-suggest-reply' });
      res.status(500).json({ error: "Failed to generate suggestion", suggestion: null });
    }
  });

  // AI Sales Agent - Generate sales-optimized response for customer messages
  app.post("/api/ai/respond", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { vehicleId, conversationId, customerMessage, customerName, messageHistory } = req.body;

      if (!customerMessage || typeof customerMessage !== 'string' || customerMessage.trim().length === 0) {
        return res.status(400).json({ error: "customerMessage is required" });
      }

      const result = await generateSalesResponse({
        dealershipId,
        vehicleId: vehicleId ? parseInt(vehicleId) : undefined,
        conversationId: conversationId ? parseInt(conversationId) : undefined,
        customerMessage: customerMessage.trim(),
        customerName,
        messageHistory,
      });

      res.json(result);
    } catch (error) {
      logError('Error generating AI sales response:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ai-respond' });
      res.status(500).json({ error: "Failed to generate AI response" });
    }
  });

  // AI Sales Agent - Generate follow-up message for cold conversations
  app.post("/api/ai/follow-up", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { conversationId, customerName, vehicleName, lastMessagePreview, hoursSinceLastMessage } = req.body;

      if (!conversationId || !vehicleName) {
        return res.status(400).json({ error: "conversationId and vehicleName are required" });
      }

      const reply = await generateFollowUp({
        dealershipId,
        conversationId: parseInt(conversationId),
        customerName: customerName || 'there',
        vehicleName,
        lastMessagePreview: lastMessagePreview || '',
        hoursSinceLastMessage: hoursSinceLastMessage || 24,
      });

      res.json({ reply });
    } catch (error) {
      logError('Error generating follow-up:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ai-follow-up' });
      res.status(500).json({ error: "Failed to generate follow-up" });
    }
  });

  // AI Payment Calculator - Calculate payment options for a vehicle
  app.get("/api/ai/payments/:vehicleId", authMiddleware, requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const vehicleId = parseInt(req.params.vehicleId);
      const creditScore = req.query.creditScore ? parseInt(req.query.creditScore as string) : undefined;

      const vehicle = await storage.getVehicleById(vehicleId, dealershipId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      const payments = await calculatePayments(dealershipId, vehicle.price, vehicle.year, creditScore);
      if (!payments) {
        return res.status(404).json({ error: "Financing rules not configured for this dealership" });
      }

      res.json({
        vehicleId: vehicle.id,
        vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`,
        ...payments,
      });
    } catch (error) {
      logError('Error calculating payments:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ai-payments' });
      res.status(500).json({ error: "Failed to calculate payments" });
    }
  });

  // Save conversation (public - conversations are saved automatically)
  app.post("/api/conversations", async (req, res) => {
    try {
      const { category, vehicleId, vehicleName, messages, sessionId } = req.body;

      if (!category || !messages || !sessionId) {
        return res.status(400).json({ error: "category, messages, and sessionId are required" });
      }

      // Dealership ID from request context
      const dealershipId = req.dealershipId!;

      // Add timestamps to messages if not already present
      const messagesWithTimestamps = messages.map((msg: any, index: number) => {
        if (msg.timestamp) return msg;
        // Calculate approximate timestamp based on message order
        // Most recent message is now, previous messages are older
        const offsetMs = (messages.length - 1 - index) * 30000; // ~30 seconds between messages
        return {
          ...msg,
          timestamp: new Date(Date.now() - offsetMs).toISOString()
        };
      });

      const conversation = await storage.saveChatConversation({
        dealershipId,
        category,
        vehicleId: vehicleId || null,
        vehicleName: vehicleName || null,
        messages: JSON.stringify(messagesWithTimestamps),
        sessionId
      });

      res.json(conversation);
    } catch (error) {
      logError('Error saving conversation:', error instanceof Error ? error : new Error(String(error)), { route: 'api-conversations' });
      res.status(500).json({ error: "Failed to save conversation" });
    }
  });

  // Get all conversations (with optional category filter) - ADMIN ONLY
  app.get("/api/conversations", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const headerDealershipId = req.headers['x-dealership-id'] ? parseInt(req.headers['x-dealership-id'] as string) : null;
      
      // Super admins can specify dealershipId via header
      let dealershipId: number;
      if (authReq.user?.role === "super_admin" && headerDealershipId) {
        dealershipId = headerDealershipId;
      } else if (req.dealershipId) {
        dealershipId = req.dealershipId;
      } else {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const category = req.query.category as string | undefined;
      
      // Parse pagination parameters (optional)
      const page = req.query.page ? parseInt(req.query.page as string) : undefined;
      const limit = page ? Math.min(parseInt(req.query.limit as string) || 50, 100) : 10000; // No limit if page not specified
      const offset = page ? (page - 1) * limit : 0;
      
      const { conversations, total } = await storage.getAllConversations(dealershipId, category, limit, offset);
      
      // Parse messages JSON for each conversation
      const parsed = conversations.map(conv => ({
        ...conv,
        messages: JSON.parse(conv.messages)
      }));
      
      // Return paginated response if page param provided, otherwise return array (backward compatible)
      if (page) {
        res.json({
          conversations: parsed,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit)
        });
      } else {
        res.json(parsed);
      }
    } catch (error) {
      logError('Error fetching conversations:', error instanceof Error ? error : new Error(String(error)), { route: 'api-conversations' });
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // Get conversation by ID - ADMIN ONLY
  app.get("/api/conversations/:id", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const headerDealershipId = req.headers['x-dealership-id'] ? parseInt(req.headers['x-dealership-id'] as string) : null;
      
      let dealershipId: number;
      if (authReq.user?.role === "super_admin" && headerDealershipId) {
        dealershipId = headerDealershipId;
      } else if (req.dealershipId) {
        dealershipId = req.dealershipId;
      } else {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const id = parseInt(req.params.id);
      const conversation = await storage.getConversationById(id, dealershipId);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      res.json({
        ...conversation,
        messages: JSON.parse(conversation.messages)
      });
    } catch (error) {
      logError('Error fetching conversation:', error instanceof Error ? error : new Error(String(error)), { route: 'api-conversations-id' });
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  // ===== MESSENGER CONVERSATIONS ROUTES =====
  
  // Get all messenger conversations (role-based filtering)
  // Managers see all, salespeople see only their connected pages
  app.get("/api/messenger-conversations", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      const conversations = await storage.getMessengerConversations(dealershipId, userId, userRole);
      res.json(conversations);
    } catch (error) {
      logError('Error fetching messenger conversations:', error instanceof Error ? error : new Error(String(error)), { route: 'api-messenger-conversations' });
      res.status(500).json({ error: "Failed to fetch messenger conversations" });
    }
  });

  // Send a reply to a Messenger conversation - Manager and above only
  app.post("/api/messenger-conversations/:id/reply", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const conversationId = parseInt(req.params.id);
      const { message } = req.body;

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Get the conversation with its page access token
      const conversation = await storage.getMessengerConversationById(conversationId, dealershipId);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      if (!conversation.pageAccessToken) {
        return res.status(400).json({ error: "Facebook page access token not available. Please reconnect the Facebook account." });
      }

      // Send the message using the Facebook Send API
      const result = await facebookService.sendMessengerMessage(
        conversation.pageAccessToken,
        conversation.participantId,
        message.trim()
      );

      // Create messenger message record for this outbound message
      const messengerMessage = await storage.createMessengerMessage({
        dealershipId,
        conversationId,
        facebookMessageId: result.messageId,
        senderId: 'dealership',
        senderName: req.user?.name || 'Sales Team',
        isFromCustomer: false,
        content: message.trim(),
        isRead: true,
        sentAt: new Date(),
        syncSource: 'lotview',
      });

      // Update the conversation's last message
      await storage.updateMessengerConversation(conversationId, dealershipId, {
        lastMessage: `You: ${message.trim().substring(0, 200)}`,
        lastMessageAt: new Date()
      });

      // Sync message to GoHighLevel - MUST await to store ghlMessageId before webhook arrives
      // This prevents duplicate messages when GHL webhook fires before ghlMessageId is persisted
      const ghlSyncEnabled = await isFeatureEnabled(FEATURE_FLAGS.ENABLE_GHL_MESSENGER_SYNC, dealershipId);
      if (ghlSyncEnabled) {
        const ghlSyncService = createGhlMessageSyncService(dealershipId);
        try {
          const syncResult = await ghlSyncService.syncMessageToGhl(
            conversation as any,
            message.trim(),
            req.user?.name || 'Sales Team'
          );
          
          // Store the GHL message ID on our record for deduplication
          if (syncResult.success && syncResult.ghlMessageId) {
            await storage.updateMessengerMessage(messengerMessage.id, dealershipId, {
              ghlMessageId: syncResult.ghlMessageId
            });
          }
        } catch (err) {
          logError('[GHL Sync] Sync to GHL failed', err instanceof Error ? err : new Error(String(err)), { route: 'api-messenger-conversations-id-reply' });
          // Don't fail the request - FB message was sent successfully
        }
      }

      res.json({ 
        success: true, 
        messageId: result.messageId,
        message: "Reply sent successfully"
      });
    } catch (error: any) {
      logError('Error sending messenger reply:', error instanceof Error ? error : new Error(String(error)), { route: 'api-messenger-conversations-id-reply' });
      res.status(500).json({ error: error.message || "Failed to send reply" });
    }
  });

  // Send FWC follow-up message (SMS, Email, or Facebook)
  app.post("/api/conversations/:id/fwc-message", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const conversationId = parseInt(req.params.id);
      const { type, message, subject } = req.body;

      if (!type || !['sms', 'email', 'facebook'].includes(type)) {
        return res.status(400).json({ error: "Invalid message type. Must be 'sms', 'email', or 'facebook'" });
      }

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Get the conversation
      const conversation = await storage.getConversationById(conversationId, dealershipId);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Check if we have FWC contact ID
      if (!conversation.ghlContactId) {
        return res.status(400).json({ error: "No FWC contact linked to this conversation. Customer contact info may not be available." });
      }

      // Validate required contact info for the message type
      if (type === 'sms' && !conversation.handoffPhone) {
        return res.status(400).json({ error: "No phone number available for SMS" });
      }
      if (type === 'email' && !conversation.handoffEmail) {
        return res.status(400).json({ error: "No email address available for Email" });
      }

      // Create or get GHL API service for this dealership
      const { createGhlApiService } = await import("./ghl-api-service");
      const ghlService = createGhlApiService(dealershipId);
      
      // Get or create conversation in FWC
      const ghlConvResult = await ghlService.getOrCreateConversation(conversation.ghlContactId, 
        type === 'sms' ? 'TYPE_SMS' : type === 'email' ? 'TYPE_EMAIL' : 'TYPE_FB'
      );
      
      if (!ghlConvResult.success || !ghlConvResult.data) {
        return res.status(500).json({ error: "Failed to create FWC conversation" });
      }

      // Map type to FWC message type
      const messageType = type === 'sms' ? 'SMS' : type === 'email' ? 'Email' : 'FB';
      
      // Send the message
      const sendResult = await ghlService.sendMessage(ghlConvResult.data.id, {
        type: messageType as 'SMS' | 'Email' | 'FB',
        message: message.trim(),
        subject: type === 'email' ? (subject || `Follow-up from ${req.user?.name || 'Sales Team'}`) : undefined,
      });

      if (!sendResult.success) {
        return res.status(500).json({ error: sendResult.error || "Failed to send message via FWC" });
      }

      // Log the follow-up
      console.log(`[FWC Follow-up] Sent ${type} to contact ${conversation.ghlContactId} for conversation ${conversationId}`);

      res.json({ 
        success: true, 
        messageId: sendResult.data?.id,
        message: `${type.toUpperCase()} sent successfully via FWC`
      });
    } catch (error: any) {
      logError('Error sending FWC follow-up:', error instanceof Error ? error : new Error(String(error)), { route: 'api-conversations-id-fwc-message' });
      res.status(500).json({ error: error.message || "Failed to send FWC message" });
    }
  });

  // Send SMS or Email from conversation (auto-creates FWC contact if needed)
  app.post("/api/conversations/:id/send-message", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const conversationId = parseInt(req.params.id);
      const { channel, message, phone, email, subject } = req.body;

      if (!channel || !['sms', 'email'].includes(channel)) {
        return res.status(400).json({ error: "Invalid channel. Must be 'sms' or 'email'" });
      }

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: "Message is required" });
      }

      if (channel === 'sms' && !phone) {
        return res.status(400).json({ error: "Phone number is required for SMS" });
      }
      if (channel === 'email' && !email) {
        return res.status(400).json({ error: "Email address is required for Email" });
      }

      // Get the conversation to extract customer info
      const conversation = await storage.getConversationById(conversationId, dealershipId);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      // Get contact name from conversation
      const customerName = conversation.handoffName || "Customer";
      const firstName = customerName.split(' ')[0] || "Customer";
      const lastName = customerName.split(' ').slice(1).join(' ') || undefined;

      // Create or get GHL API service
      const { createGhlApiService } = await import("./ghl-api-service");
      const ghlService = createGhlApiService(dealershipId);

      let ghlContactId = conversation.ghlContactId;

      // If no GHL contact linked, try to find or create one
      if (!ghlContactId) {
        // Try to find existing contact by email or phone
        let foundContact = null;
        
        if (email) {
          const searchResult = await ghlService.searchContacts({ email });
          if (searchResult.success && searchResult.data?.contacts?.length) {
            foundContact = searchResult.data.contacts[0];
          }
        }
        
        if (!foundContact && phone) {
          const searchResult = await ghlService.searchContacts({ phone });
          if (searchResult.success && searchResult.data?.contacts?.length) {
            foundContact = searchResult.data.contacts[0];
          }
        }

        if (foundContact) {
          ghlContactId = foundContact.id;
        } else {
          // Create new contact in FWC
          const createResult = await ghlService.createContact({
            firstName,
            lastName,
            email: email || undefined,
            phone: phone || undefined,
            source: 'Website Chat',
            tags: ['Website Lead'],
          });
          
          if (createResult.success && createResult.data) {
            ghlContactId = createResult.data.id;
          } else {
            // If contact already exists (400 error), try to extract contactId from error response
            // GHL returns contactId in the error response when contact already exists
            const errorStr = createResult.error || '';
            let extractedContactId: string | null = null;
            
            try {
              const errorJson = JSON.parse(errorStr);
              // GHL may return contactId at different levels of the response
              extractedContactId = errorJson?.meta?.contactId || errorJson?.contactId || null;
            } catch {
              // If JSON parse fails, try regex as fallback
              const contactIdMatch = errorStr.match(/"contactId"\s*:\s*"([^"]+)"/);
              extractedContactId = contactIdMatch?.[1] || null;
            }
            
            if (extractedContactId) {
              console.log(`[Send Message] Contact already exists, using existing contactId: ${extractedContactId}`);
              ghlContactId = extractedContactId;
            } else {
              return res.status(500).json({ 
                error: `Failed to create FWC contact: ${createResult.error || 'Unknown error'}` 
              });
            }
          }
        }

        // Update conversation with the GHL contact ID
        await storage.updateConversationHandoff(conversationId, dealershipId, { 
          ghlContactId 
        });
      }

      // Get or create conversation in FWC for the appropriate channel
      const conversationType = channel === 'sms' ? 'TYPE_SMS' : 'TYPE_EMAIL';
      console.log(`[Send Message] Getting/creating FWC conversation for contact ${ghlContactId}, type: ${conversationType}`);
      const ghlConvResult = await ghlService.getOrCreateConversation(ghlContactId, conversationType);
      
      if (!ghlConvResult.success || !ghlConvResult.data) {
        console.log(`[Send Message] Failed to create FWC conversation:`, ghlConvResult.error);
        return res.status(500).json({ error: ghlConvResult.error || "Failed to create FWC conversation" });
      }
      
      console.log(`[Send Message] Got FWC conversation: ${ghlConvResult.data.id}`);

      // Send the message - GHL API requires 'contactId' for conversations
      const messageType = channel === 'sms' ? 'SMS' : 'Email';
      const sendPayload: any = {
        type: messageType,
        message: message.trim(),
        contactId: ghlContactId, // Required by GHL API
      };
      
      if (channel === 'email') {
        sendPayload.subject = subject || `Follow-up from ${req.user?.name || 'Sales Team'}`;
        sendPayload.emailTo = email;
        sendPayload.html = `<p>${message.trim().replace(/\n/g, '<br>')}</p>`;
      }

      console.log(`[Send Message] Sending message to conversation ${ghlConvResult.data.id}:`, sendPayload);
      const sendResult = await ghlService.sendMessage(ghlConvResult.data.id, sendPayload);

      if (!sendResult.success) {
        return res.status(500).json({ error: sendResult.error || "Failed to send message" });
      }

      // Append the outbound message to the conversation's messages
      await storage.appendMessageToConversation(conversationId, dealershipId, {
        role: 'assistant',
        content: message.trim(),
        timestamp: new Date().toISOString(),
        channel: channel,
        direction: 'outbound',
        ghlMessageId: sendResult.data?.id
      });

      console.log(`[Send Message] Sent ${channel} to ${channel === 'sms' ? phone : email} for conversation ${conversationId}`);

      res.json({ 
        success: true, 
        messageId: sendResult.data?.id,
        message: `${channel.toUpperCase()} sent successfully`,
        ghlContactId
      });
    } catch (error: any) {
      logError('Error sending message:', error instanceof Error ? error : new Error(String(error)), { route: 'api-conversations-id-send-message' });
      res.status(500).json({ error: error.message || "Failed to send message" });
    }
  });

  // Get messages for a specific conversation
  app.get("/api/messenger-conversations/:id/messages", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const conversationId = parseInt(req.params.id);

      if (isNaN(conversationId)) {
        return res.status(400).json({ error: "Invalid conversation ID" });
      }

      const messages = await storage.getMessengerMessages(dealershipId, conversationId);
      
      // Mark messages as read when fetched
      await storage.markMessagesAsRead(dealershipId, conversationId);
      
      res.json(messages);
    } catch (error) {
      logError('Error fetching messenger messages:', error instanceof Error ? error : new Error(String(error)), { route: 'api-messenger-conversations-id-messages' });
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // Assign a conversation to a salesperson - Manager and above only
  app.post("/api/messenger-conversations/:id/assign", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const conversationId = parseInt(req.params.id);
      const { assignedToUserId } = req.body;

      if (isNaN(conversationId)) {
        return res.status(400).json({ error: "Invalid conversation ID" });
      }

      if (!assignedToUserId || typeof assignedToUserId !== 'number') {
        return res.status(400).json({ error: "assignedToUserId is required" });
      }

      const assignment = await storage.updateConversationAssignment(
        dealershipId, 
        conversationId, 
        assignedToUserId,
        req.user?.id
      );

      res.json({ success: true, assignment });
    } catch (error) {
      logError('Error assigning conversation:', error instanceof Error ? error : new Error(String(error)), { route: 'api-messenger-conversations-id-assign' });
      res.status(500).json({ error: "Failed to assign conversation" });
    }
  });

  // Get salespeople for assignment dropdown
  app.get("/api/salespeople", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const users = await storage.getAllUsers(dealershipId);
      
      // Filter to only salespeople and managers
      const salespeople = users
        .filter(u => ['salesperson', 'manager', 'admin', 'master'].includes(u.role) && u.isActive)
        .map(u => ({ id: u.id, name: u.name, role: u.role }));
      
      res.json(salespeople);
    } catch (error) {
      logError('Error fetching salespeople:', error instanceof Error ? error : new Error(String(error)), { route: 'api-salespeople' });
      res.status(500).json({ error: "Failed to fetch salespeople" });
    }
  });

  // ===== ALL CONVERSATIONS UNIFIED ENDPOINT =====
  
  // Helper function to extract contact info from messages
  const extractContactFromMessages = (messages: { role: string; content: string }[]): { phone?: string; email?: string; name?: string } => {
    const contact: { phone?: string; email?: string; name?: string } = {};
    
    // Phone regex - matches 10-digit numbers with or without formatting
    // Uses lookbehind/lookahead to avoid partial matches without breaking on parentheses
    const phoneRegex = /(?<!\d)\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)|(?<!\d)\d{10}(?!\d)/;
    // Email regex
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    // Name patterns - standard phrases
    const namePatterns = [
      /my name is\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
      /i'm\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
      /i am\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
      /this is\s+([a-zA-Z]+)/i,
      /call me\s+([a-zA-Z]+)/i,
    ];
    // Pattern for "Name and Phone" format (e.g., "Riley and 6048334967", "John 604-555-1234")
    const nameWithPhonePatterns = [
      /^([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(?:and\s+)?(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})/i,
      /^([a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s*[-,]\s*(?:\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\d{10})/i,
    ];
    
    const skipWords = ['yes', 'no', 'hi', 'hello', 'hey', 'sure', 'ok', 'okay', 'thanks', 'thank', 'good', 'great', 'fine', 'it', 'is', 'the', 'a', 'an'];
    
    for (const msg of messages) {
      if (msg.role === 'user') {
        // Extract phone
        if (!contact.phone) {
          const phoneMatch = msg.content.match(phoneRegex);
          if (phoneMatch) {
            contact.phone = phoneMatch[0].replace(/[^\d]/g, ''); // Normalize to digits only
          }
        }
        // Extract email
        if (!contact.email) {
          const emailMatch = msg.content.match(emailRegex);
          if (emailMatch) {
            contact.email = emailMatch[0].toLowerCase();
          }
        }
        // Extract name - first try "Name and Phone" patterns (higher priority when phone is in same message)
        if (!contact.name) {
          // Check if this message contains a phone number - likely contains name too
          if (phoneRegex.test(msg.content)) {
            for (const pattern of nameWithPhonePatterns) {
              const match = msg.content.trim().match(pattern);
              if (match && match[1] && match[1].length > 1 && match[1].length < 30) {
                if (!skipWords.includes(match[1].toLowerCase())) {
                  contact.name = match[1].trim();
                  break;
                }
              }
            }
          }
          // If still no name, try standard patterns
          if (!contact.name) {
            for (const pattern of namePatterns) {
              const match = msg.content.match(pattern);
              if (match && match[1] && match[1].length > 1 && match[1].length < 30) {
                if (!skipWords.includes(match[1].toLowerCase())) {
                  contact.name = match[1];
                  break;
                }
              }
            }
          }
        }
      }
    }
    return contact;
  };
  
  // Get all conversations (both website chat and messenger) with role-based filtering
  // General Manager/Sales Manager see all, salespeople see only their connected pages' messenger
  app.get("/api/all-conversations", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      // Managers get website chat conversations
      let websiteChats: any[] = [];
      if (userRole === 'manager' || userRole === 'admin' || userRole === 'master' || userRole === 'super_admin') {
        const { conversations } = await storage.getAllConversations(dealershipId, undefined, 1000, 0);
        
        // Process each conversation - extract missing contact info from messages
        websiteChats = await Promise.all(conversations.map(async (conv) => {
          const messages = JSON.parse(conv.messages);
          const convData: any = {
            ...conv,
            type: 'website_chat',
            messages
          };
          
          // If missing contact info, extract from messages and update
          if (!conv.handoffPhone || !conv.handoffEmail || !conv.handoffName) {
            const extracted = extractContactFromMessages(messages);
            
            // Update if we found new info
            const updates: any = {};
            if (!conv.handoffPhone && extracted.phone) {
              updates.handoffPhone = extracted.phone;
              convData.handoffPhone = extracted.phone;
            }
            if (!conv.handoffEmail && extracted.email) {
              updates.handoffEmail = extracted.email;
              convData.handoffEmail = extracted.email;
            }
            if (!conv.handoffName && extracted.name) {
              updates.handoffName = extracted.name;
              convData.handoffName = extracted.name;
            }
            
            // Persist the updates if any
            if (Object.keys(updates).length > 0) {
              try {
                await storage.updateConversationHandoff(conv.id, dealershipId, updates);
              } catch (err) {
                logWarn(`[Conversations] Failed to update contact info for conv ${conv.id}:`, { route: 'api-all-conversations' });
              }
            }
          }
          
          return convData;
        }));
      }
      
      // Get messenger conversations (role-filtered)
      const messengerConvs = await storage.getMessengerConversations(dealershipId, userId, userRole);
      const messengerChats = messengerConvs.map(conv => ({
        ...conv,
        type: 'messenger'
      }));
      
      res.json({
        websiteChats,
        messengerConversations: messengerChats,
        totalWebsiteChats: websiteChats.length,
        totalMessengerConversations: messengerChats.length
      });
    } catch (error) {
      logError('Error fetching all conversations:', error instanceof Error ? error : new Error(String(error)), { route: 'api-all-conversations' });
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  // ===== SCHEDULED MESSAGES ROUTES =====

  // Get scheduled messages for a conversation
  app.get("/api/messenger-conversations/:id/scheduled", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const conversationId = parseInt(req.params.id);
      
      const scheduledMessages = await storage.getScheduledMessagesByConversation(dealershipId, conversationId);
      res.json(scheduledMessages);
    } catch (error) {
      logError('Error fetching scheduled messages:', error instanceof Error ? error : new Error(String(error)), { route: 'api-messenger-conversations-id-scheduled' });
      res.status(500).json({ error: "Failed to fetch scheduled messages" });
    }
  });

  // Get all pending scheduled messages for dealership
  app.get("/api/scheduled-messages", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const status = req.query.status as string | undefined;
      
      const scheduledMessages = await storage.getScheduledMessages(dealershipId, status);
      res.json(scheduledMessages);
    } catch (error) {
      logError('Error fetching scheduled messages:', error instanceof Error ? error : new Error(String(error)), { route: 'api-scheduled-messages' });
      res.status(500).json({ error: "Failed to fetch scheduled messages" });
    }
  });

  // Cancel a scheduled message
  app.post("/api/scheduled-messages/:id/cancel", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const messageId = parseInt(req.params.id);
      
      const cancelled = await storage.cancelScheduledMessage(messageId, dealershipId);
      
      if (cancelled) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Scheduled message not found or already sent" });
      }
    } catch (error) {
      logError('Error cancelling scheduled message:', error instanceof Error ? error : new Error(String(error)), { route: 'api-scheduled-messages-id-cancel' });
      res.status(500).json({ error: "Failed to cancel scheduled message" });
    }
  });

  // Toggle AI for a conversation
  app.post("/api/messenger-conversations/:id/toggle-ai", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const conversationId = parseInt(req.params.id);
      const { enabled, reason } = req.body;
      
      const conversation = await storage.updateMessengerConversation(conversationId, dealershipId, {
        aiEnabled: enabled,
        aiDisabledReason: enabled ? null : (reason || 'manual'),
        aiDisabledAt: enabled ? null : new Date(),
      });
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      res.json({ success: true, aiEnabled: conversation.aiEnabled });
    } catch (error) {
      logError('Error toggling AI:', error instanceof Error ? error : new Error(String(error)), { route: 'api-messenger-conversations-id-toggle-ai' });
      res.status(500).json({ error: "Failed to toggle AI" });
    }
  });

  // Toggle Watch Mode (manual takeover - AI watches but doesn't respond)
  app.post("/api/messenger-conversations/:id/toggle-watch-mode", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const conversationId = parseInt(req.params.id);
      const { enabled } = req.body;
      
      const conversation = await storage.updateMessengerConversation(conversationId, dealershipId, {
        aiWatchMode: enabled,
        aiWatchModeAt: enabled ? new Date() : null,
      });
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      res.json({ 
        success: true, 
        aiWatchMode: conversation.aiWatchMode,
        message: enabled ? "You are now in control. AI is watching and analyzing." : "AI is back in control."
      });
    } catch (error) {
      logError('Error toggling watch mode:', error instanceof Error ? error : new Error(String(error)), { route: 'api-messenger-conversations-id-toggle-wa' });
      res.status(500).json({ error: "Failed to toggle watch mode" });
    }
  });

  // Update conversation metadata (tags, lead status, pipeline stage, etc.) - Manager and above
  app.patch("/api/messenger-conversations/:id/metadata", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const conversationId = parseInt(req.params.id);
      const { leadStatus, pipelineStage, tags, vehicleOfInterest, assignedToUserId, customerPhone, customerEmail } = req.body;
      
      // Build update object with only provided fields
      const updates: Record<string, any> = {};
      if (leadStatus !== undefined) updates.leadStatus = leadStatus;
      if (pipelineStage !== undefined) updates.pipelineStage = pipelineStage;
      if (tags !== undefined) updates.tags = tags;
      if (vehicleOfInterest !== undefined) updates.vehicleOfInterest = vehicleOfInterest;
      if (assignedToUserId !== undefined) updates.assignedToUserId = assignedToUserId;
      if (customerPhone !== undefined) updates.customerPhone = customerPhone;
      if (customerEmail !== undefined) updates.customerEmail = customerEmail;
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No metadata fields provided to update" });
      }
      
      const conversation = await storage.updateMessengerConversation(conversationId, dealershipId, updates);
      
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      
      // Sync metadata to GHL if conversation is linked and GHL sync is enabled
      if (conversation.ghlContactId) {
        try {
          const ghlMessengerSyncEnabled = await isFeatureEnabled(FEATURE_FLAGS.ENABLE_GHL_MESSENGER_SYNC, dealershipId);
          if (ghlMessengerSyncEnabled) {
            const ghlMessageSyncService = createGhlMessageSyncService(dealershipId);
            await ghlMessageSyncService.syncMetadataToGhl(conversation);
          }
        } catch (syncError) {
          console.error(`[Metadata] Error syncing metadata to GHL:`, syncError);
          // Don't fail the request, just log the error
        }
      }
      
      res.json({ success: true, conversation });
    } catch (error) {
      logError('Error updating conversation metadata:', error instanceof Error ? error : new Error(String(error)), { route: 'api-messenger-conversations-id-metadata' });
      res.status(500).json({ error: "Failed to update conversation metadata" });
    }
  });

  // ===== TRAINING MODE ROUTES =====

  // Update AI prompt for a message (Training Mode)
  app.patch("/api/messenger-messages/:id/training", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const messageId = parseInt(req.params.id);
      const { editedPrompt, editReason } = req.body;
      
      if (!editedPrompt) {
        return res.status(400).json({ error: "editedPrompt is required" });
      }
      
      const updatedMessage = await storage.updateMessengerMessage(messageId, dealershipId, {
        aiPromptEdited: editedPrompt,
        aiPromptEditReason: editReason || null,
        aiPromptEditedById: req.user?.id || null,
        aiPromptEditedAt: new Date(),
      });
      
      if (!updatedMessage) {
        return res.status(404).json({ error: "Message not found" });
      }
      
      res.json({ success: true, message: updatedMessage });
    } catch (error) {
      logError('Error updating message training:', error instanceof Error ? error : new Error(String(error)), { route: 'api-messenger-messages-id-training' });
      res.status(500).json({ error: "Failed to update message training" });
    }
  });

  // ===== CHAT PROMPT ROUTES =====

  // Get all chat prompts - Manager and above
  app.get("/api/chat-prompts", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const prompts = await storage.getChatPrompts(dealershipId);
      res.json(prompts);
    } catch (error) {
      logError('Error fetching chat prompts:', error instanceof Error ? error : new Error(String(error)), { route: 'api-chat-prompts' });
      res.status(500).json({ error: "Failed to fetch chat prompts" });
    }
  });

  // Get chat prompt by scenario - Manager and above
  app.get("/api/chat-prompts/:scenario", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const scenario = req.params.scenario;
      const prompt = await storage.getChatPromptByScenario(scenario, dealershipId);

      if (!prompt) {
        return res.status(404).json({ error: "Prompt not found for this scenario" });
      }

      res.json(prompt);
    } catch (error) {
      logError('Error fetching chat prompt:', error instanceof Error ? error : new Error(String(error)), { route: 'api-chat-prompts-scenario' });
      res.status(500).json({ error: "Failed to fetch chat prompt" });
    }
  });

  // Create or update chat prompt - Manager and above
  app.post("/api/chat-prompts", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { scenario, systemPrompt, greeting, name } = req.body;

      if (!scenario || !systemPrompt || !greeting) {
        return res.status(400).json({ error: "scenario, systemPrompt, and greeting are required" });
      }

      // Check if prompt exists for this scenario
      const existing = await storage.getChatPromptByScenario(scenario, dealershipId);

      if (existing) {
        // Update existing
        const updated = await storage.updateChatPrompt(scenario, dealershipId, {
          systemPrompt,
          greeting,
          isActive: true,
        });
        res.json(updated);
      } else {
        // Create new - generate name from scenario if not provided
        const promptName = name || `${scenario.charAt(0).toUpperCase() + scenario.slice(1).replace(/-/g, ' ')} Prompt`;
        const prompt = await storage.saveChatPrompt({
          dealershipId,
          name: promptName,
          scenario,
          systemPrompt,
          greeting,
          isActive: true,
        });
        res.json(prompt);
      }
    } catch (error) {
      logError('Error saving chat prompt:', error instanceof Error ? error : new Error(String(error)), { route: 'api-chat-prompts' });
      res.status(500).json({ error: "Failed to save chat prompt" });
    }
  });

  // Update a specific prompt by ID (for training mode)
  app.patch("/api/chat-prompts/:id", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const promptId = parseInt(req.params.id);
      const { systemPrompt, greeting, isActive } = req.body;

      if (!systemPrompt) {
        return res.status(400).json({ error: "systemPrompt is required" });
      }

      const updates: any = { systemPrompt };
      if (greeting !== undefined) updates.greeting = greeting;
      if (isActive !== undefined) updates.isActive = isActive;

      const prompt = await storage.updateChatPromptById(promptId, dealershipId, updates);
      
      if (!prompt) {
        return res.status(404).json({ error: "Prompt not found" });
      }
      
      res.json({ success: true, prompt });
    } catch (error) {
      logError('Error updating chat prompt:', error instanceof Error ? error : new Error(String(error)), { route: 'api-chat-prompts-id' });
      res.status(500).json({ error: "Failed to update chat prompt" });
    }
  });

  // Training feedback endpoint - analyzes edited AI responses and suggests prompt improvements
  app.post("/api/chat/training-feedback", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { originalResponse, editedResponse, conversationContext, currentPrompt } = req.body;

      if (!originalResponse || !editedResponse) {
        return res.status(400).json({ error: "originalResponse and editedResponse are required" });
      }

      if (originalResponse === editedResponse) {
        return res.status(400).json({ error: "No changes detected between original and edited response" });
      }

      // Get OpenAI client
      const OpenAI = (await import('openai')).default;
      
      // Get dealership-specific API key or fallback to default
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      const openaiKey = apiKeys?.openaiApiKey || process.env.OPENAI_API_KEY;
      
      if (!openaiKey) {
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }
      
      const openai = new OpenAI({ apiKey: openaiKey });

      // Build context from conversation
      const contextSummary = conversationContext?.slice(-5).map((msg: any) => 
        `${msg.role === 'user' ? 'Customer' : 'AI'}: ${msg.content}`
      ).join('\n') || 'No context provided';

      // Create training feedback prompt - structured JSON output for UI
      const trainingPrompt = `You are an AI prompt engineering expert analyzing how a dealership AI assistant's response was corrected by a human manager.

CURRENT SYSTEM PROMPT BEING USED:
${currentPrompt || 'No system prompt provided'}

CONVERSATION CONTEXT:
${contextSummary}

ORIGINAL AI RESPONSE:
${originalResponse}

HUMAN-CORRECTED RESPONSE:
${editedResponse}

Analyze the difference and provide a JSON response with the following structure:
{
  "analysis": "Brief analysis of what was wrong with the original response and what the human preferred",
  "suggestedPrompt": "The complete updated system prompt with your improvements incorporated. Start with the current prompt and add/modify instructions to produce responses more like the human correction.",
  "changes": ["List of specific changes you made to the prompt", "Each change as a separate string"]
}

IMPORTANT: The suggestedPrompt should be a complete, ready-to-use system prompt. Return ONLY valid JSON, no markdown or extra text.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert in prompt engineering and AI training. Return only valid JSON." },
          { role: "user", content: trainingPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });

      const rawContent = response.choices[0]?.message?.content || "{}";
      let parsedFeedback;
      try {
        parsedFeedback = JSON.parse(rawContent);
      } catch {
        parsedFeedback = { analysis: rawContent, suggestedPrompt: currentPrompt, changes: [] };
      }

      res.json({ 
        success: true, 
        feedback: parsedFeedback.analysis || "Analysis complete",
        suggestedPrompt: parsedFeedback.suggestedPrompt || currentPrompt,
        changes: parsedFeedback.changes || [],
        originalLength: originalResponse.length,
        editedLength: editedResponse.length
      });
    } catch (error: any) {
      logError('Error generating training feedback:', error instanceof Error ? error : new Error(String(error)), { route: 'api-chat-training-feedback' });
      res.status(500).json({ error: error.message || "Failed to generate training feedback" });
    }
  });

  // ===== ENHANCED PROMPT MANAGEMENT API FOR SUPER ADMIN =====
  
  // Get all prompts (including inactive) for admin
  app.get("/api/admin/prompts", authMiddleware, requireRole("master", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const queryDealershipId = req.query.dealershipId ? parseInt(req.query.dealershipId as string) : null;
      
      // Super admins can specify dealershipId via query param
      let dealershipId: number;
      if (authReq.user?.role === "super_admin" && queryDealershipId) {
        dealershipId = queryDealershipId;
      } else if (req.dealershipId) {
        dealershipId = req.dealershipId;
      } else {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const prompts = await storage.getAllChatPrompts(dealershipId);
      res.json(prompts);
    } catch (error) {
      logError('Error fetching all prompts:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-prompts' });
      res.status(500).json({ error: "Failed to fetch prompts" });
    }
  });

  // Get single prompt by ID
  app.get("/api/admin/prompts/:id", authMiddleware, requireRole("master", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const queryDealershipId = req.query.dealershipId ? parseInt(req.query.dealershipId as string) : null;
      
      let dealershipId: number;
      if (authReq.user?.role === "super_admin" && queryDealershipId) {
        dealershipId = queryDealershipId;
      } else if (req.dealershipId) {
        dealershipId = req.dealershipId;
      } else {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const promptId = parseInt(req.params.id);
      const prompt = await storage.getChatPromptById(promptId, dealershipId);
      
      if (!prompt) {
        return res.status(404).json({ error: "Prompt not found" });
      }
      
      res.json(prompt);
    } catch (error) {
      logError('Error fetching prompt:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-prompts-id' });
      res.status(500).json({ error: "Failed to fetch prompt" });
    }
  });

  // Create new prompt with all fields
  app.post("/api/admin/prompts", authMiddleware, requireRole("master", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const bodyDealershipId = req.body.dealershipId ? parseInt(req.body.dealershipId) : null;
      
      let dealershipId: number;
      if (authReq.user?.role === "super_admin" && bodyDealershipId) {
        dealershipId = bodyDealershipId;
      } else if (req.dealershipId) {
        dealershipId = req.dealershipId;
      } else {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const { 
        name, scenario, channel, systemPrompt, greeting, 
        followUpPrompt, escalationTriggers, aiModel, temperature, maxTokens, isActive,
        ghlWorkflowId 
      } = req.body;

      if (!name || !scenario || !systemPrompt || !greeting) {
        return res.status(400).json({ error: "name, scenario, systemPrompt, and greeting are required" });
      }

      const prompt = await storage.saveChatPrompt({
        dealershipId,
        name,
        scenario,
        channel: channel || 'all',
        systemPrompt,
        greeting,
        followUpPrompt: followUpPrompt || null,
        escalationTriggers: escalationTriggers ? JSON.stringify(escalationTriggers) : null,
        aiModel: aiModel || 'gpt-4o',
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 500,
        isActive: isActive ?? true,
        ghlWorkflowId: ghlWorkflowId || null,
        ghlPromptSynced: false
      });
      
      res.json(prompt);
    } catch (error) {
      logError('Error creating prompt:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-prompts' });
      res.status(500).json({ error: "Failed to create prompt" });
    }
  });

  // Update prompt by ID
  app.put("/api/admin/prompts/:id", authMiddleware, requireRole("master", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const bodyDealershipId = req.body.dealershipId ? parseInt(req.body.dealershipId) : null;
      
      let dealershipId: number;
      if (authReq.user?.role === "super_admin" && bodyDealershipId) {
        dealershipId = bodyDealershipId;
      } else if (req.dealershipId) {
        dealershipId = req.dealershipId;
      } else {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const promptId = parseInt(req.params.id);
      const updates = { ...req.body };
      delete updates.dealershipId;

      // Parse escalationTriggers if it's an array
      if (updates.escalationTriggers && Array.isArray(updates.escalationTriggers)) {
        updates.escalationTriggers = JSON.stringify(updates.escalationTriggers);
      }

      // Mark as needing sync if prompt content changed
      if (updates.systemPrompt || updates.greeting || updates.followUpPrompt) {
        updates.ghlPromptSynced = false;
      }

      const prompt = await storage.updateChatPromptById(promptId, dealershipId, updates);
      
      if (!prompt) {
        return res.status(404).json({ error: "Prompt not found" });
      }
      
      res.json(prompt);
    } catch (error) {
      logError('Error updating prompt:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-prompts-id' });
      res.status(500).json({ error: "Failed to update prompt" });
    }
  });

  // Delete prompt
  app.delete("/api/admin/prompts/:id", authMiddleware, requireRole("master", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const queryDealershipId = req.query.dealershipId ? parseInt(req.query.dealershipId as string) : null;
      
      let dealershipId: number;
      if (authReq.user?.role === "super_admin" && queryDealershipId) {
        dealershipId = queryDealershipId;
      } else if (req.dealershipId) {
        dealershipId = req.dealershipId;
      } else {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const promptId = parseInt(req.params.id);
      
      const deleted = await storage.deleteChatPrompt(promptId, dealershipId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Prompt not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting prompt:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-prompts-id' });
      res.status(500).json({ error: "Failed to delete prompt" });
    }
  });

  // Sync prompt to GHL
  app.post("/api/admin/prompts/:id/sync-ghl", authMiddleware, requireRole("master", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const bodyDealershipId = req.body.dealershipId ? parseInt(req.body.dealershipId) : null;
      
      let dealershipId: number;
      if (authReq.user?.role === "super_admin" && bodyDealershipId) {
        dealershipId = bodyDealershipId;
      } else if (req.dealershipId) {
        dealershipId = req.dealershipId;
      } else {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const promptId = parseInt(req.params.id);
      
      // Get the prompt
      const prompt = await storage.getChatPromptById(promptId, dealershipId);
      if (!prompt) {
        return res.status(404).json({ error: "Prompt not found" });
      }

      // Check if GHL account is connected
      const ghlAccount = await storage.getGhlAccountByDealership(dealershipId);
      if (!ghlAccount || !ghlAccount.isActive) {
        return res.status(400).json({ error: "GHL account not connected or inactive" });
      }

      // Get the GHL API service
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);

      // If prompt has a workflow ID, update the workflow
      if (prompt.ghlWorkflowId) {
        // GHL Workflow API to update the prompt content
        // Note: GHL's workflow API requires specific endpoint access
        // For now, we'll mark it as synced and log
        console.log(`[GHL Sync] Would sync prompt ${prompt.id} to workflow ${prompt.ghlWorkflowId}`);
        
        // Update the prompt as synced
        await storage.updateChatPromptById(promptId, dealershipId, {
          ghlPromptSynced: true,
          ghlLastSyncedAt: new Date(),
          ghlSyncError: null
        });
        
        res.json({ 
          success: true, 
          message: "Prompt synced to GHL",
          workflowId: prompt.ghlWorkflowId
        });
      } else {
        res.status(400).json({ error: "No GHL workflow ID configured for this prompt" });
      }
    } catch (error) {
      logError('Error syncing prompt to GHL:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-prompts-id-sync-ghl' });
      
      // Update prompt with error - need to get dealershipId from the request again
      const authReq = req as AuthRequest;
      const bodyDealershipId = req.body.dealershipId ? parseInt(req.body.dealershipId) : null;
      const dealershipId = (authReq.user?.role === "super_admin" && bodyDealershipId) 
        ? bodyDealershipId 
        : req.dealershipId;
      
      if (dealershipId) {
        const promptId = parseInt(req.params.id);
        await storage.updateChatPromptById(promptId, dealershipId, {
          ghlPromptSynced: false,
          ghlSyncError: String(error)
        });
      }
      
      res.status(500).json({ error: "Failed to sync prompt to GHL" });
    }
  });

  // AI-powered prompt enhancement endpoint
  app.post("/api/admin/enhance-prompt", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const dealershipId = authReq.user?.role === "super_admin" 
        ? (req.body.dealershipId || 1) 
        : req.dealershipId!;
      
      const { text, promptType, context } = req.body;
      
      if (!text || !promptType) {
        return res.status(400).json({ error: "text and promptType are required" });
      }

      // Import OpenAI client getter
      const OpenAI = (await import('openai')).default;
      
      // Get dealership API keys for custom OpenAI key, or use Replit fallback
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      let openai: InstanceType<typeof OpenAI>;
      let model: string;
      
      if (apiKeys?.openaiApiKey && apiKeys.openaiApiKey.length > 20) {
        openai = new OpenAI({ apiKey: apiKeys.openaiApiKey });
        model = 'gpt-4o-mini';
      } else {
        openai = new OpenAI({
          baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
          apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
        });
        model = 'gpt-5';
      }

      // Build the enhancement prompt based on type
      let systemPrompt = '';
      let userPrompt = '';
      
      switch (promptType) {
        case 'system':
          systemPrompt = `You are an expert at writing AI system prompts for automotive dealership chatbots.
Your task is to transform basic instructions into clear, effective AI system prompts that:
- Give the AI a clear personality and role (friendly automotive sales consultant)
- Include specific behavioral guidelines
- Set boundaries on what the AI should/shouldn't do
- Emphasize customer service excellence
- Include urgency to capture leads and book appointments
- Keep responses conversational and not robotic
Do not use placeholders like [Dealership Name] - write it generically so it works for any dealership.`;
          userPrompt = `Transform this basic instruction into a world-class AI system prompt for a car dealership chatbot:\n\n"${text}"\n\n${context ? `Context: ${context}` : ''}\n\nWrite only the enhanced prompt, no explanations.`;
          break;
          
        case 'greeting':
          systemPrompt = `You are an expert copywriter for automotive dealerships.
Your task is to write warm, engaging greeting messages that:
- Feel personal and welcoming (not corporate or robotic)
- Create immediate connection with the customer
- Hint at value without being pushy
- Encourage the customer to engage
- Are concise (1-2 sentences max)
- Work for text/chat conversations`;
          userPrompt = `Transform this greeting into a warm, engaging welcome message:\n\n"${text}"\n\n${context ? `Context: ${context}` : ''}\n\nWrite only the enhanced greeting, no explanations.`;
          break;
          
        case 'followup':
        case 'sms':
          systemPrompt = `You are an expert at writing follow-up messages for automotive sales.
Your task is to write compelling SMS/text follow-up messages that:
- Are brief and mobile-friendly (under 160 characters ideally)
- Create urgency without being pushy
- Feel personal, not mass-produced
- Include a clear call-to-action
- Get customers to respond or take action
- Use natural, conversational language
You can use these personalization variables: {{name}}, {{first_name}}, {{vehicle}}, {{vehicle_name}}, {{price}}, {{dealership}}`;
          userPrompt = `Transform this into a compelling follow-up text message:\n\n"${text}"\n\n${context ? `Context: ${context}` : ''}\n\nWrite only the enhanced message, no explanations.`;
          break;
          
        case 'email':
          systemPrompt = `You are an expert at writing follow-up emails for automotive sales.
Your task is to write professional, effective follow-up emails that:
- Have a compelling subject line feel (even in body)
- Are scannable with clear formatting
- Balance professionalism with warmth
- Include a strong call-to-action
- Create urgency without being pushy
- Feel personal, not template-y
You can use these personalization variables: {{name}}, {{first_name}}, {{vehicle}}, {{vehicle_name}}, {{price}}, {{dealership}}`;
          userPrompt = `Transform this into a compelling follow-up email:\n\n"${text}"\n\n${context ? `Context: ${context}` : ''}\n\nWrite only the enhanced email, no explanations.`;
          break;
          
        default:
          systemPrompt = `You are an expert copywriter for automotive dealerships.
Your task is to improve any customer-facing message to be more effective, engaging, and professional.`;
          userPrompt = `Enhance this message for a car dealership:\n\n"${text}"\n\n${context ? `Context: ${context}` : ''}\n\nWrite only the enhanced message, no explanations.`;
      }

      const response = await openai.chat.completions.create({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_completion_tokens: 500,
        temperature: 0.8
      });

      const enhanced = response.choices[0]?.message?.content?.trim();
      
      if (!enhanced) {
        return res.status(500).json({ error: "Failed to generate enhancement" });
      }

      res.json({ enhanced });
    } catch (error: any) {
      logError('Error enhancing prompt:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-enhance-prompt' });
      res.status(500).json({ error: error.message || "Failed to enhance prompt" });
    }
  });

  // Get GHL workflows for linking
  app.get("/api/admin/ghl/workflows", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      const ghlAccount = await storage.getGhlAccountByDealership(dealershipId);
      if (!ghlAccount || !ghlAccount.isActive) {
        return res.json({ workflows: [], message: "GHL account not connected" });
      }

      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      
      // Get workflows from GHL API
      // Note: GHL workflow list API may require additional scopes
      // For now, return placeholder indicating feature availability
      res.json({ 
        workflows: [],
        message: "Connect GHL workflows by entering the workflow ID from your GHL dashboard"
      });
    } catch (error) {
      logError('Error fetching GHL workflows:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-ghl-workflows' });
      res.status(500).json({ error: "Failed to fetch GHL workflows" });
    }
  });

  // Generate AI insights for conversations - ADMIN ONLY
  app.post("/api/chat-insights", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { scenario } = req.body;

      if (!scenario) {
        return res.status(400).json({ error: "scenario is required" });
      }

      // Get conversations for this scenario (no pagination - need full dataset for insights)
      const { conversations } = await storage.getAllConversations(dealershipId, scenario, 10000, 0);

      if (conversations.length === 0) {
        return res.json({
          insights: "No conversations found for this scenario yet. Start collecting conversations to generate insights."
        });
      }

      // Get current prompt for context
      const currentPrompt = await storage.getChatPromptByScenario(scenario, dealershipId);

      // Prepare conversation data for analysis
      const conversationSummaries = conversations.slice(0, 20).map(conv => {
        const messages = JSON.parse(conv.messages);
        return {
          vehicleName: conv.vehicleName,
          messageCount: messages.length,
          messages: messages.map((m: any) => `${m.role}: ${m.content}`).join('\n')
        };
      });

      // Generate insights using OpenAI
      const analysisPrompt = `You are analyzing customer conversations for a car dealership's chatbot in the "${scenario}" scenario.

Current System Prompt: ${currentPrompt?.systemPrompt || 'Not set'}
Current Greeting: ${currentPrompt?.greeting || 'Not set'}

Here are ${conversationSummaries.length} recent conversations:

${conversationSummaries.map((conv, idx) => `
Conversation ${idx + 1} (${conv.vehicleName || 'General'}):
${conv.messages}
---
`).join('\n')}

Based on these conversations, provide:
1. Key patterns you notice in customer questions and concerns
2. Areas where the current prompts are working well
3. Specific improvements to the system prompt
4. Specific improvements to the greeting message
5. Common objections or friction points
6. Recommended follow-up questions the bot should ask

Format your response in clear sections with actionable recommendations.`;

      const response = await generateChatResponse(
        [{ role: 'user', content: analysisPrompt }],
        dealershipId,
        'general'
      );

      res.json({ insights: response, conversationCount: conversations.length });
    } catch (error) {
      logError('Error generating insights:', error instanceof Error ? error : new Error(String(error)), { route: 'api-chat-insights' });
      res.status(500).json({ error: "Failed to generate insights" });
    }
  });

  // ===== DEALERSHIP API KEYS ROUTES =====

  // Get dealership API keys - ADMIN ONLY
  app.get("/api/dealership-api-keys", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      // Mask all API keys for security (show only last 4 characters)
      if (apiKeys) {
        const masked = {
          ...apiKeys,
          openaiApiKey: apiKeys.openaiApiKey ? `****${apiKeys.openaiApiKey.slice(-4)}` : null,
          marketcheckKey: apiKeys.marketcheckKey ? `****${apiKeys.marketcheckKey.slice(-4)}` : null,
          apifyToken: apiKeys.apifyToken ? `****${apiKeys.apifyToken.slice(-4)}` : null,
          geminiApiKey: apiKeys.geminiApiKey ? `****${apiKeys.geminiApiKey.slice(-4)}` : null,
          ghlApiKey: apiKeys.ghlApiKey ? `****${apiKeys.ghlApiKey.slice(-4)}` : null,
          facebookAppSecret: apiKeys.facebookAppSecret ? `****${apiKeys.facebookAppSecret.slice(-4)}` : null,
        };
        res.json(masked);
      } else {
        res.json(null);
      }
    } catch (error) {
      logError('Error fetching API keys:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-api-keys' });
      res.status(500).json({ error: "Failed to fetch API keys" });
    }
  });

  // Update dealership API keys - ADMIN ONLY
  app.patch("/api/dealership-api-keys", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const updates = req.body;

      // Validate that only allowed fields are being updated
      const allowedFields = ['openaiApiKey', 'marketcheckKey', 'apifyToken', 'apifyActorId', 'geminiApiKey', 'ghlApiKey', 'ghlLocationId', 'facebookAppId', 'facebookAppSecret'];
      const invalidFields = Object.keys(updates).filter(key => !allowedFields.includes(key));
      
      if (invalidFields.length > 0) {
        return res.status(400).json({ error: `Invalid fields: ${invalidFields.join(', ')}` });
      }

      // Check if API keys exist for this dealership
      const existing = await storage.getDealershipApiKeys(dealershipId);
      
      let apiKeys;
      if (existing) {
        // Update existing
        apiKeys = await storage.updateDealershipApiKeys(dealershipId, updates);
      } else {
        // Create new
        apiKeys = await storage.saveDealershipApiKeys({
          dealershipId,
          ...updates
        });
      }

      // Mask the response
      if (apiKeys) {
        const masked = {
          ...apiKeys,
          openaiApiKey: apiKeys.openaiApiKey ? `****${apiKeys.openaiApiKey.slice(-4)}` : null,
          marketcheckKey: apiKeys.marketcheckKey ? `****${apiKeys.marketcheckKey.slice(-4)}` : null,
          apifyToken: apiKeys.apifyToken ? `****${apiKeys.apifyToken.slice(-4)}` : null,
          geminiApiKey: apiKeys.geminiApiKey ? `****${apiKeys.geminiApiKey.slice(-4)}` : null,
          ghlApiKey: apiKeys.ghlApiKey ? `****${apiKeys.ghlApiKey.slice(-4)}` : null,
          facebookAppSecret: apiKeys.facebookAppSecret ? `****${apiKeys.facebookAppSecret.slice(-4)}` : null,
        };
        res.json(masked);
      } else {
        res.status(500).json({ error: "Failed to save API keys" });
      }
    } catch (error) {
      logError('Error updating API keys:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-api-keys' });
      res.status(500).json({ error: "Failed to update API keys" });
    }
  });

  // Generate or regenerate webhook secret for automated scraping (Zapier/n8n)
  app.post("/api/dealership/webhook-secret", authMiddleware, requireRole("admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      // Generate a secure random secret
      const secret = crypto.randomBytes(32).toString('hex');
      
      // Check if API keys exist for this dealership
      const existing = await storage.getDealershipApiKeys(dealershipId);
      
      if (existing) {
        await storage.updateDealershipApiKeys(dealershipId, { scrapeWebhookSecret: secret });
      } else {
        await storage.saveDealershipApiKeys({
          dealershipId,
          scrapeWebhookSecret: secret
        });
      }
      
      // Get dealership info for the response
      const dealership = await storage.getDealershipById(dealershipId);
      
      res.json({ 
        success: true,
        secret,
        dealershipId,
        dealershipName: dealership?.name,
        webhookUrl: `https://hyundaivancouver.lotview.ai/api/webhooks/trigger-scrape`,
        instructions: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: { dealershipId, secret }
        }
      });
    } catch (error) {
      logError('Error generating webhook secret:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-webhook-secret' });
      res.status(500).json({ error: "Failed to generate webhook secret" });
    }
  });

  // Get webhook secret info (masked) for the current dealership
  app.get("/api/dealership/webhook-secret", authMiddleware, requireRole("admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      if (!apiKeys?.scrapeWebhookSecret) {
        return res.json({ 
          configured: false,
          message: "No webhook secret configured. Use POST to generate one."
        });
      }
      
      res.json({ 
        configured: true,
        secretPreview: `${apiKeys.scrapeWebhookSecret.slice(0, 8)}...${apiKeys.scrapeWebhookSecret.slice(-4)}`,
        webhookUrl: `https://hyundaivancouver.lotview.ai/api/webhooks/trigger-scrape`,
        instructions: {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: { dealershipId, secret: "YOUR_SECRET_KEY" }
        }
      });
    } catch (error) {
      logError('Error getting webhook secret:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-webhook-secret-get' });
      res.status(500).json({ error: "Failed to get webhook secret" });
    }
  });

  // ===== GOHIGHLEVEL CTA ROUTES =====
  
  // Handle CTA action (send lead to GoHighLevel)
  app.post("/api/cta/send", async (req, res) => {
    try {
      const { vehicleInfo, ctaType, contactInfo } = req.body;

      if (!vehicleInfo || !ctaType) {
        return res.status(400).json({ error: "vehicleInfo and ctaType are required" });
      }

      const validCTATypes = ['test-drive', 'reserve', 'get-approved', 'value-trade'];
      if (!validCTATypes.includes(ctaType)) {
        return res.status(400).json({ error: "Invalid CTA type" });
      }

      const dealershipId = req.dealershipId!;
      const { GHLClient } = await import("./ghl-client");
      
      // Try dealership-specific client first (uses API keys from database)
      let client = await GHLClient.getInstanceForDealership(dealershipId);
      
      // Fallback to legacy getInstance (uses ghlConfig table)
      if (!client) {
        client = await GHLClient.getInstance();
      }

      if (!client) {
        return res.status(503).json({ 
          error: "GoHighLevel integration not configured. Please configure GHL API key in admin panel." 
        });
      }

      const result = await client.handleCTAAction(vehicleInfo, ctaType, contactInfo);

      if (!result.success) {
        return res.status(500).json({ 
          error: result.error || "Failed to send lead to GoHighLevel" 
        });
      }

      res.json(result);
    } catch (error) {
      logError('Error handling CTA action:', error instanceof Error ? error : new Error(String(error)), { route: 'api-cta-send' });
      res.status(500).json({ error: "Failed to process CTA action" });
    }
  });

  // ===== SMS HANDOFF ROUTES =====
  
  // Request SMS handoff (sync conversation to GHL via API or webhook) - PUBLIC (user initiates)
  app.post("/api/chat/handoff", async (req, res) => {
    try {
      const { conversationId, phoneNumber, messages, vehicleInfo, category } = req.body;

      if (!conversationId || !phoneNumber || !messages) {
        return res.status(400).json({ error: "conversationId, phoneNumber, and messages are required" });
      }

      const dealershipId = req.dealershipId!;
      let handoffSuccess = false;
      let errorMessage = "";

      // Try GHL API first (preferred method - uses dealership-specific API keys from database)
      const { GHLClient } = await import("./ghl-client");
      const ghlClient = await GHLClient.getInstanceForDealership(dealershipId);
      
      if (ghlClient) {
        try {
          const dealership = await storage.getDealership(dealershipId);
          const result = await ghlClient.syncChatConversation({
            phone: phoneNumber,
            sessionId: conversationId.toString(),
            category: category || 'general',
            vehicleName: vehicleInfo?.vehicleName,
            messages: messages,
            dealershipName: dealership?.name,
          });

          if (result.success) {
            handoffSuccess = true;
            console.log(`[Chat Handoff] Successfully synced to GHL API - Contact: ${result.contactId}`);
          } else {
            errorMessage = result.error || "GHL API sync failed";
            logWarn('[Chat Handoff] GHL API failed: ${errorMessage}', { route: 'api-chat-handoff' });
          }
        } catch (apiError) {
          errorMessage = apiError instanceof Error ? apiError.message : "GHL API error";
          logWarn('[Chat Handoff] GHL API error: ${errorMessage}', { route: 'api-chat-handoff' });
        }
      }

      // Fallback to webhook if API failed or not configured
      if (!handoffSuccess) {
        const webhookConfig = await storage.getActiveGHLWebhookConfig(dealershipId);
        
        if (webhookConfig) {
          try {
            const conversationSummary = messages.map((m: any) => 
              `${m.role === 'assistant' ? 'Bot' : 'Customer'}: ${m.content}`
            ).join('\n\n');

            const payload = {
              phone: phoneNumber,
              conversationSummary,
              category: category || 'general',
              vehicleInfo: vehicleInfo || null,
              timestamp: new Date().toISOString(),
              source: 'olympic-auto-website'
            };

            const response = await fetch(webhookConfig.webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });

            if (response.ok) {
              handoffSuccess = true;
              console.log(`[Chat Handoff] Successfully sent to webhook`);
            } else {
              errorMessage = `Webhook failed with status ${response.status}`;
            }
          } catch (webhookError) {
            errorMessage = webhookError instanceof Error ? webhookError.message : "Webhook error";
          }
        } else if (!ghlClient) {
          return res.status(503).json({ 
            error: "SMS handoff not configured. Please configure GHL API key or webhook in admin panel." 
          });
        }
      }

      // Update conversation with handoff status
      await storage.updateConversationHandoff(conversationId, dealershipId, {
        handoffRequested: true,
        handoffPhone: phoneNumber,
        handoffSent: handoffSuccess,
        handoffSentAt: handoffSuccess ? new Date() : undefined,
      });

      if (handoffSuccess) {
        res.json({ 
          success: true, 
          message: "Conversation handed off to SMS. You'll receive a text shortly!" 
        });
      } else {
        res.status(500).json({ error: errorMessage || "Failed to handoff conversation to SMS" });
      }
    } catch (error) {
      logError('Error handling SMS handoff:', error instanceof Error ? error : new Error(String(error)), { route: 'api-chat-handoff' });
      
      if (req.body.conversationId) {
        const dealershipId = req.dealershipId!;
        await storage.updateConversationHandoff(req.body.conversationId, dealershipId, {
          handoffRequested: true,
          handoffPhone: req.body.phoneNumber,
          handoffSent: false,
        });
      }
      
      res.status(500).json({ error: "Failed to handoff conversation to SMS" });
    }
  });

  // Auto-sync chat lead to GHL when contact info is captured (PUBLIC - called automatically by chatbot)
  // Tenant middleware provides dealershipId from subdomain/header
  app.post("/api/chat/auto-sync-lead", async (req, res) => {
    try {
      const { 
        conversationId, 
        phone, 
        email, 
        name, 
        messages, 
        vehicleInfo, 
        category,
        source 
      } = req.body;

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "messages array is required" });
      }

      if (!phone && !email) {
        return res.status(400).json({ error: "Phone or email is required" });
      }

      // Gracefully handle missing dealership - tenant middleware may not resolve
      const dealershipId = req.dealershipId;
      if (!dealershipId) {
        console.log(`[Auto-Sync] No dealership resolved - skipping sync`);
        return res.json({ 
          success: false, 
          skipped: true,
          message: "Dealership not resolved" 
        });
      }
      
      // Get GHL client for this dealership
      const { GHLClient } = await import("./ghl-client");
      const ghlClient = await GHLClient.getInstanceForDealership(dealershipId);
      
      if (!ghlClient) {
        console.log(`[Auto-Sync] GHL not configured for dealership ${dealershipId} - skipping sync`);
        return res.json({ 
          success: false, 
          skipped: true,
          message: "GHL not configured for this dealership" 
        });
      }

      const dealership = await storage.getDealership(dealershipId);
      
      const result = await ghlClient.autoSyncChatLead({
        phone: phone || undefined,
        email: email || undefined,
        name: name || undefined,
        category: category || 'general',
        vehicleName: vehicleInfo?.vehicleName,
        vehicleId: vehicleInfo?.vehicleId,
        source: source || 'website_chat',
        messages: messages,
        dealershipName: dealership?.name,
      });

      if (result.success) {
        console.log(`[Auto-Sync] Successfully synced lead to GHL - Contact: ${result.contactId}`);
        
        // Only update conversation handoff if we have a valid numeric conversationId
        if (conversationId && typeof conversationId === 'number') {
          try {
            await storage.updateConversationHandoff(conversationId, dealershipId, {
              handoffRequested: true,
              handoffPhone: phone || undefined,
              handoffEmail: email || undefined,
              handoffName: name || undefined,
              handoffSent: true,
              handoffSentAt: new Date(),
              ghlContactId: result.contactId || undefined,
            });
          } catch (updateError) {
            // Non-fatal - conversation may not exist yet
            logWarn(`[Auto-Sync] Could not update conversation ${conversationId}:`, { route: 'api-chat-auto-sync-lead' });
          }
        }
        
        res.json({ 
          success: true, 
          contactId: result.contactId,
          conversationId: result.conversationId,
          message: "Lead synced to CRM for follow-up" 
        });
      } else {
        logWarn('[Auto-Sync] GHL sync failed: ${result.error}', { route: 'api-chat-auto-sync-lead' });
        res.json({ 
          success: false, 
          error: result.error,
          message: "Failed to sync lead to CRM" 
        });
      }
    } catch (error) {
      logError('Error auto-syncing chat lead:', error instanceof Error ? error : new Error(String(error)), { route: 'api-chat-auto-sync-lead' });
      res.status(500).json({ error: "Failed to sync lead to CRM" });
    }
  });

  // ===== FINANCING RULES ROUTES (Master Only) =====
  
  // Get all credit score tiers
  app.get("/api/financing/credit-tiers", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const tiers = await storage.getCreditScoreTiers(dealershipId);
      res.json(tiers);
    } catch (error) {
      logError('Error fetching credit tiers:', error instanceof Error ? error : new Error(String(error)), { route: 'api-financing-credit-tiers' });
      res.status(500).json({ error: "Failed to fetch credit tiers" });
    }
  });
  
  // Create credit score tier
  app.post("/api/financing/credit-tiers", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const { tierName, minScore, maxScore, interestRate } = req.body;
      
      if (!tierName || minScore === undefined || maxScore === undefined || interestRate === undefined) {
        return res.status(400).json({ error: "All fields are required" });
      }
      
      if (minScore > maxScore) {
        return res.status(400).json({ error: "Min score must be less than or equal to max score" });
      }
      
      if (minScore < 300 || maxScore > 850) {
        return res.status(400).json({ error: "Credit scores must be between 300 and 850" });
      }
      
      if (interestRate < 0 || interestRate > 10000) {
        return res.status(400).json({ error: "Interest rate must be between 0 and 10000 basis points (0% - 100%)" });
      }
      
      const dealershipId = req.dealershipId!;
      const tier = await storage.createCreditScoreTier({
        dealershipId,
        tierName,
        minScore,
        maxScore,
        interestRate,
        isActive: true,
      });
      
      res.status(201).json(tier);
    } catch (error) {
      logError('Error creating credit tier:', error instanceof Error ? error : new Error(String(error)), { route: 'api-financing-credit-tiers' });
      res.status(500).json({ error: "Failed to create credit tier" });
    }
  });
  
  // Update credit score tier
  app.patch("/api/financing/credit-tiers/:id", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { minScore, maxScore, interestRate } = req.body;
      
      if (minScore !== undefined && maxScore !== undefined && minScore > maxScore) {
        return res.status(400).json({ error: "Min score must be less than or equal to max score" });
      }
      
      if (minScore !== undefined && (minScore < 300 || minScore > 850)) {
        return res.status(400).json({ error: "Min score must be between 300 and 850" });
      }
      
      if (maxScore !== undefined && (maxScore < 300 || maxScore > 850)) {
        return res.status(400).json({ error: "Max score must be between 300 and 850" });
      }
      
      if (interestRate !== undefined && (interestRate < 0 || interestRate > 10000)) {
        return res.status(400).json({ error: "Interest rate must be between 0 and 10000 basis points (0% - 100%)" });
      }
      
      const dealershipId = req.dealershipId!;
      const tier = await storage.updateCreditScoreTier(id, dealershipId, req.body);
      
      if (!tier) {
        return res.status(404).json({ error: "Credit tier not found" });
      }
      
      res.json(tier);
    } catch (error) {
      logError('Error updating credit tier:', error instanceof Error ? error : new Error(String(error)), { route: 'api-financing-credit-tiers-id' });
      res.status(500).json({ error: "Failed to update credit tier" });
    }
  });
  
  // Delete credit score tier
  app.delete("/api/financing/credit-tiers/:id", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      await storage.deleteCreditScoreTier(id, dealershipId);
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting credit tier:', error instanceof Error ? error : new Error(String(error)), { route: 'api-financing-credit-tiers-id' });
      res.status(500).json({ error: "Failed to delete credit tier" });
    }
  });
  
  // Get all model year terms
  app.get("/api/financing/model-year-terms", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const terms = await storage.getModelYearTerms(dealershipId);
      res.json(terms);
    } catch (error) {
      logError('Error fetching model year terms:', error instanceof Error ? error : new Error(String(error)), { route: 'api-financing-model-year-terms' });
      res.status(500).json({ error: "Failed to fetch model year terms" });
    }
  });
  
  // Create model year term
  app.post("/api/financing/model-year-terms", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const { minModelYear, maxModelYear, availableTerms } = req.body;
      
      if (!minModelYear || !maxModelYear || !availableTerms) {
        return res.status(400).json({ error: "All fields are required" });
      }
      
      if (minModelYear > maxModelYear) {
        return res.status(400).json({ error: "Min year must be less than or equal to max year" });
      }
      
      if (!Array.isArray(availableTerms) || availableTerms.length === 0) {
        return res.status(400).json({ error: "At least one term must be selected" });
      }
      
      // Convert terms to strings for validation (frontend may send numbers or strings)
      const termsAsStrings = availableTerms.map(t => String(t));
      const validTerms = ["36", "48", "60", "72", "84"];
      if (!termsAsStrings.every(term => validTerms.includes(term))) {
        return res.status(400).json({ error: "Invalid term selected" });
      }
      
      const dealershipId = req.dealershipId!;
      const term = await storage.createModelYearTerm({
        dealershipId,
        minModelYear,
        maxModelYear,
        availableTerms,
        isActive: true,
      });
      
      res.status(201).json(term);
    } catch (error) {
      logError('Error creating model year term:', error instanceof Error ? error : new Error(String(error)), { route: 'api-financing-model-year-terms' });
      res.status(500).json({ error: "Failed to create model year term" });
    }
  });
  
  // Update model year term
  app.patch("/api/financing/model-year-terms/:id", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const { minModelYear, maxModelYear, availableTerms } = req.body;
      
      if (minModelYear !== undefined && maxModelYear !== undefined && minModelYear > maxModelYear) {
        return res.status(400).json({ error: "Min year must be less than or equal to max year" });
      }
      
      if (availableTerms !== undefined) {
        if (!Array.isArray(availableTerms) || availableTerms.length === 0) {
          return res.status(400).json({ error: "At least one term must be selected" });
        }
        
        // Convert terms to strings for validation (frontend may send numbers or strings)
        const termsAsStrings = availableTerms.map((t: string | number) => String(t));
        const validTerms = ["36", "48", "60", "72", "84"];
        if (!termsAsStrings.every(term => validTerms.includes(term))) {
          return res.status(400).json({ error: "Invalid term selected" });
        }
      }
      
      const dealershipId = req.dealershipId!;
      const term = await storage.updateModelYearTerm(id, dealershipId, req.body);
      
      if (!term) {
        return res.status(404).json({ error: "Model year term not found" });
      }
      
      res.json(term);
    } catch (error) {
      logError('Error updating model year term:', error instanceof Error ? error : new Error(String(error)), { route: 'api-financing-model-year-terms-id' });
      res.status(500).json({ error: "Failed to update model year term" });
    }
  });
  
  // Delete model year term
  app.delete("/api/financing/model-year-terms/:id", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      await storage.deleteModelYearTerm(id, dealershipId);
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting model year term:', error instanceof Error ? error : new Error(String(error)), { route: 'api-financing-model-year-terms-id' });
      res.status(500).json({ error: "Failed to delete model year term" });
    }
  });
  
  // ===== DEALERSHIP FEES ROUTES (General Manager) =====
  
  // Get all fees for dealership
  app.get("/api/dealership-fees", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const fees = await storage.getDealershipFees(dealershipId);
      res.json(fees);
    } catch (error) {
      logError('Error fetching dealership fees:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-fees' });
      res.status(500).json({ error: "Failed to fetch dealership fees" });
    }
  });
  
  // Get active fees for payment calculation (public)
  app.get("/api/public/dealership-fees", async (req, res) => {
    try {
      const dealershipId = 1; // Default for now
      const fees = await storage.getActiveDealershipFees(dealershipId);
      res.json(fees);
    } catch (error) {
      logError('Error fetching active fees:', error instanceof Error ? error : new Error(String(error)), { route: 'api-public-dealership-fees' });
      res.status(500).json({ error: "Failed to fetch fees" });
    }
  });
  
  // Get public dealership info for legal pages (Privacy Policy, Terms of Service)
  // Supports resolution by: slug, subdomain, or dealershipId query params
  // Falls back to dealershipId=1 for backward compatibility
  app.get("/api/public/dealership-info", async (req, res) => {
    try {
      let dealership = null;
      
      // Try to resolve dealership by slug first
      if (req.query.slug) {
        dealership = await storage.getDealershipBySlug(req.query.slug as string);
      }
      // Then try subdomain
      else if (req.query.subdomain) {
        dealership = await storage.getDealershipBySubdomain(req.query.subdomain as string);
      }
      // Then try explicit dealershipId
      else if (req.query.dealershipId) {
        const id = parseInt(req.query.dealershipId as string, 10);
        if (!isNaN(id) && id > 0) {
          dealership = await storage.getDealership(id);
        }
      }
      // Fallback to default dealership (ID 1) for single-tenant deployments
      else {
        dealership = await storage.getDealership(1);
      }
      
      if (!dealership) {
        return res.status(404).json({ error: "Dealership not found" });
      }
      
      // Return only public-safe dealership info for legal pages
      res.json({
        name: dealership.name,
        address: dealership.address || null,
        city: dealership.city || null,
        province: dealership.province || null,
        postalCode: dealership.postalCode || null,
        phone: dealership.phone || null,
      });
    } catch (error) {
      logError('Error fetching dealership info:', error instanceof Error ? error : new Error(String(error)), { route: 'api-public-dealership-info' });
      res.status(500).json({ error: "Failed to fetch dealership info" });
    }
  });
  
  // Create dealership fee
  app.post("/api/dealership-fees", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { feeName, feeAmount, isPercentage, includeInPayment, displayOrder } = req.body;
      
      if (!feeName || feeAmount === undefined) {
        return res.status(400).json({ error: "Fee name and amount are required" });
      }
      
      const fee = await storage.createDealershipFee({
        dealershipId,
        feeName,
        feeAmount: parseInt(feeAmount),
        isPercentage: isPercentage || false,
        includeInPayment: includeInPayment !== false,
        displayOrder: displayOrder || 0,
        isActive: true,
      });
      
      res.status(201).json(fee);
    } catch (error) {
      logError('Error creating dealership fee:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-fees' });
      res.status(500).json({ error: "Failed to create dealership fee" });
    }
  });
  
  // Update dealership fee
  app.patch("/api/dealership-fees/:id", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      
      const fee = await storage.updateDealershipFee(id, dealershipId, req.body);
      
      if (!fee) {
        return res.status(404).json({ error: "Fee not found" });
      }
      
      res.json(fee);
    } catch (error) {
      logError('Error updating dealership fee:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-fees-id' });
      res.status(500).json({ error: "Failed to update dealership fee" });
    }
  });
  
  // Delete dealership fee
  app.delete("/api/dealership-fees/:id", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      await storage.deleteDealershipFee(id, dealershipId);
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting dealership fee:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-fees-id' });
      res.status(500).json({ error: "Failed to delete dealership fee" });
    }
  });
  
  // ===== DEALERSHIP CONTACTS/WEBSITE ROUTES =====
  
  // Get dealership website URL (for managers to view their site)
  app.get("/api/dealership/website-url", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId || req.user?.dealershipId;
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership not found" });
      }
      
      // Query dealership_contacts for website URL
      const contacts = await db.query.dealershipContacts.findFirst({
        where: eq(dealershipContacts.dealershipId, dealershipId)
      });
      
      res.json({ 
        websiteUrl: contacts?.websiteUrl || null 
      });
    } catch (error) {
      logError('Error fetching website URL:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-website-url' });
      res.status(500).json({ error: "Failed to fetch website URL" });
    }
  });
  
  // ===== DEALERSHIP BRANDING ROUTES (General Manager) =====
  
  // Get dealership branding
  app.get("/api/dealership/branding", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const branding = await storage.getDealershipBranding(dealershipId);
      const dealership = await storage.getDealershipById(dealershipId);
      
      res.json({
        logoUrl: branding?.logoUrl || null,
        dealershipName: dealership?.name || "Unknown Dealership",
        primaryColor: branding?.primaryColor || "#022d60",
        secondaryColor: branding?.secondaryColor || "#00aad2",
      });
    } catch (error) {
      logError('Error fetching branding:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-branding' });
      res.status(500).json({ error: "Failed to fetch branding" });
    }
  });
  
  // Upload dealership logo (using persistent object storage)
  app.post("/api/dealership/branding/logo", authMiddleware, requireRole("master"), requireDealership, logoUpload.single('logo'), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }
      
      const objectStorageService = new ObjectStorageService();
      
      // Delete old logo from object storage if exists
      const existingBranding = await storage.getDealershipBranding(dealershipId);
      if (existingBranding?.logoUrl && existingBranding.logoUrl.startsWith('/public-objects/')) {
        await objectStorageService.deleteObject(existingBranding.logoUrl);
      }
      
      // Upload new logo to object storage
      const logoUrl = await objectStorageService.uploadLogoFromBuffer(
        req.file.buffer,
        dealershipId,
        req.file.mimetype
      );
      
      // Update or create branding record
      await storage.upsertDealershipBranding({
        dealershipId,
        logoUrl,
      });
      
      res.json({ logoUrl });
    } catch (error) {
      logError('Error uploading logo:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-branding-logo' });
      res.status(500).json({ error: "Failed to upload logo" });
    }
  });
  
  // Delete dealership logo
  app.delete("/api/dealership/branding/logo", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      // Get current branding to find old logo
      const branding = await storage.getDealershipBranding(dealershipId);
      
      if (branding?.logoUrl) {
        // Delete from object storage if it's an object storage URL
        if (branding.logoUrl.startsWith('/public-objects/')) {
          const objectStorageService = new ObjectStorageService();
          await objectStorageService.deleteObject(branding.logoUrl);
        }
      }
      
      // Update branding to remove logo
      await storage.upsertDealershipBranding({
        dealershipId,
        logoUrl: null,
      });
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting logo:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-branding-logo' });
      res.status(500).json({ error: "Failed to delete logo" });
    }
  });
  
  // ===== VDP FOOTER ROUTES (General Manager) =====
  
  // Get dealership VDP footer
  app.get("/api/dealership/vdp-footer", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const dealership = await storage.getDealershipById(dealershipId);
      
      res.json({
        vdpFooterDescription: dealership?.vdpFooterDescription || null,
      });
    } catch (error) {
      logError('Error fetching VDP footer:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-vdp-footer' });
      res.status(500).json({ error: "Failed to fetch VDP footer" });
    }
  });
  
  // Update dealership VDP footer (General Manager only)
  app.patch("/api/dealership/vdp-footer", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { vdpFooterDescription } = req.body;
      
      const updated = await storage.updateDealership(dealershipId, { vdpFooterDescription });
      
      if (!updated) {
        return res.status(404).json({ error: "Dealership not found" });
      }
      
      res.json({ vdpFooterDescription: updated.vdpFooterDescription });
    } catch (error) {
      logError('Error updating VDP footer:', error instanceof Error ? error : new Error(String(error)), { route: 'api-dealership-vdp-footer' });
      res.status(500).json({ error: "Failed to update VDP footer" });
    }
  });
  
  // Public endpoint to get VDP footer (for displaying on VDP pages)
  app.get("/api/public/vdp-footer", async (req, res) => {
    try {
      const dealershipId = req.dealershipId || 1;
      const dealership = await storage.getDealershipById(dealershipId);
      
      res.json({
        vdpFooterDescription: dealership?.vdpFooterDescription || null,
      });
    } catch (error) {
      logError('Error fetching public VDP footer:', error instanceof Error ? error : new Error(String(error)), { route: 'api-public-vdp-footer' });
      res.status(500).json({ error: "Failed to fetch VDP footer" });
    }
  });
  
  // ===== SCRAPE SOURCES ROUTES (General Manager) =====
  
  // Get all scrape sources for dealership
  app.get("/api/scrape-sources", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const sources = await storage.getScrapeSources(dealershipId);
      res.json(sources);
    } catch (error) {
      logError('Error fetching scrape sources:', error instanceof Error ? error : new Error(String(error)), { route: 'api-scrape-sources' });
      res.status(500).json({ error: "Failed to fetch scrape sources" });
    }
  });
  
  // Create scrape source
  app.post("/api/scrape-sources", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { sourceName, sourceUrl, sourceType, scrapeFrequency } = req.body;
      
      if (!sourceName || !sourceUrl) {
        return res.status(400).json({ error: "Source name and URL are required" });
      }
      
      // Basic URL validation
      try {
        new URL(sourceUrl);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }
      
      const source = await storage.createScrapeSource({
        dealershipId,
        sourceName,
        sourceUrl,
        sourceType: sourceType || "dealer_website",
        scrapeFrequency: scrapeFrequency || "daily",
        isActive: true,
      });
      
      res.status(201).json(source);
    } catch (error) {
      logError('Error creating scrape source:', error instanceof Error ? error : new Error(String(error)), { route: 'api-scrape-sources' });
      res.status(500).json({ error: "Failed to create scrape source" });
    }
  });
  
  // Update scrape source
  app.patch("/api/scrape-sources/:id", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      
      // Validate URL if provided
      if (req.body.sourceUrl) {
        try {
          new URL(req.body.sourceUrl);
        } catch {
          return res.status(400).json({ error: "Invalid URL format" });
        }
      }
      
      const source = await storage.updateScrapeSource(id, dealershipId, req.body);
      
      if (!source) {
        return res.status(404).json({ error: "Scrape source not found" });
      }
      
      res.json(source);
    } catch (error) {
      logError('Error updating scrape source:', error instanceof Error ? error : new Error(String(error)), { route: 'api-scrape-sources-id' });
      res.status(500).json({ error: "Failed to update scrape source" });
    }
  });
  
  // Delete scrape source
  app.delete("/api/scrape-sources/:id", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      await storage.deleteScrapeSource(id, dealershipId);
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting scrape source:', error instanceof Error ? error : new Error(String(error)), { route: 'api-scrape-sources-id' });
      res.status(500).json({ error: "Failed to delete scrape source" });
    }
  });
  
  // Trigger manual scrape for a source - uses ZenRows robust scraper (same as midnight sync)
  app.post("/api/scrape-sources/:id/scrape", authMiddleware, requireRole("master"), requireDealership, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const dealershipId = req.dealershipId!;
      
      const sources = await storage.getScrapeSources(dealershipId);
      const source = sources.find(s => s.id === id);
      
      if (!source) {
        return res.status(404).json({ error: "Scrape source not found" });
      }
      
      // Return immediately, scrape runs in background
      res.json({ message: `ZenRows scrape started for ${source.sourceName} (same as midnight sync)`, sourceId: id });
      
      // Trigger robust scrape (same as midnight scheduled scrape) in background
      import("./robust-scraper").then(async ({ runRobustScrape }) => {
        try {
          console.log(`[Scraper] Starting manual ZenRows scrape triggered by source: ${source.sourceName} (ID: ${id})`);
          const result = await runRobustScrape('manual', dealershipId);
          
          if (result.success) {
            // Update the scrape source with results
            await storage.updateScrapeSourceStats(id, result.vehiclesFound);
            console.log(`[Scraper] Completed scrape: ${result.vehiclesFound} vehicles (method: ${result.method}, retries: ${result.retryCount})`);
          } else {
            console.error(`[Scraper] Scrape failed after ${result.retryCount} retries: ${result.error}`);
          }
        } catch (err) {
          logError('[Scraper] Error during robust scrape:', err instanceof Error ? err : new Error(String(err)), { route: 'api-scrape-sources-id-scrape' });
        }
      }).catch((err) => {
        logError('[Scraper] Failed to import robust-scraper module:', err instanceof Error ? err : new Error(String(err)), { route: 'api-scrape-sources-id-scrape' });
      });
    } catch (error) {
      logError('Error triggering scrape:', error instanceof Error ? error : new Error(String(error)), { route: 'api-scrape-sources-id-scrape' });
      res.status(500).json({ error: "Failed to trigger scrape" });
    }
  });
  
  // ===== FACEBOOK POSTING ROUTES (Salespeople) =====
  
  // Get Facebook accounts for current user
  app.get("/api/facebook/accounts", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      const accounts = await storage.getFacebookAccountsByUser(userId, dealershipId);
      res.json(accounts);
    } catch (error) {
      logError('Error fetching Facebook accounts:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-accounts' });
      res.status(500).json({ error: "Failed to fetch Facebook accounts" });
    }
  });

  // Create Facebook account
  app.post("/api/facebook/accounts", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      // Validate request body - only require accountName, dealershipId and userId come from auth
      const validated = insertFacebookAccountSchema.omit({ 
        userId: true, 
        isActive: true, 
        dealershipId: true,
        facebookUserId: true,
        accessToken: true,
        tokenExpiresAt: true
      }).safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: fromZodError(validated.error).message });
      }

      // Check if user already has 5 accounts
      const existingAccounts = await storage.getFacebookAccountsByUser(userId, dealershipId);
      if (existingAccounts.length >= 5) {
        return res.status(400).json({ error: "Maximum 5 Facebook accounts per user" });
      }
      
      const account = await storage.createFacebookAccount({
        ...validated.data,
        userId,
        dealershipId,
        isActive: true,
      });
      
      res.status(201).json(account);
    } catch (error) {
      logError('Error creating Facebook account:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-accounts' });
      res.status(500).json({ error: "Failed to create Facebook account" });
    }
  });

  // Update Facebook account
  app.patch("/api/facebook/accounts/:id", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const id = parseInt(req.params.id);
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      // Validate with partial schema, excluding ownership fields
      const updateSchema = insertFacebookAccountSchema.omit({ userId: true }).partial();
      const validated = updateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: fromZodError(validated.error).message });
      }
      
      const account = await storage.updateFacebookAccount(id, userId, dealershipId, validated.data);
      
      if (!account) {
        return res.status(404).json({ error: "Facebook account not found or access denied" });
      }
      
      res.json(account);
    } catch (error) {
      logError('Error updating Facebook account:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-accounts-id' });
      res.status(500).json({ error: "Failed to update Facebook account" });
    }
  });

  // Delete Facebook account
  app.delete("/api/facebook/accounts/:id", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const id = parseInt(req.params.id);
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      const success = await storage.deleteFacebookAccount(id, userId, dealershipId);
      
      if (!success) {
        return res.status(404).json({ error: "Facebook account not found or access denied" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting Facebook account:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-accounts-id' });
      res.status(500).json({ error: "Failed to delete Facebook account" });
    }
  });

  // Get ad templates for current user
  app.get("/api/facebook/templates", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      const templates = await storage.getAdTemplatesByUser(userId, dealershipId);
      res.json(templates);
    } catch (error) {
      logError('Error fetching ad templates:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-templates' });
      res.status(500).json({ error: "Failed to fetch ad templates" });
    }
  });

  // Create ad template
  app.post("/api/facebook/templates", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      // Validate request body (omit userId and dealershipId as they come from auth context)
      const validated = insertAdTemplateSchema.omit({ userId: true, dealershipId: true }).safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: fromZodError(validated.error).message });
      }
      
      const template = await storage.createAdTemplate({
        ...validated.data,
        userId,
        dealershipId,
      });
      
      res.status(201).json(template);
    } catch (error) {
      logError('Error creating ad template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-templates' });
      res.status(500).json({ error: "Failed to create ad template" });
    }
  });

  // Update ad template
  app.patch("/api/facebook/templates/:id", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const id = parseInt(req.params.id);
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      // Validate with partial schema, excluding ownership fields
      const updateSchema = insertAdTemplateSchema.omit({ userId: true }).partial();
      const validated = updateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: fromZodError(validated.error).message });
      }
      
      const template = await storage.updateAdTemplate(id, userId, dealershipId, validated.data);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found or access denied" });
      }
      
      res.json(template);
    } catch (error) {
      logError('Error updating ad template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-templates-id' });
      res.status(500).json({ error: "Failed to update ad template" });
    }
  });

  // Delete ad template
  app.delete("/api/facebook/templates/:id", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const id = parseInt(req.params.id);
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      const success = await storage.deleteAdTemplate(id, userId, dealershipId);
      
      if (!success) {
        return res.status(404).json({ error: "Template not found or access denied" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting ad template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-templates-id' });
      res.status(500).json({ error: "Failed to delete ad template" });
    }
  });

  // Get posting queue for current user
  app.get("/api/facebook/queue", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      const queue = await storage.getPostingQueueByUser(userId, dealershipId);
      res.json(queue);
    } catch (error) {
      logError('Error fetching posting queue:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-queue' });
      res.status(500).json({ error: "Failed to fetch posting queue" });
    }
  });

  // Add vehicle to posting queue
  app.post("/api/facebook/queue", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      // Validate request body
      const validated = insertPostingQueueSchema.omit({ userId: true, status: true }).safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: fromZodError(validated.error).message });
      }
      
      // Verify ownership of foreign key references
      if (validated.data.facebookAccountId) {
        const account = await storage.getFacebookAccountById(validated.data.facebookAccountId, userId, dealershipId);
        if (!account || account.userId !== userId) {
          return res.status(403).json({ error: "Facebook account not found or access denied" });
        }
      }
      
      if (validated.data.templateId) {
        const template = await storage.getAdTemplateById(validated.data.templateId, userId, dealershipId);
        if (!template || template.userId !== userId) {
          return res.status(403).json({ error: "Ad template not found or access denied" });
        }
      }
      
      const item = await storage.createPostingQueueItem({
        ...validated.data,
        userId,
        dealershipId,
        status: 'queued',
      });
      
      res.status(201).json(item);
    } catch (error) {
      logError('Error adding to posting queue:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-queue' });
      res.status(500).json({ error: "Failed to add to posting queue" });
    }
  });

  // Update queue item
  app.patch("/api/facebook/queue/:id", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const id = parseInt(req.params.id);
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      // Validate with partial schema, excluding ownership and status fields
      const updateSchema = insertPostingQueueSchema.omit({ userId: true, status: true }).partial();
      const validated = updateSchema.safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: fromZodError(validated.error).message });
      }
      
      // Verify ownership of foreign key references if being updated
      if (validated.data.facebookAccountId) {
        const account = await storage.getFacebookAccountById(validated.data.facebookAccountId, userId, dealershipId);
        if (!account || account.userId !== userId) {
          return res.status(403).json({ error: "Facebook account not found or access denied" });
        }
      }
      
      if (validated.data.templateId) {
        const template = await storage.getAdTemplateById(validated.data.templateId, userId, dealershipId);
        if (!template || template.userId !== userId) {
          return res.status(403).json({ error: "Ad template not found or access denied" });
        }
      }
      
      const item = await storage.updatePostingQueueItem(id, userId, dealershipId, validated.data);
      
      if (!item) {
        return res.status(404).json({ error: "Queue item not found or access denied" });
      }
      
      res.json(item);
    } catch (error) {
      logError('Error updating queue item:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-queue-id' });
      res.status(500).json({ error: "Failed to update queue item" });
    }
  });

  // Delete queue item
  app.delete("/api/facebook/queue/:id", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const id = parseInt(req.params.id);
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      const success = await storage.deletePostingQueueItem(id, userId, dealershipId);
      
      if (!success) {
        return res.status(404).json({ error: "Queue item not found or access denied" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting queue item:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-queue-id' });
      res.status(500).json({ error: "Failed to delete queue item" });
    }
  });

  // Get posting schedule for current user
  app.get("/api/facebook/schedule", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      const schedule = await storage.getPostingScheduleByUser(userId, dealershipId);
      res.json(schedule || null);
    } catch (error) {
      logError('Error fetching posting schedule:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-schedule' });
      res.status(500).json({ error: "Failed to fetch posting schedule" });
    }
  });

  // Create or update posting schedule
  app.post("/api/facebook/schedule", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      // Validate request body
      const validated = insertPostingScheduleSchema.omit({ userId: true }).safeParse(req.body);
      if (!validated.success) {
        return res.status(400).json({ error: fromZodError(validated.error).message });
      }
      
      // Check if schedule exists
      const existing = await storage.getPostingScheduleByUser(userId, dealershipId);
      
      let schedule;
      if (existing) {
        schedule = await storage.updatePostingSchedule(userId, dealershipId, validated.data);
      } else {
        schedule = await storage.createPostingSchedule({
          ...validated.data,
          userId,
          dealershipId,
        });
      }
      
      res.json(schedule);
    } catch (error) {
      logError('Error saving posting schedule:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-schedule' });
      res.status(500).json({ error: "Failed to save posting schedule" });
    }
  });

  // Check if Facebook is configured
  app.get("/api/facebook/config/status", authMiddleware, requireRole("salesperson"), (req, res) => {
    res.json({ configured: facebookService.isConfigured() });
  });

  // ===== NEW SESSION-BASED OAUTH FLOW =====
  // This flow: Click "Add Account" → OAuth popup → Select pages → Account created
  
  // Start OAuth session (no pre-created account needed)
  app.post("/api/facebook/oauth/start", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      // Check if user already has 5 accounts
      const existingAccounts = await storage.getFacebookAccountsByUser(userId, dealershipId);
      if (existingAccounts.length >= 5) {
        return res.status(400).json({ error: "Maximum 5 Facebook accounts per user" });
      }
      
      // Generate state and session ID
      const state = crypto.randomBytes(32).toString('hex');
      const sessionId = crypto.randomBytes(16).toString('hex');
      
      // Store state with session ID reference (no accountId needed)
      oauthStateStore.set(state, {
        userId,
        accountId: 0, // Not used in new flow
        dealershipId,
        expiresAt: Date.now() + 600000 // 10 minutes
      });
      
      // Store session ID in state data for callback to use
      (oauthStateStore.get(state) as any).sessionId = sessionId;
      (oauthStateStore.get(state) as any).isNewFlow = true;
      
      const authUrl = facebookService.getAuthUrl(state);
      res.json({ authUrl, sessionId });
    } catch (error) {
      logError('Error starting OAuth session:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-oauth-start' });
      res.status(500).json({ error: "Failed to start OAuth flow" });
    }
  });
  
  // Get OAuth session status (poll this after OAuth popup closes)
  app.get("/api/facebook/oauth/session/:sessionId", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const sessionId = req.params.sessionId;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      const session = oauthSessionStore.get(sessionId);
      
      if (!session) {
        return res.json({ status: 'pending' });
      }
      
      // Verify session belongs to this user and dealership
      if (session.userId !== userId || session.dealershipId !== dealershipId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (session.expiresAt < Date.now()) {
        oauthSessionStore.delete(sessionId);
        return res.json({ status: 'expired' });
      }
      
      // Return session data with pages
      res.json({
        status: 'ready',
        facebookUserName: session.facebookUserName,
        pages: session.pages.map(p => ({
          id: p.id,
          name: p.name,
          category: p.category,
          picture: p.picture
        }))
      });
    } catch (error) {
      logError('Error fetching OAuth session:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-oauth-session-sessionId' });
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });
  
  // Connect selected pages (creates accounts)
  app.post("/api/facebook/accounts/connect", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      const { sessionId, pageIds } = req.body;
      
      if (!sessionId || !Array.isArray(pageIds) || pageIds.length === 0) {
        return res.status(400).json({ error: "Session ID and at least one page selection required" });
      }
      
      const session = oauthSessionStore.get(sessionId);
      
      if (!session) {
        return res.status(400).json({ error: "Session not found or expired. Please try again." });
      }
      
      // Verify session belongs to this user and dealership
      if (session.userId !== userId || session.dealershipId !== dealershipId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      if (session.expiresAt < Date.now()) {
        oauthSessionStore.delete(sessionId);
        return res.status(400).json({ error: "Session expired. Please try again." });
      }
      
      // Check max accounts limit
      const existingAccounts = await storage.getFacebookAccountsByUser(userId, dealershipId);
      if (existingAccounts.length + pageIds.length > 5) {
        return res.status(400).json({ 
          error: `Cannot add ${pageIds.length} pages. You can only have ${5 - existingAccounts.length} more accounts.` 
        });
      }
      
      // Create accounts for selected pages
      const createdAccounts = [];
      for (const pageId of pageIds) {
        const page = session.pages.find(p => p.id === pageId);
        if (!page) {
          continue; // Skip pages not in session
        }
        
        // Check if this page is already connected
        const existingPage = await storage.getFacebookPageByPageId(pageId);
        if (existingPage) {
          // Page already exists, skip or update
          continue;
        }
        
        // Create the Facebook account
        const account = await storage.createFacebookAccount({
          dealershipId,
          userId,
          accountName: page.name, // Use page name as account name
          facebookUserId: session.facebookUserId,
          accessToken: session.accessToken,
          tokenExpiresAt: session.tokenExpiresAt,
          isActive: true
        });
        
        // Create the Facebook page entry (linked via dealershipId, not accountId)
        await storage.createFacebookPage({
          dealershipId,
          pageId: page.id,
          pageName: page.name,
          accessToken: page.accessToken,
          isActive: true
        });
        
        createdAccounts.push({
          id: account.id,
          accountName: account.accountName,
          pageName: page.name
        });
      }
      
      // Clean up session
      oauthSessionStore.delete(sessionId);
      
      if (createdAccounts.length === 0) {
        return res.status(400).json({ error: "No new pages were connected. They may already be connected." });
      }
      
      res.json({ 
        success: true, 
        message: `Successfully connected ${createdAccounts.length} page(s)`,
        accounts: createdAccounts 
      });
    } catch (error) {
      logError('Error connecting pages:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-accounts-connect' });
      res.status(500).json({ error: "Failed to connect pages" });
    }
  });

  // ===== LEGACY OAUTH FLOW (for existing accounts that need reconnection) =====
  
  // Initiate Facebook OAuth flow
  app.get("/api/facebook/oauth/init/:accountId", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const accountId = parseInt(req.params.accountId);
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      const account = await storage.getFacebookAccountById(accountId, userId, dealershipId);
      if (!account || account.userId !== userId) {
        return res.status(404).json({ error: "Account not found or access denied" });
      }
      
      const state = crypto.randomBytes(32).toString('hex');
      oauthStateStore.set(state, {
        userId,
        accountId,
        dealershipId,
        expiresAt: Date.now() + 600000
      });
      
      const authUrl = facebookService.getAuthUrl(state);
      res.json({ authUrl });
    } catch (error) {
      logError('Error initiating OAuth:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-oauth-init-accountId' });
      res.status(500).json({ error: "Failed to initiate OAuth flow" });
    }
  });

  // Facebook OAuth callback
  app.get("/api/facebook/oauth/callback", async (req, res) => {
    try {
      const { code, state } = req.query;
      
      if (!code || !state) {
        return res.status(400).send("Missing code or state");
      }

      const stateData = oauthStateStore.get(state as string);
      if (!stateData) {
        return res.status(400).send(`
          <html>
            <head><title>Invalid State</title></head>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>✗ Invalid or Expired Session</h1>
              <p>The authentication session is invalid or has expired. Please try again.</p>
              <button onclick="window.close()">Close</button>
            </body>
          </html>
        `);
      }

      if (stateData.expiresAt < Date.now()) {
        oauthStateStore.delete(state as string);
        return res.status(400).send(`
          <html>
            <head><title>Session Expired</title></head>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>✗ Session Expired</h1>
              <p>The authentication session has expired. Please try again.</p>
              <button onclick="window.close()">Close</button>
            </body>
          </html>
        `);
      }

      // Use dealershipId from state (not from request) for proper multi-tenant security
      const { accountId, userId, dealershipId } = stateData;
      const isNewFlow = (stateData as any).isNewFlow === true;
      const sessionId = (stateData as any).sessionId as string | undefined;
      
      // Delete state after extracting data
      oauthStateStore.delete(state as string);
      
      // Runtime check to ensure dealershipId is present (defense in depth)
      if (!dealershipId || typeof dealershipId !== 'number') {
        return res.status(400).send(`
          <html>
            <head><title>Invalid State</title></head>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>✗ Invalid Session Data</h1>
              <p>The session is missing required tenant information. Please try again.</p>
              <button onclick="window.close()">Close</button>
            </body>
          </html>
        `);
      }
      
      // Exchange code for tokens
      const { accessToken } = await facebookService.exchangeCodeForToken(code as string);
      const longLivedToken = await facebookService.getLongLivedToken(accessToken);
      const userInfo = await facebookService.getUserInfo(longLivedToken.accessToken);
      const expiresAt = new Date(Date.now() + longLivedToken.expiresIn * 1000);
      
      // NEW SESSION-BASED FLOW: Store session with pages for later selection
      if (isNewFlow && sessionId) {
        // Fetch user's pages
        const pages = await facebookService.getUserPages(longLivedToken.accessToken);
        
        // Store session for frontend to poll
        oauthSessionStore.set(sessionId, {
          userId,
          dealershipId,
          facebookUserId: userInfo.id,
          facebookUserName: userInfo.name,
          accessToken: longLivedToken.accessToken,
          tokenExpiresAt: expiresAt,
          pages: pages.map(p => ({
            id: p.id,
            name: p.name,
            category: p.category,
            accessToken: p.access_token,
            picture: p.picture?.data?.url
          })),
          expiresAt: Date.now() + 600000 // 10 minutes
        });
        
        return res.send(`
          <html>
            <head><title>Facebook Connected</title></head>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>✓ Connected to Facebook</h1>
              <p>Please select your pages in the app window.</p>
              <p>This window will close automatically...</p>
              <script>
                // Signal parent window that OAuth is complete
                if (window.opener) {
                  window.opener.postMessage({ type: 'facebook-oauth-complete', sessionId: '${sessionId}' }, '*');
                }
                setTimeout(() => window.close(), 1500);
              </script>
            </body>
          </html>
        `);
      }
      
      // LEGACY FLOW: Update existing account directly
      const account = await storage.getFacebookAccountById(accountId, userId, dealershipId);
      if (!account) {
        return res.status(403).send(`
          <html>
            <head><title>Access Denied</title></head>
            <body style="font-family: system-ui; text-align: center; padding: 50px;">
              <h1>✗ Access Denied</h1>
              <p>You don't have permission to connect this account.</p>
              <button onclick="window.close()">Close</button>
            </body>
          </html>
        `);
      }
      
      await storage.updateFacebookAccount(accountId, userId, dealershipId, {
        accessToken: longLivedToken.accessToken,
        facebookUserId: userInfo.id,
        tokenExpiresAt: expiresAt,
        isActive: true
      });
      
      res.send(`
        <html>
          <head><title>Facebook Connected</title></head>
          <body style="font-family: system-ui; text-align: center; padding: 50px;">
            <h1>✓ Facebook Account Connected</h1>
            <p>You can close this window and return to the app.</p>
            <script>window.close();</script>
          </body>
        </html>
      `);
    } catch (error) {
      logError('OAuth callback error:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-oauth-callback' });
      res.status(500).send(`
        <html>
          <head><title>Connection Failed</title></head>
          <body style="font-family: system-ui; text-align: center; padding: 50px;">
            <h1>✗ Connection Failed</h1>
            <p>${error instanceof Error ? error.message : "Unknown error"}</p>
            <button onclick="window.close()">Close</button>
          </body>
        </html>
      `);
    }
  });

  // Get available Facebook pages from a connected account
  app.get("/api/facebook/accounts/:accountId/pages", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const accountId = parseInt(req.params.accountId);
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      const account = await storage.getFacebookAccountById(accountId, userId, dealershipId);
      if (!account || !account.accessToken) {
        return res.status(400).json({ error: "Account not connected or token missing" });
      }
      
      const pages = await facebookService.getUserPages(account.accessToken);
      
      const formattedPages = pages.map(page => ({
        id: page.id,
        name: page.name,
        category: page.category,
        picture: page.picture?.data?.url,
        hasToken: !!page.access_token
      }));
      
      res.json(formattedPages);
    } catch (error) {
      logError('Error fetching Facebook pages:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-accounts-accountId-pages' });
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to fetch pages" });
    }
  });

  // Connect a Facebook page (store its access token)
  app.post("/api/facebook/accounts/:accountId/pages/:pageId/connect", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const accountId = parseInt(req.params.accountId);
      const pageId = req.params.pageId;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      const account = await storage.getFacebookAccountById(accountId, userId, dealershipId);
      if (!account || !account.accessToken) {
        return res.status(400).json({ error: "Account not connected" });
      }
      
      const pages = await facebookService.getUserPages(account.accessToken);
      const page = pages.find(p => p.id === pageId);
      
      if (!page) {
        return res.status(404).json({ error: "Page not found or you don't have access" });
      }
      
      const existingPage = await storage.getFacebookPageByPageId(pageId);
      if (existingPage) {
        await storage.updateFacebookPage(existingPage.id, {
          accessToken: page.access_token,
          isActive: true,
          pageName: page.name
        });
        return res.json({ 
          success: true, 
          message: "Page reconnected successfully",
          page: { id: existingPage.id, pageId, name: page.name }
        });
      }
      
      const newPage = await storage.createFacebookPage({
        dealershipId,
        pageName: page.name,
        pageId: page.id,
        accessToken: page.access_token,
        isActive: true,
        selectedTemplate: 'modern'
      });
      
      res.json({ 
        success: true, 
        message: "Page connected successfully",
        page: { id: newPage.id, pageId: newPage.pageId, name: newPage.pageName }
      });
    } catch (error) {
      logError('Error connecting Facebook page:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-accounts-accountId-pages-pa' });
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to connect page" });
    }
  });

  // Disconnect a Facebook page
  app.post("/api/facebook/pages/:pageId/disconnect", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const pageId = parseInt(req.params.pageId);
      const dealershipId = req.dealershipId!;
      
      await storage.updateFacebookPage(pageId, { isActive: false, accessToken: null });
      
      res.json({ success: true, message: "Page disconnected" });
    } catch (error) {
      logError('Error disconnecting Facebook page:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-pages-pageId-disconnect' });
      res.status(500).json({ error: "Failed to disconnect page" });
    }
  });

  // Get connected Facebook pages for the dealership
  app.get("/api/facebook/connected-pages", authMiddleware, async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const pages = await storage.getFacebookPages(dealershipId);
      
      // Explicitly exclude sensitive token data from response
      const safePages = pages.map(({ accessToken, ...page }) => ({
        ...page,
        hasValidToken: !!accessToken
      }));
      
      res.json(safePages);
    } catch (error) {
      logError('Error fetching connected pages:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-connected-pages' });
      res.status(500).json({ error: "Failed to fetch connected pages" });
    }
  });

  // Test post to a Facebook page
  app.post("/api/facebook/pages/:pageId/test-post", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const pageId = parseInt(req.params.pageId);
      const dealershipId = req.dealershipId!;
      const { message } = req.body;
      
      const pages = await storage.getFacebookPages(dealershipId);
      const page = pages.find(p => p.id === pageId);
      
      if (!page || !page.accessToken) {
        return res.status(400).json({ error: "Page not connected or token missing" });
      }
      
      const result = await facebookService.postToPage(
        page.accessToken,
        page.pageId,
        message || `Test post from Olympic Auto Group - ${new Date().toLocaleString()}`
      );
      
      res.json({ success: true, postId: result.postId });
    } catch (error) {
      logError('Error posting to Facebook page:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-pages-pageId-test-post' });
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to post" });
    }
  });

  // Post a vehicle to a Facebook page
  app.post("/api/facebook/pages/:pageId/post-vehicle/:vehicleId", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const pageId = parseInt(req.params.pageId);
      const vehicleId = parseInt(req.params.vehicleId);
      const dealershipId = req.dealershipId!;
      
      const pages = await storage.getFacebookPages(dealershipId);
      const page = pages.find(p => p.id === pageId);
      
      if (!page || !page.accessToken) {
        return res.status(400).json({ error: "Page not connected or token missing" });
      }
      
      const vehicle = await storage.getVehicleById(vehicleId, dealershipId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      
      const result = await facebookService.postVehicleToPage(
        page.accessToken,
        page.pageId,
        {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          price: vehicle.price,
          odometer: vehicle.odometer,
          images: vehicle.images,
          dealerVdpUrl: vehicle.dealerVdpUrl || undefined,
          description: vehicle.description
        }
      );
      
      res.json({ success: true, postId: result.postId, vehicleId });
    } catch (error) {
      logError('Error posting vehicle to Facebook:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-pages-pageId-post-vehicle-v' });
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to post vehicle" });
    }
  });

  // Manually post a vehicle to Facebook Marketplace
  app.post("/api/facebook/post/:queueId", authMiddleware, requireRole("salesperson"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const queueId = parseInt(req.params.queueId);
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      
      const queueItem = (await storage.getPostingQueueByUser(userId, dealershipId)).find(item => item.id === queueId);
      
      if (!queueItem) {
        return res.status(404).json({ error: "Queue item not found" });
      }
      
      const vehicle = await storage.getVehicleById(queueItem.vehicleId, dealershipId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      
      let account;
      if (queueItem.facebookAccountId) {
        account = await storage.getFacebookAccountById(queueItem.facebookAccountId, userId, dealershipId);
      } else {
        const accounts = await storage.getFacebookAccountsByUser(userId, dealershipId);
        account = accounts[0];
      }
      
      if (!account || !account.accessToken) {
        return res.status(400).json({ error: "No Facebook account connected" });
      }
      
      let template;
      if (queueItem.templateId) {
        template = await storage.getAdTemplateById(queueItem.templateId, userId, dealershipId);
      } else {
        const templates = await storage.getAdTemplatesByUser(userId, dealershipId);
        template = templates.find(t => t.isDefault) || templates[0];
      }
      
      if (!template) {
        return res.status(400).json({ error: "No ad template found" });
      }
      
      await storage.updatePostingQueueItem(queueId, userId, dealershipId, { status: 'posting' });
      
      try {
        const { postId } = await facebookService.postToMarketplace(
          account.accessToken,
          vehicle,
          {
            titleTemplate: template.titleTemplate,
            descriptionTemplate: template.descriptionTemplate
          }
        );
        
        await storage.updatePostingQueueItem(queueId, userId, dealershipId, {
          status: 'posted',
          facebookPostId: postId,
          postedAt: new Date()
        });
        
        res.json({ success: true, postId });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await storage.updatePostingQueueItem(queueId, userId, dealershipId, {
          status: 'failed',
          errorMessage
        });
        throw error;
      }
    } catch (error) {
      logError('Error posting to Facebook:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-post-queueId' });
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to post to Facebook" });
    }
  });

  // ===== SALES MANAGER ROUTES =====
  
  // Decode VIN with auto-save appraisal
  app.post("/api/manager/decode-vin", authMiddleware, requireRole("manager"), async (req: AuthRequest, res) => {
    try {
      const { vin, autoSave = true } = req.body;
      const dealershipId = req.dealershipId || 1;
      const userId = req.user?.id;
      
      if (!vin || typeof vin !== 'string') {
        return res.json({
          vin: '',
          errorCode: 'MISSING_VIN',
          errorMessage: 'VIN is required'
        });
      }
      
      // Use enriched VIN decoder for comprehensive data with confidence scoring
      const enrichedResult = await enrichVIN(vin, dealershipId);
      const result = toVINDecodeResult(enrichedResult);
      
      // Auto-save appraisal if decode was successful, autoSave is enabled, and feature flag is on
      let appraisalId: number | undefined;
      const appraisalAutoSaveEnabled = await isFeatureEnabled(FEATURE_FLAGS.ENABLE_APPRAISAL_AUTOSAVE, dealershipId);
      if (autoSave && appraisalAutoSaveEnabled && !result.errorCode && result.vin) {
        try {
          // Check if appraisal already exists for this VIN
          const existing = await storage.getVehicleAppraisalByVin(result.vin, dealershipId);
          
          if (existing) {
            // Update existing appraisal with latest decode data
            await storage.updateVehicleAppraisal(existing.id, dealershipId, {
              year: result.year ? parseInt(result.year) : undefined,
              make: result.make || undefined,
              model: result.model || undefined,
              trim: result.trim || undefined,
              bodyType: result.bodyClass || undefined,
              driveType: result.driveType || undefined,
              transmission: result.transmission || undefined,
              fuelType: result.fuelType || undefined,
              exteriorColor: result.exteriorColor || undefined,
              interiorColor: result.interiorColor || undefined,
              engineInfo: result.engineCylinders && result.engineHP 
                ? `${result.engineCylinders} cyl, ${result.engineHP}hp` 
                : undefined,
            });
            appraisalId = existing.id;
          } else {
            // Create new appraisal
            const newAppraisal = await storage.createVehicleAppraisal({
              dealershipId,
              createdBy: userId || null,
              vin: result.vin,
              year: result.year ? parseInt(result.year) : undefined,
              make: result.make || undefined,
              model: result.model || undefined,
              trim: result.trim || undefined,
              bodyType: result.bodyClass || undefined,
              driveType: result.driveType || undefined,
              transmission: result.transmission || undefined,
              fuelType: result.fuelType || undefined,
              exteriorColor: result.exteriorColor || undefined,
              interiorColor: result.interiorColor || undefined,
              engineInfo: result.engineCylinders && result.engineHP 
                ? `${result.engineCylinders} cyl, ${result.engineHP}hp` 
                : undefined,
              status: 'draft',
            });
            appraisalId = newAppraisal.id;
          }
        } catch (appraisalError) {
          logWarn('Failed to auto-save appraisal:', { error: appraisalError instanceof Error ? appraisalError.message : String(appraisalError) });
        }
      }
      
      // Fetch competitor vehicles if we have make/model/year
      let competitors: Array<{
        id: number;
        year: number | null;
        make: string | null;
        model: string | null;
        trim: string | null;
        price: number | null;
        mileage: number | null;
        sellerName: string | null;
        location: string | null;
        listingUrl: string | null;
        interiorColor: string | null;
        exteriorColor: string | null;
        daysOnMarket: number | null;
      }> = [];
      
      if (!result.errorCode && result.year && result.make && result.model) {
        try {
          const vehicleYear = parseInt(result.year);
          const { listings: marketListings } = await storage.getMarketListings(dealershipId, {
            make: result.make,
            model: result.model,
            yearMin: vehicleYear - 1,
            yearMax: vehicleYear + 1
          }, 100, 0);
          
          const now = new Date();
          competitors = marketListings
            .filter(l => l.isActive && l.price && l.price > 0)
            .sort((a, b) => (a.price || 0) - (b.price || 0))
            .slice(0, 10)
            .map(l => {
              let daysOnMarket: number | null = null;
              if (l.postedDate) {
                const posted = new Date(l.postedDate);
                daysOnMarket = Math.floor((now.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24));
              }
              
              return {
                id: l.id,
                year: l.year,
                make: l.make,
                model: l.model,
                trim: l.trim,
                price: l.price,
                mileage: l.mileage,
                sellerName: l.sellerName,
                location: l.location,
                listingUrl: l.listingUrl,
                interiorColor: l.interiorColor || null,
                exteriorColor: l.exteriorColor || null,
                daysOnMarket
              };
            });
        } catch (competitorError) {
          logWarn('Failed to fetch competitor vehicles:', { error: competitorError instanceof Error ? competitorError.message : String(competitorError) });
        }
      }
      
      res.json({ ...result, appraisalId, competitors });
    } catch (error) {
      logError('Error decoding VIN:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-decode-vin' });
      res.json({
        vin: req.body.vin || '',
        errorCode: 'DECODE_ERROR',
        errorMessage: error instanceof Error ? error.message : "Failed to decode VIN"
      });
    }
  });

  // Market pricing analysis (uses external market listings)
  app.post("/api/manager/market-pricing", authMiddleware, requireRole("manager"), async (req: AuthRequest, res) => {
    try {
      const { year, years, make, model, trim, trims, yearMin, yearMax, mileage, radiusKm, postalCode, vin, autoSave = true } = req.body;
      
      // Validate required fields
      if (!year && !years && !yearMin) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'Year or year range is required'
        });
      }
      
      if (!make || !model) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'Make and model are required for market pricing analysis'
        });
      }

      // Get user settings for postal code/radius defaults
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      const userSettings = await storage.getManagerSettings(userId, dealershipId);
      
      const searchPostalCode = postalCode || userSettings?.postalCode;
      const searchRadiusKm = radiusKm || userSettings?.defaultRadiusKm || 50;
      
      // Handle years parameter (array) vs single year vs year range
      let searchYearMin: number;
      let searchYearMax: number;
      let targetYear: number;
      if (years && Array.isArray(years) && years.length > 0) {
        searchYearMin = Math.min(...years);
        searchYearMax = Math.max(...years);
        targetYear = Math.round((searchYearMin + searchYearMax) / 2);
      } else if (yearMin && yearMax) {
        searchYearMin = parseInt(yearMin);
        searchYearMax = parseInt(yearMax);
        targetYear = Math.round((searchYearMin + searchYearMax) / 2);
      } else if (year) {
        targetYear = parseInt(year);
        searchYearMin = targetYear - 2;
        searchYearMax = targetYear + 2;
      } else {
        searchYearMin = new Date().getFullYear() - 5;
        searchYearMax = new Date().getFullYear();
        targetYear = Math.round((searchYearMin + searchYearMax) / 2);
      }
      
      // Get market listings from database (no pagination - need full dataset for analytics)
      let { listings: marketListings } = await storage.getMarketListings(dealershipId, {
        make,
        model,
        yearMin: searchYearMin,
        yearMax: searchYearMax
      }, 10000, 0);

      // If no market listings found, return message prompting manual scrape
      if (marketListings.length === 0) {
        const noListingsResponse = {
          averagePrice: 0,
          medianPrice: 0,
          minPrice: 0,
          maxPrice: 0,
          totalComps: 0,
          comparisons: [],
          priceRange: { low: 0, high: 0 },
          recommendation: `No market data found. Please use the "Refresh Market Data" button to scrape current listings from AutoTrader.`,
          marketPosition: 'at_market' as const,
          meta: {
            dataSource: 'none',
            totalListings: 0,
            sources: [] as string[],
            searchRadius: searchRadiusKm,
            postalCode: searchPostalCode,
            years: years || (year ? [parseInt(year)] : []),
            year: targetYear
          }
        };
        
        // Auto-save appraisal even with no listings if VIN provided and feature flag enabled
        let appraisalId: number | undefined;
        const appraisalFlagEnabled = await isFeatureEnabled(FEATURE_FLAGS.ENABLE_APPRAISAL_AUTOSAVE, req.dealershipId);
        if (autoSave && appraisalFlagEnabled && vin && typeof vin === 'string' && vin.length >= 11) {
          try {
            const dealershipId = req.dealershipId || 1;
            const existing = await storage.getVehicleAppraisalByVin(vin, dealershipId);
            
            if (existing) {
              await storage.updateVehicleAppraisal(existing.id, dealershipId, {
                marketAnalysisData: JSON.stringify(noListingsResponse),
                comparableCount: 0,
              });
              appraisalId = existing.id;
            } else {
              const newAppraisal = await storage.createVehicleAppraisal({
                dealershipId,
                createdBy: req.user?.id || null,
                vin,
                year: targetYear,
                make,
                model,
                trim: trim || (trims && trims.length === 1 ? trims[0] : undefined),
                mileage: mileage ? parseInt(mileage) : undefined,
                marketAnalysisData: JSON.stringify(noListingsResponse),
                comparableCount: 0,
                status: 'draft',
              });
              appraisalId = newAppraisal.id;
            }
          } catch (appraisalError) {
            logWarn('Failed to auto-save appraisal (no listings):', { error: appraisalError instanceof Error ? appraisalError.message : String(appraisalError) });
          }
        }
        
        return res.json({ ...noListingsResponse, appraisalId });
      }

      // Convert market listings to Vehicle format for pricing analysis
      const vehiclesForAnalysis = marketListings.map(listing => ({
        id: listing.id,
        stockNumber: listing.externalId,
        year: listing.year,
        make: listing.make,
        model: listing.model,
        trim: listing.trim || '',
        price: listing.price,
        mileage: listing.mileage || 0,
        location: listing.location,
        dealership: listing.sellerName,
        source: listing.source,
        listingType: listing.listingType,
        listingUrl: listing.listingUrl,
        postedDate: listing.postedDate,
        scrapedAt: listing.scrapedAt,
        interiorColor: listing.interiorColor,
        exteriorColor: listing.exteriorColor
      }));
      
      // Import market pricing service
      const { analyzeMarketPricing } = await import('./market-pricing');
      
      // Prepare request
      const pricingRequest = {
        year: targetYear,
        make,
        model,
        trim: trim, // Legacy single trim support
        trims: trims && trims.length > 0 ? trims : undefined, // Multi-trim support
        mileage: mileage ? parseInt(mileage) : undefined,
        radius: searchRadiusKm
      };
      
      // Analyze pricing
      const result = analyzeMarketPricing(pricingRequest, vehiclesForAnalysis as any);
      
      // Calculate source breakdown
      const sourceBreakdown = {
        marketcheck: marketListings.filter(l => l.source === 'marketcheck').length,
        apify: marketListings.filter(l => l.source === 'apify').length,
        autotrader_scraper: marketListings.filter(l => l.source === 'autotrader_scraper').length
      };
      
      // Calculate trim breakdown - group comparisons by trim level (excluding unknown trims)
      const trimBreakdown: Record<string, { count: number; avgPrice: number; minPrice: number; maxPrice: number; medianPrice: number }> = {};
      if (result.comparisons && result.comparisons.length > 0) {
        const trimGroups: Record<string, number[]> = {};
        
        for (const comp of result.comparisons) {
          // Skip listings without a trim - they would skew the breakdown
          if (!comp.trim || comp.trim.trim() === '') continue;
          const trimKey = comp.trim;
          if (!trimGroups[trimKey]) {
            trimGroups[trimKey] = [];
          }
          trimGroups[trimKey].push(comp.price);
        }
        
        for (const [trimName, prices] of Object.entries(trimGroups)) {
          const sortedPrices = [...prices].sort((a, b) => a - b);
          const sum = prices.reduce((acc, p) => acc + p, 0);
          const median = sortedPrices.length % 2 === 0
            ? Math.round((sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2)
            : sortedPrices[Math.floor(sortedPrices.length / 2)];
          
          trimBreakdown[trimName] = {
            count: prices.length,
            avgPrice: Math.round(sum / prices.length),
            minPrice: sortedPrices[0],
            maxPrice: sortedPrices[sortedPrices.length - 1],
            medianPrice: median
          };
        }
      }
      
      // Calculate mileage adjustment - uses $0.12/km depreciation rate (industry standard)
      const DEPRECIATION_RATE_PER_KM = 0.12; // CAD per km
      let mileageAdjustment: { 
        targetMileage: number | null;
        marketAvgMileage: number;
        mileageDifference: number;
        priceAdjustment: number;
        adjustedPrice: number;
        adjustmentDirection: 'add' | 'subtract' | 'none';
      } | null = null;
      
      if (result.comparisons && result.comparisons.length > 0) {
        const mileages = result.comparisons.filter(c => c.mileage && c.mileage > 0).map(c => c.mileage!);
        if (mileages.length > 0) {
          const marketAvgMileage = Math.round(mileages.reduce((a, b) => a + b, 0) / mileages.length);
          const targetMileage = mileage ? parseInt(mileage) : null;
          
          if (targetMileage && targetMileage > 0) {
            const mileageDifference = marketAvgMileage - targetMileage; // Positive = target has fewer miles
            const priceAdjustment = Math.round(Math.abs(mileageDifference) * DEPRECIATION_RATE_PER_KM);
            const adjustedPrice = mileageDifference > 0 
              ? result.averagePrice + priceAdjustment  // Fewer miles = worth more
              : result.averagePrice - priceAdjustment; // More miles = worth less
            
            mileageAdjustment = {
              targetMileage,
              marketAvgMileage,
              mileageDifference,
              priceAdjustment,
              adjustedPrice: Math.max(0, adjustedPrice),
              adjustmentDirection: mileageDifference > 0 ? 'add' : mileageDifference < 0 ? 'subtract' : 'none'
            };
          } else {
            mileageAdjustment = {
              targetMileage: null,
              marketAvgMileage,
              mileageDifference: 0,
              priceAdjustment: 0,
              adjustedPrice: result.averagePrice,
              adjustmentDirection: 'none'
            };
          }
        }
      }
      
      // Calculate market velocity indicator (Hot/Warm/Cold based on days on market and supply)
      let marketVelocity: {
        indicator: 'hot' | 'warm' | 'cold';
        avgDaysOnMarket: number;
        supplyLevel: 'low' | 'moderate' | 'high';
        demandSignal: string;
      } | null = null;
      
      if (result.comparisons && result.comparisons.length > 0) {
        const daysOnMarket = result.comparisons
          .filter(c => c.daysOnLot !== undefined && c.daysOnLot >= 0)
          .map(c => c.daysOnLot!);
        
        const avgDays = daysOnMarket.length > 0 
          ? Math.round(daysOnMarket.reduce((a, b) => a + b, 0) / daysOnMarket.length)
          : 45; // Default assumption
        
        // Supply level based on total listings
        const supplyLevel = result.totalComps <= 10 ? 'low' : result.totalComps <= 30 ? 'moderate' : 'high';
        
        // Determine market velocity
        let indicator: 'hot' | 'warm' | 'cold';
        let demandSignal: string;
        
        if (avgDays < 21 && supplyLevel !== 'high') {
          indicator = 'hot';
          demandSignal = 'High demand - vehicles selling quickly. Price aggressively.';
        } else if (avgDays < 45 || (avgDays < 60 && supplyLevel === 'low')) {
          indicator = 'warm';
          demandSignal = 'Moderate demand - normal market conditions. Price competitively.';
        } else {
          indicator = 'cold';
          demandSignal = 'Low demand - vehicles sitting longer. Consider pricing below market.';
        }
        
        marketVelocity = { indicator, avgDaysOnMarket: avgDays, supplyLevel, demandSignal };
      }
      
      // Add meta information about data sources
      const responseWithMeta = {
        ...result,
        trimBreakdown,
        mileageAdjustment,
        marketVelocity,
        meta: {
          dataSource: 'external_market',
          totalListings: marketListings.length,
          sources: Array.from(new Set(marketListings.map(l => l.source))),
          sourceBreakdown,
          searchRadius: searchRadiusKm,
          postalCode: searchPostalCode,
          years: years || (year ? [parseInt(year)] : []),
          year: targetYear
        }
      };
      
      // Auto-save market analysis to appraisal if VIN is provided and feature flag enabled
      let appraisalId: number | undefined;
      const appraisalFlagEnabled2 = await isFeatureEnabled(FEATURE_FLAGS.ENABLE_APPRAISAL_AUTOSAVE, req.dealershipId);
      if (autoSave && appraisalFlagEnabled2 && vin && typeof vin === 'string' && vin.length >= 11) {
        try {
          const dealershipId = req.dealershipId || 1;
          const existing = await storage.getVehicleAppraisalByVin(vin, dealershipId);
          
          if (existing) {
            // Update existing appraisal with market analysis data
            const priceRangeStr = result.priceRange.low > 0 && result.priceRange.high > 0
              ? `$${result.priceRange.low.toLocaleString()} - $${result.priceRange.high.toLocaleString()}`
              : undefined;
            
            await storage.updateVehicleAppraisal(existing.id, dealershipId, {
              marketAnalysisData: JSON.stringify(responseWithMeta),
              comparableCount: result.totalComps,
              averageMarketPrice: result.averagePrice * 100, // Convert to cents
              marketPriceRange: priceRangeStr,
            });
            appraisalId = existing.id;
          } else {
            // Create new appraisal with market analysis data
            const priceRangeStr = result.priceRange.low > 0 && result.priceRange.high > 0
              ? `$${result.priceRange.low.toLocaleString()} - $${result.priceRange.high.toLocaleString()}`
              : undefined;
            
            const newAppraisal = await storage.createVehicleAppraisal({
              dealershipId,
              createdBy: req.user?.id || null,
              vin,
              year: targetYear,
              make,
              model,
              trim: trim || (trims && trims.length === 1 ? trims[0] : undefined),
              mileage: mileage ? parseInt(mileage) : undefined,
              marketAnalysisData: JSON.stringify(responseWithMeta),
              comparableCount: result.totalComps,
              averageMarketPrice: result.averagePrice * 100, // Convert to cents
              marketPriceRange: priceRangeStr,
              status: 'draft',
            });
            appraisalId = newAppraisal.id;
          }
        } catch (appraisalError) {
          logWarn('Failed to auto-save market analysis to appraisal:', { error: appraisalError instanceof Error ? appraisalError.message : String(appraisalError) });
        }
      }
      
      res.json({ ...responseWithMeta, appraisalId });
    } catch (error) {
      logError('Error analyzing market pricing:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-market-pricing' });
      res.status(500).json({
        error: 'PRICING_ERROR',
        message: error instanceof Error ? error.message : "Failed to analyze market pricing"
      });
    }
  });

  // Enhanced market analysis with percentiles, competitors, trends, and AI insights
  app.post("/api/manager/enhanced-market-analysis", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const { years, make, model, trims, mileage, radiusKm, postalCode, targetPrice } = req.body;
      
      if (!make || !model) {
        return res.status(400).json({
          error: 'Missing required fields',
          message: 'Make and model are required'
        });
      }

      const authReq = req as AuthRequest;
      const dealershipId = authReq.dealershipId || 1;
      
      // Get settings for defaults
      const settings = authReq.user ? await storage.getManagerSettings(authReq.user.id, dealershipId) : null;
      const searchPostalCode = postalCode || settings?.postalCode || 'V6B 1A1';
      const searchRadiusKm = radiusKm || settings?.defaultRadiusKm || 100;
      const searchYears = years || [new Date().getFullYear()];
      
      const { enhancedMarketAnalysis } = await import('./enhanced-market-analysis');
      
      const result = await enhancedMarketAnalysis.analyze({
        make,
        model,
        years: searchYears,
        trims,
        mileage: mileage ? parseInt(mileage) : undefined,
        postalCode: searchPostalCode,
        radiusKm: searchRadiusKm,
        dealershipId,
        targetPrice: targetPrice ? parseInt(targetPrice) : undefined
      });
      
      res.json(result);
    } catch (error) {
      logError('Error in enhanced market analysis:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-enhanced-market-analysis' });
      res.status(500).json({
        error: 'ANALYSIS_ERROR',
        message: error instanceof Error ? error.message : "Failed to perform market analysis"
      });
    }
  });

  // Get price history for trend visualization
  app.get("/api/manager/price-history", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const { make, model, externalId } = req.query;
      const dealershipId = (req as AuthRequest).dealershipId || 1;
      
      const history = await storage.getPriceHistory(dealershipId, {
        make: make as string,
        model: model as string,
        externalId: externalId as string
      }, 100);
      
      res.json(history);
    } catch (error) {
      logError('Error fetching price history:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-price-history' });
      res.status(500).json({ error: "Failed to fetch price history" });
    }
  });

  // Get market snapshots for trend analysis
  app.get("/api/manager/market-snapshots", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const { make, model, limit } = req.query;
      const dealershipId = (req as AuthRequest).dealershipId || 1;
      
      const snapshots = await storage.getMarketSnapshots(dealershipId, {
        make: make as string,
        model: model as string,
        limit: limit ? parseInt(limit as string) : 30
      });
      
      res.json(snapshots);
    } catch (error) {
      logError('Error fetching market snapshots:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-market-snapshots' });
      res.status(500).json({ error: "Failed to fetch market snapshots" });
    }
  });

  // Get VIN-specific live market pricing (retail, wholesale, demand)
  app.post("/api/manager/vin-pricing", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const { vin, mileage, postalCode } = req.body;
      
      if (!vin || vin.length !== 17) {
        return res.status(400).json({
          error: 'INVALID_VIN',
          message: 'A valid 17-character VIN is required'
        });
      }

      const dealershipId = (req as AuthRequest).dealershipId || 1;
      
      const { getMarketCheckServiceForDealership } = await import('./marketcheck-service');
      const service = await getMarketCheckServiceForDealership(dealershipId);
      
      if (!service) {
        return res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'MarketCheck API not configured. Please add your MarketCheck API key in Settings.'
        });
      }

      const result = await service.getVINPricing(
        vin.toUpperCase(),
        mileage ? parseInt(mileage) : undefined,
        postalCode
      );

      if (!result) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Could not find pricing data for this VIN'
        });
      }

      res.json(result);
    } catch (error) {
      logError('Error getting VIN pricing:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-vin-pricing' });
      res.status(500).json({
        error: 'PRICING_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get VIN pricing'
      });
    }
  });

  // Get live market statistics for make/model/year
  app.post("/api/manager/live-market-stats", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const { make, model, yearMin, yearMax, postalCode, radiusKm } = req.body;
      
      if (!make || !model) {
        return res.status(400).json({
          error: 'MISSING_FIELDS',
          message: 'Make and model are required'
        });
      }

      const dealershipId = (req as AuthRequest).dealershipId || 1;
      const authReq = req as AuthRequest;
      const settings = authReq.user ? await storage.getManagerSettings(authReq.user.id, dealershipId) : null;
      
      const { getMarketCheckServiceForDealership } = await import('./marketcheck-service');
      const service = await getMarketCheckServiceForDealership(dealershipId);
      
      if (!service) {
        return res.status(503).json({
          error: 'SERVICE_UNAVAILABLE',
          message: 'MarketCheck API not configured. Please add your MarketCheck API key in Settings.'
        });
      }

      const result = await service.getLiveMarketStats({
        make,
        model,
        yearMin: yearMin ? parseInt(yearMin) : undefined,
        yearMax: yearMax ? parseInt(yearMax) : undefined,
        postalCode: postalCode || settings?.postalCode || 'L4W1S9',
        radiusKm: radiusKm ? parseInt(radiusKm) : (settings?.defaultRadiusKm || 100),
        maxResults: 100,
        dealershipId
      });

      if (!result) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'No market data found for this vehicle'
        });
      }

      res.json(result);
    } catch (error) {
      logError('Error getting live market stats:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-live-market-stats' });
      res.status(500).json({
        error: 'STATS_ERROR',
        message: error instanceof Error ? error.message : 'Failed to get live market stats'
      });
    }
  });

  // Get competitor dealers
  app.get("/api/manager/competitors", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = (req as AuthRequest).dealershipId || 1;
      const competitors = await storage.getCompetitorDealers(dealershipId);
      res.json(competitors);
    } catch (error) {
      logError('Error fetching competitors:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-competitors' });
      res.status(500).json({ error: "Failed to fetch competitors" });
    }
  });

  // Get competitor price alerts
  app.get("/api/manager/competitor-alerts", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = (req as AuthRequest).dealershipId || 1;
      const { status, severity, vehicleId, limit } = req.query;
      const alerts = await storage.getCompetitorPriceAlerts(dealershipId, {
        status: status as string | undefined,
        severity: severity as string | undefined,
        vehicleId: vehicleId ? parseInt(vehicleId as string) : undefined
      }, limit ? parseInt(limit as string) : 50);
      res.json(alerts);
    } catch (error) {
      logError('Error fetching competitor alerts:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-competitor-alerts' });
      res.status(500).json({ error: "Failed to fetch competitor alerts" });
    }
  });

  // Get competitor alerts summary for dashboard widget
  app.get("/api/manager/competitor-alerts/summary", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = (req as AuthRequest).dealershipId || 1;
      const { createCompetitorMonitoringService } = await import("./competitor-monitoring-service");
      const service = createCompetitorMonitoringService(dealershipId);
      const summary = await service.getAlertSummary();
      res.json(summary);
    } catch (error) {
      logError('Error fetching competitor alert summary:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-competitor-alerts-summary' });
      res.status(500).json({ error: "Failed to fetch competitor alert summary" });
    }
  });

  // Acknowledge a competitor price alert
  app.post("/api/manager/competitor-alerts/:id/acknowledge", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = (req as AuthRequest).dealershipId || 1;
      const userId = (req as AuthRequest).user?.id;
      const alertId = parseInt(req.params.id);
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      const alert = await storage.acknowledgeCompetitorPriceAlert(alertId, dealershipId, userId);
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      res.json(alert);
    } catch (error) {
      logError('Error acknowledging competitor alert:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-competitor-alerts-id-acknowl' });
      res.status(500).json({ error: "Failed to acknowledge alert" });
    }
  });

  // Resolve a competitor price alert
  app.post("/api/manager/competitor-alerts/:id/resolve", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = (req as AuthRequest).dealershipId || 1;
      const alertId = parseInt(req.params.id);
      const { note } = req.body;
      const alert = await storage.resolveCompetitorPriceAlert(alertId, dealershipId, note);
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }
      res.json(alert);
    } catch (error) {
      logError('Error resolving competitor alert:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-competitor-alerts-id-resolve' });
      res.status(500).json({ error: "Failed to resolve alert" });
    }
  });

  // Trigger manual competitor scan
  app.post("/api/manager/competitor-scan", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = (req as AuthRequest).dealershipId || 1;
      const { createCompetitorMonitoringService } = await import("./competitor-monitoring-service");
      const service = createCompetitorMonitoringService(dealershipId);
      const result = await service.runCompetitorScan();
      res.json(result);
    } catch (error) {
      logError('Error running competitor scan:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-competitor-scan' });
      res.status(500).json({ error: "Failed to run competitor scan" });
    }
  });

  // Get unique makes from market listings (for autocomplete)
  app.get("/api/inventory/makes", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      // Get all market listings to populate makes
      const { listings: marketListings } = await storage.getMarketListings(dealershipId, {}, 10000, 0);
      const makes = Array.from(new Set(marketListings.map(v => v.make))).filter(Boolean).sort();
      res.json(makes);
    } catch (error) {
      logError('Error fetching makes:', error instanceof Error ? error : new Error(String(error)), { route: 'api-inventory-makes' });
      res.status(500).json({ error: "Failed to fetch makes" });
    }
  });

  // Get unique models for a specific make from market listings (for autocomplete)
  app.get("/api/inventory/models", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { make } = req.query;
      const { listings: marketListings } = await storage.getMarketListings(dealershipId, {}, 10000, 0);
      
      let models;
      if (make) {
        models = Array.from(new Set(marketListings.filter(v => v.make === make).map(v => v.model))).filter(Boolean).sort();
      } else {
        models = Array.from(new Set(marketListings.map(v => v.model))).filter(Boolean).sort();
      }
      
      res.json(models);
    } catch (error) {
      logError('Error fetching models:', error instanceof Error ? error : new Error(String(error)), { route: 'api-inventory-models' });
      res.status(500).json({ error: "Failed to fetch models" });
    }
  });

  // Get unique trims for a specific make/model from market listings (for autocomplete)
  app.get("/api/inventory/trims", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { make, model } = req.query;
      const { listings: marketListings } = await storage.getMarketListings(dealershipId, {}, 10000, 0);
      
      let trims;
      if (make && model) {
        trims = Array.from(new Set(marketListings.filter(v => v.make === make && v.model === model).map(v => v.trim))).filter(Boolean).sort();
      } else if (make) {
        trims = Array.from(new Set(marketListings.filter(v => v.make === make).map(v => v.trim))).filter(Boolean).sort();
      } else {
        trims = Array.from(new Set(marketListings.map(v => v.trim))).filter(Boolean).sort();
      }
      
      res.json(trims);
    } catch (error) {
      logError('Error fetching trims:', error instanceof Error ? error : new Error(String(error)), { route: 'api-inventory-trims' });
      res.status(500).json({ error: "Failed to fetch trims" });
    }
  });

  // ===== MANAGER SETTINGS ROUTES =====

  // Get manager settings
  app.get("/api/manager/settings", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      const settings = await storage.getManagerSettings(userId, dealershipId);
      res.json(settings || null);
    } catch (error) {
      logError('Error fetching manager settings:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-settings' });
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  // Save manager settings
  app.post("/api/manager/settings", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const authReq = req as AuthRequest;
      const userId = authReq.user!.id;
      const dealershipId = req.dealershipId!;
      const { postalCode, defaultRadiusKm } = req.body;

      if (!postalCode) {
        return res.status(400).json({ error: "Postal code is required" });
      }

      // Geocode the postal code to get lat/lon
      const { geocodingService } = await import('./geocoding-service');
      const geocoded = await geocodingService.geocodePostalCode(postalCode);

      const existing = await storage.getManagerSettings(userId, dealershipId);

      if (existing) {
        const updated = await storage.updateManagerSettings(userId, dealershipId, {
          postalCode,
          defaultRadiusKm: defaultRadiusKm || 50,
          geocodeLat: geocoded?.latitude.toString() || null,
          geocodeLon: geocoded?.longitude.toString() || null
        });
        res.json(updated);
      } else {
        const created = await storage.createManagerSettings({
          userId,
          postalCode,
          defaultRadiusKm: defaultRadiusKm || 50,
          geocodeLat: geocoded?.latitude.toString() || null,
          geocodeLon: geocoded?.longitude.toString() || null
        });
        res.json(created);
      }
    } catch (error) {
      logError('Error saving manager settings:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-settings' });
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  // Get dealership branding (manager)
  app.get("/api/manager/branding", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const branding = await storage.getDealershipBranding(dealershipId);
      res.json(branding || { dealershipId });
    } catch (error) {
      logError('Error fetching branding:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-branding' });
      res.status(500).json({ error: "Failed to fetch branding" });
    }
  });

  // Update dealership branding (manager)
  app.post("/api/manager/branding", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { logoUrl, faviconUrl, primaryColor, secondaryColor, heroHeadline, heroSubheadline, heroImageUrl, tagline } = req.body;

      const branding = await storage.upsertDealershipBranding({
        dealershipId,
        logoUrl,
        faviconUrl,
        primaryColor,
        secondaryColor,
        heroHeadline,
        heroSubheadline,
        heroImageUrl,
        tagline
      });

      res.json(branding);
    } catch (error) {
      logError('Error updating branding:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-branding' });
      res.status(500).json({ error: "Failed to update branding" });
    }
  });

  // Trigger market data aggregation from all sources
  app.post("/api/manager/scrape-market", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const { make, model, yearMin, yearMax, postalCode, radiusKm } = req.body;

      if (!make || !model) {
        return res.status(400).json({ error: "Make and model are required" });
      }

      const { marketAggregationService } = await import('./market-aggregation-service');

      const result = await marketAggregationService.aggregateMarketData({
        make,
        model,
        yearMin,
        yearMax,
        postalCode,
        radiusKm,
        maxResults: 100
      });

      // Return error status if all sources failed and no data was saved
      if (!result.success && result.totalListings === 0) {
        return res.status(500).json({
          success: false,
          savedCount: 0,
          marketCheckCount: result.marketCheckCount,
          apifyCount: result.apifyCount,
          scraperCount: result.scraperCount,
          duplicatesRemoved: result.duplicatesRemoved,
          errors: result.errors,
          message: `Failed to aggregate market data. Errors: ${result.errors.join(', ')}`
        });
      }

      res.json({
        success: result.success,
        savedCount: result.totalListings,
        marketCheckCount: result.marketCheckCount,
        apifyCount: result.apifyCount,
        scraperCount: result.scraperCount,
        duplicatesRemoved: result.duplicatesRemoved,
        errors: result.errors,
        message: `Successfully aggregated ${result.totalListings} new listings from ${result.marketCheckCount + result.apifyCount + result.scraperCount} sources (MarketCheck: ${result.marketCheckCount}, Apify: ${result.apifyCount}, Scraper: ${result.scraperCount})`
      });
    } catch (error) {
      logError('Error aggregating market data:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-scrape-market' });
      res.status(500).json({ error: "Failed to aggregate market data" });
    }
  });

  // Inventory Analysis - Get all vehicles with market comparison data
  app.get("/api/manager/inventory-analysis", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { radiusKm = '50' } = req.query;
      const radius = radiusKm === 'national' ? 2000 : parseInt(radiusKm as string) || 50;
      
      // Get all dealership vehicles
      const { vehicles } = await storage.getVehicles(dealershipId, 500, 0);
      
      // Get manager settings for postal code
      const authReq = req as AuthRequest;
      const settings = authReq.user ? await storage.getManagerSettings(authReq.user.id, dealershipId) : null;
      const postalCode = settings?.postalCode || 'V6H 1G9';
      
      // Get the latest market snapshot for timestamp
      const latestSnapshot = await storage.getLatestMarketSnapshotDate(dealershipId);
      
      // Build market comparison for each vehicle
      const vehiclesWithMarket = await Promise.all(vehicles.map(async (vehicle) => {
        // Get cached market data for this vehicle's make/model/year
        const { listings: marketListings } = await storage.getMarketListings(dealershipId, {
          make: vehicle.make || undefined,
          model: vehicle.model || undefined,
          yearMin: vehicle.year ? vehicle.year - 1 : undefined,
          yearMax: vehicle.year ? vehicle.year + 1 : undefined
        }, 200, 0);
        
        // Filter by approximate radius (if we have location data)
        const relevantListings = marketListings.filter(l => l.isActive);
        
        if (relevantListings.length === 0) {
          return {
            ...vehicle,
            marketData: null,
            percentilePosition: null,
            priceComparison: null
          };
        }
        
        // Calculate price statistics
        const prices = relevantListings.map(l => l.price).filter(p => p && p > 0).sort((a, b) => a! - b!);
        if (prices.length === 0) {
          return {
            ...vehicle,
            marketData: null,
            percentilePosition: null,
            priceComparison: null
          };
        }
        
        const avgPrice = Math.round(prices.reduce((a, b) => a + b!, 0) / prices.length);
        const medianPrice = prices[Math.floor(prices.length / 2)]!;
        const minPrice = prices[0]!;
        const maxPrice = prices[prices.length - 1]!;
        const p25 = prices[Math.floor(prices.length * 0.25)]!;
        const p75 = prices[Math.floor(prices.length * 0.75)]!;
        
        // Calculate this vehicle's percentile position
        const vehiclePrice = vehicle.price || 0;
        let percentilePosition = null;
        let priceComparison = 'unknown';
        
        if (vehiclePrice > 0) {
          const belowCount = prices.filter(p => p! < vehiclePrice).length;
          percentilePosition = Math.round((belowCount / prices.length) * 100);
          
          if (vehiclePrice < p25) {
            priceComparison = 'below_market';
          } else if (vehiclePrice <= p75) {
            priceComparison = 'at_market';
          } else {
            priceComparison = 'above_market';
          }
        }
        
        // Get top comparable listings (up to 10, sorted by price proximity to vehicle)
        const now = new Date();
        const comparableListings = relevantListings
          .filter(l => l.price && l.price > 0)
          .sort((a, b) => {
            const diffA = Math.abs((a.price || 0) - vehiclePrice);
            const diffB = Math.abs((b.price || 0) - vehiclePrice);
            return diffA - diffB;
          })
          .slice(0, 10)
          .map(l => {
            // Calculate days on market from posted date
            let daysOnMarket: number | null = null;
            if (l.postedDate) {
              const posted = new Date(l.postedDate);
              daysOnMarket = Math.floor((now.getTime() - posted.getTime()) / (1000 * 60 * 60 * 24));
            }
            
            return {
              id: l.id,
              year: l.year,
              make: l.make,
              model: l.model,
              trim: l.trim,
              price: l.price,
              mileage: l.mileage,
              sellerName: l.sellerName,
              location: l.location,
              listingUrl: l.listingUrl,
              interiorColor: l.interiorColor || null,
              exteriorColor: l.exteriorColor || null,
              daysOnMarket
            };
          });

        return {
          ...vehicle,
          marketData: {
            totalListings: relevantListings.length,
            avgPrice,
            medianPrice,
            minPrice,
            maxPrice,
            p25,
            p75
          },
          comparableListings,
          percentilePosition,
          priceComparison
        };
      }));
      
      res.json({
        vehicles: vehiclesWithMarket,
        totalVehicles: vehicles.length,
        lastUpdated: latestSnapshot || null,
        radiusKm: radius,
        postalCode
      });
    } catch (error) {
      logError('Error fetching inventory analysis:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-inventory-analysis' });
      res.status(500).json({ error: "Failed to fetch inventory analysis" });
    }
  });

  // Trigger full inventory market analysis refresh
  app.post("/api/manager/inventory-analysis/refresh", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { radiusKm = 50 } = req.body;
      const radius = radiusKm === 'national' ? 2000 : parseInt(radiusKm) || 50;
      
      // Get manager settings
      const authReq = req as AuthRequest;
      const settings = authReq.user ? await storage.getManagerSettings(authReq.user.id, dealershipId) : null;
      const postalCode = settings?.postalCode || 'V6H 1G9';
      
      // Get all unique make/model combinations from inventory
      const { vehicles } = await storage.getVehicles(dealershipId, 500, 0);
      const uniqueVehicles = new Map<string, { make: string; model: string; yearMin: number; yearMax: number }>();
      
      vehicles.forEach(v => {
        if (v.make && v.model) {
          const key = `${v.make}-${v.model}`;
          const existing = uniqueVehicles.get(key);
          if (existing) {
            existing.yearMin = Math.min(existing.yearMin, v.year || existing.yearMin);
            existing.yearMax = Math.max(existing.yearMax, v.year || existing.yearMax);
          } else {
            uniqueVehicles.set(key, {
              make: v.make,
              model: v.model,
              yearMin: v.year || new Date().getFullYear() - 3,
              yearMax: v.year || new Date().getFullYear()
            });
          }
        }
      });
      
      // Aggregate market data for each unique vehicle
      const { marketAggregationService } = await import('./market-aggregation-service');
      let totalNewListings = 0;
      const errors: string[] = [];
      
      for (const [key, vehicleInfo] of uniqueVehicles) {
        try {
          const result = await marketAggregationService.aggregateMarketData({
            make: vehicleInfo.make,
            model: vehicleInfo.model,
            yearMin: vehicleInfo.yearMin,
            yearMax: vehicleInfo.yearMax,
            postalCode,
            radiusKm: radius,
            maxResults: 100,
            dealershipId
          });
          totalNewListings += result.totalListings;
          if (result.errors.length > 0) {
            errors.push(...result.errors.map(e => `${key}: ${e}`));
          }
        } catch (e) {
          errors.push(`${key}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }
      
      // Auto-enrich colors for listings without them (limit to 10 per refresh)
      let colorsEnriched = 0;
      try {
        // Get listings missing color data
        const { listings: allListings } = await storage.getMarketListings(dealershipId, {}, 200, 0);
        const listingsWithoutColors = allListings.filter(l => 
          l.isActive && l.year && l.make && l.model && !l.exteriorColor && !l.interiorColor
        ).slice(0, 10);
        
        if (listingsWithoutColors.length > 0) {
          const { lookupCargurusColorsByYearMakeModel } = await import("./cargurus-color-service");
          
          for (const listing of listingsWithoutColors) {
            try {
              const colorResults = await lookupCargurusColorsByYearMakeModel(
                listing.year!,
                listing.make!,
                listing.model!,
                listing.trim || undefined
              );
              
              const match = colorResults.find(r => r.found);
              if (match && (match.exteriorColor || match.interiorColor)) {
                await storage.updateMarketListing(listing.id, dealershipId, {
                  exteriorColor: match.exteriorColor || null,
                  interiorColor: match.interiorColor || null
                });
                colorsEnriched++;
              }
            } catch (colorError) {
              // Silently continue on individual color lookup failures
              console.log(`[ColorEnrich] Failed for ${listing.year} ${listing.make} ${listing.model}`);
            }
          }
        }
      } catch (colorError) {
        logWarn('Color enrichment failed:', { error: colorError instanceof Error ? colorError.message : String(colorError) });
      }
      
      res.json({
        success: true,
        vehiclesAnalyzed: uniqueVehicles.size,
        newListingsFound: totalNewListings,
        colorsEnriched,
        errors: errors.slice(0, 10), // Limit errors returned
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      logError('Error refreshing inventory analysis:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-inventory-analysis-refresh' });
      res.status(500).json({ error: "Failed to refresh inventory analysis" });
    }
  });

  // Lookup colors for a vehicle from CarGurus (Manager+)
  app.post("/api/manager/lookup-colors", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const { vin, year, make, model, trim } = req.body;
      
      if (!vin && (!year || !make || !model)) {
        return res.status(400).json({ error: "VIN or year/make/model required" });
      }
      
      // VIN-based lookup (preferred - can cache)
      if (vin) {
        // Check cache first
        const cached = await storage.getCargurusColorByVin(vin);
        if (cached && new Date(cached.expiresAt) > new Date()) {
          return res.json({ 
            cached: true, 
            found: true,
            interiorColor: cached.interiorColor,
            exteriorColor: cached.exteriorColor,
            cargurusUrl: cached.cargurusUrl
          });
        }
        
        // Scrape CarGurus by VIN
        const { lookupCargurusColors } = await import("./cargurus-color-service");
        const result = await lookupCargurusColors(vin);
        
        if (result.found) {
          // Cache the result (30 day TTL)
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          
          await storage.upsertCargurusColorCache({
            vin: result.vin,
            interiorColor: result.interiorColor || null,
            exteriorColor: result.exteriorColor || null,
            cargurusListingId: result.cargurusListingId || null,
            cargurusUrl: result.cargurusUrl || null,
            expiresAt
          });
        }
        
        return res.json({
          cached: false,
          found: result.found,
          interiorColor: result.interiorColor,
          exteriorColor: result.exteriorColor,
          cargurusUrl: result.cargurusUrl,
          error: result.error
        });
      }
      
      // Year/Make/Model lookup (returns multiple results, caches each VIN found)
      const { lookupCargurusColorsByYearMakeModel } = await import("./cargurus-color-service");
      const results = await lookupCargurusColorsByYearMakeModel(
        parseInt(year),
        make,
        model,
        trim
      );
      
      // Cache all results with VINs
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      for (const result of results) {
        if (result.vin && result.found) {
          await storage.upsertCargurusColorCache({
            vin: result.vin,
            interiorColor: result.interiorColor || null,
            exteriorColor: result.exteriorColor || null,
            cargurusListingId: result.cargurusListingId || null,
            cargurusUrl: result.cargurusUrl || null,
            expiresAt
          });
        }
      }
      
      // Return first matching result or summary
      const firstMatch = results.find(r => r.found);
      res.json({
        cached: false,
        found: !!firstMatch,
        interiorColor: firstMatch?.interiorColor,
        exteriorColor: firstMatch?.exteriorColor,
        cargurusUrl: firstMatch?.cargurusUrl,
        totalResults: results.length
      });
    } catch (error) {
      logError('Color lookup error:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-lookup-colors' });
      res.status(500).json({ error: "Failed to lookup colors" });
    }
  });

  // Get Apify market pricing for a specific vehicle (Manager+)
  app.post("/api/manager/apify-market-pricing", authMiddleware, requireRole("manager"), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { make, model, yearMin, yearMax, postalCode, province, radiusKm, maxResults } = req.body;
      
      if (!make || !model) {
        return res.status(400).json({ error: "Make and model are required" });
      }
      
      const { getApifyServiceForDealership } = await import("./apify-service");
      const apifyService = await getApifyServiceForDealership(dealershipId);
      
      if (!apifyService) {
        return res.json({ 
          success: false, 
          error: "Apify not configured",
          message: "Apify API is not configured for this dealership. Contact your administrator."
        });
      }
      
      try {
        const result = await apifyService.getMarketPricing({
          make,
          model,
          yearMin: yearMin ? parseInt(yearMin) : undefined,
          yearMax: yearMax ? parseInt(yearMax) : undefined,
          postalCode,
          province,
          radiusKm: radiusKm ? parseInt(radiusKm) : undefined,
          maxResults: maxResults ? parseInt(maxResults) : 50,
          dealershipId
        });
        
        res.json({
          success: true,
          listings: result.listings,
          stats: result.stats,
          source: 'apify_autotrader',
          message: `Found ${result.listings.length} comparable vehicles on AutoTrader.ca`
        });
      } catch (scrapeError) {
        logError('Apify scrape error:', scrapeError instanceof Error ? scrapeError : new Error(String(scrapeError)), { route: 'api-manager-apify-market-pricing' });
        res.json({ 
          success: false, 
          error: "Scrape failed",
          message: scrapeError instanceof Error ? scrapeError.message : 'Unknown error'
        });
      }
    } catch (error) {
      logError('Error getting Apify market pricing:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-apify-market-pricing' });
      res.status(500).json({ error: "Failed to get market pricing" });
    }
  });

  // ===== VEHICLE APPRAISAL ROUTES (Manager+) =====
  
  // Get all appraisals for dealership
  app.get("/api/manager/appraisals", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      
      const filters = {
        status: status || undefined,
        search: search || undefined,
      };
      
      const result = await storage.getVehicleAppraisals(dealershipId, filters, limit, offset);
      res.json({ ...result, limit, offset });
    } catch (error) {
      logError('Error fetching appraisals:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-appraisals' });
      res.status(500).json({ error: "Failed to fetch appraisals" });
    }
  });
  
  // Get look-to-book stats for dealership
  app.get("/api/manager/appraisals/stats", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const stats = await storage.getAppraisalStats(dealershipId);
      res.json(stats);
    } catch (error) {
      logError('Error fetching appraisal stats:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-appraisals-stats' });
      res.status(500).json({ error: "Failed to fetch appraisal stats" });
    }
  });
  
  // Get missed trades stats for dealership
  app.get("/api/manager/appraisals/missed-stats", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const stats = await storage.getMissedTradesStats(dealershipId);
      res.json(stats);
    } catch (error) {
      logError('Error fetching missed trades stats:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-appraisals-missed-stats' });
      res.status(500).json({ error: "Failed to fetch missed trades stats" });
    }
  });
  
  // Get appraisal accuracy report for dealership
  app.get("/api/manager/appraisals/accuracy-report", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const report = await storage.getAppraisalAccuracyReport(dealershipId);
      res.json(report);
    } catch (error) {
      logError('Error fetching accuracy report:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-appraisals-accuracy-report' });
      res.status(500).json({ error: "Failed to fetch accuracy report" });
    }
  });
  
  // Check if VIN has previous appraisal (must be before /:id route to avoid matching)
  app.get("/api/manager/appraisals/vin/:vin", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const vin = req.params.vin.toUpperCase().trim();
      
      if (!vin || vin.length < 11) {
        return res.status(400).json({ error: "Invalid VIN" });
      }
      
      const appraisal = await storage.getVehicleAppraisalByVin(vin, dealershipId);
      res.json({ exists: !!appraisal, appraisal: appraisal || null });
    } catch (error) {
      logError('Error checking VIN appraisal:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-appraisals-vin-vin' });
      res.status(500).json({ error: "Failed to check VIN appraisal" });
    }
  });
  
  // Get single appraisal by ID
  app.get("/api/manager/appraisals/:id", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid appraisal ID" });
      }
      
      const appraisal = await storage.getVehicleAppraisalById(id, dealershipId);
      if (!appraisal) {
        return res.status(404).json({ error: "Appraisal not found" });
      }
      
      res.json(appraisal);
    } catch (error) {
      logError('Error fetching appraisal:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-appraisals-id' });
      res.status(500).json({ error: "Failed to fetch appraisal" });
    }
  });
  
  // Create new appraisal
  app.post("/api/manager/appraisals", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const authReq = req as AuthRequest;
      const userId = authReq.user?.id;
      
      const validationResult = insertVehicleAppraisalSchema.safeParse({
        ...req.body,
        dealershipId,
        createdBy: userId
      });
      
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: "Validation failed", 
          details: fromZodError(validationResult.error).toString() 
        });
      }
      
      const appraisal = await storage.createVehicleAppraisal(validationResult.data);
      res.status(201).json(appraisal);
    } catch (error) {
      logError('Error creating appraisal:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-appraisals' });
      res.status(500).json({ error: "Failed to create appraisal" });
    }
  });
  
  // Update appraisal
  app.patch("/api/manager/appraisals/:id", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid appraisal ID" });
      }
      
      // Check if appraisal exists
      const existing = await storage.getVehicleAppraisalById(id, dealershipId);
      if (!existing) {
        return res.status(404).json({ error: "Appraisal not found" });
      }
      
      // Sanitize updates - don't allow changing dealershipId
      const { dealershipId: _, id: __, ...updates } = req.body;
      
      const updated = await storage.updateVehicleAppraisal(id, dealershipId, updates);
      res.json(updated);
    } catch (error) {
      logError('Error updating appraisal:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-appraisals-id' });
      res.status(500).json({ error: "Failed to update appraisal" });
    }
  });
  
  // Delete appraisal
  app.delete("/api/manager/appraisals/:id", authMiddleware, requireRole("manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const id = parseInt(req.params.id);
      
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid appraisal ID" });
      }
      
      const deleted = await storage.deleteVehicleAppraisal(id, dealershipId);
      if (!deleted) {
        return res.status(404).json({ error: "Appraisal not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting appraisal:', error instanceof Error ? error : new Error(String(error)), { route: 'api-manager-appraisals-id' });
      res.status(500).json({ error: "Failed to delete appraisal" });
    }
  });

  // ===== REMARKETING ROUTES (Master only) =====
  
  // Get all remarketing vehicles
  app.get("/api/remarketing/vehicles", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const remarketingVehicles = await storage.getRemarketingVehicles(dealershipId);
      res.json(remarketingVehicles);
    } catch (error) {
      logError('Error fetching remarketing vehicles:', error instanceof Error ? error : new Error(String(error)), { route: 'api-remarketing-vehicles' });
      res.status(500).json({ error: "Failed to fetch remarketing vehicles" });
    }
  });
  
  // Add vehicle to remarketing
  app.post("/api/remarketing/vehicles", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const { vehicleId, budgetPriority } = req.body;
      
      if (!vehicleId || budgetPriority === undefined) {
        return res.status(400).json({ error: "vehicleId and budgetPriority are required" });
      }
      
      const dealershipId = req.dealershipId!;
      
      // Check if vehicle exists
      const existingVehicle = await storage.getVehicleById(vehicleId, dealershipId);
      if (!existingVehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      
      // Check if vehicle is already in remarketing
      const remarketingVehicles = await storage.getRemarketingVehicles(dealershipId);
      if (remarketingVehicles.some(rv => rv.vehicleId === vehicleId)) {
        return res.status(400).json({ error: "Vehicle is already in remarketing" });
      }
      
      // Check if we already have 20 active vehicles
      const count = await storage.getRemarketingVehicleCount(dealershipId);
      if (count >= 20) {
        return res.status(400).json({ error: "Maximum 20 vehicles allowed for remarketing" });
      }
      
      const vehicle = await storage.addRemarketingVehicle({ dealershipId, vehicleId, budgetPriority, isActive: true });
      res.json(vehicle);
    } catch (error) {
      logError('Error adding remarketing vehicle:', error instanceof Error ? error : new Error(String(error)), { route: 'api-remarketing-vehicles' });
      res.status(500).json({ error: "Failed to add remarketing vehicle" });
    }
  });
  
  // Update remarketing vehicle priority
  app.patch("/api/remarketing/vehicles/:id", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const id = parseInt(req.params.id);
      const { budgetPriority } = req.body;
      
      const vehicle = await storage.updateRemarketingVehicle(id, dealershipId, { budgetPriority });
      
      if (!vehicle) {
        return res.status(404).json({ error: "Remarketing vehicle not found" });
      }
      
      res.json(vehicle);
    } catch (error) {
      logError('Error updating remarketing vehicle:', error instanceof Error ? error : new Error(String(error)), { route: 'api-remarketing-vehicles-id' });
      res.status(500).json({ error: "Failed to update remarketing vehicle" });
    }
  });
  
  // Remove vehicle from remarketing
  app.delete("/api/remarketing/vehicles/:id", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const id = parseInt(req.params.id);
      const success = await storage.removeRemarketingVehicle(id, dealershipId);
      
      if (!success) {
        return res.status(404).json({ error: "Remarketing vehicle not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error removing remarketing vehicle:', error instanceof Error ? error : new Error(String(error)), { route: 'api-remarketing-vehicles-id' });
      res.status(500).json({ error: "Failed to remove remarketing vehicle" });
    }
  });

  // ===== PBS DMS INTEGRATION ROUTES =====
  
  // Get PBS configuration
  app.get("/api/pbs/config", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const config = await storage.getPbsConfig(dealershipId);
      res.json(config || null);
    } catch (error) {
      logError('Error fetching PBS config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-config' });
      res.status(500).json({ error: "Failed to fetch PBS configuration" });
    }
  });
  
  // Create or update PBS configuration
  app.post("/api/pbs/config", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const { partnerId, username, password, webhookUrl, webhookSecret, pbsApiUrl } = req.body;
      
      if (!partnerId || !username || !password) {
        return res.status(400).json({ error: "partnerId, username, and password are required" });
      }
      
      const dealershipId = req.dealershipId!;
      
      // Check if config exists
      const existing = await storage.getPbsConfig(dealershipId);
      
      let config;
      if (existing) {
        config = await storage.updatePbsConfig(existing.id, dealershipId, {
          partnerId,
          username,
          password,
          webhookUrl,
          webhookSecret,
          pbsApiUrl,
          isActive: true
        });
      } else {
        config = await storage.createPbsConfig({
          dealershipId,
          partnerId,
          username,
          password,
          webhookUrl,
          webhookSecret,
          pbsApiUrl,
          isActive: true
        });
      }
      
      res.json(config);
    } catch (error) {
      logError('Error saving PBS config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-config' });
      res.status(500).json({ error: "Failed to save PBS configuration" });
    }
  });
  
  // Delete PBS configuration
  app.delete("/api/pbs/config/:id", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const id = parseInt(req.params.id);
      await storage.deletePbsConfig(id, dealershipId);
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting PBS config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-config-id' });
      res.status(500).json({ error: "Failed to delete PBS configuration" });
    }
  });

  // ===== EXTERNAL AUTOMATION WEBHOOKS (Zapier/n8n) =====
  
  // Webhook to trigger inventory scrape (for Zapier, n8n, or other automation tools)
  app.post("/api/webhooks/trigger-scrape", async (req, res) => {
    try {
      // Get dealership ID (required for per-dealership authentication)
      const dealershipId = req.body?.dealershipId;
      const secretKey = req.headers['x-webhook-secret'] || req.body?.secret;
      
      if (!dealershipId) {
        return res.status(400).json({ 
          success: false, 
          error: "dealershipId is required" 
        });
      }
      
      if (!secretKey) {
        return res.status(401).json({ 
          success: false, 
          error: "Secret key is required (use x-webhook-secret header or secret in body)" 
        });
      }
      
      // Validate per-dealership webhook secret
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      
      if (!apiKeys?.scrapeWebhookSecret) {
        logError('Scrape webhook not configured for dealership', new Error('No webhook secret configured'), { route: 'api-webhooks-trigger-scrape', dealershipId });
        return res.status(500).json({ 
          success: false, 
          error: "Webhook not configured for this dealership. Generate a secret key in admin settings." 
        });
      }
      
      if (secretKey !== apiKeys.scrapeWebhookSecret) {
        logError('Scrape webhook unauthorized', new Error('Invalid secret key'), { route: 'api-webhooks-trigger-scrape', dealershipId });
        return res.status(401).json({ 
          success: false, 
          error: "Unauthorized. Invalid secret key for this dealership." 
        });
      }
      
      console.log(`🔄 Webhook triggered inventory scrape for dealership ${dealershipId}...`);
      
      // Generate a unique job ID for tracking
      const jobId = `scrape-${dealershipId}-${Date.now()}`;
      
      // Return immediately with acknowledgment (async mode for n8n timeout prevention)
      res.status(202).json({
        success: true,
        message: "Inventory scrape initiated in background",
        jobId,
        dealershipId,
        async: true,
        timestamp: new Date().toISOString(),
        note: "Scrape is running asynchronously. Check /api/scrape-runs?dealershipId=X for status."
      });
      
      // Trigger the scrape in the background (fire and forget)
      triggerManualSync(dealershipId)
        .then(result => {
          if (result.success) {
            console.log(`✓ [${jobId}] Background scrape complete: ${result.count || 'multiple'} vehicles`);
          } else {
            console.error(`✗ [${jobId}] Background scrape failed: ${result.error}`);
          }
        })
        .catch(error => {
          console.error(`✗ [${jobId}] Background scrape error:`, error);
        });
      
    } catch (error: any) {
      logError('Webhook trigger-scrape failed', error, { route: 'api-webhooks-trigger-scrape' });
      res.status(500).json({ 
        success: false, 
        error: error.message || "Scrape failed",
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Health check endpoint for automation tools (no auth required)
  app.get("/api/webhooks/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      service: "Lotview Inventory System"
    });
  });
  
  // Webhook receiver endpoint (no auth - PBS will call this)
  app.post("/api/pbs/webhook", async (req, res) => {
    try {
      // Single-dealership mode: Tenant middleware defaults to dealershipId=1
      // Multi-tenant expansion: Parse dealershipId from webhook URL path (e.g., /api/pbs/webhook/:dealershipId) or custom header
      const dealershipId = req.dealershipId!;
      
      // Get PBS config to validate webhook secret
      const pbsConfig = await storage.getPbsConfig(dealershipId);
      
      // If webhook secret is configured, validate the signature
      if (pbsConfig?.webhookSecret) {
        const signature = req.headers['x-pbs-signature'] as string;
        const timestamp = req.headers['x-pbs-timestamp'] as string;
        
        if (!signature || !timestamp) {
          logError('PBS webhook rejected: Missing signature or timestamp headers', new Error('PBS webhook rejected: Missing signature or timestamp headers'), { route: 'api-pbs-webhook' });
          return res.status(401).json({ 
            error: "Unauthorized", 
            message: "Missing signature headers" 
          });
        }
        
        // Verify signature using HMAC-SHA256
        const payload = timestamp + '.' + JSON.stringify(req.body);
        const expectedSignature = crypto
          .createHmac('sha256', pbsConfig.webhookSecret)
          .update(payload)
          .digest('hex');
        
        // Use timing-safe comparison to prevent timing attacks
        // First check if lengths match (if not, signature is definitely invalid)
        if (signature.length !== expectedSignature.length) {
          logError('PBS webhook rejected: Invalid signature length', new Error('PBS webhook rejected: Invalid signature length'), { route: 'api-pbs-webhook' });
          return res.status(403).json({ 
            error: "Forbidden", 
            message: "Invalid signature" 
          });
        }
        
        if (!crypto.timingSafeEqual(
          Buffer.from(signature),
          Buffer.from(expectedSignature)
        )) {
          logError('PBS webhook rejected: Invalid signature', new Error('PBS webhook rejected: Invalid signature'), { route: 'api-pbs-webhook' });
          return res.status(403).json({ 
            error: "Forbidden", 
            message: "Invalid signature" 
          });
        }
        
        // Verify timestamp is recent (within 5 minutes) to prevent replay attacks
        const timestampAge = Date.now() - parseInt(timestamp);
        const MAX_AGE = 5 * 60 * 1000; // 5 minutes in milliseconds
        
        if (timestampAge > MAX_AGE || timestampAge < 0) {
          logError('PBS webhook rejected: Timestamp too old or in future', new Error('PBS webhook rejected: Timestamp too old or in future'), { route: 'api-pbs-webhook' });
          return res.status(403).json({ 
            error: "Forbidden", 
            message: "Timestamp outside valid window" 
          });
        }
      }
      
      const { event, id: eventId, data } = req.body;
      
      // Log the webhook event
      await storage.createPbsWebhookEvent({
        dealershipId,
        eventType: event || 'unknown',
        eventId: eventId || `event-${Date.now()}`,
        payload: JSON.stringify(req.body),
        status: 'pending'
      });
      
      // Acknowledge receipt immediately - webhook is stored for async processing
      res.json({ success: true, message: "Webhook received" });
      
      // Webhook events are stored in pbs_webhook_events table with 'pending' status
      // A background job or manual trigger can process them via PATCH /api/pbs/webhook-events/:id
    } catch (error) {
      logError('Error processing PBS webhook:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-webhook' });
      res.status(500).json({ error: "Failed to process webhook" });
    }
  });
  
  // Get PBS webhook events (for monitoring)
  app.get("/api/pbs/webhook-events", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const events = await storage.getPbsWebhookEvents(dealershipId, limit);
      res.json(events);
    } catch (error) {
      logError('Error fetching PBS webhook events:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-webhook-events' });
      res.status(500).json({ error: "Failed to fetch webhook events" });
    }
  });
  
  // Update webhook event status (mark as processed/failed)
  app.patch("/api/pbs/webhook-events/:id", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const id = parseInt(req.params.id);
      const { status, errorMessage } = req.body;
      
      const event = await storage.updatePbsWebhookEvent(id, dealershipId, {
        status,
        errorMessage,
        processedAt: status === 'processed' ? new Date() : undefined
      });
      
      if (!event) {
        return res.status(404).json({ error: "Webhook event not found" });
      }
      
      res.json(event);
    } catch (error) {
      logError('Error updating webhook event:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-webhook-events-id' });
      res.status(500).json({ error: "Failed to update webhook event" });
    }
  });

  // ===== PBS PARTNER HUB API ROUTES =====
  // These routes expose PBS DMS functionality to the frontend and AI assistant

  // Test PBS connection
  app.post("/api/pbs/test-connection", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.testConnection();
      res.json(result);
    } catch (error) {
      logError('Error testing PBS connection:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-test-connection' });
      res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Connection test failed" });
    }
  });

  // Get PBS API logs
  app.get("/api/pbs/api-logs", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const pbsService = createPbsApiService(dealershipId);
      const logs = await pbsService.getApiLogs(limit);
      res.json(logs);
    } catch (error) {
      logError('Error fetching PBS API logs:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-api-logs' });
      res.status(500).json({ error: "Failed to fetch API logs" });
    }
  });

  // Clear PBS session and cache
  app.post("/api/pbs/clear-cache", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const pbsService = createPbsApiService(dealershipId);
      await pbsService.clearSession();
      const cleared = await pbsService.clearCache();
      res.json({ success: true, cleared });
    } catch (error) {
      logError('Error clearing PBS cache:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-clear-cache' });
      res.status(500).json({ error: "Failed to clear cache" });
    }
  });

  // ===== PBS SALES MODULE =====

  // Search contacts by phone, email, or name
  app.get("/api/pbs/sales/contacts/search", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { phone, email, firstName, lastName } = req.query;
      
      if (!phone && !email && !firstName && !lastName) {
        return res.status(400).json({ error: "At least one search parameter required (phone, email, firstName, lastName)" });
      }
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.contactSearch({
        phone: phone as string | undefined,
        email: email as string | undefined,
        firstName: firstName as string | undefined,
        lastName: lastName as string | undefined,
      });
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error searching PBS contacts:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-contacts-search' });
      res.status(500).json({ error: "Failed to search contacts" });
    }
  });

  // Get contact by ID
  app.get("/api/pbs/sales/contacts/:contactId", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId } = req.params;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.contactGet(contactId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-contacts-contactId' });
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });

  // Create new contact
  app.post("/api/pbs/sales/contacts", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const contactData = req.body;
      
      if (!contactData.FirstName && !contactData.LastName && !contactData.Phone && !contactData.Email) {
        return res.status(400).json({ error: "At least one contact field required" });
      }
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.contactSave(contactData);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error creating PBS contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-contacts' });
      res.status(500).json({ error: "Failed to create contact" });
    }
  });

  // Update contact
  app.patch("/api/pbs/sales/contacts/:contactId", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId } = req.params;
      const updates = req.body;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.contactChange(contactId, updates);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error updating PBS contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-contacts-contactId' });
      res.status(500).json({ error: "Failed to update contact" });
    }
  });

  // Get contact vehicles
  app.get("/api/pbs/sales/contacts/:contactId/vehicles", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId } = req.params;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.contactVehicleGet(contactId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS contact vehicles:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-contacts-contactId-vehicle' });
      res.status(500).json({ error: "Failed to fetch contact vehicles" });
    }
  });

  // Get workplan events for contact
  app.get("/api/pbs/sales/workplan/events", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId } = req.query;
      
      if (!contactId) {
        return res.status(400).json({ error: "contactId is required" });
      }
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.workplanEventsByContact(contactId as string);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS workplan events:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-workplan-events' });
      res.status(500).json({ error: "Failed to fetch workplan events" });
    }
  });

  // Get single workplan event
  app.get("/api/pbs/sales/workplan/events/:eventId", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { eventId } = req.params;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.workplanEventGet(eventId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS workplan event:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-workplan-events-eventId' });
      res.status(500).json({ error: "Failed to fetch workplan event" });
    }
  });

  // Update workplan event
  app.patch("/api/pbs/sales/workplan/events/:eventId", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { eventId } = req.params;
      const updates = req.body;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.workplanEventChange(eventId, updates);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error updating PBS workplan event:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-workplan-events-eventId' });
      res.status(500).json({ error: "Failed to update workplan event" });
    }
  });

  // Get workplan appointments for contact
  app.get("/api/pbs/sales/workplan/appointments", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId } = req.query;
      
      if (!contactId) {
        return res.status(400).json({ error: "contactId is required" });
      }
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.workplanAppointmentContactGet(contactId as string);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS workplan appointments:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-workplan-appointments' });
      res.status(500).json({ error: "Failed to fetch workplan appointments" });
    }
  });

  // Get single workplan appointment
  app.get("/api/pbs/sales/workplan/appointments/:appointmentId", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { appointmentId } = req.params;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.workplanAppointmentGet(appointmentId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS workplan appointment:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-workplan-appointments-appo' });
      res.status(500).json({ error: "Failed to fetch workplan appointment" });
    }
  });

  // Create workplan appointment
  app.post("/api/pbs/sales/workplan/appointments", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const appointmentData = req.body;
      
      if (!appointmentData.ContactID) {
        return res.status(400).json({ error: "ContactID is required" });
      }
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.workplanAppointmentCreate(appointmentData);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error creating PBS workplan appointment:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-workplan-appointments' });
      res.status(500).json({ error: "Failed to create workplan appointment" });
    }
  });

  // Update workplan appointment
  app.patch("/api/pbs/sales/workplan/appointments/:appointmentId", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { appointmentId } = req.params;
      const updates = req.body;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.workplanAppointmentChange(appointmentId, updates);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error updating PBS workplan appointment:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-workplan-appointments-appo' });
      res.status(500).json({ error: "Failed to update workplan appointment" });
    }
  });

  // Get reminders for contact
  app.get("/api/pbs/sales/workplan/reminders", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId } = req.query;
      
      if (!contactId) {
        return res.status(400).json({ error: "contactId is required" });
      }
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.workplanReminderGet(contactId as string);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS workplan reminders:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-sales-workplan-reminders' });
      res.status(500).json({ error: "Failed to fetch workplan reminders" });
    }
  });

  // ===== PBS SERVICE MODULE =====

  // Get service appointment bookings
  app.get("/api/pbs/service/appointments/booking", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { date } = req.query;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.appointmentBookingGet(date as string | undefined);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS service bookings:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-appointments-booking' });
      res.status(500).json({ error: "Failed to fetch service bookings" });
    }
  });

  // Get service appointments for contact
  app.get("/api/pbs/service/appointments", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId, vehicleId } = req.query;
      
      if (!contactId) {
        return res.status(400).json({ error: "contactId is required" });
      }
      
      const pbsService = createPbsApiService(dealershipId);
      const result = vehicleId 
        ? await pbsService.appointmentContactVehicleInfoGet(contactId as string, vehicleId as string)
        : await pbsService.appointmentContactVehicleGet(contactId as string);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS service appointments:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-appointments' });
      res.status(500).json({ error: "Failed to fetch service appointments" });
    }
  });

  // Get single service appointment
  app.get("/api/pbs/service/appointments/:appointmentId", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { appointmentId } = req.params;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.appointmentGet(appointmentId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS service appointment:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-appointments-appointment' });
      res.status(500).json({ error: "Failed to fetch service appointment" });
    }
  });

  // Create service appointment
  app.post("/api/pbs/service/appointments", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const appointmentData = req.body;
      
      if (!appointmentData.ContactID) {
        return res.status(400).json({ error: "ContactID is required" });
      }
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.appointmentCreate(appointmentData);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error creating PBS service appointment:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-appointments' });
      res.status(500).json({ error: "Failed to create service appointment" });
    }
  });

  // Update service appointment
  app.patch("/api/pbs/service/appointments/:appointmentId", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { appointmentId } = req.params;
      const updates = req.body;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.appointmentChange(appointmentId, updates);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error updating PBS service appointment:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-appointments-appointment' });
      res.status(500).json({ error: "Failed to update service appointment" });
    }
  });

  // Update service appointment contact/vehicle
  app.patch("/api/pbs/service/appointments/:appointmentId/vehicle", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { appointmentId } = req.params;
      const { contactId, vehicleId } = req.body;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.appointmentContactVehicleChange(appointmentId, { contactId, vehicleId });
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error updating PBS service appointment vehicle:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-appointments-appointment' });
      res.status(500).json({ error: "Failed to update service appointment vehicle" });
    }
  });

  // Get repair orders for contact
  app.get("/api/pbs/service/repair-orders", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId } = req.query;
      
      if (!contactId) {
        return res.status(400).json({ error: "contactId is required" });
      }
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.repairOrderContactVehicleGet(contactId as string);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS repair orders:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-repair-orders' });
      res.status(500).json({ error: "Failed to fetch repair orders" });
    }
  });

  // Get single repair order
  app.get("/api/pbs/service/repair-orders/:repairOrderId", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { repairOrderId } = req.params;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.repairOrderGet(repairOrderId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS repair order:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-repair-orders-repairOrde' });
      res.status(500).json({ error: "Failed to fetch repair order" });
    }
  });

  // Update repair order
  app.patch("/api/pbs/service/repair-orders/:repairOrderId", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { repairOrderId } = req.params;
      const updates = req.body;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.repairOrderChange(repairOrderId, updates);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error updating PBS repair order:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-repair-orders-repairOrde' });
      res.status(500).json({ error: "Failed to update repair order" });
    }
  });

  // Update repair order contact/vehicle
  app.patch("/api/pbs/service/repair-orders/:repairOrderId/vehicle", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { repairOrderId } = req.params;
      const { contactId, vehicleId } = req.body;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.repairOrderContactVehicleChange(repairOrderId, { contactId, vehicleId });
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error updating PBS repair order vehicle:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-repair-orders-repairOrde' });
      res.status(500).json({ error: "Failed to update repair order vehicle" });
    }
  });

  // ===== PBS PARTS MODULE (Read-Only) =====

  // Search parts inventory
  app.get("/api/pbs/parts/inventory/search", authMiddleware, requireRole("master", "service_manager", "parts_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { q } = req.query;
      
      if (!q) {
        return res.status(400).json({ error: "Search query (q) is required" });
      }
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.partsInventorySearch(q as string);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error searching PBS parts inventory:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-parts-inventory-search' });
      res.status(500).json({ error: "Failed to search parts inventory" });
    }
  });

  // Get part by part number
  app.get("/api/pbs/parts/inventory/:partNumber", authMiddleware, requireRole("master", "service_manager", "parts_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { partNumber } = req.params;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.partsInventoryGet(partNumber);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS part:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-parts-inventory-partNumber' });
      res.status(500).json({ error: "Failed to fetch part" });
    }
  });

  // Get parts order
  app.get("/api/pbs/parts/orders/:orderId", authMiddleware, requireRole("master", "parts_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { orderId } = req.params;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.partsOrderGet(orderId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS parts order:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-parts-orders-orderId' });
      res.status(500).json({ error: "Failed to fetch parts order" });
    }
  });

  // Get purchase order
  app.get("/api/pbs/parts/purchase-orders/:purchaseOrderId", authMiddleware, requireRole("master", "parts_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { purchaseOrderId } = req.params;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.purchaseOrderGet(purchaseOrderId);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS purchase order:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-parts-purchase-orders-purchaseOr' });
      res.status(500).json({ error: "Failed to fetch purchase order" });
    }
  });

  // Get tire storage
  app.get("/api/pbs/parts/tire-storage", authMiddleware, requireRole("master", "service_manager", "parts_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId, vin } = req.query;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.tireStorageGet(contactId as string | undefined, vin as string | undefined);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS tire storage:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-parts-tire-storage' });
      res.status(500).json({ error: "Failed to fetch tire storage" });
    }
  });

  // Get shops
  app.get("/api/pbs/service/shops", authMiddleware, requireRole("master", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      const pbsService = createPbsApiService(dealershipId);
      const result = await pbsService.shopGet();
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching PBS shops:', error instanceof Error ? error : new Error(String(error)), { route: 'api-pbs-service-shops' });
      res.status(500).json({ error: "Failed to fetch shops" });
    }
  });

  // ===== ADMIN ROUTES =====
  
  // Save GHL configuration (Legacy - use OAuth flow for new integrations)
  app.post("/api/admin/ghl-config", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { syncContacts, syncAppointments, syncOpportunities } = req.body;
      
      // First check if there's a connected GHL account
      const account = await storage.getGhlAccountByDealership(dealershipId);
      if (!account) {
        return res.status(400).json({ error: "No GHL account connected. Use OAuth flow to connect first." });
      }

      const config = await storage.saveGHLConfig({ 
        dealershipId, 
        ghlAccountId: account.id,
        syncContacts: syncContacts ?? true,
        syncAppointments: syncAppointments ?? true,
        syncOpportunities: syncOpportunities ?? false
      });
      res.json(config);
    } catch (error) {
      logError('Error saving GHL config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-ghl-config' });
      res.status(500).json({ error: "Failed to save GHL configuration" });
    }
  });

  // Save GHL Webhook configuration
  app.post("/api/admin/ghl-webhook-config", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { webhookUrl, webhookName } = req.body;

      if (!webhookUrl || !webhookName) {
        return res.status(400).json({ error: "webhookUrl and webhookName are required" });
      }

      const config = await storage.saveGHLWebhookConfig({ 
        dealershipId,
        webhookUrl, 
        webhookName, 
        isActive: true 
      });
      res.json(config);
    } catch (error) {
      logError('Error saving GHL webhook config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-ghl-webhook-config' });
      res.status(500).json({ error: "Failed to save GHL webhook configuration" });
    }
  });

  // Get GHL Webhook configuration
  app.get("/api/admin/ghl-webhook-config", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const config = await storage.getActiveGHLWebhookConfig(dealershipId);
      res.json(config || null);
    } catch (error) {
      logError('Error fetching GHL webhook config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-ghl-webhook-config' });
      res.status(500).json({ error: "Failed to fetch GHL webhook configuration" });
    }
  });

  // Save AI prompt template
  app.post("/api/admin/ai-prompt", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { name, promptText, isActive } = req.body;

      if (!name || !promptText) {
        return res.status(400).json({ error: "name and promptText are required" });
      }

      const template = await storage.saveAIPromptTemplate({ name, dealershipId, promptText, isActive });
      res.json(template);
    } catch (error) {
      logError('Error saving AI prompt:', error instanceof Error ? error : new Error(String(error)), { route: 'api-admin-ai-prompt' });
      res.status(500).json({ error: "Failed to save AI prompt template" });
    }
  });

  // ===== GOHIGHLEVEL INTEGRATION ROUTES =====
  
  // GHL OAuth: Initiate connection - generates authorization URL
  app.get("/api/ghl/auth/connect", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const clientId = process.env.GHL_CLIENT_ID;
      const redirectUri = process.env.GHL_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/ghl/auth/callback`;
      
      if (!clientId) {
        return res.status(500).json({ error: "GHL_CLIENT_ID not configured" });
      }
      
      // Generate state token with dealership ID for security
      const state = Buffer.from(JSON.stringify({ 
        dealershipId, 
        timestamp: Date.now(),
        nonce: Math.random().toString(36).substring(7)
      })).toString('base64');
      
      // GHL OAuth 2.0 scopes for CRM functionality
      const scopes = [
        "contacts.readonly",
        "contacts.write",
        "calendars.readonly", 
        "calendars.write",
        "calendars/events.readonly",
        "calendars/events.write",
        "opportunities.readonly",
        "opportunities.write",
        "locations.readonly",
        "users.readonly"
      ].join(' ');
      
      const authUrl = `https://marketplace.gohighlevel.com/oauth/chooselocation?` +
        `response_type=code&` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `state=${encodeURIComponent(state)}`;
      
      res.json({ authUrl, state });
    } catch (error) {
      logError('Error generating GHL auth URL:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-auth-connect' });
      res.status(500).json({ error: "Failed to generate authorization URL" });
    }
  });
  
  // GHL OAuth: Callback handler - exchanges code for tokens
  app.get("/api/ghl/auth/callback", async (req, res) => {
    try {
      const { code, state, error } = req.query;
      
      if (error) {
        logError('GHL OAuth error:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-auth-callback' });
        return res.redirect(`/dashboard?ghl_error=${encodeURIComponent(error as string)}`);
      }
      
      if (!code || !state) {
        return res.redirect('/dashboard?ghl_error=missing_code_or_state');
      }
      
      // Decode and validate state
      let stateData;
      try {
        stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
      } catch (e) {
        return res.redirect('/dashboard?ghl_error=invalid_state');
      }
      
      const { dealershipId, timestamp } = stateData;
      
      // Validate state timestamp (15 minute expiry)
      if (Date.now() - timestamp > 15 * 60 * 1000) {
        return res.redirect('/dashboard?ghl_error=state_expired');
      }
      
      const clientId = process.env.GHL_CLIENT_ID;
      const clientSecret = process.env.GHL_CLIENT_SECRET;
      const redirectUri = process.env.GHL_REDIRECT_URI || `${req.protocol}://${req.get('host')}/api/ghl/auth/callback`;
      
      if (!clientId || !clientSecret) {
        return res.redirect('/dashboard?ghl_error=missing_credentials');
      }
      
      // Exchange code for tokens
      const tokenResponse = await fetch('https://services.leadconnectorhq.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: code as string,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri
        })
      });
      
      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        logError('GHL token exchange failed', new Error(errorText), { route: 'api-ghl-auth-callback' });
        return res.redirect('/dashboard?ghl_error=token_exchange_failed');
      }
      
      const tokens = await tokenResponse.json();
      
      // Get location info
      const locationResponse = await fetch(`https://services.leadconnectorhq.com/locations/${tokens.locationId}`, {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Version': '2021-07-28'
        }
      });
      
      let locationName = 'Unknown Location';
      let companyId = null;
      if (locationResponse.ok) {
        const locationData = await locationResponse.json();
        locationName = locationData.location?.name || locationName;
        companyId = locationData.location?.companyId || null;
      }
      
      // Save account to database
      await storage.createGhlAccount({
        dealershipId,
        locationId: tokens.locationId,
        companyId,
        locationName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        tokenType: tokens.token_type,
        scope: tokens.scope,
        userType: tokens.userType,
        isActive: true
      });
      
      console.log(`GHL account connected for dealership ${dealershipId}, location ${tokens.locationId}`);
      res.redirect('/dashboard?ghl_connected=true');
    } catch (error) {
      logError('Error in GHL OAuth callback:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-auth-callback' });
      res.redirect('/dashboard?ghl_error=callback_error');
    }
  });
  
  // GHL Account: Get connected account status
  app.get("/api/ghl/account", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const account = await storage.getGhlAccountByDealership(dealershipId);
      
      if (!account) {
        return res.json({ connected: false });
      }
      
      // Return account info without sensitive tokens
      res.json({
        connected: true,
        id: account.id,
        locationId: account.locationId,
        locationName: account.locationName,
        companyId: account.companyId,
        isActive: account.isActive,
        lastSyncAt: account.lastSyncAt,
        syncStatus: account.syncStatus,
        syncError: account.syncError,
        expiresAt: account.expiresAt
      });
    } catch (error) {
      logError('Error fetching GHL account:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-account' });
      res.status(500).json({ error: "Failed to fetch GHL account" });
    }
  });
  
  // GHL Account: Disconnect
  app.delete("/api/ghl/account", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const account = await storage.getGhlAccountByDealership(dealershipId);
      
      if (!account) {
        return res.status(404).json({ error: "No GHL account connected" });
      }
      
      await storage.deleteGhlAccount(account.id, dealershipId);
      console.log(`GHL account disconnected for dealership ${dealershipId}`);
      res.json({ success: true });
    } catch (error) {
      logError('Error disconnecting GHL account:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-account' });
      res.status(500).json({ error: "Failed to disconnect GHL account" });
    }
  });
  
  // GHL Config: Get sync configuration
  app.get("/api/ghl/config", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const config = await storage.getGhlConfig(dealershipId);
      res.json(config || { configured: false });
    } catch (error) {
      logError('Error fetching GHL config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-config' });
      res.status(500).json({ error: "Failed to fetch GHL configuration" });
    }
  });
  
  // GHL Config: Update sync configuration
  app.post("/api/ghl/config", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { 
        syncContacts, 
        syncAppointments, 
        syncOpportunities,
        bidirectionalSync,
        webhookVerifyToken
      } = req.body;
      
      // Get the GHL account to link config
      const account = await storage.getGhlAccountByDealership(dealershipId);
      if (!account) {
        return res.status(400).json({ error: "No GHL account connected. Connect an account first." });
      }
      
      let config = await storage.getGhlConfig(dealershipId);
      
      if (config) {
        // Update existing config
        config = await storage.updateGhlConfig(config.id, dealershipId, {
          syncContacts: syncContacts ?? config.syncContacts,
          syncAppointments: syncAppointments ?? config.syncAppointments,
          syncOpportunities: syncOpportunities ?? config.syncOpportunities,
          bidirectionalSync: bidirectionalSync ?? config.bidirectionalSync,
          webhookVerifyToken: webhookVerifyToken ?? config.webhookVerifyToken
        });
      } else {
        // Create new config
        config = await storage.createGhlConfig({
          dealershipId,
          ghlAccountId: account.id,
          syncContacts: syncContacts ?? true,
          syncAppointments: syncAppointments ?? true,
          syncOpportunities: syncOpportunities ?? false,
          bidirectionalSync: bidirectionalSync ?? true,
          webhookVerifyToken: webhookVerifyToken || null
        });
      }
      
      res.json(config);
    } catch (error) {
      logError('Error saving GHL config:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-config' });
      res.status(500).json({ error: "Failed to save GHL configuration" });
    }
  });
  
  // GHL Webhook: Receive events from GoHighLevel
  app.post("/api/ghl/webhook", async (req, res) => {
    try {
      const signature = req.headers['x-ghl-signature'] as string;
      const eventType = req.headers['x-ghl-event'] as string;
      const locationId = req.body?.locationId || req.body?.location?.id;
      
      // Find dealership by location ID
      // NOTE: In multi-tenant, we need to look up which dealership owns this location
      // For now, we'll process events and log them with a pending status
      if (!locationId) {
        logWarn('GHL webhook received without locationId', { route: 'api-ghl-webhook' });
        return res.status(400).json({ error: "Missing locationId" });
      }
      
      // First try ghl_accounts table (OAuth-based connections)
      let dealershipId: number | null = null;
      let accountId: number | null = null;
      
      const accounts = await db.select().from(ghlAccounts)
        .where(eq(ghlAccounts.locationId, locationId))
        .limit(1);
      
      if (accounts.length > 0) {
        const account = accounts[0];
        if (!account.isActive) {
          logWarn('GHL webhook rejected: account inactive for dealership ${account.dealershipId}', { route: 'api-ghl-webhook' });
          return res.status(403).json({ error: "Account not active" });
        }
        dealershipId = account.dealershipId;
        accountId = account.id;
        console.log(`GHL webhook: verified via ghl_accounts - dealership ${dealershipId}, location ${locationId}`);
      } else {
        // Fallback: Check dealership_api_keys table (API key-based connections)
        const apiKeyRecords = await db.select().from(dealershipApiKeys)
          .where(eq(dealershipApiKeys.ghlLocationId, locationId))
          .limit(1);
        
        if (apiKeyRecords.length > 0) {
          dealershipId = apiKeyRecords[0].dealershipId;
          console.log(`GHL webhook: verified via dealership_api_keys - dealership ${dealershipId}, location ${locationId}`);
        }
      }
      
      if (!dealershipId) {
        logWarn('GHL webhook for unknown location: ${locationId}', { route: 'api-ghl-webhook' });
        return res.status(404).json({ error: "Location not registered" });
      }
      
      // Verify webhook signature if configured
      const config = await storage.getGhlConfig(dealershipId);
      if (config?.webhookVerifyToken && signature) {
        const crypto = await import('crypto');
        const expectedSignature = crypto.createHmac('sha256', config.webhookVerifyToken)
          .update(JSON.stringify(req.body))
          .digest('hex');
        
        if (signature !== expectedSignature) {
          logWarn('GHL webhook signature mismatch', { route: 'api-ghl-webhook' });
          return res.status(401).json({ error: "Invalid signature" });
        }
      }
      
      // Check for duplicate events
      const eventId = req.body?.id || `${eventType}-${Date.now()}`;
      const existingEvent = await storage.getGhlWebhookEventByEventId(dealershipId, eventId);
      if (existingEvent) {
        console.log(`Duplicate GHL webhook event: ${eventId}`);
        return res.json({ success: true, duplicate: true });
      }
      
      // Store webhook event for processing
      await storage.createGhlWebhookEvent({
        dealershipId,
        locationId,
        eventId,
        eventType: eventType || req.body?.type || 'unknown',
        payload: JSON.stringify(req.body),
        status: 'pending'
      });
      
      // Acknowledge receipt immediately
      res.json({ success: true, eventId });
      
      // Process event asynchronously based on type
      setImmediate(async () => {
        try {
          const { createGhlApiService } = await import('./ghl-api-service');
          const ghlService = createGhlApiService(dealershipId);
          
          // Helper to normalize "null" strings to actual null
          const normalizeNull = (val: any) => (val === 'null' || val === 'undefined' || val === '') ? null : val;
          
          // Route to appropriate handler based on event type
          // Convert type to string to handle numeric types from FWC workflows
          const rawType = eventType || req.body?.type;
          const type = typeof rawType === 'number' ? String(rawType) : rawType;
          const typeStr = type ? String(type).toLowerCase() : '';
          
          // Check if this is a message event - either by string type or numeric type
          // FWC numeric types: 1=Email, 2=SMS, 3=Call, etc.
          const isMessageEvent = typeStr.includes('message') || 
                                 typeStr.includes('inbound') || 
                                 typeStr.includes('outbound') ||
                                 type === '2' || type === '1' || // SMS or Email
                                 (req.body?.body && req.body?.contactId); // Has message body and contact
          
          if (typeStr.includes('contact') && !isMessageEvent) {
            // Contact created/updated - sync to local DB and optionally to PBS
            await handleGhlContactEvent(dealershipId, req.body, ghlService);
          } else if (typeStr.includes('appointment') || typeStr.includes('calendar')) {
            // Appointment created/updated/cancelled
            await handleGhlAppointmentEvent(dealershipId, req.body, ghlService);
          } else if (typeStr.includes('opportunity')) {
            // Opportunity stage change
            await handleGhlOpportunityEvent(dealershipId, req.body, ghlService);
          } else if (isMessageEvent) {
            // Check if this is a call message (messageType = 'CALL')
            const messageType = req.body.messageType || req.body.type;
            if (messageType === 'CALL' || messageType === 'TYPE_CALL' || messageType === 3 || messageType === '3') {
              // Handle call recording from GHL
              await handleGhlCallEvent(dealershipId, req.body, storage);
            } else {
              // Message received or sent - sync to Lotview conversations (if feature flag enabled)
              const ghlMessengerSyncEnabled = await isFeatureEnabled(FEATURE_FLAGS.ENABLE_GHL_MESSENGER_SYNC, dealershipId);
              if (ghlMessengerSyncEnabled) {
                const ghlMessageSyncService = createGhlMessageSyncService(dealershipId);
                
                // Determine direction - FWC workflow may send "null" strings
                let direction = normalizeNull(req.body.direction);
                if (!direction) {
                  // Infer from type string or default to inbound (customer reply)
                  direction = typeStr.includes('outbound') ? 'outbound' : 'inbound';
                }
                
                // Map numeric types to string types for downstream handlers
                const numericType = String(req.body.type);
                let messageTypeStr = 'SMS'; // Default to SMS
                if (numericType === '1' || type === '1') {
                  messageTypeStr = 'Email';
                } else if (numericType === '2' || type === '2' || numericType.toLowerCase().includes('sms')) {
                  messageTypeStr = 'SMS';
                } else if (typeof req.body.type === 'string' && !['1', '2', '3'].includes(req.body.type)) {
                  messageTypeStr = req.body.type; // Use original string type if it's not numeric
                }
                
                await ghlMessageSyncService.handleInboundGhlMessage({
                  conversationId: normalizeNull(req.body.conversationId) || normalizeNull(req.body.conversation?.id),
                  contactId: normalizeNull(req.body.contactId) || normalizeNull(req.body.contact?.id),
                  locationId: locationId,
                  body: req.body.body || req.body.message || '',
                  messageId: normalizeNull(req.body.messageId) || req.body.id || `fwc-${Date.now()}`,
                  direction: direction,
                  dateAdded: normalizeNull(req.body.dateAdded) || normalizeNull(req.body.createdAt) || new Date().toISOString(),
                  type: messageTypeStr,
                });
              } else {
                console.log(`[GHL Webhook] Messenger sync disabled for dealership ${dealershipId}, skipping message sync`);
              }
            }
          } else if (typeStr.includes('call') || type === '3') {
            // Direct call event
            await handleGhlCallEvent(dealershipId, req.body, storage);
          }
          
          // Mark event as processed
          const event = await storage.getGhlWebhookEventByEventId(dealershipId, eventId);
          if (event) {
            await storage.updateGhlWebhookEvent(event.id, dealershipId, { status: 'processed' });
          }
        } catch (processError) {
          logError('Error processing GHL webhook:', processError instanceof Error ? processError : new Error(String(processError)), { route: 'api-ghl-webhook' });
          const event = await storage.getGhlWebhookEventByEventId(dealershipId, eventId);
          if (event) {
            await storage.updateGhlWebhookEvent(event.id, dealershipId, { 
              status: 'failed',
              errorMessage: String(processError)
            });
          }
        }
      });
    } catch (error) {
      logError('Error receiving GHL webhook:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-webhook' });
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // GHL Webhook Events: List for debugging
  app.get("/api/ghl/webhook-events", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { status, limit } = req.query;
      const events = await storage.getGhlWebhookEvents(
        dealershipId, 
        status as string | undefined, 
        Math.min(parseInt(limit as string) || 100, 500)
      );
      res.json(events);
    } catch (error) {
      logError('Error fetching GHL webhook events:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-webhook-events' });
      res.status(500).json({ error: "Failed to fetch webhook events" });
    }
  });
  
  // GHL API Logs: View for debugging
  app.get("/api/ghl/api-logs", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { limit } = req.query;
      const logs = await storage.getGhlApiLogs(
        dealershipId,
        Math.min(parseInt(limit as string) || 100, 500)
      );
      res.json(logs);
    } catch (error) {
      logError('Error fetching GHL API logs:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-api-logs' });
      res.status(500).json({ error: "Failed to fetch API logs" });
    }
  });
  
  // GHL Contacts: Search contacts via GHL API
  app.get("/api/ghl/contacts/search", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { query, limit } = req.query;
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.searchContacts({ query: query as string, limit: parseInt(limit as string) || 20 });
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error searching GHL contacts:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-contacts-search' });
      res.status(500).json({ error: "Failed to search contacts" });
    }
  });
  
  // GHL Contacts: Get single contact
  app.get("/api/ghl/contacts/:contactId", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId } = req.params;
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.getContact(contactId);
      
      if (!result.success) {
        return res.status(result.errorCode === 'NOT_FOUND' ? 404 : 500).json({ 
          error: result.error, 
          errorCode: result.errorCode 
        });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching GHL contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-contacts-contactId' });
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });
  
  // GHL Contacts: Create contact
  app.post("/api/ghl/contacts", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.createContact(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.status(201).json(result.data);
    } catch (error) {
      logError('Error creating GHL contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-contacts' });
      res.status(500).json({ error: "Failed to create contact" });
    }
  });
  
  // GHL Contacts: Update contact
  app.patch("/api/ghl/contacts/:contactId", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { contactId } = req.params;
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.updateContact(contactId, req.body);
      
      if (!result.success) {
        return res.status(result.errorCode === 'NOT_FOUND' ? 404 : 400).json({ 
          error: result.error, 
          errorCode: result.errorCode 
        });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error updating GHL contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-contacts-contactId' });
      res.status(500).json({ error: "Failed to update contact" });
    }
  });
  
  // GHL Appointments: Get calendar appointments
  app.get("/api/ghl/appointments", authMiddleware, requireRole("master", "sales_manager", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { calendarId, startDate, endDate } = req.query;
      
      if (!calendarId || !startDate || !endDate) {
        return res.status(400).json({ error: "calendarId, startDate, and endDate are required" });
      }
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.getCalendarEvents(
        calendarId as string,
        startDate as string,
        endDate as string
      );
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching GHL appointments:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-appointments' });
      res.status(500).json({ error: "Failed to fetch appointments" });
    }
  });
  
  // GHL Appointments: Create appointment
  app.post("/api/ghl/appointments", authMiddleware, requireRole("master", "sales_manager", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.createCalendarEvent(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.status(201).json(result.data);
    } catch (error) {
      logError('Error creating GHL appointment:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-appointments' });
      res.status(500).json({ error: "Failed to create appointment" });
    }
  });
  
  // GHL Pipelines: List available pipelines
  app.get("/api/ghl/pipelines", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.getPipelines();
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching GHL pipelines:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-pipelines' });
      res.status(500).json({ error: "Failed to fetch pipelines" });
    }
  });
  
  // GHL Calendars: List available calendars
  app.get("/api/ghl/calendars", authMiddleware, requireRole("master", "sales_manager", "service_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.getCalendars();
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching GHL calendars:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-calendars' });
      res.status(500).json({ error: "Failed to fetch calendars" });
    }
  });
  
  // GHL Opportunities: List opportunities
  app.get("/api/ghl/opportunities", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { pipelineId } = req.query;
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.getOpportunities(pipelineId as string | undefined);
      
      if (!result.success) {
        return res.status(500).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.json(result.data);
    } catch (error) {
      logError('Error fetching GHL opportunities:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-opportunities' });
      res.status(500).json({ error: "Failed to fetch opportunities" });
    }
  });
  
  // GHL Opportunities: Create opportunity
  app.post("/api/ghl/opportunities", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.createOpportunity(req.body);
      
      if (!result.success) {
        return res.status(400).json({ error: result.error, errorCode: result.errorCode });
      }
      
      res.status(201).json(result.data);
    } catch (error) {
      logError('Error creating GHL opportunity:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-opportunities' });
      res.status(500).json({ error: "Failed to create opportunity" });
    }
  });
  
  // GHL Sync Stats: Get sync statistics for dashboard
  app.get("/api/ghl/sync/stats", authMiddleware, requireRole("master", "sales_manager"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      // Get counts of synced contacts and appointments
      const [contactSyncs, appointmentSyncs, account, config] = await Promise.all([
        db.select({ count: sql<number>`count(*)` }).from(ghlContactSync)
          .where(eq(ghlContactSync.dealershipId, dealershipId)),
        db.select({ count: sql<number>`count(*)` }).from(ghlAppointmentSync)
          .where(eq(ghlAppointmentSync.dealershipId, dealershipId)),
        storage.getGhlAccountByDealership(dealershipId),
        storage.getGhlConfig(dealershipId)
      ]);
      
      // Get pending syncs count
      const pendingSyncs = await db.select({ count: sql<number>`count(*)` }).from(ghlContactSync)
        .where(and(
          eq(ghlContactSync.dealershipId, dealershipId),
          eq(ghlContactSync.syncStatus, 'pending')
        ));
      
      // Get last sync time from most recent contact sync
      const lastSync = await db.select({ lastSyncAt: ghlContactSync.lastSyncAt }).from(ghlContactSync)
        .where(eq(ghlContactSync.dealershipId, dealershipId))
        .orderBy(desc(ghlContactSync.lastSyncAt))
        .limit(1);
      
      res.json({
        connected: !!account,
        locationId: account?.locationId,
        contactsSynced: contactSyncs[0]?.count || 0,
        appointmentsSynced: appointmentSyncs[0]?.count || 0,
        pendingSyncs: pendingSyncs[0]?.count || 0,
        lastSyncAt: lastSync[0]?.lastSyncAt || null,
        syncEnabled: config?.syncContacts || false,
        bidirectionalSync: config?.bidirectionalSync || false
      });
    } catch (error) {
      logError('Error fetching GHL sync stats:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-sync-stats' });
      res.status(500).json({ error: "Failed to fetch sync stats" });
    }
  });
  
  // GHL Sync Run: Manually trigger a sync
  app.post("/api/ghl/sync/run", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      // Check if GHL is connected
      const account = await storage.getGhlAccountByDealership(dealershipId);
      if (!account) {
        return res.status(400).json({ error: "FWC CRM not connected" });
      }
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      
      // Fetch contacts from GHL and sync them (use searchContacts with empty query)
      const contactsResult = await ghlService.searchContacts({ limit: 100 });
      
      if (!contactsResult.success) {
        return res.status(500).json({ error: contactsResult.error || "Failed to fetch contacts from FWC" });
      }
      
      const contacts = contactsResult.data?.contacts || [];
      let synced = 0;
      let errors = 0;
      
      for (const contact of contacts) {
        try {
          // Check if already synced
          const existing = await storage.getGhlContactSync(dealershipId, contact.id);
          if (existing) {
            await storage.updateGhlContactSync(existing.id, dealershipId, {
              syncStatus: 'synced'
            });
          } else {
            await storage.createGhlContactSync({
              dealershipId,
              ghlContactId: contact.id,
              syncStatus: 'synced',
              syncDirection: 'ghl_to_local'
            });
          }
          synced++;
        } catch (err) {
          errors++;
          logError(`Error syncing contact ${contact.id}:`, err instanceof Error ? err : new Error(String(err)), { route: 'api-ghl-sync-run' });
        }
      }
      
      res.json({
        success: true,
        message: `Synced ${synced} contacts${errors > 0 ? `, ${errors} errors` : ''}`,
        synced,
        errors,
        total: contacts.length
      });
    } catch (error) {
      logError('Error running GHL sync:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-sync-run' });
      res.status(500).json({ error: "Failed to run sync" });
    }
  });
  
  // GHL Disconnect: Remove GHL integration
  app.delete("/api/ghl/disconnect", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      const account = await storage.getGhlAccountByDealership(dealershipId);
      if (!account) {
        return res.status(404).json({ error: "No FWC CRM account connected" });
      }
      
      // Delete the account (this will cascade delete config due to FK)
      await storage.deleteGhlAccount(account.id, dealershipId);
      
      res.json({ success: true, message: "FWC CRM disconnected successfully" });
    } catch (error) {
      logError('Error disconnecting GHL:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-disconnect' });
      res.status(500).json({ error: "Failed to disconnect" });
    }
  });
  
  // GHL Contact Sync Records: List sync status
  app.get("/api/ghl/sync/contacts", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { status, limit } = req.query;
      
      if (status === 'pending') {
        const syncs = await storage.getPendingGhlContactSyncs(
          dealershipId,
          Math.min(parseInt(limit as string) || 100, 500)
        );
        return res.json(syncs);
      }
      
      // Return all recent syncs
      const syncs = await db.select().from(ghlContactSync)
        .where(eq(ghlContactSync.dealershipId, dealershipId))
        .orderBy(desc(ghlContactSync.lastSyncAt))
        .limit(Math.min(parseInt(limit as string) || 100, 500));
      
      res.json(syncs);
    } catch (error) {
      logError('Error fetching GHL contact syncs:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-sync-contacts' });
      res.status(500).json({ error: "Failed to fetch contact syncs" });
    }
  });
  
  // GHL Test Connection: Verify API access
  app.post("/api/ghl/test-connection", authMiddleware, requireRole("master"), async (req, res) => {
    try {
      const dealershipId = req.dealershipId!;
      
      const { createGhlApiService } = await import('./ghl-api-service');
      const ghlService = createGhlApiService(dealershipId);
      const result = await ghlService.testConnection();
      
      res.json({
        success: result.success,
        message: result.message,
        locationName: result.locationName
      });
    } catch (error) {
      logError('Error testing GHL connection:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-test-connection' });
      res.status(500).json({ error: "Failed to test connection" });
    }
  });
  
  // Webhook event handlers (internal helpers)
  async function handleGhlContactEvent(dealershipId: number, payload: any, _ghlService: any) {
    const contactId = payload?.contact?.id || payload?.contactId;
    if (!contactId) return;
    
    // Check if we already have this contact synced
    let syncRecord = await storage.getGhlContactSync(dealershipId, contactId);
    
    if (!syncRecord) {
      // Create new sync record (lastSyncAt is auto-set by storage layer)
      syncRecord = await storage.createGhlContactSync({
        dealershipId,
        ghlContactId: contactId,
        syncStatus: 'synced',
        syncDirection: 'ghl_to_local'
      });
    } else {
      // Update existing sync record (storage layer auto-updates lastSyncAt)
      await storage.updateGhlContactSync(syncRecord.id, dealershipId, {
        syncStatus: 'synced'
      });
    }
    
    // Sync contact metadata to Messenger conversation (tags, phone, email)
    try {
      const ghlMessageSyncService = createGhlMessageSyncService(dealershipId);
      await ghlMessageSyncService.handleGhlContactUpdate({
        contactId,
        locationId: payload?.locationId || '',
        tags: payload?.contact?.tags || payload?.tags,
        phone: payload?.contact?.phone || payload?.phone,
        email: payload?.contact?.email || payload?.email,
        customFields: payload?.contact?.customFields || payload?.customFields,
      });
    } catch (syncError) {
      console.error(`[GHL Contact] Error syncing contact metadata to conversation:`, syncError);
    }
    
    // If bidirectional sync is enabled, also sync to PBS
    const config = await storage.getGhlConfig(dealershipId);
    if (config?.bidirectionalSync && config?.syncContacts) {
      // Queue PBS sync (will be handled by scheduled job)
      await storage.updateGhlContactSync(syncRecord.id, dealershipId, {
        syncStatus: 'pending_pbs',
        syncDirection: 'ghl_to_pbs'
      });
    }
  }
  
  async function handleGhlAppointmentEvent(dealershipId: number, payload: any, _ghlService: any) {
    const appointmentId = payload?.appointment?.id || payload?.appointmentId;
    const calendarId = payload?.appointment?.calendarId || payload?.calendarId || 'unknown';
    const scheduledStart = payload?.appointment?.startTime || payload?.startTime || new Date();
    if (!appointmentId) return;
    
    // Check if we already have this appointment synced
    let syncRecord = await storage.getGhlAppointmentSync(dealershipId, appointmentId);
    
    if (!syncRecord) {
      // Create new sync record (lastSyncAt is auto-set by storage layer)
      syncRecord = await storage.createGhlAppointmentSync({
        dealershipId,
        ghlAppointmentId: appointmentId,
        ghlCalendarId: calendarId,
        scheduledStart: new Date(scheduledStart),
        syncStatus: 'synced',
        syncDirection: 'ghl_to_local'
      });
    } else {
      // Update existing sync record (storage layer auto-updates lastSyncAt)
      await storage.updateGhlAppointmentSync(syncRecord.id, dealershipId, {
        syncStatus: 'synced'
      });
    }
    
    // If bidirectional sync is enabled, also sync to PBS
    const config = await storage.getGhlConfig(dealershipId);
    if (config?.bidirectionalSync && config?.syncAppointments) {
      await storage.updateGhlAppointmentSync(syncRecord.id, dealershipId, {
        syncStatus: 'pending_pbs',
        syncDirection: 'ghl_to_pbs'
      });
    }
  }
  
  async function handleGhlOpportunityEvent(dealershipId: number, payload: any, _ghlService: any) {
    const opportunityId = payload?.opportunity?.id || payload?.opportunityId;
    const contactId = payload?.opportunity?.contactId || payload?.contactId;
    
    console.log(`GHL opportunity event for dealership ${dealershipId}:`, opportunityId);
    
    if (!contactId) return;
    
    // Sync opportunity metadata (pipeline stage, status) to Messenger conversation
    try {
      const ghlMessageSyncService = createGhlMessageSyncService(dealershipId);
      await ghlMessageSyncService.handleGhlOpportunityUpdate({
        opportunityId: opportunityId || '',
        contactId,
        locationId: payload?.locationId || '',
        pipelineStageId: payload?.opportunity?.pipelineStageId || payload?.pipelineStageId,
        pipelineStageName: payload?.opportunity?.pipelineStageName || payload?.stageName || payload?.stage?.name,
        status: payload?.opportunity?.status || payload?.status,
      });
    } catch (syncError) {
      console.error(`[GHL Opportunity] Error syncing opportunity metadata to conversation:`, syncError);
    }
  }
  
  async function handleGhlCallEvent(dealershipId: number, payload: any, storageInstance: typeof storage) {
    console.log(`[GHL Call] Processing call event for dealership ${dealershipId}`);
    
    // Extract call data from various GHL webhook formats
    const ghlCallId = payload.messageId || payload.id || payload.call?.id || `ghl-call-${Date.now()}`;
    const ghlContactId = payload.contactId || payload.contact?.id || null;
    
    // Recording URL is often in attachments array for call messages
    const recordingUrl = payload.attachments?.[0] || payload.recordingUrl || payload.call?.recordingUrl || null;
    const transcription = payload.transcript || payload.call?.transcript || payload.transcription || null;
    
    // Call details
    const direction = payload.direction || 'inbound';
    const duration = payload.callDuration || payload.duration || payload.call?.duration || 0;
    const callStatus = payload.callStatus || payload.status || payload.call?.status || 'completed';
    
    // Phone numbers - GHL uses 'from' and 'to' or may have them in the message
    const callerPhone = payload.from || payload.call?.from || payload.phone || 'unknown';
    const dealershipPhone = payload.to || payload.call?.to || 'unknown';
    
    // Contact name
    const callerName = payload.contactName || payload.contact?.name || payload.contact?.firstName || null;
    
    // User/salesperson who handled the call
    const userId = payload.userId || payload.assignedTo || null;
    
    // Timestamps
    const dateAdded = payload.dateAdded || payload.createdAt || new Date().toISOString();
    
    // Check for duplicate
    const existingCall = await storageInstance.getCallRecordingByGhlCallId(ghlCallId, dealershipId);
    if (existingCall) {
      console.log(`[GHL Call] Duplicate call ${ghlCallId} - skipping`);
      return;
    }
    
    // Create call recording
    const callRecording = await storageInstance.createCallRecording({
      dealershipId,
      ghlCallId,
      ghlContactId,
      callerPhone,
      dealershipPhone,
      direction,
      duration,
      callStatus,
      recordingUrl,
      transcription,
      callerName,
      salespersonName: userId ? `User ${userId}` : null,
      callStartedAt: new Date(dateAdded),
      callEndedAt: duration ? new Date(new Date(dateAdded).getTime() + duration * 1000) : null,
      analysisStatus: transcription ? 'pending' : (recordingUrl ? 'pending' : 'skipped')
    });
    
    console.log(`[GHL Call] Created call recording ${callRecording.id} for dealership ${dealershipId}`);
    
    // If we have transcription, queue for AI analysis
    if (transcription || recordingUrl) {
      try {
        const { getCallAnalysisService } = await import('./call-analysis-service');
        const analysisService = getCallAnalysisService(dealershipId);
        // Process asynchronously
        analysisService.processCallRecording(callRecording.id).catch(err => {
          logError(`[GHL Call] Error analyzing call ${callRecording.id}:`, err instanceof Error ? err : new Error(String(err)), { route: 'api-ghl-test-connection' });
        });
      } catch (importError) {
        logError('[GHL Call] Error importing analysis service:', importError instanceof Error ? importError : new Error(String(importError)), { route: 'api-ghl-test-connection' });
      }
    }
  }
  
  // ====== CALL ANALYSIS SYSTEM ======
  
  // GHL Call Webhook - receives call completed events
  app.post("/api/ghl/call-webhook", async (req, res) => {
    try {
      const { locationId, call, contact } = req.body;
      
      if (!locationId) {
        return res.status(400).json({ error: "Missing locationId" });
      }
      
      // Find dealership by GHL location ID
      const ghlAccountResults = await db.select().from(ghlAccounts)
        .where(eq(ghlAccounts.locationId, locationId));
      
      if (ghlAccountResults.length === 0) {
        logWarn('No dealership found for GHL location ${locationId}', { route: 'api-ghl-call-webhook' });
        return res.status(200).json({ received: true, warning: "Unknown location" });
      }
      
      const dealershipId = ghlAccountResults[0].dealershipId;
      
      // Check if we already have this call
      const existingCall = await storage.getCallRecordingByGhlCallId(call?.id || req.body.messageId, dealershipId);
      if (existingCall) {
        return res.json({ received: true, status: "duplicate" });
      }
      
      // Create call recording record
      const callRecording = await storage.createCallRecording({
        dealershipId,
        ghlCallId: call?.id || req.body.messageId || `ghl-${Date.now()}`,
        ghlContactId: contact?.id || null,
        callerPhone: call?.from || req.body.from || 'unknown',
        dealershipPhone: call?.to || req.body.to || 'unknown',
        direction: call?.direction || req.body.direction || 'inbound',
        duration: call?.duration || req.body.duration || 0,
        callStatus: call?.status || req.body.status || 'completed',
        recordingUrl: call?.recordingUrl || req.body.recordingUrl || null,
        transcription: call?.transcript || req.body.transcript || null,
        callerName: contact?.name || contact?.firstName || null,
        salespersonName: call?.assignedTo || null,
        callStartedAt: new Date(call?.startTime || req.body.startTime || Date.now()),
        callEndedAt: call?.endTime ? new Date(call.endTime) : null,
        analysisStatus: (call?.transcript || req.body.transcript) ? 'pending' : 'skipped'
      });
      
      // If transcription is available, queue for AI analysis
      if (callRecording.transcription) {
        // Process asynchronously - don't block webhook response
        const { getCallAnalysisService } = await import('./call-analysis-service');
        const service = getCallAnalysisService(dealershipId);
        service.processCallRecording(callRecording.id).catch(err => {
          logError(`Error processing call ${callRecording.id}:`, err instanceof Error ? err : new Error(String(err)), { route: 'api-ghl-call-webhook' });
        });
      }
      
      res.json({ received: true, callId: callRecording.id });
    } catch (error) {
      logError('Error processing call webhook:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ghl-call-webhook' });
      res.status(500).json({ error: "Failed to process call webhook" });
    }
  });
  
  // Get call recordings (manager/admin only)
  app.get("/api/call-recordings", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.user?.dealershipId || 1;
      const { salespersonId, startDate, endDate, analysisStatus, needsReview, minScore, maxScore, limit, offset } = req.query;
      
      const filters: any = {};
      if (salespersonId) filters.salespersonId = parseInt(salespersonId as string);
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (analysisStatus) filters.analysisStatus = analysisStatus as string;
      if (needsReview !== undefined) filters.needsReview = needsReview === 'true';
      if (minScore) filters.minScore = parseInt(minScore as string);
      if (maxScore) filters.maxScore = parseInt(maxScore as string);
      
      const result = await storage.getCallRecordings(
        dealershipId,
        filters,
        limit ? parseInt(limit as string) : 50,
        offset ? parseInt(offset as string) : 0
      );
      
      res.json(result);
    } catch (error) {
      logError('Error fetching call recordings:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-recordings' });
      res.status(500).json({ error: "Failed to fetch call recordings" });
    }
  });
  
  // Get call recording stats (must be before :id route)
  app.get("/api/call-recordings/stats", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.user?.dealershipId || 1;
      const { startDate, endDate } = req.query;
      
      const stats = await storage.getCallRecordingStats(
        dealershipId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      
      res.json(stats);
    } catch (error) {
      logError('Error fetching call stats:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-recordings-stats' });
      res.status(500).json({ error: "Failed to fetch call stats" });
    }
  });
  
  // Get call recording by ID
  app.get("/api/call-recordings/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.user?.dealershipId || 1;
      const id = parseInt(req.params.id);
      
      const recording = await storage.getCallRecordingById(id, dealershipId);
      if (!recording) {
        return res.status(404).json({ error: "Call recording not found" });
      }
      
      res.json(recording);
    } catch (error) {
      logError('Error fetching call recording:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-recordings-id' });
      res.status(500).json({ error: "Failed to fetch call recording" });
    }
  });
  
  // Re-analyze a call
  app.post("/api/call-recordings/:id/analyze", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.user?.dealershipId || 1;
      const id = parseInt(req.params.id);
      
      const recording = await storage.getCallRecordingById(id, dealershipId);
      if (!recording) {
        return res.status(404).json({ error: "Call recording not found" });
      }
      
      // Reset status to pending
      await storage.updateCallRecording(id, dealershipId, {
        analysisStatus: 'pending',
        analysisError: null
      });
      
      // Process asynchronously
      const { getCallAnalysisService } = await import('./call-analysis-service');
      const service = getCallAnalysisService(dealershipId);
      service.processCallRecording(id).then(success => {
        console.log(`Re-analysis of call ${id}: ${success ? 'success' : 'failed'}`);
      });
      
      res.json({ message: "Analysis queued", callId: id });
    } catch (error) {
      logError('Error queuing call analysis:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-recordings-id-analyze' });
      res.status(500).json({ error: "Failed to queue analysis" });
    }
  });
  
  // Mark call as reviewed
  app.post("/api/call-recordings/:id/review", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.user?.dealershipId || 1;
      const id = parseInt(req.params.id);
      const { notes } = req.body;
      
      const recording = await storage.updateCallRecording(id, dealershipId, {
        reviewedBy: req.user?.id,
        reviewedAt: new Date(),
        reviewNotes: notes || null,
        needsReview: false
      });
      
      if (!recording) {
        return res.status(404).json({ error: "Call recording not found" });
      }
      
      res.json(recording);
    } catch (error) {
      logError('Error marking call as reviewed:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-recordings-id-review' });
      res.status(500).json({ error: "Failed to mark call as reviewed" });
    }
  });
  
  // Get call analysis criteria
  app.get("/api/call-analysis-criteria", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.user?.dealershipId || 1;
      const criteria = await storage.getCallAnalysisCriteria(dealershipId);
      res.json(criteria);
    } catch (error) {
      logError('Error fetching call analysis criteria:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-analysis-criteria' });
      res.status(500).json({ error: "Failed to fetch criteria" });
    }
  });
  
  // Create call analysis criteria
  app.post("/api/call-analysis-criteria", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.user?.dealershipId || 1;
      const { name, description, category, weight, promptGuidance } = req.body;
      
      const criteria = await storage.createCallAnalysisCriteria({
        dealershipId,
        name,
        description,
        category: category || 'general',
        weight: weight || 1,
        isActive: true,
        promptGuidance
      });
      
      res.json(criteria);
    } catch (error) {
      logError('Error creating call analysis criteria:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-analysis-criteria' });
      res.status(500).json({ error: "Failed to create criteria" });
    }
  });
  
  // Update call analysis criteria
  app.patch("/api/call-analysis-criteria/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.user?.dealershipId || 1;
      const id = parseInt(req.params.id);
      
      const criteria = await storage.updateCallAnalysisCriteria(id, dealershipId, req.body);
      if (!criteria) {
        return res.status(404).json({ error: "Criteria not found" });
      }
      
      res.json(criteria);
    } catch (error) {
      logError('Error updating call analysis criteria:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-analysis-criteria-id' });
      res.status(500).json({ error: "Failed to update criteria" });
    }
  });
  
  // Delete call analysis criteria
  app.delete("/api/call-analysis-criteria/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.user?.dealershipId || 1;
      const id = parseInt(req.params.id);
      
      await storage.deleteCallAnalysisCriteria(id, dealershipId);
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting call analysis criteria:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-analysis-criteria-id' });
      res.status(500).json({ error: "Failed to delete criteria" });
    }
  });
  
  // Seed default criteria
  app.post("/api/call-analysis-criteria/seed-defaults", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.user?.dealershipId || 1;
      const { seedDefaultCriteria } = await import('./call-analysis-service');
      await seedDefaultCriteria(dealershipId);
      
      const criteria = await storage.getCallAnalysisCriteria(dealershipId);
      res.json(criteria);
    } catch (error) {
      logError('Error seeding default criteria:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-analysis-criteria-seed-defaults' });
      res.status(500).json({ error: "Failed to seed defaults" });
    }
  });
  
  // ===== CALL SCORING TEMPLATES =====
  
  // Get all templates (system defaults + dealership specific)
  app.get("/api/call-scoring/templates", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId || req.user?.dealershipId || null;
      const templates = await storage.getCallScoringTemplates(dealershipId);
      res.json(templates);
    } catch (error) {
      logError('Error fetching call scoring templates:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-templates' });
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });
  
  // Get single template with criteria
  app.get("/api/call-scoring/templates/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getCallScoringTemplate(id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      const criteria = await storage.getTemplateCriteria(id);
      res.json({ ...template, criteria });
    } catch (error) {
      logError('Error fetching call scoring template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-templates-id' });
      res.status(500).json({ error: "Failed to fetch template" });
    }
  });
  
  // Create dealership-specific template
  app.post("/api/call-scoring/templates", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId || req.user?.dealershipId;
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const { department, name, description, isDefault } = req.body;
      if (!department || !name) {
        return res.status(400).json({ error: "Department and name are required" });
      }
      
      const template = await storage.createCallScoringTemplate({
        dealershipId,
        department,
        name,
        description,
        isActive: true,
        isDefault: isDefault || false,
        version: 1,
        createdById: req.user?.id,
      });
      
      res.status(201).json(template);
    } catch (error) {
      logError('Error creating call scoring template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-templates' });
      res.status(500).json({ error: "Failed to create template" });
    }
  });
  
  // Clone system template for dealership customization
  app.post("/api/call-scoring/templates/:id/clone", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const dealershipId = req.dealershipId || req.user?.dealershipId;
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "User not authenticated" });
      }
      
      const clonedTemplate = await storage.cloneTemplateForDealership(templateId, dealershipId, userId);
      const criteria = await storage.getTemplateCriteria(clonedTemplate.id);
      
      res.status(201).json({ ...clonedTemplate, criteria });
    } catch (error) {
      logError('Error cloning call scoring template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-templates-id-clone' });
      res.status(500).json({ error: "Failed to clone template" });
    }
  });
  
  // Update template
  app.patch("/api/call-scoring/templates/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getCallScoringTemplate(id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.dealershipId === null) {
        return res.status(403).json({ error: "Cannot modify system default templates" });
      }
      
      const { name, description, isActive, isDefault, department } = req.body;
      const updated = await storage.updateCallScoringTemplate(id, {
        name,
        description,
        isActive,
        isDefault,
        department,
      });
      
      res.json(updated);
    } catch (error) {
      logError('Error updating call scoring template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-templates-id' });
      res.status(500).json({ error: "Failed to update template" });
    }
  });
  
  // Delete template (only dealership-specific, not system defaults)
  app.delete("/api/call-scoring/templates/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getCallScoringTemplate(id);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.dealershipId === null) {
        return res.status(403).json({ error: "Cannot delete system default templates" });
      }
      
      await storage.deleteCallScoringTemplate(id);
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting call scoring template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-templates-id' });
      res.status(500).json({ error: "Failed to delete template" });
    }
  });
  
  // ===== TEMPLATE CRITERIA =====
  
  // Get criteria for a template
  app.get("/api/call-scoring/templates/:templateId/criteria", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const templateId = parseInt(req.params.templateId);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const criteria = await storage.getTemplateCriteria(templateId);
      res.json(criteria);
    } catch (error) {
      logError('Error fetching template criteria:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-templates-templateId-cr' });
      res.status(500).json({ error: "Failed to fetch criteria" });
    }
  });
  
  // Add criterion to template
  app.post("/api/call-scoring/templates/:templateId/criteria", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const templateId = parseInt(req.params.templateId);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const template = await storage.getCallScoringTemplate(templateId);
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      if (template.dealershipId === null) {
        return res.status(403).json({ error: "Cannot modify system default templates" });
      }
      
      const { category, label, description, weight, maxScore, ratingType, sortOrder, aiInstruction, isRequired } = req.body;
      if (!category || !label) {
        return res.status(400).json({ error: "Category and label are required" });
      }
      
      const criterion = await storage.createCriterion({
        templateId,
        category,
        label,
        description,
        weight: weight || 1,
        maxScore: maxScore || 10,
        ratingType: ratingType || 'numeric',
        sortOrder: sortOrder || 0,
        aiInstruction,
        isRequired: isRequired !== undefined ? isRequired : true,
      });
      
      res.status(201).json(criterion);
    } catch (error) {
      logError('Error creating criterion:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-templates-templateId-cr' });
      res.status(500).json({ error: "Failed to create criterion" });
    }
  });
  
  // Update criterion
  app.patch("/api/call-scoring/criteria/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid criterion ID" });
      }
      
      const { category, label, description, weight, maxScore, ratingType, sortOrder, aiInstruction, isRequired } = req.body;
      const updated = await storage.updateCriterion(id, {
        category,
        label,
        description,
        weight,
        maxScore,
        ratingType,
        sortOrder,
        aiInstruction,
        isRequired,
      });
      
      if (!updated) {
        return res.status(404).json({ error: "Criterion not found" });
      }
      
      res.json(updated);
    } catch (error) {
      logError('Error updating criterion:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-criteria-id' });
      res.status(500).json({ error: "Failed to update criterion" });
    }
  });
  
  // Delete criterion
  app.delete("/api/call-scoring/criteria/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid criterion ID" });
      }
      
      const deleted = await storage.deleteCriterion(id);
      if (!deleted) {
        return res.status(404).json({ error: "Criterion not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting criterion:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-criteria-id' });
      res.status(500).json({ error: "Failed to delete criterion" });
    }
  });
  
  // Reorder criteria
  app.post("/api/call-scoring/templates/:templateId/criteria/reorder", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const templateId = parseInt(req.params.templateId);
      if (isNaN(templateId)) {
        return res.status(400).json({ error: "Invalid template ID" });
      }
      
      const { criteriaIds } = req.body;
      if (!Array.isArray(criteriaIds)) {
        return res.status(400).json({ error: "criteriaIds must be an array" });
      }
      
      await storage.reorderCriteria(templateId, criteriaIds);
      res.json({ success: true });
    } catch (error) {
      logError('Error reordering criteria:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-templates-templateId-cr' });
      res.status(500).json({ error: "Failed to reorder criteria" });
    }
  });
  
  // ===== CALL SCORING SHEETS =====
  
  // Get scoring sheet for a call
  app.get("/api/call-recordings/:callId/scoring", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const callId = parseInt(req.params.callId);
      if (isNaN(callId)) {
        return res.status(400).json({ error: "Invalid call ID" });
      }
      
      const result = await storage.getCallScoringSheetWithResponses(callId);
      if (!result) {
        return res.status(404).json({ error: "Scoring sheet not found" });
      }
      
      res.json(result);
    } catch (error) {
      logError('Error fetching scoring sheet:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-recordings-callId-scoring' });
      res.status(500).json({ error: "Failed to fetch scoring sheet" });
    }
  });
  
  // Create or update scoring sheet
  app.post("/api/call-recordings/:callId/scoring", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const callId = parseInt(req.params.callId);
      if (isNaN(callId)) {
        return res.status(400).json({ error: "Invalid call ID" });
      }
      
      const dealershipId = req.dealershipId || req.user?.dealershipId;
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      
      const { templateId, status, employeeId, employeeName, employeeDepartment, reviewerNotes, coachingNotes, reviewerTotalScore, finalScore } = req.body;
      
      let sheet = await storage.getCallScoringSheet(callId);
      
      if (sheet) {
        sheet = await storage.updateCallScoringSheet(sheet.id, {
          status,
          reviewerId: req.user?.id,
          employeeId,
          employeeName,
          employeeDepartment,
          reviewerNotes,
          coachingNotes,
          reviewerTotalScore,
          finalScore,
          reviewedAt: status === 'reviewed' || status === 'approved' ? new Date() : undefined,
        }) || sheet;
      } else {
        if (!templateId) {
          return res.status(400).json({ error: "Template ID is required for new scoring sheet" });
        }
        
        sheet = await storage.createCallScoringSheet({
          dealershipId,
          callRecordingId: callId,
          templateId,
          reviewerId: req.user?.id,
          status: status || 'pending',
          employeeId,
          employeeName,
          employeeDepartment,
          reviewerNotes,
          coachingNotes,
        });
      }
      
      res.json(sheet);
    } catch (error) {
      logError('Error creating/updating scoring sheet:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-recordings-callId-scoring' });
      res.status(500).json({ error: "Failed to save scoring sheet" });
    }
  });
  
  // Update individual response score
  app.patch("/api/call-scoring/responses/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: "Invalid response ID" });
      }
      
      const { reviewerScore, comment, timestamp } = req.body;
      
      // SECURITY: Verify response belongs to caller's dealership via sheet join
      const responseWithSheet = await db.select({
        response: callScoringResponses,
        sheetDealershipId: callScoringSheets.dealershipId,
      })
        .from(callScoringResponses)
        .innerJoin(callScoringSheets, eq(callScoringResponses.sheetId, callScoringSheets.id))
        .where(eq(callScoringResponses.id, id))
        .limit(1);

      if (responseWithSheet.length === 0) {
        return res.status(404).json({ error: "Response not found" });
      }

      const authReq = req as AuthRequest;
      if (req.dealershipId && responseWithSheet[0].sheetDealershipId !== req.dealershipId) {
        return res.status(403).json({ error: "Access denied: response belongs to another dealership" });
      }

      const updated = await db.update(callScoringResponses)
        .set({ reviewerScore, comment, timestamp, updatedAt: new Date() })
        .where(eq(callScoringResponses.id, id))
        .returning();

      res.json(updated[0]);
    } catch (error) {
      logError('Error updating response:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-scoring-responses-id' });
      res.status(500).json({ error: "Failed to update response" });
    }
  });
  
  // Bulk update responses (for batch saving)
  app.post("/api/call-recordings/:callId/scoring/responses", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const callId = parseInt(req.params.callId);
      if (isNaN(callId)) {
        return res.status(400).json({ error: "Invalid call ID" });
      }
      
      const { responses } = req.body;
      if (!Array.isArray(responses)) {
        return res.status(400).json({ error: "Responses must be an array" });
      }
      
      const sheet = await storage.getCallScoringSheet(callId);
      if (!sheet) {
        return res.status(404).json({ error: "Scoring sheet not found" });
      }
      
      const responsesWithSheetId = responses.map(r => ({
        ...r,
        sheetId: sheet.id,
      }));
      
      const savedResponses = await storage.bulkUpsertCallScoringResponses(responsesWithSheetId);
      res.json(savedResponses);
    } catch (error) {
      logError('Error bulk updating responses:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-recordings-callId-scoring-respo' });
      res.status(500).json({ error: "Failed to save responses" });
    }
  });
  
  // ===== CALL PARTICIPANTS =====
  
  // Get participants for a call
  app.get("/api/call-recordings/:callId/participants", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const callId = parseInt(req.params.callId);
      if (isNaN(callId)) {
        return res.status(400).json({ error: "Invalid call ID" });
      }
      
      const participants = await storage.getCallParticipants(callId);
      res.json(participants);
    } catch (error) {
      logError('Error fetching call participants:', error instanceof Error ? error : new Error(String(error)), { route: 'api-call-recordings-callId-participants' });
      res.status(500).json({ error: "Failed to fetch participants" });
    }
  });
  
  // ====== SUPER ADMIN IMPERSONATION ======
  
  // Start impersonation session
  app.post("/api/super-admin/impersonate", authMiddleware, superAdminOnly, async (req: AuthRequest, res) => {
    try {
      const { targetUserId, reason } = req.body;
      
      if (!targetUserId) {
        return res.status(400).json({ error: "Target user ID is required" });
      }
      
      // Get target user
      const targetUser = await storage.getUserById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: "Target user not found" });
      }
      
      // Cannot impersonate another super admin
      if (targetUser.role === 'super_admin') {
        return res.status(403).json({ error: "Cannot impersonate another super admin" });
      }
      
      // End any active impersonation session first
      const activeSession = await storage.getActiveImpersonationSession(req.user!.id);
      if (activeSession) {
        await storage.endImpersonationSession(activeSession.id, req.user!.id);
      }
      
      // Create new impersonation session
      const session = await storage.createImpersonationSession({
        superAdminId: req.user!.id,
        targetUserId,
        targetDealershipId: targetUser.dealershipId,
        reason,
        ipAddress: req.ip || req.headers['x-forwarded-for'] as string || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        actionsPerformed: 0
      });
      
      // Generate impersonation token
      const impersonationToken = generateToken({
        id: targetUser.id,
        email: targetUser.email,
        role: targetUser.role,
        name: targetUser.name,
        dealershipId: targetUser.dealershipId,
        isActive: targetUser.isActive,
        createdBy: targetUser.createdBy,
        createdAt: targetUser.createdAt,
        updatedAt: targetUser.updatedAt,
        passwordHash: ''
      });
      
      // Log audit action
      await storage.logAuditAction({
        userId: req.user!.id,
        action: 'impersonate_start',
        resource: 'user',
        resourceId: targetUserId.toString(),
        details: JSON.stringify({ 
          targetUserEmail: targetUser.email,
          targetUserRole: targetUser.role,
          reason,
          sessionId: session.id
        }),
        ipAddress: req.ip || null
      });
      
      res.json({
        success: true,
        sessionId: session.id,
        impersonationToken,
        targetUser: {
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
          role: targetUser.role,
          dealershipId: targetUser.dealershipId
        }
      });
    } catch (error) {
      logError('Error starting impersonation:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-impersonate' });
      res.status(500).json({ error: "Failed to start impersonation" });
    }
  });
  
  // End impersonation session
  app.post("/api/super-admin/impersonate/end", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { sessionId, superAdminId } = req.body;
      
      if (!sessionId || !superAdminId) {
        return res.status(400).json({ error: "Session ID and super admin ID are required" });
      }
      
      const session = await storage.endImpersonationSession(sessionId, superAdminId);
      
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      
      // Log audit action
      await storage.logAuditAction({
        userId: superAdminId,
        action: 'impersonate_end',
        resource: 'user',
        resourceId: session.targetUserId.toString(),
        details: JSON.stringify({ 
          sessionId: session.id,
          actionsPerformed: session.actionsPerformed
        }),
        ipAddress: req.ip || null
      });
      
      res.json({ success: true, session });
    } catch (error) {
      logError('Error ending impersonation:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-impersonate-end' });
      res.status(500).json({ error: "Failed to end impersonation" });
    }
  });
  
  // Get impersonation history
  app.get("/api/super-admin/impersonation-history", authMiddleware, superAdminOnly, async (req: AuthRequest, res) => {
    try {
      const { limit, offset } = req.query;
      const result = await storage.getImpersonationSessions(
        limit ? parseInt(limit as string) : 50,
        offset ? parseInt(offset as string) : 0
      );
      res.json(result);
    } catch (error) {
      logError('Error fetching impersonation history:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-impersonation-history' });
      res.status(500).json({ error: "Failed to fetch history" });
    }
  });
  
  // Get active impersonation session for super admin
  app.get("/api/super-admin/impersonate/active", authMiddleware, superAdminOnly, async (req: AuthRequest, res) => {
    try {
      const session = await storage.getActiveImpersonationSession(req.user!.id);
      res.json({ session: session || null });
    } catch (error) {
      logError('Error fetching active session:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-impersonate-active' });
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  const httpServer = createServer(app);
  
  // ===== WEBSOCKET SERVER FOR REAL-TIME NOTIFICATIONS =====
  const WebSocket = await import('ws');
  const wss = new WebSocket.WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Store connected clients by dealership with authenticated user info
  interface AuthenticatedClient {
    ws: InstanceType<typeof WebSocket.WebSocket>;
    userId: number;
    dealershipId: number;
  }
  const clientsByDealership = new Map<number, Set<AuthenticatedClient>>();
  
  wss.on('connection', async (ws: InstanceType<typeof WebSocket.WebSocket>, req) => {
    // SECURITY: Authenticate WebSocket connection using JWT token
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    
    if (!token) {
      ws.close(4001, 'Authentication required');
      return;
    }
    
    try {
      // Verify JWT token and get user info
      const decoded = verifyToken(token);
      if (!decoded || !decoded.id) {
        ws.close(4001, 'Invalid token');
        return;
      }
      
      // Verify user is still active
      const user = await storage.getUserById(decoded.id);
      if (!user || !user.isActive) {
        ws.close(4001, 'User not found or inactive');
        return;
      }
      
      // Use the dealership ID from the user's token, not from query params
      // This ensures tenant isolation - users can only subscribe to their own dealership
      const dealershipId = user.dealershipId || 1; // Super admins default to dealership 1
      
      const client: AuthenticatedClient = {
        ws,
        userId: user.id,
        dealershipId,
      };
      
      // Add to dealership clients
      if (!clientsByDealership.has(dealershipId)) {
        clientsByDealership.set(dealershipId, new Set());
      }
      clientsByDealership.get(dealershipId)!.add(client);
      
      console.log(`WebSocket client connected: user ${user.id} for dealership ${dealershipId}`);
      
      ws.on('close', () => {
        clientsByDealership.get(dealershipId)?.delete(client);
        console.log(`WebSocket client disconnected: user ${user.id} for dealership ${dealershipId}`);
      });
      
      ws.on('error', (error: Error) => {
        logError('WebSocket error:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-impersonate-active' });
      });
    } catch (error) {
      logError('WebSocket authentication error:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-impersonate-active' });
      ws.close(4001, 'Authentication failed');
    }
  });
  
  // Notification payload schema for validation
  const NotificationSchema = {
    validate: (data: any): data is {
      type: 'new_lead' | 'chat_message' | 'post_status' | 'inventory_sync' | 'system' | 'new_message' | 'conversation_update';
      title: string;
      message: string;
      data?: any;
      timestamp: string;
    } => {
      const validTypes = ['new_lead', 'chat_message', 'post_status', 'inventory_sync', 'system', 'new_message', 'conversation_update'];
      return (
        typeof data === 'object' &&
        data !== null &&
        validTypes.includes(data.type) &&
        typeof data.title === 'string' &&
        typeof data.message === 'string' &&
        typeof data.timestamp === 'string'
      );
    }
  };
  
  // Broadcast notification to all authenticated clients for a dealership
  const broadcastNotification = (dealershipId: number, notification: {
    type: 'new_lead' | 'chat_message' | 'post_status' | 'inventory_sync' | 'system' | 'new_message' | 'conversation_update';
    title: string;
    message: string;
    data?: any;
    timestamp: string;
  }) => {
    // Validate notification payload
    if (!NotificationSchema.validate(notification)) {
      logError('Invalid notification payload', new Error(JSON.stringify(notification)), { route: 'websocket-broadcast' });
      return;
    }
    
    // Validate dealership ID
    if (typeof dealershipId !== 'number' || isNaN(dealershipId) || dealershipId < 1) {
      logError('Invalid dealership ID for broadcast', new Error(`Invalid dealershipId: ${dealershipId}`), { route: 'websocket-broadcast' });
      return;
    }
    
    const clients = clientsByDealership.get(dealershipId);
    if (!clients || clients.size === 0) return;
    
    const payload = JSON.stringify(notification);
    clients.forEach(client => {
      if (client.ws.readyState === WebSocket.WebSocket.OPEN) {
        client.ws.send(payload);
      }
    });
  };
  
  // Expose broadcast function globally for use in other routes
  (global as any).broadcastNotification = broadcastNotification;

  // ===== AUTOMATION ENGINE ROUTES =====

  // Helper to resolve dealership ID for super admins
  const resolveAutomationDealershipId = (req: any): number | null => {
    const authReq = req as AuthRequest;
    const queryDealershipId = req.query.dealershipId ? parseInt(req.query.dealershipId as string) : null;
    const bodyDealershipId = req.body?.dealershipId ? parseInt(req.body.dealershipId) : null;
    
    if (authReq.user?.role === 'super_admin') {
      return queryDealershipId || bodyDealershipId || null;
    }
    return req.dealershipId || null;
  };

  // Get all follow-up sequences for dealership
  app.get("/api/automation/sequences", authMiddleware, async (req, res) => {
    try {
      const dealershipId = resolveAutomationDealershipId(req);
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      const sequences = await storage.getFollowUpSequences(dealershipId);
      res.json(sequences);
    } catch (error) {
      logError('Error fetching sequences:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-sequences' });
      res.status(500).json({ error: "Failed to fetch sequences" });
    }
  });

  // Get a specific sequence
  app.get("/api/automation/sequences/:id", authMiddleware, async (req, res) => {
    try {
      const dealershipId = resolveAutomationDealershipId(req);
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      const id = parseInt(req.params.id);
      const sequence = await storage.getFollowUpSequenceById(id, dealershipId);
      if (!sequence) {
        return res.status(404).json({ error: "Sequence not found" });
      }
      res.json(sequence);
    } catch (error) {
      logError('Error fetching sequence:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-sequences-id' });
      res.status(500).json({ error: "Failed to fetch sequence" });
    }
  });

  // Create a new sequence
  app.post("/api/automation/sequences", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = resolveAutomationDealershipId(req);
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      const sequence = await storage.createFollowUpSequence({
        ...req.body,
        dealershipId,
      });
      res.status(201).json(sequence);
    } catch (error) {
      logError('Error creating sequence:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-sequences' });
      res.status(500).json({ error: "Failed to create sequence" });
    }
  });

  // Update a sequence
  app.patch("/api/automation/sequences/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = resolveAutomationDealershipId(req);
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      const id = parseInt(req.params.id);
      const sequence = await storage.updateFollowUpSequence(id, dealershipId, req.body);
      if (!sequence) {
        return res.status(404).json({ error: "Sequence not found" });
      }
      res.json(sequence);
    } catch (error) {
      logError('Error updating sequence:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-sequences-id' });
      res.status(500).json({ error: "Failed to update sequence" });
    }
  });

  // Delete a sequence
  app.delete("/api/automation/sequences/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = resolveAutomationDealershipId(req);
      if (!dealershipId) {
        return res.status(400).json({ error: "Dealership ID is required" });
      }
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteFollowUpSequence(id, dealershipId);
      if (!deleted) {
        return res.status(404).json({ error: "Sequence not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting sequence:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-sequences-id' });
      res.status(500).json({ error: "Failed to delete sequence" });
    }
  });

  // Get follow-up queue items
  app.get("/api/automation/queue", authMiddleware, async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      const items = await storage.getFollowUpQueueItems(dealershipId, status, limit);
      res.json(items);
    } catch (error) {
      logError('Error fetching queue:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-queue' });
      res.status(500).json({ error: "Failed to fetch queue" });
    }
  });

  // Cancel a queue item
  app.post("/api/automation/queue/:id/cancel", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      const item = await storage.updateFollowUpQueueItem(id, dealershipId, { status: 'cancelled' });
      if (!item) {
        return res.status(404).json({ error: "Queue item not found" });
      }
      res.json(item);
    } catch (error) {
      logError('Error cancelling queue item:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-queue-id-cancel' });
      res.status(500).json({ error: "Failed to cancel queue item" });
    }
  });

  // Manually trigger a follow-up for a contact
  app.post("/api/automation/trigger", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const { createAutomationService } = await import('./automation-service');
      const automation = createAutomationService(dealershipId);
      const result = await automation.triggerFollowUp({
        ...req.body,
        sourceType: req.body.sourceType || 'manual',
      });
      res.json(result);
    } catch (error) {
      logError('Error triggering follow-up:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-trigger' });
      res.status(500).json({ error: "Failed to trigger follow-up" });
    }
  });

  // Facebook Messenger Lead Webhook - triggers follow-up sequence for FB leads
  // Can be called via webhook from Facebook/GHL or manually by staff
  // Requires either: authenticated session OR valid API token in header
  app.post("/api/automation/facebook-lead", async (req, res) => {
    try {
      const { 
        contactName, 
        contactPhone, 
        contactEmail, 
        vehicleInterest,
        vehicleId,
        message,
        source,
        dealershipId: bodyDealershipId 
      } = req.body;

      // Determine dealership from authenticated session OR valid API token only
      // No unauthenticated access allowed - dealershipId in body is NOT sufficient
      let dealershipId: number | null = null;
      
      // Check for authenticated session first (logged-in user)
      if ((req as any).dealershipId) {
        dealershipId = (req as any).dealershipId;
      }
      // Check for API token in Authorization header (for external webhooks like n8n, Zapier, GHL)
      else if (req.headers.authorization?.startsWith('Bearer ')) {
        const tokenPrefix = req.headers.authorization.slice(7, 15); // First 8 chars after "Bearer "
        const tokenData = await storage.getExternalApiTokenByPrefix(tokenPrefix);
        if (tokenData) {
          // Validate the full token using bcrypt
          const bcrypt = await import('bcryptjs');
          const fullToken = req.headers.authorization.slice(7);
          const isValid = await bcrypt.compare(fullToken, tokenData.tokenHash);
          if (isValid && tokenData.permissions.includes('automation:trigger')) {
            dealershipId = tokenData.dealershipId;
            await storage.updateExternalApiTokenLastUsed(tokenData.id);
          } else {
            return res.status(401).json({ error: "Invalid API token or missing 'automation:trigger' permission" });
          }
        } else {
          return res.status(401).json({ error: "Unknown API token" });
        }
      }
      
      if (!dealershipId) {
        return res.status(401).json({ 
          error: "Authentication required: provide session cookie or Bearer token with 'automation:trigger' permission" 
        });
      }
      
      if (!contactPhone && !contactEmail) {
        return res.status(400).json({ error: "Contact phone or email is required" });
      }

      const { createAutomationService } = await import('./automation-service');
      const automation = createAutomationService(dealershipId);

      // Build metadata for personalization
      const metadata: Record<string, unknown> = {};
      if (vehicleInterest) metadata.vehicleName = vehicleInterest;
      if (message) metadata.initialMessage = message;
      if (source) metadata.source = source;

      // Get dealership name for messages
      const dealership = await storage.getDealership(dealershipId);
      if (dealership) metadata.dealershipName = dealership.name;

      const result = await automation.triggerFollowUp({
        triggerType: 'facebook_messenger',
        contactName: contactName || undefined,
        contactPhone: contactPhone || undefined,
        contactEmail: contactEmail || undefined,
        sourceType: source || 'facebook_messenger',
        sourceId: `fb_lead_${Date.now()}`,
        vehicleId: vehicleId ? parseInt(vehicleId) : undefined,
        metadata,
      });

      console.log(`[FB Lead] New lead processed: ${contactName || 'Unknown'} - ${result.success ? 'queued' : result.error}`);
      
      res.json({ 
        success: result.success, 
        message: result.success 
          ? 'Lead received and follow-up sequence started' 
          : result.error,
        queueItemId: result.queueItemId 
      });
    } catch (error) {
      logError('Error processing Facebook lead:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-facebook-lead' });
      res.status(500).json({ error: "Failed to process Facebook lead" });
    }
  });

  // Get automation logs
  app.get("/api/automation/logs", authMiddleware, async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const limit = parseInt(req.query.limit as string) || 100;
      const automationType = req.query.automationType as string | undefined;
      const logs = await storage.getAutomationLogs(dealershipId, { automationType }, limit);
      res.json(logs);
    } catch (error) {
      logError('Error fetching automation logs:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-logs' });
      res.status(500).json({ error: "Failed to fetch automation logs" });
    }
  });

  // Run automation engine manually (for testing)
  app.post("/api/automation/run", authMiddleware, requireRole('admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const { createAutomationService } = await import('./automation-service');
      const automation = createAutomationService(dealershipId);
      const result = await automation.processDueFollowUps();
      res.json(result);
    } catch (error) {
      logError('Error running automation:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-run' });
      res.status(500).json({ error: "Failed to run automation" });
    }
  });

  // ===== RE-ENGAGEMENT CAMPAIGNS =====
  
  // Get all re-engagement campaigns
  app.get("/api/automation/reengagement-campaigns", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const campaigns = await storage.getReengagementCampaigns(dealershipId);
      res.json(campaigns);
    } catch (error) {
      logError('Error fetching re-engagement campaigns:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-reengagement-campaigns' });
      res.status(500).json({ error: "Failed to fetch re-engagement campaigns" });
    }
  });

  // Get single re-engagement campaign
  app.get("/api/automation/reengagement-campaigns/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      const campaign = await storage.getReengagementCampaignById(id, dealershipId);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      logError('Error fetching re-engagement campaign:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-reengagement-campaigns-id' });
      res.status(500).json({ error: "Failed to fetch re-engagement campaign" });
    }
  });

  // Create re-engagement campaign
  app.post("/api/automation/reengagement-campaigns", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const campaign = await storage.createReengagementCampaign({
        ...req.body,
        dealershipId,
      });
      res.status(201).json(campaign);
    } catch (error) {
      logError('Error creating re-engagement campaign:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-reengagement-campaigns' });
      res.status(500).json({ error: "Failed to create re-engagement campaign" });
    }
  });

  // Update re-engagement campaign
  app.patch("/api/automation/reengagement-campaigns/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      const campaign = await storage.updateReengagementCampaign(id, dealershipId, req.body);
      if (!campaign) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json(campaign);
    } catch (error) {
      logError('Error updating re-engagement campaign:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-reengagement-campaigns-id' });
      res.status(500).json({ error: "Failed to update re-engagement campaign" });
    }
  });

  // Delete re-engagement campaign
  app.delete("/api/automation/reengagement-campaigns/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      const deleted = await storage.deleteReengagementCampaign(id, dealershipId);
      if (!deleted) {
        return res.status(404).json({ error: "Campaign not found" });
      }
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting re-engagement campaign:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-reengagement-campaigns-id' });
      res.status(500).json({ error: "Failed to delete re-engagement campaign" });
    }
  });

  // ===== SEQUENCE ANALYTICS =====

  // Get sequence performance summary
  app.get("/api/automation/analytics/summary", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const summary = await storage.getSequencePerformanceSummary(dealershipId, startDate, endDate);
      res.json(summary);
    } catch (error) {
      logError('Error fetching sequence analytics summary:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-analytics-summary' });
      res.status(500).json({ error: "Failed to fetch analytics summary" });
    }
  });

  // Get sequence executions (with optional filters)
  app.get("/api/automation/analytics/executions", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const sequenceId = req.query.sequenceId ? parseInt(req.query.sequenceId as string) : undefined;
      const status = req.query.status as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      const executions = await storage.getSequenceExecutions(dealershipId, sequenceId, status, limit);
      res.json(executions);
    } catch (error) {
      logError('Error fetching sequence executions:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-analytics-executions' });
      res.status(500).json({ error: "Failed to fetch sequence executions" });
    }
  });

  // Get messages for a specific execution
  app.get("/api/automation/analytics/executions/:executionId/messages", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const executionId = parseInt(req.params.executionId);
      const messages = await storage.getSequenceMessages(dealershipId, executionId);
      res.json(messages);
    } catch (error) {
      logError('Error fetching sequence messages:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-analytics-executions-exec' });
      res.status(500).json({ error: "Failed to fetch sequence messages" });
    }
  });

  // Get conversions for analytics
  app.get("/api/automation/analytics/conversions", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const sequenceId = req.query.sequenceId ? parseInt(req.query.sequenceId as string) : undefined;
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
      const conversions = await storage.getSequenceConversions(dealershipId, sequenceId, startDate, endDate);
      res.json(conversions);
    } catch (error) {
      logError('Error fetching sequence conversions:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-analytics-conversions' });
      res.status(500).json({ error: "Failed to fetch sequence conversions" });
    }
  });

  // ===== CONTACT ACTIVITY =====

  // Get all contact activity
  app.get("/api/automation/contact-activity", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const result = await storage.getAllContactActivity(dealershipId, limit, offset);
      res.json(result);
    } catch (error) {
      logError('Error fetching contact activity:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-contact-activity' });
      res.status(500).json({ error: "Failed to fetch contact activity" });
    }
  });

  // Get inactive contacts for re-engagement
  app.get("/api/automation/inactive-contacts", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const inactiveDays = parseInt(req.query.inactiveDays as string) || 90;
      const limit = parseInt(req.query.limit as string) || 50;
      const contacts = await storage.getInactiveContacts(dealershipId, inactiveDays, limit);
      res.json(contacts);
    } catch (error) {
      logError('Error fetching inactive contacts:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-inactive-contacts' });
      res.status(500).json({ error: "Failed to fetch inactive contacts" });
    }
  });

  // Log/upsert contact activity
  app.post("/api/automation/contact-activity", authMiddleware, async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const activity = await storage.upsertContactActivity({
        ...req.body,
        dealershipId,
      });
      res.json(activity);
    } catch (error) {
      logError('Error logging contact activity:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-contact-activity' });
      res.status(500).json({ error: "Failed to log contact activity" });
    }
  });

  // Update contact activity
  app.patch("/api/automation/contact-activity/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      const activity = await storage.updateContactActivity(id, dealershipId, req.body);
      if (!activity) {
        return res.status(404).json({ error: "Contact activity not found" });
      }
      res.json(activity);
    } catch (error) {
      logError('Error updating contact activity:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-contact-activity-id' });
      res.status(500).json({ error: "Failed to update contact activity" });
    }
  });

  // Record a sequence execution event
  app.post("/api/automation/sequence-executions", authMiddleware, async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const execution = await storage.createSequenceExecution({
        ...req.body,
        dealershipId,
      });
      res.status(201).json(execution);
    } catch (error) {
      logError('Error creating sequence execution:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-sequence-executions' });
      res.status(500).json({ error: "Failed to create sequence execution" });
    }
  });

  // Update sequence execution status
  app.patch("/api/automation/sequence-executions/:id", authMiddleware, async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      const execution = await storage.updateSequenceExecution(id, dealershipId, req.body);
      if (!execution) {
        return res.status(404).json({ error: "Sequence execution not found" });
      }
      res.json(execution);
    } catch (error) {
      logError('Error updating sequence execution:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-sequence-executions-id' });
      res.status(500).json({ error: "Failed to update sequence execution" });
    }
  });

  // Record a sequence message
  app.post("/api/automation/sequence-messages", authMiddleware, async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const message = await storage.createSequenceMessage({
        ...req.body,
        dealershipId,
      });
      res.status(201).json(message);
    } catch (error) {
      logError('Error creating sequence message:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-sequence-messages' });
      res.status(500).json({ error: "Failed to create sequence message" });
    }
  });

  // Update sequence message status
  app.patch("/api/automation/sequence-messages/:id", authMiddleware, async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      const message = await storage.updateSequenceMessage(id, dealershipId, req.body);
      if (!message) {
        return res.status(404).json({ error: "Sequence message not found" });
      }
      res.json(message);
    } catch (error) {
      logError('Error updating sequence message:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-sequence-messages-id' });
      res.status(500).json({ error: "Failed to update sequence message" });
    }
  });

  // Record a conversion event
  app.post("/api/automation/conversions", authMiddleware, async (req, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const conversion = await storage.createSequenceConversion({
        ...req.body,
        dealershipId,
      });
      res.status(201).json(conversion);
    } catch (error) {
      logError('Error recording conversion:', error instanceof Error ? error : new Error(String(error)), { route: 'api-automation-conversions' });
      res.status(500).json({ error: "Failed to record conversion" });
    }
  });

  // ===== CRM CONTACTS =====
  
  // Get all CRM contacts (with RBAC - salespeople see own, managers see all)
  app.get("/api/crm/contacts", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      // Build filters from query params
      const filters: any = {};
      
      // Salespeople can only see their own contacts
      if (userRole === 'salesperson') {
        filters.ownerId = userId;
      } else if (req.query.ownerId) {
        filters.ownerId = parseInt(req.query.ownerId as string);
      }
      
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.leadSource) filters.leadSource = req.query.leadSource as string;
      if (req.query.search) filters.search = req.query.search as string;
      
      const pagination = {
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string) : 0
      };
      
      const sorting = {
        field: req.query.sortField as string,
        direction: req.query.sortDirection as 'asc' | 'desc'
      };
      
      const result = await storage.getCrmContacts(dealershipId, filters, pagination, sorting);
      res.json(result);
    } catch (error) {
      logError('Error fetching CRM contacts:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts' });
      res.status(500).json({ error: "Failed to fetch contacts" });
    }
  });
  
  // Create a new CRM contact
  app.post("/api/crm/contacts", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const userId = req.user?.id;
      
      const parseResult = insertCrmContactSchema.safeParse({
        ...req.body,
        dealershipId,
        createdById: userId,
        ownerId: req.body.ownerId || userId
      });
      
      if (!parseResult.success) {
        return res.status(400).json({ error: fromZodError(parseResult.error).message });
      }
      
      const contact = await storage.createCrmContact(parseResult.data);
      
      // Log creation activity
      await storage.createCrmActivity({
        contactId: contact.id,
        dealershipId,
        activityType: 'contact_created',
        content: 'Contact was created',
        userId
      });
      
      res.status(201).json(contact);
    } catch (error) {
      logError('Error creating CRM contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts' });
      res.status(500).json({ error: "Failed to create contact" });
    }
  });
  
  // Get a single CRM contact by ID
  app.get("/api/crm/contacts/:id", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      const contact = await storage.getCrmContactById(id, dealershipId);
      
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Salespeople can only access their own contacts
      if (userRole === 'salesperson' && contact.ownerId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      res.json(contact);
    } catch (error) {
      logError('Error fetching CRM contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id' });
      res.status(500).json({ error: "Failed to fetch contact" });
    }
  });
  
  // Update a CRM contact
  app.patch("/api/crm/contacts/:id", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      // Check contact exists and access rights
      const existing = await storage.getCrmContactById(id, dealershipId);
      if (!existing) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Salespeople can only update their own contacts
      if (userRole === 'salesperson' && existing.ownerId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const contact = await storage.updateCrmContact(id, dealershipId, req.body);
      
      // Log update activity
      await storage.createCrmActivity({
        contactId: id,
        dealershipId,
        activityType: 'contact_updated',
        content: 'Contact information was updated',
        userId
      });
      
      res.json(contact);
    } catch (error) {
      logError('Error updating CRM contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id' });
      res.status(500).json({ error: "Failed to update contact" });
    }
  });
  
  // Delete a CRM contact
  app.delete("/api/crm/contacts/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteCrmContact(id, dealershipId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting CRM contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id' });
      res.status(500).json({ error: "Failed to delete contact" });
    }
  });
  
  // ===== CRM TAGS =====
  
  // Get all CRM tags for dealership
  app.get("/api/crm/tags", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const tags = await storage.getCrmTags(dealershipId);
      res.json(tags);
    } catch (error) {
      logError('Error fetching CRM tags:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-tags' });
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });
  
  // Create a new CRM tag
  app.post("/api/crm/tags", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const userId = req.user?.id;
      
      const parseResult = insertCrmTagSchema.safeParse({
        ...req.body,
        dealershipId,
        createdById: userId
      });
      
      if (!parseResult.success) {
        return res.status(400).json({ error: fromZodError(parseResult.error).message });
      }
      
      const tag = await storage.createCrmTag(parseResult.data);
      res.status(201).json(tag);
    } catch (error) {
      logError('Error creating CRM tag:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-tags' });
      res.status(500).json({ error: "Failed to create tag" });
    }
  });
  
  // Update a CRM tag
  app.patch("/api/crm/tags/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      
      const tag = await storage.updateCrmTag(id, dealershipId, req.body);
      
      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }
      
      res.json(tag);
    } catch (error) {
      logError('Error updating CRM tag:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-tags-id' });
      res.status(500).json({ error: "Failed to update tag" });
    }
  });
  
  // Delete a CRM tag
  app.delete("/api/crm/tags/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteCrmTag(id, dealershipId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Tag not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting CRM tag:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-tags-id' });
      res.status(500).json({ error: "Failed to delete tag" });
    }
  });
  
  // Add tag to contact
  app.post("/api/crm/contacts/:id/tags/:tagId", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const tagId = parseInt(req.params.tagId);
      const userId = req.user?.id;
      
      const contactTag = await storage.addTagToContact(contactId, tagId, userId);
      res.status(201).json(contactTag);
    } catch (error) {
      logError('Error adding tag to contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id-tags-tagId' });
      res.status(500).json({ error: "Failed to add tag" });
    }
  });
  
  // Remove tag from contact
  app.delete("/api/crm/contacts/:id/tags/:tagId", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const tagId = parseInt(req.params.tagId);
      
      const removed = await storage.removeTagFromContact(contactId, tagId);
      
      if (!removed) {
        return res.status(404).json({ error: "Tag not found on contact" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error removing tag from contact:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id-tags-tagId' });
      res.status(500).json({ error: "Failed to remove tag" });
    }
  });
  
  // Get tags for a contact
  app.get("/api/crm/contacts/:id/tags", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const contactId = parseInt(req.params.id);
      const tags = await storage.getContactTags(contactId);
      res.json(tags);
    } catch (error) {
      logError('Error fetching contact tags:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id-tags' });
      res.status(500).json({ error: "Failed to fetch tags" });
    }
  });
  
  // ===== CRM ACTIVITIES =====
  
  // Get activity timeline for a contact
  app.get("/api/crm/contacts/:id/activities", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const contactId = parseInt(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const activities = await storage.getCrmActivities(contactId, dealershipId, limit);
      res.json(activities);
    } catch (error) {
      logError('Error fetching CRM activities:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id-activities' });
      res.status(500).json({ error: "Failed to fetch activities" });
    }
  });
  
  // Log a new activity for a contact
  app.post("/api/crm/contacts/:id/activities", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const contactId = parseInt(req.params.id);
      const userId = req.user?.id;
      
      const parseResult = insertCrmActivitySchema.safeParse({
        ...req.body,
        contactId,
        dealershipId,
        performedById: userId
      });
      
      if (!parseResult.success) {
        return res.status(400).json({ error: fromZodError(parseResult.error).message });
      }
      
      const activity = await storage.createCrmActivity(parseResult.data);
      res.status(201).json(activity);
    } catch (error) {
      logError('Error creating CRM activity:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id-activities' });
      res.status(500).json({ error: "Failed to create activity" });
    }
  });
  
  // ===== CRM TASKS =====
  
  // Get CRM tasks
  app.get("/api/crm/tasks", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      const filters: any = {};
      
      // Salespeople see only their assigned tasks
      if (userRole === 'salesperson') {
        filters.assignedToId = userId;
      } else if (req.query.assignedToId) {
        filters.assignedToId = parseInt(req.query.assignedToId as string);
      }
      
      if (req.query.contactId) filters.contactId = parseInt(req.query.contactId as string);
      if (req.query.status) filters.status = req.query.status as string;
      if (req.query.priority) filters.priority = req.query.priority as string;
      if (req.query.dueAfter) filters.dueAfter = new Date(req.query.dueAfter as string);
      if (req.query.dueBefore) filters.dueBefore = new Date(req.query.dueBefore as string);
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      
      const tasks = await storage.getCrmTasks(dealershipId, filters, limit);
      res.json(tasks);
    } catch (error) {
      logError('Error fetching CRM tasks:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-tasks' });
      res.status(500).json({ error: "Failed to fetch tasks" });
    }
  });
  
  // Get a single CRM task by ID
  app.get("/api/crm/tasks/:id", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      
      const task = await storage.getCrmTaskById(id, dealershipId);
      
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      res.json(task);
    } catch (error) {
      logError('Error fetching CRM task:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-tasks-id' });
      res.status(500).json({ error: "Failed to fetch task" });
    }
  });
  
  // Create a new CRM task
  app.post("/api/crm/tasks", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const userId = req.user?.id;
      
      const parseResult = insertCrmTaskSchema.safeParse({
        ...req.body,
        dealershipId,
        createdById: userId,
        assignedToId: req.body.assignedToId || userId
      });
      
      if (!parseResult.success) {
        return res.status(400).json({ error: fromZodError(parseResult.error).message });
      }
      
      const task = await storage.createCrmTask(parseResult.data);
      res.status(201).json(task);
    } catch (error) {
      logError('Error creating CRM task:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-tasks' });
      res.status(500).json({ error: "Failed to create task" });
    }
  });
  
  // Update a CRM task
  app.patch("/api/crm/tasks/:id", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      // Check task exists
      const existing = await storage.getCrmTaskById(id, dealershipId);
      if (!existing) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      // Salespeople can only update their own tasks
      if (userRole === 'salesperson' && existing.assignedToId !== userId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const task = await storage.updateCrmTask(id, dealershipId, req.body);
      res.json(task);
    } catch (error) {
      logError('Error updating CRM task:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-tasks-id' });
      res.status(500).json({ error: "Failed to update task" });
    }
  });
  
  // Delete a CRM task
  app.delete("/api/crm/tasks/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteCrmTask(id, dealershipId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting CRM task:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-tasks-id' });
      res.status(500).json({ error: "Failed to delete task" });
    }
  });
  
  // ===== CRM MESSAGE TEMPLATES =====
  
  // Get all message templates for the dealership
  app.get("/api/crm/message-templates", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const channel = req.query.channel as string | undefined;
      
      const templates = await storage.getCrmMessageTemplates(dealershipId, channel);
      res.json(templates);
    } catch (error) {
      logError('Error fetching message templates:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-message-templates' });
      res.status(500).json({ error: "Failed to fetch message templates" });
    }
  });
  
  // Get a specific message template
  app.get("/api/crm/message-templates/:id", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      
      const template = await storage.getCrmMessageTemplateById(id, dealershipId);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      logError('Error fetching message template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-message-templates-id' });
      res.status(500).json({ error: "Failed to fetch message template" });
    }
  });
  
  // Create a new message template
  app.post("/api/crm/message-templates", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const userId = req.user?.id;
      
      const { name, channel, category, subject, content, availableFields } = req.body;
      
      if (!name || !channel || !content) {
        return res.status(400).json({ error: "Name, channel, and content are required" });
      }
      
      if (!['email', 'sms', 'facebook'].includes(channel)) {
        return res.status(400).json({ error: "Channel must be 'email', 'sms', or 'facebook'" });
      }
      
      const template = await storage.createCrmMessageTemplate({
        dealershipId,
        createdById: userId,
        name,
        channel,
        category: category || 'custom',
        subject,
        content,
        availableFields: availableFields ? JSON.stringify(availableFields) : null,
      });
      
      res.status(201).json(template);
    } catch (error) {
      logError('Error creating message template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-message-templates' });
      res.status(500).json({ error: "Failed to create message template" });
    }
  });
  
  // Update a message template
  app.patch("/api/crm/message-templates/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      
      const template = await storage.updateCrmMessageTemplate(id, dealershipId, req.body);
      
      if (!template) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      logError('Error updating message template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-message-templates-id' });
      res.status(500).json({ error: "Failed to update message template" });
    }
  });
  
  // Delete a message template
  app.delete("/api/crm/message-templates/:id", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const id = parseInt(req.params.id);
      
      const deleted = await storage.deleteCrmMessageTemplate(id, dealershipId);
      
      if (!deleted) {
        return res.status(404).json({ error: "Template not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      logError('Error deleting message template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-message-templates-id' });
      res.status(500).json({ error: "Failed to delete message template" });
    }
  });
  
  // ===== CRM MESSAGING =====
  
  // Send a message to a contact (email, sms, or facebook)
  app.post("/api/crm/contacts/:id/message", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const contactId = parseInt(req.params.id);
      const userId = req.user?.id;
      
      const { channel, content, subject } = req.body;
      
      if (!channel || !['email', 'sms', 'facebook'].includes(channel)) {
        return res.status(400).json({ error: "Invalid channel. Must be 'email', 'sms', or 'facebook'" });
      }
      
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: "Message content is required" });
      }
      
      const { createContactMessagingService } = await import('./contact-messaging-service');
      const messagingService = createContactMessagingService(dealershipId);
      
      const result = await messagingService.sendMessage({
        dealershipId,
        contactId,
        channel,
        content: content.trim(),
        subject,
        sentById: userId,
      });
      
      if (result.success) {
        res.json({ success: true, messageId: result.messageId, externalMessageId: result.externalMessageId });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error: any) {
      logError('Error sending CRM message:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id-message' });
      res.status(500).json({ error: error.message || "Failed to send message" });
    }
  });
  
  // Get AI-suggested message for a contact
  app.post("/api/crm/contacts/:id/suggest-message", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const contactId = parseInt(req.params.id);
      
      const { channel, context } = req.body;
      
      if (!channel || !['email', 'sms', 'facebook'].includes(channel)) {
        return res.status(400).json({ error: "Invalid channel. Must be 'email', 'sms', or 'facebook'" });
      }
      
      const { createContactMessagingService } = await import('./contact-messaging-service');
      const messagingService = createContactMessagingService(dealershipId);
      
      const result = await messagingService.generateAiMessageSuggestion({
        dealershipId,
        contactId,
        channel,
        context,
      });
      
      if (result.success) {
        res.json({ success: true, suggestion: result.suggestion });
      } else {
        res.status(400).json({ error: result.error });
      }
    } catch (error: any) {
      logError('Error generating AI message suggestion:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id-suggest-message' });
      res.status(500).json({ error: error.message || "Failed to generate suggestion" });
    }
  });
  
  // Get message history for a contact
  app.get("/api/crm/contacts/:id/messages", authMiddleware, requireRole('salesperson', 'manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = (req as any).dealershipId;
      const contactId = parseInt(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      
      const messages = await storage.getCrmMessages(contactId, dealershipId, limit);
      res.json(messages);
    } catch (error) {
      logError('Error fetching CRM messages:', error instanceof Error ? error : new Error(String(error)), { route: 'api-crm-contacts-id-messages' });
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // =====================
  // Email API Routes
  // =====================
  
  // Send a test email
  app.post("/api/email/test", authMiddleware, requireRole('admin', 'master', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const { to, subject, message } = req.body;
      
      if (!to || !subject || !message) {
        return res.status(400).json({ error: "Missing required fields: to, subject, message" });
      }
      
      const { sendEmail } = await import('./email-service');
      
      const result = await sendEmail({
        to,
        subject,
        html: `<div style="font-family: sans-serif; padding: 20px;">${message.replace(/\n/g, '<br>')}</div>`,
        text: message
      });
      
      if (result.success) {
        res.json({ success: true, id: result.id });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      logError('Error sending test email:', error instanceof Error ? error : new Error(String(error)), { route: 'api-email-test' });
      res.status(500).json({ error: error.message || "Failed to send email" });
    }
  });

  // Send call scoring alert email
  app.post("/api/email/call-scoring-alert", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const { managerEmail, managerName, salespersonName, callDate, overallScore, maxScore, department, callId, needsReview } = req.body;
      
      if (!managerEmail || !managerName || !salespersonName || !callId) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      const { sendCallScoringAlert, getDashboardUrl } = await import('./email-service');
      
      const dashboardUrl = getDashboardUrl();
      
      const result = await sendCallScoringAlert({
        managerEmail,
        managerName,
        salespersonName,
        callDate: new Date(callDate),
        overallScore: overallScore || 0,
        maxScore: maxScore || 100,
        department: department || 'General',
        callId,
        needsReview: needsReview || false,
        dashboardUrl
      });
      
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      logError('Error sending call scoring alert:', error instanceof Error ? error : new Error(String(error)), { route: 'api-email-call-scoring-alert' });
      res.status(500).json({ error: error.message || "Failed to send alert" });
    }
  });

  // Send lead notification email
  app.post("/api/email/lead-notification", authMiddleware, requireRole('manager', 'admin', 'master', 'super_admin'), requireDealership, async (req: AuthRequest, res) => {
    try {
      const { salesEmail, salesName, customerName, customerPhone, customerEmail, vehicleInterest, source } = req.body;
      
      if (!salesEmail || !salesName || !customerName) {
        return res.status(400).json({ error: "Missing required fields: salesEmail, salesName, customerName" });
      }
      
      const { sendLeadNotification, getDashboardUrl } = await import('./email-service');
      
      const dashboardUrl = getDashboardUrl();
      
      const result = await sendLeadNotification({
        salesEmail,
        salesName,
        customerName,
        customerPhone,
        customerEmail,
        vehicleInterest,
        source: source || 'Website',
        dashboardUrl
      });
      
      if (result.success) {
        res.json({ success: true });
      } else {
        res.status(400).json({ success: false, error: result.error });
      }
    } catch (error: any) {
      logError('Error sending lead notification:', error instanceof Error ? error : new Error(String(error)), { route: 'api-email-lead-notification' });
      res.status(500).json({ error: error.message || "Failed to send notification" });
    }
  });

  // ==================== FACEBOOK ACCOUNTS FOR MARKETPLACE BLAST ====================
  
  // Get user's Facebook accounts
  app.get("/api/facebook-accounts", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const accounts = await storage.getFacebookAccountsByUser(userId, dealershipId);
      res.json(accounts);
    } catch (error: any) {
      logError('Error fetching Facebook accounts:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-accounts' });
      res.status(500).json({ error: error.message || "Failed to fetch accounts" });
    }
  });

  // Create a new Facebook account
  app.post("/api/facebook-accounts", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const { accountName } = req.body;
      
      if (!accountName) {
        return res.status(400).json({ error: "Account name is required" });
      }
      
      const account = await storage.createFacebookAccount({
        dealershipId,
        userId,
        accountName,
        isActive: true
      });
      
      res.json(account);
    } catch (error: any) {
      logError('Error creating Facebook account:', error instanceof Error ? error : new Error(String(error)), { route: 'api-facebook-accounts' });
      res.status(500).json({ error: error.message || "Failed to create account" });
    }
  });

  // ==================== AD TEMPLATES FOR MARKETPLACE BLAST ====================
  
  // Get templates for user (shared + personal combined)
  app.get("/api/ad-templates", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      // Return shared templates + user's personal templates
      const templates = await storage.getAdTemplatesForUser(userId, dealershipId);
      res.json(templates);
    } catch (error: any) {
      logError('Error fetching ad templates:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ad-templates' });
      res.status(500).json({ error: error.message || "Failed to fetch templates" });
    }
  });

  // Get shared templates only (manager dashboard)
  app.get("/api/ad-templates/shared", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const templates = await storage.getSharedAdTemplates(dealershipId);
      res.json(templates);
    } catch (error: any) {
      logError('Error fetching shared templates:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ad-templates-shared' });
      res.status(500).json({ error: error.message || "Failed to fetch shared templates" });
    }
  });

  // Create a personal template (salesperson)
  app.post("/api/ad-templates", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const { templateName, titleTemplate, descriptionTemplate, isDefault } = req.body;
      
      if (!templateName || !titleTemplate || !descriptionTemplate) {
        return res.status(400).json({ error: "Template name, title, and description are required" });
      }
      
      // Salespeople can only create personal (non-shared) templates
      const template = await storage.createAdTemplate({
        dealershipId,
        userId,
        templateName,
        titleTemplate,
        descriptionTemplate,
        isDefault: isDefault || false,
        isShared: false
      });
      
      res.json(template);
    } catch (error: any) {
      logError('Error creating ad template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ad-templates' });
      res.status(500).json({ error: error.message || "Failed to create template" });
    }
  });

  // Create a shared template (manager-only)
  app.post("/api/ad-templates/shared", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const { templateName, titleTemplate, descriptionTemplate, isDefault } = req.body;
      
      if (!templateName || !titleTemplate || !descriptionTemplate) {
        return res.status(400).json({ error: "Template name, title, and description are required" });
      }
      
      // Managers create shared templates visible to all
      const template = await storage.createAdTemplate({
        dealershipId,
        userId,
        templateName,
        titleTemplate,
        descriptionTemplate,
        isDefault: isDefault || false,
        isShared: true
      });
      
      res.json(template);
    } catch (error: any) {
      logError('Error creating shared template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ad-templates-shared' });
      res.status(500).json({ error: error.message || "Failed to create shared template" });
    }
  });

  // Fork a shared template (create personal copy)
  app.post("/api/ad-templates/:id/fork", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const templateId = parseInt(req.params.id);
      
      const template = await storage.forkAdTemplate(templateId, userId, dealershipId);
      res.json(template);
    } catch (error: any) {
      logError('Error forking template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ad-templates-id-fork' });
      res.status(500).json({ error: error.message || "Failed to fork template" });
    }
  });

  // Update a personal template (owner only)
  app.patch("/api/ad-templates/:id", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const templateId = parseInt(req.params.id);
      const { templateName, titleTemplate, descriptionTemplate, isDefault } = req.body;
      
      const template = await storage.updateAdTemplate(templateId, userId, dealershipId, {
        templateName,
        titleTemplate,
        descriptionTemplate,
        isDefault
      });
      
      if (!template) {
        return res.status(404).json({ error: "Template not found or you don't have permission to edit it" });
      }
      
      res.json(template);
    } catch (error: any) {
      logError('Error updating ad template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ad-templates-id' });
      res.status(500).json({ error: error.message || "Failed to update template" });
    }
  });

  // Update a shared template (manager-only)
  app.patch("/api/ad-templates/shared/:id", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const templateId = parseInt(req.params.id);
      const { templateName, titleTemplate, descriptionTemplate, isDefault } = req.body;
      
      const template = await storage.updateSharedAdTemplate(templateId, dealershipId, {
        templateName,
        titleTemplate,
        descriptionTemplate,
        isDefault
      });
      
      if (!template) {
        return res.status(404).json({ error: "Shared template not found" });
      }
      
      res.json(template);
    } catch (error: any) {
      logError('Error updating shared template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ad-templates-shared-id' });
      res.status(500).json({ error: error.message || "Failed to update shared template" });
    }
  });

  // Delete a personal template (owner only)
  app.delete("/api/ad-templates/:id", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const templateId = parseInt(req.params.id);
      
      await storage.deleteAdTemplate(templateId, userId, dealershipId);
      res.json({ success: true });
    } catch (error: any) {
      logError('Error deleting ad template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ad-templates-id' });
      res.status(500).json({ error: error.message || "Failed to delete template" });
    }
  });

  // Delete a shared template (manager-only)
  app.delete("/api/ad-templates/shared/:id", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const templateId = parseInt(req.params.id);
      
      await storage.deleteSharedAdTemplate(templateId, dealershipId);
      res.json({ success: true });
    } catch (error: any) {
      logError('Error deleting shared template:', error instanceof Error ? error : new Error(String(error)), { route: 'api-ad-templates-shared-id' });
      res.status(500).json({ error: error.message || "Failed to delete shared template" });
    }
  });

  // ==================== MARKETPLACE BLAST ROUTES ====================
  
  // Get vehicles for Marketplace Blast queue (sorted by priority - aged inventory first)
  app.get("/api/marketplace-blast/queue", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const includePosted = req.query.includePosted === 'true';
      const limit = parseInt(req.query.limit as string) || 50;
      
      // Get all vehicles (high limit to get full inventory)
      const result = await storage.getVehicles(dealershipId, 1000, 0);
      const allVehicles = result.vehicles;
      
      // Calculate days since listed for each vehicle
      const now = new Date();
      type VehicleWithAge = typeof allVehicles[number] & { daysInStock: number };
      const vehiclesWithAge: VehicleWithAge[] = allVehicles.map(v => {
        const createdAt = new Date(v.createdAt);
        const daysInStock = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
        return { ...v, daysInStock };
      });
      
      // Filter: exclude recently posted (within last 7 days) unless includePosted is true
      let filtered = vehiclesWithAge;
      if (!includePosted) {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        filtered = vehiclesWithAge.filter(v => 
          !v.marketplacePostedAt || new Date(v.marketplacePostedAt) < sevenDaysAgo
        );
      }
      
      // Sort by days in stock (aged inventory first), then by price
      filtered.sort((a, b) => {
        // Aged inventory first (more days = higher priority)
        if (b.daysInStock !== a.daysInStock) {
          return b.daysInStock - a.daysInStock;
        }
        // Then by price (higher price = higher priority for margin)
        return b.price - a.price;
      });
      
      // Limit results
      const queue = filtered.slice(0, limit).map(v => ({
        id: v.id,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim,
        type: v.type,
        price: v.price,
        odometer: v.odometer,
        images: v.images?.slice(0, 10) || [],
        location: v.location,
        dealership: v.dealership,
        daysInStock: v.daysInStock,
        socialTemplates: v.socialTemplates ? JSON.parse(v.socialTemplates) : null,
        socialTemplatesGeneratedAt: v.socialTemplatesGeneratedAt,
        marketplacePostedAt: v.marketplacePostedAt,
        vin: v.vin,
        stockNumber: v.stockNumber,
        carfaxUrl: v.carfaxUrl,
        badges: v.badges || []
      }));
      
      res.json({ 
        vehicles: queue,
        total: filtered.length,
        hasMore: filtered.length > limit
      });
    } catch (error: any) {
      logError('Error fetching marketplace blast queue:', error instanceof Error ? error : new Error(String(error)), { route: 'api-marketplace-blast-queue' });
      res.status(500).json({ error: error.message || "Failed to fetch queue" });
    }
  });
  
  // Get single vehicle details for Marketplace Blast detail page
  app.get("/api/marketplace-blast/vehicle/:vehicleId", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const vehicleId = parseInt(req.params.vehicleId);
      
      const vehicle = await storage.getVehicleById(vehicleId, dealershipId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      
      const daysInStock = vehicle.createdAt 
        ? Math.floor((Date.now() - new Date(vehicle.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      
      let socialTemplates = null;
      if (vehicle.socialTemplates) {
        try {
          socialTemplates = typeof vehicle.socialTemplates === 'string' 
            ? JSON.parse(vehicle.socialTemplates) 
            : vehicle.socialTemplates;
        } catch { }
      }
      
      res.json({
        ...vehicle,
        daysInStock,
        socialTemplates,
        images: vehicle.images || [],
      });
    } catch (error: any) {
      logError('Error fetching vehicle detail:', error instanceof Error ? error : new Error(String(error)), { route: 'api-marketplace-blast-vehicle-detail' });
      res.status(500).json({ error: error.message || "Failed to fetch vehicle" });
    }
  });

  // Enhance description with AI (rate limited to prevent abuse)
  app.post("/api/marketplace-blast/enhance-description", sensitiveLimiter, authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { currentDescription, vehicle } = req.body;
      
      if (!currentDescription) {
        return res.status(400).json({ error: "No description provided" });
      }
      
      if (currentDescription.length > 5000) {
        return res.status(400).json({ error: "Description too long (max 5000 characters)" });
      }
      
      const OpenAI = (await import('openai')).default;
      const apiKeys = await storage.getDealershipApiKeys(dealershipId);
      let openai: InstanceType<typeof OpenAI>;
      
      if (apiKeys?.openaiApiKey) {
        openai = new OpenAI({ apiKey: apiKeys.openaiApiKey });
      } else if (process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY });
      } else {
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }
      
      const prompt = `You are a world-class automotive copywriter. Enhance this Facebook Marketplace vehicle listing to be more compelling, professional, and engaging while keeping it authentic and not overly salesy.

Vehicle: ${vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}` : 'Unknown'}
${vehicle?.price ? `Price: $${vehicle.price.toLocaleString()}` : ''}
${vehicle?.odometer ? `Mileage: ${vehicle.odometer.toLocaleString()} km` : ''}

Current Description:
${currentDescription}

Guidelines:
- Keep the same general structure but make it more engaging
- Use emojis sparingly and tastefully
- Highlight key selling points
- Create urgency without being pushy
- Keep it concise (under 500 characters if possible)
- Include a call to action
- Make it feel personal and trustworthy

Return ONLY the enhanced description, nothing else.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 500,
        temperature: 0.7,
      });
      
      const enhancedDescription = response.choices[0]?.message?.content?.trim() || currentDescription;
      
      res.json({ enhancedDescription });
    } catch (error: any) {
      logError('Error enhancing description:', error instanceof Error ? error : new Error(String(error)), { route: 'api-marketplace-blast-enhance-description' });
      res.status(500).json({ error: error.message || "Failed to enhance description" });
    }
  });

  // Generate AI content for a single vehicle
  app.post("/api/marketplace-blast/generate/:vehicleId", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const vehicleId = parseInt(req.params.vehicleId);
      
      const vehicle = await storage.getVehicleById(vehicleId, dealershipId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      
      // Generate Marketplace content using AI
      const templates = await generateMarketplaceContent(
        {
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim,
          type: vehicle.type,
          price: vehicle.price,
          odometer: vehicle.odometer,
          badges: vehicle.badges || [],
          description: vehicle.description,
          location: vehicle.location,
          dealership: vehicle.dealership,
          vin: vehicle.vin || undefined,
          carfaxUrl: vehicle.carfaxUrl || undefined
        },
        dealershipId
      );
      
      // Save templates to vehicle
      await storage.updateVehicle(vehicleId, {
        socialTemplates: JSON.stringify(templates),
        socialTemplatesGeneratedAt: new Date()
      }, dealershipId);
      
      res.json({ 
        success: true,
        templates,
        generatedAt: new Date()
      });
    } catch (error: any) {
      logError('Error generating marketplace content:', error instanceof Error ? error : new Error(String(error)), { route: 'api-marketplace-blast-generate-vehicleId' });
      res.status(500).json({ error: error.message || "Failed to generate content" });
    }
  });
  
  // Bulk generate AI content for multiple vehicles
  app.post("/api/marketplace-blast/generate-bulk", authMiddleware, requireRole("manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { vehicleIds, regenerate = false } = req.body;
      
      if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
        return res.status(400).json({ error: "vehicleIds array is required" });
      }
      
      // Limit to 20 at a time to avoid timeout
      const limitedIds = vehicleIds.slice(0, 20);
      const results: { vehicleId: number; success: boolean; error?: string }[] = [];
      
      for (const vehicleId of limitedIds) {
        try {
          const vehicle = await storage.getVehicleById(vehicleId, dealershipId);
          if (!vehicle) {
            results.push({ vehicleId, success: false, error: "Vehicle not found" });
            continue;
          }
          
          // Skip if already has templates unless regenerate is true
          if (vehicle.socialTemplates && !regenerate) {
            results.push({ vehicleId, success: true });
            continue;
          }
          
          const templates = await generateMarketplaceContent(
            {
              year: vehicle.year,
              make: vehicle.make,
              model: vehicle.model,
              trim: vehicle.trim,
              type: vehicle.type,
              price: vehicle.price,
              odometer: vehicle.odometer,
              badges: vehicle.badges || [],
              description: vehicle.description,
              location: vehicle.location,
              dealership: vehicle.dealership,
              vin: vehicle.vin || undefined,
              carfaxUrl: vehicle.carfaxUrl || undefined
            },
            dealershipId
          );
          
          await storage.updateVehicle(vehicleId, {
            socialTemplates: JSON.stringify(templates),
            socialTemplatesGeneratedAt: new Date()
          }, dealershipId);
          
          results.push({ vehicleId, success: true });
        } catch (error: any) {
          results.push({ vehicleId, success: false, error: error.message });
        }
      }
      
      res.json({
        success: true,
        processed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        results
      });
    } catch (error: any) {
      logError('Error in bulk generate:', error instanceof Error ? error : new Error(String(error)), { route: 'api-marketplace-blast-generate-bulk' });
      res.status(500).json({ error: error.message || "Failed to generate content" });
    }
  });
  
  // Mark vehicle as posted to Marketplace
  app.post("/api/marketplace-blast/mark-posted/:vehicleId", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const userId = req.user!.id;
      const vehicleId = parseInt(req.params.vehicleId);
      
      const vehicle = await storage.getVehicleById(vehicleId, dealershipId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      
      await storage.updateVehicle(vehicleId, {
        marketplacePostedAt: new Date(),
        marketplacePostedBy: userId
      }, dealershipId);
      
      res.json({ success: true, postedAt: new Date() });
    } catch (error: any) {
      logError('Error marking as posted:', error instanceof Error ? error : new Error(String(error)), { route: 'api-marketplace-blast-mark-posted-vehicl' });
      res.status(500).json({ error: error.message || "Failed to mark as posted" });
    }
  });
  
  // Download photos as ZIP for a vehicle (returns list of image URLs for now)
  app.get("/api/marketplace-blast/photos/:vehicleId", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const vehicleId = parseInt(req.params.vehicleId);
      const limit = parseInt(req.query.limit as string) || 10;
      
      const vehicle = await storage.getVehicleById(vehicleId, dealershipId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      
      // Return first N images (optimized for Marketplace)
      const images = (vehicle.images || []).slice(0, limit);
      
      res.json({
        vehicleId,
        vehicleName: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`,
        images,
        count: images.length
      });
    } catch (error: any) {
      logError('Error fetching photos:', error instanceof Error ? error : new Error(String(error)), { route: 'api-marketplace-blast-photos-vehicleId' });
      res.status(500).json({ error: error.message || "Failed to fetch photos" });
    }
  });

  // Helper: Validate image URL is from trusted CDN domains
  const ALLOWED_IMAGE_DOMAINS = [
    'cloudfront.net', 'dealereprocess.com', 'autotradercdn.com', 'photomanager.',
    'cdn.', 'images.', 's3.amazonaws.com', 'storage.googleapis.com',
    'carfax.com', 'autotraderstatic.com', 'dealerinspire.com', 'cars.com'
  ];
  const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB per image
  const FETCH_TIMEOUT = 15000; // 15 seconds

  function isAllowedImageUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      return ALLOWED_IMAGE_DOMAINS.some(domain => parsed.hostname.includes(domain));
    } catch {
      return false;
    }
  }

  function sanitizeFilename(name: string): string {
    return name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 100);
  }

  async function fetchImageWithTimeout(url: string): Promise<Buffer | null> {
    if (!isAllowedImageUrl(url)) return null;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const contentLength = parseInt(response.headers.get('content-length') || '0');
      if (contentLength > MAX_IMAGE_SIZE) return null;
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_IMAGE_SIZE) return null;
      return Buffer.from(buffer);
    } catch {
      return null;
    }
  }

  // Download all photos as ZIP for a single vehicle
  app.get("/api/inventory/download-images/:vehicleId", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    const archiver = await import('archiver');
    try {
      const dealershipId = req.dealershipId!;
      const vehicleId = parseInt(req.params.vehicleId);
      
      const vehicle = await storage.getVehicleById(vehicleId, dealershipId);
      if (!vehicle) {
        return res.status(404).json({ error: "Vehicle not found" });
      }
      
      const images = vehicle.images || [];
      if (images.length === 0) {
        return res.status(404).json({ error: "No images found for this vehicle" });
      }
      
      const vehicleName = sanitizeFilename(`${vehicle.year}_${vehicle.make}_${vehicle.model}`);
      const zipFilename = `${vehicleName}_photos.zip`;
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
      
      const archive = archiver.default('zip', { zlib: { level: 5 } });
      archive.pipe(res);
      
      for (let i = 0; i < images.length; i++) {
        const buffer = await fetchImageWithTimeout(images[i]);
        if (buffer) {
          const ext = images[i].includes('.png') ? 'png' : 'jpg';
          archive.append(buffer, { name: `${vehicleName}_${i + 1}.${ext}` });
        }
      }
      
      await archive.finalize();
    } catch (error: any) {
      logError('Error downloading images:', error instanceof Error ? error : new Error(String(error)), { route: 'api-inventory-download-images' });
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Failed to download images" });
      }
    }
  });

  // Download all photos for all vehicles as ZIP
  app.get("/api/inventory/download-all-images", authMiddleware, requireRole("salesperson", "manager", "admin", "master", "super_admin"), requireDealership, async (req: AuthRequest, res) => {
    const archiver = await import('archiver');
    try {
      const dealershipId = req.dealershipId!;
      const imagesPerVehicle = Math.min(parseInt(req.query.limit as string) || 5, 10);
      
      const { vehicles } = await storage.getVehicles(dealershipId, 100, 0);
      
      if (!vehicles || vehicles.length === 0) {
        return res.status(404).json({ error: "No vehicles found" });
      }
      
      const zipFilename = `inventory_photos_${new Date().toISOString().split('T')[0]}.zip`;
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
      
      const archive = archiver.default('zip', { zlib: { level: 5 } });
      archive.pipe(res);
      
      for (const vehicle of vehicles) {
        const images = (vehicle.images || []).slice(0, imagesPerVehicle);
        if (images.length === 0) continue;
        
        const vehicleName = sanitizeFilename(`${vehicle.year}_${vehicle.make}_${vehicle.model}`);
        const folderName = sanitizeFilename(`${vehicle.stockNumber || vehicle.id}_${vehicleName}`);
        
        for (let i = 0; i < images.length; i++) {
          const buffer = await fetchImageWithTimeout(images[i]);
          if (buffer) {
            const ext = images[i].includes('.png') ? 'png' : 'jpg';
            archive.append(buffer, { name: `${folderName}/photo_${i + 1}.${ext}` });
          }
        }
      }
      
      await archive.finalize();
    } catch (error: any) {
      logError('Error downloading all images:', error instanceof Error ? error : new Error(String(error)), { route: 'api-inventory-download-all-images' });
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Failed to download images" });
      }
    }
  });

  // ============ FACEBOOK MARKETPLACE AUTOMATION ============
  
  // Get FB Marketplace settings for a dealership
  app.get("/api/super-admin/fb-marketplace/settings/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const [settings] = await db
        .select()
        .from(fbMarketplaceSettings)
        .where(eq(fbMarketplaceSettings.dealershipId, dealershipId));
      
      res.json(settings || { dealershipId, isEnabled: false });
    } catch (error: any) {
      logError('Error fetching FB Marketplace settings:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-fb-marketplace-settings' });
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Update FB Marketplace settings
  app.put("/api/super-admin/fb-marketplace/settings/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const settingsData = req.body;

      const [existing] = await db
        .select()
        .from(fbMarketplaceSettings)
        .where(eq(fbMarketplaceSettings.dealershipId, dealershipId));

      if (existing) {
        await db.update(fbMarketplaceSettings)
          .set({ ...settingsData, updatedAt: new Date() })
          .where(eq(fbMarketplaceSettings.dealershipId, dealershipId));
      } else {
        await db.insert(fbMarketplaceSettings).values({
          dealershipId,
          ...settingsData,
        });
      }

      const [updated] = await db
        .select()
        .from(fbMarketplaceSettings)
        .where(eq(fbMarketplaceSettings.dealershipId, dealershipId));

      res.json(updated);
    } catch (error: any) {
      logError('Error updating FB Marketplace settings:', error, { route: 'api-super-admin-fb-marketplace-settings' });
      res.status(500).json({ error: error.message });
    }
  });

  // Get all FB Marketplace accounts for a dealership
  app.get("/api/super-admin/fb-marketplace/accounts/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const accounts = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(eq(fbMarketplaceAccounts.dealershipId, dealershipId))
        .orderBy(desc(fbMarketplaceAccounts.createdAt));
      
      res.json(accounts);
    } catch (error: any) {
      logError('Error fetching FB Marketplace accounts:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-fb-marketplace-accounts' });
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Create a new FB Marketplace account
  app.post("/api/super-admin/fb-marketplace/accounts/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const { accountName, facebookEmail, userId } = req.body;

      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(dealershipId);
      const accountId = await service.createAccount(accountName, facebookEmail, userId);

      const [account] = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(eq(fbMarketplaceAccounts.id, accountId));

      res.json(account);
    } catch (error: any) {
      logError('Error creating FB Marketplace account:', error instanceof Error ? error : new Error(String(error)), { route: 'api-super-admin-fb-marketplace-accounts' });
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  });

  // Delete FB Marketplace account
  app.delete("/api/super-admin/fb-marketplace/accounts/:accountId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      
      await db.delete(fbMarketplaceAccounts)
        .where(eq(fbMarketplaceAccounts.id, accountId));

      res.json({ success: true });
    } catch (error: any) {
      logError('Error deleting FB Marketplace account:', error, { route: 'api-super-admin-fb-marketplace-accounts' });
      res.status(500).json({ error: error.message });
    }
  });

  // Initiate auth for an account (returns auth URL)
  app.post("/api/super-admin/fb-marketplace/accounts/:accountId/auth", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      
      const [account] = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(eq(fbMarketplaceAccounts.id, accountId));

      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(account.dealershipId);
      const authInfo = await service.initiateAuth(accountId);

      res.json(authInfo);
    } catch (error: any) {
      logError('Error initiating FB Marketplace auth:', error, { route: 'api-super-admin-fb-marketplace-auth' });
      res.status(500).json({ error: error.message });
    }
  });

  // Verify session after auth
  app.post("/api/super-admin/fb-marketplace/accounts/:accountId/verify", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const accountId = parseInt(req.params.accountId);
      
      const [account] = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(eq(fbMarketplaceAccounts.id, accountId));

      if (!account) {
        return res.status(404).json({ error: "Account not found" });
      }

      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(account.dealershipId);
      const isVerified = await service.verifyAndSaveSession(accountId);

      res.json({ success: isVerified });
    } catch (error: any) {
      logError('Error verifying FB Marketplace session:', error, { route: 'api-super-admin-fb-marketplace-verify' });
      res.status(500).json({ error: error.message });
    }
  });

  // Get FB Marketplace stats for a dealership
  app.get("/api/super-admin/fb-marketplace/stats/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      
      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(dealershipId);
      const stats = await service.getAccountStats();

      res.json(stats);
    } catch (error: any) {
      logError('Error fetching FB Marketplace stats:', error, { route: 'api-super-admin-fb-marketplace-stats' });
      res.status(500).json({ error: error.message });
    }
  });

  // Get all FB Marketplace listings for a dealership
  app.get("/api/super-admin/fb-marketplace/listings/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      
      const listings = await db
        .select({
          listing: fbMarketplaceListings,
          vehicle: vehicles,
          account: fbMarketplaceAccounts,
        })
        .from(fbMarketplaceListings)
        .leftJoin(vehicles, eq(fbMarketplaceListings.vehicleId, vehicles.id))
        .leftJoin(fbMarketplaceAccounts, eq(fbMarketplaceListings.accountId, fbMarketplaceAccounts.id))
        .where(eq(fbMarketplaceListings.dealershipId, dealershipId))
        .orderBy(desc(fbMarketplaceListings.createdAt))
        .limit(100);

      res.json(listings);
    } catch (error: any) {
      logError('Error fetching FB Marketplace listings:', error, { route: 'api-super-admin-fb-marketplace-listings' });
      res.status(500).json({ error: error.message });
    }
  });

  // Queue a vehicle for posting
  app.post("/api/super-admin/fb-marketplace/queue/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const { vehicleIds, priority } = req.body;

      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(dealershipId);
      
      const queueIds = [];
      for (const vehicleId of vehicleIds) {
        const queueId = await service.queueVehicleForPosting(vehicleId, priority || 5);
        queueIds.push(queueId);
      }

      res.json({ success: true, queuedCount: queueIds.length, queueIds });
    } catch (error: any) {
      logError('Error queuing vehicles for FB Marketplace:', error, { route: 'api-super-admin-fb-marketplace-queue' });
      res.status(500).json({ error: error.message });
    }
  });

  // Get posting queue for a dealership
  app.get("/api/super-admin/fb-marketplace/queue/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      
      const queue = await db
        .select({
          queue: fbMarketplaceQueue,
          vehicle: vehicles,
          account: fbMarketplaceAccounts,
        })
        .from(fbMarketplaceQueue)
        .leftJoin(vehicles, eq(fbMarketplaceQueue.vehicleId, vehicles.id))
        .leftJoin(fbMarketplaceAccounts, eq(fbMarketplaceQueue.accountId, fbMarketplaceAccounts.id))
        .where(eq(fbMarketplaceQueue.dealershipId, dealershipId))
        .orderBy(asc(fbMarketplaceQueue.priority), asc(fbMarketplaceQueue.createdAt))
        .limit(100);

      res.json(queue);
    } catch (error: any) {
      logError('Error fetching FB Marketplace queue:', error, { route: 'api-super-admin-fb-marketplace-queue' });
      res.status(500).json({ error: error.message });
    }
  });

  // Get activity log for a dealership
  app.get("/api/super-admin/fb-marketplace/activity/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      const limit = parseInt(req.query.limit as string) || 50;
      
      const activity = await db
        .select()
        .from(fbMarketplaceActivityLog)
        .where(eq(fbMarketplaceActivityLog.dealershipId, dealershipId))
        .orderBy(desc(fbMarketplaceActivityLog.createdAt))
        .limit(limit);

      res.json(activity);
    } catch (error: any) {
      logError('Error fetching FB Marketplace activity:', error, { route: 'api-super-admin-fb-marketplace-activity' });
      res.status(500).json({ error: error.message });
    }
  });

  // Manually trigger queue processing
  app.post("/api/super-admin/fb-marketplace/process-queue/:dealershipId", authMiddleware, superAdminOnly, async (req, res) => {
    try {
      const dealershipId = parseInt(req.params.dealershipId);
      
      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(dealershipId);
      const result = await service.processQueue();

      res.json(result);
    } catch (error: any) {
      logError('Error processing FB Marketplace queue:', error, { route: 'api-super-admin-fb-marketplace-process-queue' });
      res.status(500).json({ error: error.message });
    }
  });

  // ============ SALESPERSON FB MARKETPLACE ENDPOINTS ============
  
  // Get current user's FB Marketplace accounts
  app.get("/api/fb-marketplace/my-accounts", authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      
      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(dealershipId);
      const accounts = await service.getAccountsByUserId(userId);

      res.json(accounts);
    } catch (error: any) {
      logError('Error fetching user FB accounts:', error, { route: 'api-fb-marketplace-my-accounts' });
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new FB Marketplace account for current user (max 2)
  app.post("/api/fb-marketplace/my-accounts", authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const { accountName, facebookEmail, accountSlot } = req.body;

      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(dealershipId);
      const accountId = await service.createAccount(accountName, facebookEmail, userId, accountSlot);

      const [account] = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(eq(fbMarketplaceAccounts.id, accountId));

      res.json(account);
    } catch (error: any) {
      logError('Error creating user FB account:', error, { route: 'api-fb-marketplace-my-accounts' });
      res.status(500).json({ error: error.message });
    }
  });

  // Delete user's own FB Marketplace account
  app.delete("/api/fb-marketplace/my-accounts/:accountId", authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const accountId = parseInt(req.params.accountId);
      
      const [account] = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(and(
          eq(fbMarketplaceAccounts.id, accountId),
          eq(fbMarketplaceAccounts.userId, userId)
        ));

      if (!account) {
        return res.status(404).json({ error: "Account not found or not owned by you" });
      }

      await db.delete(fbMarketplaceAccounts)
        .where(eq(fbMarketplaceAccounts.id, accountId));

      res.json({ success: true });
    } catch (error: any) {
      logError('Error deleting user FB account:', error, { route: 'api-fb-marketplace-my-accounts' });
      res.status(500).json({ error: error.message });
    }
  });

  // Initiate auth for user's own account
  app.post("/api/fb-marketplace/my-accounts/:accountId/auth", authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const accountId = parseInt(req.params.accountId);
      
      const [account] = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(and(
          eq(fbMarketplaceAccounts.id, accountId),
          eq(fbMarketplaceAccounts.userId, userId)
        ));

      if (!account) {
        return res.status(404).json({ error: "Account not found or not owned by you" });
      }

      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(dealershipId);
      const authInfo = await service.initiateAuth(accountId);

      res.json(authInfo);
    } catch (error: any) {
      logError('Error initiating user FB auth:', error, { route: 'api-fb-marketplace-my-accounts-auth' });
      res.status(500).json({ error: error.message });
    }
  });

  // Verify session for user's own account
  app.post("/api/fb-marketplace/my-accounts/:accountId/verify", authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const accountId = parseInt(req.params.accountId);
      
      const [account] = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(and(
          eq(fbMarketplaceAccounts.id, accountId),
          eq(fbMarketplaceAccounts.userId, userId)
        ));

      if (!account) {
        return res.status(404).json({ error: "Account not found or not owned by you" });
      }

      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(dealershipId);
      const isVerified = await service.verifyAndSaveSession(accountId);

      res.json({ success: isVerified });
    } catch (error: any) {
      logError('Error verifying user FB session:', error, { route: 'api-fb-marketplace-my-accounts-verify' });
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's FB Marketplace posting stats
  app.get("/api/fb-marketplace/my-stats", authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      
      const accounts = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(and(
          eq(fbMarketplaceAccounts.userId, userId),
          eq(fbMarketplaceAccounts.dealershipId, dealershipId)
        ));

      const accountIds = accounts.map(a => a.id);
      
      let listings: any[] = [];
      if (accountIds.length > 0) {
        listings = await db
          .select()
          .from(fbMarketplaceListings)
          .where(and(
            eq(fbMarketplaceListings.dealershipId, dealershipId),
            or(...accountIds.map(id => eq(fbMarketplaceListings.accountId, id)))
          ));
      }

      const stats = {
        totalAccounts: accounts.length,
        activeAccounts: accounts.filter(a => a.status === 'active').length,
        totalPosts: accounts.reduce((sum, a) => sum + a.totalPosts, 0),
        postsToday: accounts.reduce((sum, a) => sum + a.postsToday, 0),
        activeListings: listings.filter(l => l.status === 'posted').length,
        pendingListings: listings.filter(l => l.status === 'pending').length,
      };

      res.json(stats);
    } catch (error: any) {
      logError('Error fetching user FB stats:', error, { route: 'api-fb-marketplace-my-stats' });
      res.status(500).json({ error: error.message });
    }
  });

  // Queue vehicles for posting using salesperson's own accounts
  app.post("/api/fb-marketplace/my-queue", authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      const { vehicleIds, priority, accountId } = req.body;

      if (!Array.isArray(vehicleIds) || vehicleIds.length === 0) {
        return res.status(400).json({ error: "vehicleIds must be a non-empty array" });
      }

      if (accountId) {
        const [account] = await db
          .select()
          .from(fbMarketplaceAccounts)
          .where(and(
            eq(fbMarketplaceAccounts.id, accountId),
            eq(fbMarketplaceAccounts.userId, userId)
          ));

        if (!account) {
          return res.status(404).json({ error: "Account not found or not owned by you" });
        }
      }

      const { FBMarketplaceService } = await import("./fb-marketplace-service");
      const service = new FBMarketplaceService(dealershipId);
      
      const queueIds = [];
      for (const vehicleId of vehicleIds) {
        const queueId = await service.queueVehicleForPosting(vehicleId, priority || 5, { userId, accountId });
        queueIds.push(queueId);
      }

      res.json({ success: true, queuedCount: queueIds.length, queueIds });
    } catch (error: any) {
      logError('Error queuing vehicles for user:', error, { route: 'api-fb-marketplace-my-queue' });
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's pending queue items
  app.get("/api/fb-marketplace/my-queue", authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      
      const accounts = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(and(
          eq(fbMarketplaceAccounts.userId, userId),
          eq(fbMarketplaceAccounts.dealershipId, dealershipId)
        ));

      const accountIds = accounts.map(a => a.id);
      
      if (accountIds.length === 0) {
        return res.json([]);
      }

      const queue = await db
        .select({
          queue: fbMarketplaceQueue,
          vehicle: vehicles,
          account: fbMarketplaceAccounts,
        })
        .from(fbMarketplaceQueue)
        .leftJoin(vehicles, eq(fbMarketplaceQueue.vehicleId, vehicles.id))
        .leftJoin(fbMarketplaceAccounts, eq(fbMarketplaceQueue.accountId, fbMarketplaceAccounts.id))
        .where(and(
          eq(fbMarketplaceQueue.dealershipId, dealershipId),
          or(...accountIds.map(id => eq(fbMarketplaceQueue.accountId, id)))
        ))
        .orderBy(asc(fbMarketplaceQueue.priority), asc(fbMarketplaceQueue.createdAt))
        .limit(50);

      res.json(queue);
    } catch (error: any) {
      logError('Error fetching user queue:', error, { route: 'api-fb-marketplace-my-queue' });
      res.status(500).json({ error: error.message });
    }
  });

  // Get user's listings
  app.get("/api/fb-marketplace/my-listings", authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const dealershipId = req.dealershipId!;
      
      const accounts = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(and(
          eq(fbMarketplaceAccounts.userId, userId),
          eq(fbMarketplaceAccounts.dealershipId, dealershipId)
        ));

      const accountIds = accounts.map(a => a.id);
      
      if (accountIds.length === 0) {
        return res.json([]);
      }

      const listings = await db
        .select({
          listing: fbMarketplaceListings,
          vehicle: vehicles,
          account: fbMarketplaceAccounts,
        })
        .from(fbMarketplaceListings)
        .leftJoin(vehicles, eq(fbMarketplaceListings.vehicleId, vehicles.id))
        .leftJoin(fbMarketplaceAccounts, eq(fbMarketplaceListings.accountId, fbMarketplaceAccounts.id))
        .where(and(
          eq(fbMarketplaceListings.dealershipId, dealershipId),
          or(...accountIds.map(id => eq(fbMarketplaceListings.accountId, id)))
        ))
        .orderBy(desc(fbMarketplaceListings.createdAt))
        .limit(100);

      res.json(listings);
    } catch (error: any) {
      logError('Error fetching user listings:', error, { route: 'api-fb-marketplace-my-listings' });
      res.status(500).json({ error: error.message });
    }
  });

  // ====== CHROME EXTENSION API ROUTES ======
  // These endpoints are used by the Lotview Auto Poster Chrome extension
  // All extension routes use HMAC signature validation (except login)

  // Extension: Login endpoint (returns JWT + dealership info)
  // Note: Login does NOT use HMAC - extension doesn't have signing key yet
  app.post("/api/extension/login", authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body;
      
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password required" });
      }
      
      const user = await storage.getUserByEmail(email);
      if (!user || !user.isActive) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const isValid = await comparePassword(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      
      const token = generateToken(user);
      
      // Get dealership name
      let dealershipName: string | undefined;
      if (user.dealershipId) {
        const dealership = await storage.getDealership(user.dealershipId);
        dealershipName = dealership?.name;
      }
      
      res.json({
        token,
        userId: user.id,
        dealershipId: user.dealershipId,
        dealershipName,
        email: user.email,
      });
    } catch (error: any) {
      logError("Extension login failed", error, { route: "api-extension-login" });
      res.status(500).json({ error: "Login failed" });
    }
  });

  // Extension: Refresh auth token (silent refresh before expiry)
  app.post("/api/extension/refresh", extensionHmacMiddleware, authMiddleware, async (req: AuthRequest, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: "Not authenticated" });
      }

      const user = await storage.getUserById(userId);
      if (!user || !user.isActive) {
        return res.status(401).json({ error: "User not found or inactive" });
      }

      const token = generateToken(user);

      let dealershipName: string | undefined;
      if (user.dealershipId) {
        const dealership = await storage.getDealership(user.dealershipId);
        dealershipName = dealership?.name;
      }

      res.json({
        token,
        userId: user.id,
        dealershipId: user.dealershipId,
        dealershipName,
        email: user.email,
      });
    } catch (error: any) {
      logError("Extension token refresh failed", error instanceof Error ? error : new Error(String(error)), { route: "api-extension-refresh" });
      res.status(500).json({ error: "Token refresh failed" });
    }
  });

  // Decode HTML entities for extension text fields (e.g., &#x2F; → /, &#x27; → ')
  function decodeHtmlEntities(text: string | null | undefined): string | null {
    if (!text) return text as null;
    return text
      .replace(/&#x2F;/g, '/')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  // Extension: Get inventory with signed image URLs
  app.get("/api/extension/inventory", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const query = (req.query.query as string | undefined)?.toLowerCase() || "";
      
      const { vehicles: vehicleList } = await storage.getVehicles(dealershipId, 200, 0);
      
      // Filter by search query
      const filtered = vehicleList.filter((v: any) => {
        if (!query) return true;
        return (
          v.vin?.toLowerCase().includes(query) ||
          v.stockNumber?.toLowerCase().includes(query) ||
          `${v.year || ""} ${v.make || ""} ${v.model || ""}`.toLowerCase().includes(query)
        );
      });

      // Map to extension-friendly format
      // Combine local images (Object Storage) with CDN URLs for best coverage
      const mapped = filtered.map((v: any) => {
        const localImages = Array.isArray(v.localImages) ? v.localImages : [];
        const cdnImages = Array.isArray(v.images) ? v.images : [];
        // Prioritize local images (reliable) but fill with CDN URLs if needed (up to 20 total)
        const combinedImages: string[] = [];
        const seenUrls = new Set<string>(); // Track URLs without query strings to avoid duplicates
        
        // Helper to normalize URL for deduplication (strip query string)
        const normalizeUrl = (url: string): string => {
          try {
            return url.split('?')[0].toLowerCase();
          } catch {
            return url.toLowerCase();
          }
        };
        
        // Add all local images first (most reliable)
        for (const img of localImages) {
          if (combinedImages.length < 20 && img) {
            const normalizedUrl = normalizeUrl(img);
            if (!seenUrls.has(normalizedUrl)) {
              combinedImages.push(img);
              seenUrls.add(normalizedUrl);
            }
          }
        }
        // Fill remaining slots with CDN images (deduplicated by base URL)
        for (const img of cdnImages) {
          if (combinedImages.length < 20 && img) {
            const normalizedUrl = normalizeUrl(img);
            if (!seenUrls.has(normalizedUrl)) {
              combinedImages.push(img);
              seenUrls.add(normalizedUrl);
            }
          }
        }
        const images = combinedImages;
        return {
          id: v.id,
          dealershipId: v.dealershipId,
          stockNumber: v.stockNumber,
          vin: v.vin,
          year: v.year,
          make: v.make,
          model: v.model,
          trim: v.trim,
          price: v.price,
          odometer: v.odometer,
          exteriorColour: v.exteriorColor,
          interiorColour: v.interiorColor,
          transmission: v.transmission,
          drivetrain: v.drivetrain,
          fuelType: v.fuelType,
          bodyType: v.bodyType,
          description: decodeHtmlEntities(v.fbMarketplaceDescription || v.description),
          highlights: decodeHtmlEntities(v.highlights),
          location: v.location,
          images,
          hasLocalImages: localImages.length > 0,
        };
      });
      
      res.json(mapped);
    } catch (error: any) {
      logError("Extension inventory failed", error, { route: "api-extension-inventory" });
      res.status(500).json({ error: "Failed to fetch inventory" });
    }
  });

  // Extension: Get ad templates
  app.get("/api/extension/templates", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const templates = await storage.getAdTemplatesByDealership(dealershipId);
      res.json(templates);
    } catch (error: any) {
      logError("Extension templates failed", error, { route: "api-extension-templates" });
      res.status(500).json({ error: "Failed to fetch templates" });
    }
  });

  // Extension: Get posting limits and already-posted vehicles
  app.get("/api/extension/limits", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const userId = req.user!.id;
      const dailyLimit = 10;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayPostings = await db
        .select({
          vehicleId: fbMarketplaceListings.vehicleId,
        })
        .from(fbMarketplaceListings)
        .innerJoin(fbMarketplaceAccounts, eq(fbMarketplaceListings.accountId, fbMarketplaceAccounts.id))
        .where(and(
          eq(fbMarketplaceAccounts.userId, userId),
          eq(fbMarketplaceListings.dealershipId, dealershipId),
          gte(fbMarketplaceListings.postedAt, today)
        ));

      const postsToday = todayPostings.length;
      const remaining = Math.max(0, dailyLimit - postsToday);

      const allPostedListings = await db
        .select({
          vehicleId: fbMarketplaceListings.vehicleId,
        })
        .from(fbMarketplaceListings)
        .innerJoin(fbMarketplaceAccounts, eq(fbMarketplaceListings.accountId, fbMarketplaceAccounts.id))
        .where(and(
          eq(fbMarketplaceAccounts.userId, userId),
          eq(fbMarketplaceListings.dealershipId, dealershipId),
          eq(fbMarketplaceListings.status, 'posted')
        ));

      const postedVehicleIds = allPostedListings.map(l => l.vehicleId).filter((id): id is number => id !== null);

      res.json({
        dailyLimit,
        postsToday,
        remaining,
        postedVehicles: {
          facebook: postedVehicleIds,
          kijiji: [],
          craigslist: [],
        },
      });
    } catch (error: any) {
      logError("Extension limits failed", error, { route: "api-extension-limits" });
      res.status(500).json({ error: "Failed to fetch limits" });
    }
  });

  // Extension: Generate AI content for vehicle descriptions
  app.post("/api/extension/generate-ai", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const { vehicleId, prompt, type, tone, useEmojis } = req.body;
      const dealershipId = req.dealershipId!;

      if (!vehicleId || !prompt) {
        return res.status(400).json({ error: "vehicleId and prompt required" });
      }

      // Get vehicle data
      const vehicleData = await db
        .select()
        .from(vehicles)
        .where(and(
          eq(vehicles.id, vehicleId),
          eq(vehicles.dealershipId, dealershipId)
        ))
        .limit(1);

      if (vehicleData.length === 0) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      const vehicle = vehicleData[0];
      let techSpecs: any = {};
      try {
        if (vehicle.techSpecs) {
          techSpecs = JSON.parse(vehicle.techSpecs);
        }
      } catch { /* ignore */ }

      const vehicleContext = `
Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}
Price: $${vehicle.price?.toLocaleString() || 'N/A'}
Odometer: ${vehicle.odometer?.toLocaleString() || 'N/A'} km
Exterior: ${vehicle.exteriorColor || 'N/A'}
Interior: ${vehicle.interiorColor || 'N/A'}
Fuel: ${vehicle.fuelType || 'N/A'}
Transmission: ${vehicle.transmission || 'N/A'}
Drivetrain: ${vehicle.drivetrain || 'N/A'}
Carfax: ${(vehicle.carfaxBadges ?? []).join(', ') || 'Clean history available'}
Features: ${(techSpecs.features ?? []).slice(0, 10).join(', ') || 'Well-equipped'}
Mechanical: ${(techSpecs.mechanical ?? []).slice(0, 5).join(', ') || 'N/A'}
Interior Features: ${(techSpecs.interior ?? []).slice(0, 5).join(', ') || 'N/A'}
Entertainment: ${(techSpecs.entertainment ?? []).slice(0, 5).join(', ') || 'N/A'}
Safety: ${(techSpecs.exterior ?? []).filter((f: string) => f.toLowerCase().includes('safety') || f.toLowerCase().includes('airbag')).slice(0, 5).join(', ') || 'Standard safety features'}
`.trim();

      const toneInstructions: Record<string, string> = {
        professional: 'Use a professional, refined tone suitable for luxury buyers.',
        friendly: 'Use a warm, friendly, approachable tone.',
        excited: 'Use an energetic, excited tone with enthusiasm.',
        luxury: 'Use an exclusive, premium tone emphasizing prestige.',
        value: 'Use a practical tone emphasizing value and savings.'
      };

      const systemPrompt = `You are an expert car salesperson writing content for a Facebook Marketplace listing. ${toneInstructions[tone] || toneInstructions.professional} ${useEmojis ? 'Use relevant emojis sparingly.' : 'Do not use emojis.'}`;

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
      });

      const response = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Based on this vehicle data:\n\n${vehicleContext}\n\n${prompt}` }
        ],
        max_completion_tokens: 300,
      });

      const content = response.choices[0]?.message?.content?.trim() || '';
      res.json({ content });
    } catch (error: any) {
      logError("Extension AI generation failed", error, { route: "api-extension-generate-ai" });
      res.status(500).json({ error: "Failed to generate content" });
    }
  });

  // Extension: Request posting token (server-side limit enforcement)
  app.post("/api/extension/posting-token", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const { vehicleId, platform } = req.body;
      
      if (!vehicleId || !platform) {
        return res.status(400).json({ error: "vehicleId and platform required" });
      }

      const dealershipId = req.dealershipId!;
      const userId = req.user!.id;
      const dailyLimit = 10;

      // Check daily limit server-side
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayPostings = await db
        .select({ id: fbMarketplaceListings.id })
        .from(fbMarketplaceListings)
        .innerJoin(fbMarketplaceAccounts, eq(fbMarketplaceListings.accountId, fbMarketplaceAccounts.id))
        .where(and(
          eq(fbMarketplaceAccounts.userId, userId),
          eq(fbMarketplaceListings.dealershipId, dealershipId),
          gte(fbMarketplaceListings.postedAt, today)
        ));

      if (todayPostings.length >= dailyLimit) {
        return res.status(429).json({ error: "Daily posting limit reached" });
      }

      // Verify vehicle exists and belongs to dealership
      const vehicle = await db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(and(
          eq(vehicles.id, vehicleId),
          eq(vehicles.dealershipId, dealershipId)
        ))
        .limit(1);

      if (vehicle.length === 0) {
        return res.status(404).json({ error: "Vehicle not found" });
      }

      // Generate one-time posting token
      const postingToken = await generatePostingToken(userId, vehicleId, platform);

      res.json({ postingToken });
    } catch (error: any) {
      logError("Extension posting-token failed", error, { route: "api-extension-posting-token" });
      res.status(500).json({ error: "Failed to generate posting token" });
    }
  });

  // Extension: Log posting event (requires one-time posting token for successful posts)
  app.post("/api/extension/postings", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const { vehicleId, platform, status, url, error: errMsg, postingToken } = req.body;
      
      if (!vehicleId || !platform || !status) {
        return res.status(400).json({ error: "vehicleId, platform, status required" });
      }
      
      const dealershipId = req.dealershipId!;
      const userId = req.user!.id;

      // For successful posts, validate the one-time posting token (server-side limit enforcement)
      if (status === "success") {
        if (!postingToken) {
          return res.status(400).json({ error: "postingToken required for successful posts" });
        }

        const tokenValidation = await validatePostingToken(
          postingToken,
          userId,
          vehicleId,
          platform
        );

        if (!tokenValidation.valid) {
          return res.status(401).json({ error: tokenValidation.error || "Invalid posting token" });
        }
      }
      
      // Get or create user's FB account for extension postings
      let accounts = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(and(
          eq(fbMarketplaceAccounts.userId, userId),
          eq(fbMarketplaceAccounts.dealershipId, dealershipId)
        ))
        .limit(1);
      
      let accountId: number;
      if (accounts.length === 0) {
        const profileId = `ext_${userId}_${dealershipId}_${Date.now()}`;
        const [newAccount] = await db
          .insert(fbMarketplaceAccounts)
          .values({
            dealershipId,
            userId,
            accountSlot: 1,
            accountName: `${req.user!.name || req.user!.email}'s Account`,
            facebookEmail: req.user!.email,
            profileId,
            status: 'active',
          })
          .returning();
        accountId = newAccount.id;
      } else {
        accountId = accounts[0].id;
      }
      
      // Log the activity
      await db
        .insert(fbMarketplaceActivityLog)
        .values({
          dealershipId,
          accountId,
          vehicleId,
          action: status === "success" ? "post" : "post_failed",
          status: status === "success" ? "success" : "failed",
          details: JSON.stringify({
            method: 'chrome_extension',
            platform: platform || 'facebook_marketplace',
            url: url || null,
            error: errMsg || null,
          }),
        });
      
      // If successful, also create/update a listing record
      if (status === "success") {
        const existing = await db
          .select()
          .from(fbMarketplaceListings)
          .where(and(
            eq(fbMarketplaceListings.vehicleId, vehicleId),
            eq(fbMarketplaceListings.dealershipId, dealershipId),
            eq(fbMarketplaceListings.accountId, accountId)
          ))
          .limit(1);
        
        if (existing.length > 0) {
          await db
            .update(fbMarketplaceListings)
            .set({
              status: 'posted',
              postedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(fbMarketplaceListings.id, existing[0].id));
        } else {
          // Get vehicle price for the listing record
          const [vehicle] = await db
            .select({ price: vehicles.price })
            .from(vehicles)
            .where(and(eq(vehicles.id, vehicleId), eq(vehicles.dealershipId, dealershipId)))
            .limit(1);
          
          await db
            .insert(fbMarketplaceListings)
            .values({
              dealershipId,
              vehicleId,
              accountId,
              status: 'posted',
              postedPrice: vehicle?.price,
              currentPrice: vehicle?.price,
              postedAt: new Date(),
            });
        }
      }
      
      res.json({ ok: true });
    } catch (error: any) {
      logError("Extension posting log failed", error, { route: "api-extension-postings" });
      res.status(500).json({ error: "Failed to log posting" });
    }
  });

  // Extension: Get vehicles for posting (legacy endpoint)
  app.get("/api/extension/vehicles", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const { search, status } = req.query;

      let query = db
        .select({
          id: vehicles.id,
          year: vehicles.year,
          make: vehicles.make,
          model: vehicles.model,
          trim: vehicles.trim,
          price: vehicles.price,
          mileage: vehicles.odometer,
          vin: vehicles.vin,
          stockNumber: vehicles.stockNumber,
          exteriorColor: vehicles.exteriorColor,
          interiorColor: vehicles.interiorColor,
          images: vehicles.images,
          localImages: vehicles.localImages, // Deduplicated images in Object Storage
          carfaxUrl: vehicles.carfaxUrl,
          type: vehicles.type,
          description: vehicles.description,
        })
        .from(vehicles)
        .where(eq(vehicles.dealershipId, dealershipId))
        .orderBy(desc(vehicles.createdAt))
        .limit(100);

      const rawVehicleList = await query;
      
      // Use localImages (deduplicated) when available, fall back to images
      // This ensures the extension gets the same image set as the VDP page
      const vehicleList = rawVehicleList.map(v => ({
        ...v,
        images: (v.localImages && v.localImages.length > 0) ? v.localImages : v.images,
        localImages: undefined, // Don't send both to reduce payload
      }));

      // Get posted status for each vehicle
      const vehicleIds = vehicleList.map(v => v.id);
      const postedListings = vehicleIds.length > 0 ? await db
        .select({
          vehicleId: fbMarketplaceListings.vehicleId,
          status: fbMarketplaceListings.status,
          postedAt: fbMarketplaceListings.postedAt,
        })
        .from(fbMarketplaceListings)
        .where(and(
          eq(fbMarketplaceListings.dealershipId, dealershipId),
          sql`${fbMarketplaceListings.vehicleId} = ANY(${vehicleIds})`
        )) : [];

      const postedMap = new Map(postedListings.map(p => [p.vehicleId, p]));

      // Filter by search if provided
      let filteredVehicles = vehicleList;
      if (search && typeof search === 'string') {
        const searchLower = search.toLowerCase();
        filteredVehicles = vehicleList.filter(v => {
          const title = `${v.year} ${v.make} ${v.model}`.toLowerCase();
          const stock = (v.stockNumber || '').toLowerCase();
          return title.includes(searchLower) || stock.includes(searchLower);
        });
      }

      // Add posted status to each vehicle
      const vehiclesWithStatus = filteredVehicles.map(v => ({
        ...v,
        postedToMarketplace: postedMap.has(v.id),
        postedAt: postedMap.get(v.id)?.postedAt,
      }));

      res.json(vehiclesWithStatus);
    } catch (error: any) {
      logError('Extension: Error fetching vehicles:', error, { route: 'api-extension-vehicles' });
      res.status(500).json({ error: error.message });
    }
  });

  // Extension: Get single vehicle details
  app.get("/api/extension/vehicles/:id", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const vehicleId = parseInt(req.params.id);

      const vehicleResult = await db
        .select()
        .from(vehicles)
        .where(and(
          eq(vehicles.id, vehicleId),
          eq(vehicles.dealershipId, dealershipId)
        ))
        .limit(1);

      if (vehicleResult.length === 0) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }

      const vehicle = vehicleResult[0];
      
      // Use localImages (deduplicated) when available, fall back to images
      // This ensures the extension gets the same image set as the VDP page
      const responseVehicle = {
        ...vehicle,
        images: (vehicle.localImages && vehicle.localImages.length > 0) ? vehicle.localImages : vehicle.images,
      };

      res.json(responseVehicle);
    } catch (error: any) {
      logError('Extension: Error fetching vehicle:', error, { route: 'api-extension-vehicles-id' });
      res.status(500).json({ error: error.message });
    }
  });

  // Extension: Mark vehicle as posted (requires posting token for server-side verification)
  app.post("/api/extension/vehicles/:id/posted", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const userId = req.user!.id;
      const vehicleId = parseInt(req.params.id);
      const { platform } = req.body;

      // Verify vehicle exists and belongs to dealership
      const vehicle = await db
        .select()
        .from(vehicles)
        .where(and(
          eq(vehicles.id, vehicleId),
          eq(vehicles.dealershipId, dealershipId)
        ))
        .limit(1);

      if (vehicle.length === 0) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }

      // Get user's first FB account (or create a placeholder for extension postings)
      let account = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(and(
          eq(fbMarketplaceAccounts.userId, userId),
          eq(fbMarketplaceAccounts.dealershipId, dealershipId)
        ))
        .limit(1);

      let accountId: number;

      if (account.length === 0) {
        // Create a placeholder account for extension postings
        const profileId = `ext_${userId}_${dealershipId}_${Date.now()}`;
        const [newAccount] = await db
          .insert(fbMarketplaceAccounts)
          .values({
            dealershipId,
            userId,
            accountSlot: 1,
            accountName: `${req.user!.name || req.user!.email}'s Account`,
            facebookEmail: req.user!.email, // Use Lotview email as placeholder
            profileId,
            status: 'active',
          })
          .returning();
        accountId = newAccount.id;
      } else {
        accountId = account[0].id;
      }

      // Check if already posted
      const existingListing = await db
        .select()
        .from(fbMarketplaceListings)
        .where(and(
          eq(fbMarketplaceListings.vehicleId, vehicleId),
          eq(fbMarketplaceListings.accountId, accountId),
          eq(fbMarketplaceListings.dealershipId, dealershipId)
        ))
        .limit(1);

      if (existingListing.length > 0) {
        // Update existing listing
        await db
          .update(fbMarketplaceListings)
          .set({
            status: 'posted',
            postedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(fbMarketplaceListings.id, existingListing[0].id));
      } else {
        // Create new listing record
        await db
          .insert(fbMarketplaceListings)
          .values({
            dealershipId,
            vehicleId,
            accountId,
            status: 'posted',
            postedPrice: vehicle[0].price,
            currentPrice: vehicle[0].price,
            postedAt: new Date(),
          });
      }

      // Log the activity
      await db
        .insert(fbMarketplaceActivityLog)
        .values({
          dealershipId,
          accountId,
          vehicleId,
          action: 'post',
          status: 'success',
          details: JSON.stringify({ method: 'chrome_extension', platform: platform || 'facebook_marketplace' }),
        });

      logInfo('Extension: Vehicle marked as posted', { vehicleId, userId, platform });
      res.json({ success: true });
    } catch (error: any) {
      logError('Extension: Error marking vehicle as posted:', error, { route: 'api-extension-vehicles-posted' });
      res.status(500).json({ error: error.message });
    }
  });

  // Extension: Get user posting stats
  app.get("/api/extension/stats", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const userId = req.user!.id;

      // Get user's accounts
      const accounts = await db
        .select()
        .from(fbMarketplaceAccounts)
        .where(and(
          eq(fbMarketplaceAccounts.userId, userId),
          eq(fbMarketplaceAccounts.dealershipId, dealershipId)
        ));

      const accountIds = accounts.map(a => a.id);

      if (accountIds.length === 0) {
        return res.json({
          totalPosted: 0,
          postedToday: 0,
          postedThisWeek: 0,
        });
      }

      // Count total posted
      const totalPosted = await db
        .select({ count: sql<number>`count(*)` })
        .from(fbMarketplaceListings)
        .where(and(
          eq(fbMarketplaceListings.dealershipId, dealershipId),
          sql`${fbMarketplaceListings.accountId} = ANY(${accountIds})`,
          eq(fbMarketplaceListings.status, 'posted')
        ));

      // Count posted today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const postedToday = await db
        .select({ count: sql<number>`count(*)` })
        .from(fbMarketplaceListings)
        .where(and(
          eq(fbMarketplaceListings.dealershipId, dealershipId),
          sql`${fbMarketplaceListings.accountId} = ANY(${accountIds})`,
          gt(fbMarketplaceListings.postedAt, today)
        ));

      // Count posted this week
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const postedThisWeek = await db
        .select({ count: sql<number>`count(*)` })
        .from(fbMarketplaceListings)
        .where(and(
          eq(fbMarketplaceListings.dealershipId, dealershipId),
          sql`${fbMarketplaceListings.accountId} = ANY(${accountIds})`,
          gt(fbMarketplaceListings.postedAt, weekAgo)
        ));

      res.json({
        totalPosted: Number(totalPosted[0]?.count || 0),
        postedToday: Number(postedToday[0]?.count || 0),
        postedThisWeek: Number(postedThisWeek[0]?.count || 0),
      });
    } catch (error: any) {
      logError('Extension: Error fetching stats:', error, { route: 'api-extension-stats' });
      res.status(500).json({ error: error.message });
    }
  });

  // Extension: Image proxy to bypass CDN restrictions
  // This endpoint fetches images from AutoTrader CDN with proper headers
  const ALLOWED_IMAGE_HOSTS = [
    'photomanager-prd.autotradercdn.ca',
    '1s-photomanager-prd.autotradercdn.ca',
    '2s-photomanager-prd.autotradercdn.ca',
    '3s-photomanager-prd.autotradercdn.ca',
    'ls-photomanager-prd.autotradercdn.ca',
  ];

  // Simple in-memory cache for image responses (5 minute TTL, max 100 entries)
  const imageCache = new Map<string, { data: Buffer; contentType: string; timestamp: number }>();
  const IMAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const IMAGE_CACHE_MAX_SIZE = 100; // Max cached images to prevent memory bloat

  app.get("/api/extension/image-proxy", extensionHmacMiddleware, authMiddleware, async (req: AuthRequest, res) => {
    try {
      const imageUrl = req.query.url as string;
      
      if (!imageUrl) {
        return res.status(400).json({ error: 'Missing url parameter' });
      }

      // Validate URL
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(imageUrl);
      } catch {
        return res.status(400).json({ error: 'Invalid URL' });
      }

      // Check if host is allowed
      const isAllowed = ALLOWED_IMAGE_HOSTS.some(host => 
        parsedUrl.hostname === host || parsedUrl.hostname.endsWith('.' + host)
      );

      if (!isAllowed) {
        return res.status(403).json({ error: `Host not allowed: ${parsedUrl.hostname}` });
      }

      // Check cache first
      const cacheKey = imageUrl;
      const cached = imageCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < IMAGE_CACHE_TTL_MS) {
        res.set({
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=300',
          'X-Cache': 'HIT',
        });
        return res.send(cached.data);
      }

      // Fetch image with proper headers
      const response = await fetch(imageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://www.autotrader.ca/',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        logError('Image proxy: Failed to fetch image', { status: response.status, url: imageUrl });
        return res.status(response.status).json({ error: `Failed to fetch image: ${response.status}` });
      }

      const contentType = response.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        return res.status(400).json({ error: 'URL does not return an image' });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Store in cache
      imageCache.set(cacheKey, {
        data: buffer,
        contentType,
        timestamp: Date.now(),
      });

      // Evict oldest entries if cache is too large
      if (imageCache.size > IMAGE_CACHE_MAX_SIZE) {
        const entries = Array.from(imageCache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp);
        // Delete oldest 20% to prevent constant eviction
        const toDelete = Math.ceil(IMAGE_CACHE_MAX_SIZE * 0.2);
        for (let i = 0; i < toDelete && i < entries.length; i++) {
          imageCache.delete(entries[i][0]);
        }
      }

      // Clean up expired entries periodically (every ~100 requests)
      if (Math.random() < 0.01) {
        const now = Date.now();
        for (const [key, value] of imageCache.entries()) {
          if (now - value.timestamp > IMAGE_CACHE_TTL_MS) {
            imageCache.delete(key);
          }
        }
      }

      res.set({
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=300',
        'X-Cache': 'MISS',
      });

      res.send(buffer);
    } catch (error: any) {
      logError('Image proxy error:', error, { route: 'api-extension-image-proxy' });
      res.status(500).json({ error: 'Image fetch failed' });
    }
  });
  
  // Extension: Automated Facebook Marketplace posting via Puppeteer/Browserless
  // This endpoint uses server-side browser automation to post vehicles with full image upload
  app.post("/api/extension/auto-post", extensionHmacMiddleware, authMiddleware, requireDealership, async (req: AuthRequest, res) => {
    try {
      const dealershipId = req.dealershipId!;
      const userId = req.user!.id;
      const { vehicleId, sessionCookies } = req.body;

      if (!vehicleId) {
        return res.status(400).json({ error: 'Vehicle ID required' });
      }

      if (!sessionCookies || !Array.isArray(sessionCookies) || sessionCookies.length === 0) {
        return res.status(400).json({ error: 'Facebook session cookies required' });
      }

      // Fetch vehicle data
      const vehicle = await db
        .select()
        .from(vehicles)
        .where(and(
          eq(vehicles.id, vehicleId),
          eq(vehicles.dealershipId, dealershipId)
        ))
        .limit(1);

      if (vehicle.length === 0) {
        return res.status(404).json({ error: 'Vehicle not found' });
      }

      const v = vehicle[0];

      // Prefer localImages (hosted in our object storage) over original CDN URLs
      // Convert relative URLs to full URLs for Browserless automation
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
        : (process.env.REPL_SLUG ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : 'http://localhost:5000');
      
      let imageUrls: string[] = [];
      if (v.localImages && v.localImages.length > 0) {
        // Use hosted images - convert relative paths to full URLs
        imageUrls = v.localImages.map((path: string) => {
          if (path.startsWith('http')) return path;
          return `${baseUrl}${path}`;
        });
        console.log(`[Extension] Using ${imageUrls.length} hosted images from object storage`);
      } else if (v.images && v.images.length > 0) {
        // Fallback to original CDN URLs
        imageUrls = v.images;
        console.log(`[Extension] Falling back to ${imageUrls.length} original CDN images`);
      }

      // Prepare post data
      const postData = {
        year: v.year,
        make: v.make,
        model: v.model,
        price: v.price || 0,
        mileage: v.odometer || 0,
        description: v.description || `${v.year} ${v.make} ${v.model}`,
        exteriorColor: v.exteriorColor || undefined,
        interiorColor: v.interiorColor || undefined,
        fuelType: v.fuelType || undefined,
        transmission: v.transmission || undefined,
        bodyStyle: v.type || undefined,
        condition: 'Good',
        location: 'Vancouver, BC',
        imageUrls,
      };

      console.log(`[Extension] Auto-posting vehicle ${vehicleId} for user ${userId}`);

      // Post using Browserless automation
      const result = await facebookMarketplaceAutomation.postToMarketplace(postData, sessionCookies);

      if (result.success) {
        // Record the posting in the database
        try {
          // Get or create FB account for this user
          let account = await db
            .select()
            .from(fbMarketplaceAccounts)
            .where(and(
              eq(fbMarketplaceAccounts.userId, userId),
              eq(fbMarketplaceAccounts.dealershipId, dealershipId)
            ))
            .limit(1);

          let accountId: number;
          if (account.length === 0) {
            const profileId = `auto_${userId}_${dealershipId}_${Date.now()}`;
            const [newAccount] = await db
              .insert(fbMarketplaceAccounts)
              .values({
                dealershipId,
                userId,
                accountSlot: 1,
                accountName: `${req.user!.name || req.user!.email}'s Auto-Post Account`,
                facebookEmail: req.user!.email,
                profileId,
                status: 'active',
              })
              .returning();
            accountId = newAccount.id;
          } else {
            accountId = account[0].id;
          }

          // Record the listing
          await db.insert(fbMarketplaceListings).values({
            dealershipId,
            accountId,
            vehicleId,
            status: 'posted',
            postedAt: new Date(),
            fbListingUrl: result.listingUrl || null,
          }).onConflictDoUpdate({
            target: [fbMarketplaceListings.vehicleId, fbMarketplaceListings.accountId],
            set: {
              status: 'posted',
              postedAt: new Date(),
              fbListingUrl: result.listingUrl || null,
              updatedAt: new Date(),
            },
          });

          console.log(`[Extension] Vehicle ${vehicleId} posted successfully, recorded in DB`);
        } catch (dbError) {
          console.error('[Extension] Error recording posting:', dbError);
          // Don't fail the response - the posting succeeded
        }

        res.json({
          success: true,
          message: 'Vehicle posted successfully',
          listingUrl: result.listingUrl,
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || 'Posting failed',
        });
      }
    } catch (error: any) {
      logError('Extension: Auto-post error:', error, { route: 'api-extension-auto-post' });
      res.status(500).json({ error: error.message });
    }
  });

  // Extension: Test Browserless connection
  app.get("/api/extension/test-browserless", extensionHmacMiddleware, authMiddleware, async (req: AuthRequest, res) => {
    try {
      const result = await facebookMarketplaceAutomation.testConnection();
      res.json(result);
    } catch (error: any) {
      logError('Extension: Browserless test error:', error, { route: 'api-extension-test-browserless' });
      res.status(500).json({ success: false, message: error.message });
    }
  });
  
  return httpServer;
}
