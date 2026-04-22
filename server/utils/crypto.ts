/**
 * Crypto Utilities
 * Centralized password hashing and HMAC operations.
 * Extracted from auth.ts to eliminate circular dependency with storage.ts.
 */

import bcrypt from "bcryptjs";

export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

const EXTENSION_HMAC_SECRET_ENV = process.env.EXTENSION_HMAC_SECRET;
if (!EXTENSION_HMAC_SECRET_ENV && process.env.NODE_ENV === "production") {
  throw new Error("EXTENSION_HMAC_SECRET environment variable is required in production");
}
const EXTENSION_HMAC_SECRET = EXTENSION_HMAC_SECRET_ENV || "extension-hmac-dev-secret";

export async function computeHmac(message: string): Promise<string> {
  const crypto = await import("crypto");
  return crypto
    .createHmac("sha256", EXTENSION_HMAC_SECRET)
    .update(message)
    .digest("hex");
}

export function getExtensionHmacSecret(): string {
  return EXTENSION_HMAC_SECRET;
}
