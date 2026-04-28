/**
 * Auth Routes Module
 * Handles authentication: login, logout, password reset, staff invites.
 * Extracted from monolithic routes.ts to enable independent testing and maintenance.
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { db } from "../db";
import { storage } from "../storage";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { handleServiceUnavailable, logError } from "../error-utils";
import {
  authMiddleware,
  generateToken,
  comparePassword,
  hashPassword,
  type AuthRequest,
} from "../auth";
import { authLimiter, sensitiveLimiter } from "../middleware/http-rate-limiters";
import { isSafeE2ERequest, seedE2E } from "../e2e-test-mode";

const router = Router();

// Resolve user for login — checks across all dealerships if no tenant context
async function resolveLoginUser(email: string, dealershipId?: number | null) {
  if (dealershipId) {
    return await storage.getUserByEmailAndDealership(email, dealershipId);
  }
  return await storage.getUserByEmail(email);
}

function computeResetTokenLookupHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isDatabaseConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("ECONNREFUSED") || error.message.includes("Connection terminated");
}

// ---- Login ----
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await resolveLoginUser(email, (req as any).dealershipId);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: "Account is deactivated" });
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user);
    const { passwordHash, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword, success: true });
  } catch (error) {
    logError("Error during login:", error instanceof Error ? error : new Error(String(error)), { route: "api-auth-login" });
    if (isDatabaseConnectionError(error)) {
      return handleServiceUnavailable(res, "Authentication dependency unavailable");
    }
    res.status(500).json({ error: "Login failed" });
  }
});

// ---- Get current user ----
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    const user = await storage.getUserById(authReq.user!.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    const { passwordHash, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (error) {
    logError("Error fetching user:", error instanceof Error ? error : new Error(String(error)), { route: "api-auth-me" });
    res.status(500).json({ error: "Failed to fetch user info" });
  }
});

// ---- Logout ----
router.post("/logout", authMiddleware, async (req, res) => {
  try {
    const authReq = req as AuthRequest;
    console.log(`User ${authReq.user!.email} logged out at ${new Date().toISOString()}`);
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    logError("Error during logout:", error instanceof Error ? error : new Error(String(error)), { route: "api-auth-logout" });
    res.status(500).json({ error: "Logout failed" });
  }
});

// ---- Password Reset: Request ----
router.post("/forgot-password", sensitiveLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await resolveLoginUser(email, (req as any).dealershipId);

    // Always return success to prevent email enumeration attacks
    if (!user || !user.isActive) {
      console.log(`[Auth] Password reset requested for unknown email: ${email}`);
      return res.json({ success: true, message: "If that email exists, a reset link has been sent" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenLookupHash = computeResetTokenLookupHash(token);
    const tokenHash = await bcrypt.hash(token, 12);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await storage.createPasswordResetToken(user.id, tokenHash, expiresAt, tokenLookupHash);

    const { sendPasswordResetEmail } = await import("../email-service");
    const emailResult = await sendPasswordResetEmail({
      email: user.email,
      name: user.name,
      resetToken: token,
      expiresIn: "1 hour",
    });

    if (!emailResult.success) {
      console.error(`[Auth] Failed to send password reset email to ${email}:`, emailResult.error);
    }

    console.log(`[Auth] Password reset token created for user: ${user.email}`);
    res.json({ success: true, message: "If that email exists, a reset link has been sent" });
  } catch (error) {
    logError("Error requesting password reset:", error instanceof Error ? error : new Error(String(error)), { route: "api-auth-forgot-password" });
    res.status(500).json({ error: "Failed to process password reset request" });
  }
});

// ---- Password Reset: Validate token ----
router.get("/reset-password/:token", sensitiveLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 32) {
      return res.json({ valid: false });
    }

    const lookupHash = computeResetTokenLookupHash(token);
    const storedToken = await storage.getValidPasswordResetTokenByLookupHash(lookupHash);
    if (!storedToken) {
      return res.json({ valid: false });
    }

    const isMatch = await bcrypt.compare(token, storedToken.tokenHash);
    res.json({ valid: isMatch });
  } catch (error) {
    logError("Error validating reset token:", error instanceof Error ? error : new Error(String(error)), { route: "api-auth-reset-password-token" });
    res.json({ valid: false });
  }
});

// ---- Password Reset: Complete ----
router.post("/reset-password", sensitiveLimiter, async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== "string" || token.length < 32) {
      return res.status(400).json({ error: "Invalid reset token" });
    }

    if (!newPassword || newPassword.length < 12) {
      return res.status(400).json({ error: "Password must be at least 12 characters" });
    }

    const lookupHash = computeResetTokenLookupHash(token);
    const matchedToken = await storage.getValidPasswordResetTokenByLookupHash(lookupHash);
    if (!matchedToken) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const isMatch = await bcrypt.compare(token, matchedToken.tokenHash);
    if (!isMatch) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    const user = await storage.getUserById(matchedToken.userId);
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    const newPasswordHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    await storage.markPasswordResetTokenUsed(matchedToken.id);

    console.log(`[Auth] Password successfully reset for user: ${user.email}`);
    res.json({ success: true, message: "Password has been reset successfully" });
  } catch (error) {
    logError("Error resetting password:", error instanceof Error ? error : new Error(String(error)), { route: "api-auth-reset-password" });
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// ---- E2E Seed (development only) ----
router.post("/e2e/seed", async (req, res) => {
  try {
    if (!isSafeE2ERequest(req)) {
      return res.status(404).json({ error: "Not found" });
    }
    const seeded = await seedE2E();
    res.json({ success: true, ...seeded });
  } catch (error) {
    logError("[E2E] seed failed", error instanceof Error ? error : new Error(String(error)), { route: "api-e2e-seed" });
    res.status(500).json({ error: "E2E seed failed" });
  }
});

// ---- Staff Invites ----
router.get("/invites/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await storage.getStaffInviteByToken(token);

    if (!invite || invite.status !== "pending" || new Date() > invite.expiresAt) {
      return res.json({ valid: false, ...(invite?.status !== "pending" ? { alreadyAccepted: true } : {}), ...(new Date() > invite.expiresAt ? { expired: true } : {}) });
    }

    const dealership = await storage.getDealershipById(invite.dealershipId);
    res.json({
      valid: true,
      invite: {
        id: invite.id,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        dealershipName: dealership?.name || "Unknown Dealership",
        expiresAt: invite.expiresAt.toISOString(),
      },
    });
  } catch (error) {
    logError("Error validating invite:", error instanceof Error ? error : new Error(String(error)), { route: "api-invites-token" });
    res.status(500).json({ error: "Failed to validate invite" });
  }
});

router.post("/invites/:token/accept", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!password || password.length < 12) {
      return res.status(400).json({ error: "Password must be at least 12 characters" });
    }

    const invite = await storage.getStaffInviteByToken(token);
    if (!invite) return res.status(404).json({ error: "Invalid invite link" });
    if (invite.status !== "pending") return res.status(400).json({ error: "This invite has already been used" });
    if (new Date() > invite.expiresAt) return res.status(400).json({ error: "This invite has expired" });

    const existingUser = await storage.getUserByEmail(invite.email);
    if (existingUser) {
      return res.status(400).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(password);
    const user = await storage.createUser({
      email: invite.email,
      name: invite.name,
      passwordHash,
      role: invite.role,
      dealershipId: invite.dealershipId,
      isActive: true,
    });

    await storage.updateStaffInviteStatus(invite.id, "accepted");

    const authToken = generateToken(user);
    const { passwordHash: _, ...userWithoutPassword } = user;

    res.json({
      success: true,
      token: authToken,
      user: userWithoutPassword,
      message: "Account created successfully",
    });
  } catch (error) {
    logError("Error accepting invite:", error instanceof Error ? error : new Error(String(error)), { route: "api-invites-accept" });
    res.status(500).json({ error: "Failed to create account" });
  }
});

export default router;
