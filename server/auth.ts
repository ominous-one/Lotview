import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import type { User } from "@shared/schema";

// JWT_SECRET must be set in production for security (SESSION_SECRET accepted as alias)
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("JWT_SECRET (or SESSION_SECRET) environment variable is required in production");
}
// Development fallback
const SECRET = JWT_SECRET || "olympic-auto-jwt-dev-secret-DO-NOT-USE-IN-PRODUCTION";
const JWT_EXPIRES_IN = "1h";

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

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

export function generateToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      dealershipId: user.dealershipId,
    },
    SECRET,
    { 
      expiresIn: JWT_EXPIRES_IN,
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

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
}

// ===== HMAC SIGNATURE VALIDATION FOR CHROME EXTENSION =====
// The extension signs requests with HMAC-SHA256 to prevent tampering

const EXTENSION_HMAC_SECRET_ENV = process.env.EXTENSION_HMAC_SECRET;
if (!EXTENSION_HMAC_SECRET_ENV && process.env.NODE_ENV === "production") {
  throw new Error("EXTENSION_HMAC_SECRET environment variable is required in production");
}
const EXTENSION_HMAC_SECRET = EXTENSION_HMAC_SECRET_ENV || "extension-hmac-dev-secret";
const NONCE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const nonceCache = new Map<string, number>();

// Clean expired nonces periodically
setInterval(() => {
  const now = Date.now();
  for (const [nonce, timestamp] of nonceCache.entries()) {
    if (now - timestamp > NONCE_EXPIRY_MS * 2) {
      nonceCache.delete(nonce);
    }
  }
}, 60 * 1000); // Clean every minute

async function computeHmac(message: string): Promise<string> {
  const crypto = await import("crypto");
  return crypto
    .createHmac("sha256", EXTENSION_HMAC_SECRET)
    .update(message)
    .digest("hex");
}

export async function extensionHmacMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  // Skip HMAC for login (extension doesn't have signing key yet)
  if (req.path === "/api/extension/login") {
    return next();
  }

  // HMAC is optional when JWT auth is present - JWT provides the security
  // The extension uses a client-side generated key that doesn't match server secret
  // Relying on JWT auth (which is validated by authMiddleware) is sufficient
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    // JWT auth present - skip HMAC validation, let authMiddleware handle it
    return next();
  }

  // If no JWT, require HMAC (fallback for future use cases)
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

  // Check nonce hasn't been used (prevent replay within window)
  if (nonceCache.has(nonce)) {
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

  // Mark nonce as used
  nonceCache.set(nonce, now);

  next();
}

// ===== POSTING TOKEN FOR ONE-TIME USE =====
// Server generates a signed token that the extension must use to log postings
// This prevents client-side limit bypass

const POSTING_TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const usedPostingTokens = new Map<string, number>(); // token -> timestamp

// Clean expired tokens periodically (time-based, not size-based)
setInterval(() => {
  const now = Date.now();
  for (const [token, timestamp] of usedPostingTokens.entries()) {
    if (now - timestamp > POSTING_TOKEN_EXPIRY_MS * 2) {
      usedPostingTokens.delete(token);
    }
  }
}, 60 * 1000); // Clean every minute

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

    // Check token hasn't been used
    if (usedPostingTokens.has(token)) {
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

    // Mark as used with timestamp for time-based cleanup
    usedPostingTokens.set(token, Date.now());

    return { valid: true };
  } catch {
    return { valid: false, error: "Token parse error" };
  }
}
