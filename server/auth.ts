import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { User } from "../shared/schema.ts";
import { hasRole } from "../shared/authz.ts";
import { getE2EUserFromToken, isSafeE2ERequest, seedE2E } from "./e2e-test-mode.ts";
import { hashPassword, comparePassword, computeHmac } from "./utils/crypto";
import { isNonceUsed, markNonceUsed, isPostingTokenUsed, markPostingTokenUsed } from "./services/redis";

// JWT_SECRET must be set in production for security (SESSION_SECRET accepted as alias)
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET (or SESSION_SECRET) environment variable is required in production");
}
// Development fallback
const SECRET = JWT_SECRET || "olympic-auto-jwt-dev-secret-DO-NOT-USE-IN-PRODUCTION";
const JWT_EXPIRES_IN = "1h";
const IMPERSONATION_JWT_EXPIRES_IN = "15m";

// JWT claims for security best practices
const JWT_ISSUER = "lotview.ai";
const JWT_AUDIENCE = "lotview-api";

export interface AuthRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: string;
    name: string;
    dealershipId?: number | null;
  };
}

export { hashPassword, comparePassword } from "./utils/crypto";

type AdditionalJwtClaims = Record<string, unknown>;

export function generateToken(user: User, additionalClaims: AdditionalJwtClaims = {}): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      dealershipId: user.dealershipId,
      ...additionalClaims,
    },
    SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

export function generateImpersonationToken(user: User, sessionId: number, superAdminId: number): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      dealershipId: user.dealershipId,
      impersonationSessionId: sessionId,
      impersonatedBy: superAdminId,
      isImpersonating: true,
    },
    SECRET,
    {
      expiresIn: IMPERSONATION_JWT_EXPIRES_IN,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    }
  );
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
  } catch (error) {
    return null;
  }
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  // E2E deterministic mode (LOCALHOST + NON-PROD ONLY)
  // Accept stable bearer tokens without JWT verification.
  if (isSafeE2ERequest(req) && authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const dealershipId = req.dealershipId || (await seedE2E()).dealershipId;
    const e2eUser = getE2EUserFromToken(token, dealershipId);
    if (e2eUser) {
      req.user = e2eUser;
      return next();
    }
  }
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // SECURITY: Verify user status in database to prevent stale token usage
  // This prevents inactive users or role-changed users from accessing protected routes
  try {
    // Use dynamic import to avoid circular dependency (storage.ts imports hashPassword from this file)
    const storageModule = await import("./storage");
    const user = await storageModule.storage.getUserById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ error: "Account is deactivated" });
    }
    
    // Update req.user with fresh data from database (prevents stale role/permissions)
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      dealershipId: user.dealershipId
    };
    
    next();
  } catch (error) {
    console.error("Error validating user:", error);
    return res.status(500).json({ error: "Authentication failed" });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!hasRole(req.user.role, ...(roles as Parameters<typeof hasRole>[1][]))) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
}

// ===== HMAC SIGNATURE VALIDATION FOR CHROME EXTENSION =====
// The extension signs requests with HMAC-SHA256 to prevent tampering.
// SECURITY FIX: HMAC is now ALWAYS required for extension endpoints,
// regardless of JWT presence. JWT verifies user identity; HMAC verifies
// the extension itself is genuine. Both are required for defense in depth.

const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
// REDIS FIX: Nonces now stored in Redis for cross-instance consistency.
// The in-memory nonceCache is kept as a fast-path local cache.
const localNonceCache = new Map<string, number>();

// Clean expired local nonces periodically
const nonceCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [nonce, timestamp] of localNonceCache.entries()) {
    if (now - timestamp > NONCE_EXPIRY_MS * 2) {
      localNonceCache.delete(nonce);
    }
  }
}, 60 * 1000);
nonceCleanupInterval.unref?.();

export async function extensionHmacMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // Skip HMAC for login (extension doesn't have signing key yet)
  if (req.path === "/api/extension/login") {
    return next();
  }

  // SECURITY: HMAC is always required for extension endpoints.
  // JWT alone is not sufficient — HMAC verifies extension authenticity.
  const timestamp = req.headers["x-timestamp"] as string | undefined;
  const nonce = req.headers["x-nonce"] as string | undefined;
  const signature = req.headers["x-signature"] as string | undefined;

  if (!timestamp || !nonce || !signature) {
    return res.status(400).json({ error: "Missing signature headers" });
  }

  // Validate timestamp (prevent replay attacks)
  const requestTime = parseInt(timestamp, 10);
  if (isNaN(requestTime)) {
    return res.status(400).json({ error: "Invalid timestamp" });
  }

  const now = Date.now();
  if (Math.abs(now - requestTime) > NONCE_EXPIRY_MS) {
    return res.status(401).json({ error: "Request expired" });
  }

  // Check nonce hasn't been used — Redis is authoritative, local cache is fast-path
  if (localNonceCache.has(nonce)) {
    return res.status(401).json({ error: "Nonce already used" });
  }
  const nonceExistsInRedis = await isNonceUsed(nonce);
  if (nonceExistsInRedis) {
    return res.status(401).json({ error: "Nonce already used" });
  }

  // Compute expected signature
  const message = `${req.method}:${req.path}:${timestamp}:${nonce}`;
  const expectedSignature = await computeHmac(message);

  // Constant-time comparison to prevent timing attacks
  const crypto = await import("crypto");
  const signatureBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expectedSignature, "hex");

  if (signatureBuffer.length !== expectedBuffer.length || 
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // Mark nonce as used in both local cache (fast-path) and Redis (authoritative)
  localNonceCache.set(nonce, now);
  await markNonceUsed(nonce, NONCE_EXPIRY_MS);

  next();
}

// ===== POSTING TOKEN FOR ONE-TIME USE =====
// Server generates a signed token that the extension must use to log postings
// This prevents client-side limit bypass

const POSTING_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
// REDIS FIX: Posting tokens now stored in Redis for cross-instance consistency.
const localPostingTokenCache = new Map<string, number>();

// Clean expired local tokens periodically
const postingTokenCleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [token, timestamp] of localPostingTokenCache.entries()) {
    if (now - timestamp > POSTING_TOKEN_EXPIRY_MS * 2) {
      localPostingTokenCache.delete(token);
    }
  }
}, 60 * 1000);
postingTokenCleanupInterval.unref?.();

export async function generatePostingToken(userId: number, vehicleId: number, platform: string): Promise<string> {
  const crypto = await import("crypto");
  const payload = {
    userId,
    vehicleId,
    platform,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString("hex"),
  };
  
  const payloadStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(payloadStr).toString("base64url");
  const signature = await computeHmac(payloadStr);
  
  return `${payloadB64}.${signature}`;
}

export async function validatePostingToken(
  token: string, 
  expectedUserId: number, 
  expectedVehicleId: number, 
  expectedPlatform: string
): Promise<{ valid: boolean; error?: string }> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return { valid: false, error: "Invalid token format" };
  }

  const [payloadB64, signature] = parts;

  try {
    const payloadStr = Buffer.from(payloadB64, "base64url").toString("utf-8");
    const expectedSignature = await computeHmac(payloadStr);

    const crypto = await import("crypto");
    const sigBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expectedSignature, "hex");

    if (sigBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, error: "Invalid signature" };
    }

    const payload = JSON.parse(payloadStr);

    // Check expiry
    if (Date.now() - payload.timestamp > POSTING_TOKEN_EXPIRY_MS) {
      return { valid: false, error: "Token expired" };
    }

    // Check token hasn't been used — Redis is authoritative, local cache is fast-path
    if (localPostingTokenCache.has(token)) {
      return { valid: false, error: "Token already used" };
    }
    const tokenUsedInRedis = await isPostingTokenUsed(token);
    if (tokenUsedInRedis) {
      return { valid: false, error: "Token already used" };
    }

    // Validate payload matches
    if (payload.userId !== expectedUserId) {
      return { valid: false, error: "User mismatch" };
    }
    if (payload.vehicleId !== expectedVehicleId) {
      return { valid: false, error: "Vehicle mismatch" };
    }
    if (payload.platform !== expectedPlatform) {
      return { valid: false, error: "Platform mismatch" };
    }

    // Mark as used in both local cache (fast-path) and Redis (authoritative)
    localPostingTokenCache.set(token, Date.now());
    await markPostingTokenUsed(token, POSTING_TOKEN_EXPIRY_MS);

    return { valid: true };
  } catch {
    return { valid: false, error: "Token parse error" };
  }
}
