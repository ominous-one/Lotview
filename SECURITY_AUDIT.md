# LotView Security Audit Report

**Date:** 2026-02-23
**Scope:** Full-stack audit - Express backend, React frontend, Chrome extension, Drizzle ORM schema
**Auditor:** Automated security review

---

## Executive Summary

This audit identified **5 critical**, **7 high**, **8 medium**, and **5 low** severity issues across the LotView multi-tenant SaaS platform. All critical and high severity issues have been fixed directly in the codebase.

| Severity | Found | Fixed | Remaining |
|----------|-------|-------|-----------|
| CRITICAL | 5 | 5 | 0 |
| HIGH | 7 | 7 | 0 |
| MEDIUM | 8 | 0 | 8 |
| LOW | 5 | 0 | 5 |

---

## CRITICAL Issues (All Fixed)

### C1: Hardcoded Admin Password (FIXED)
- **File:** `server/routes.ts` (was line ~2784)
- **Issue:** `/api/admin/login` endpoint accepted hardcoded password `"admin123"` and returned a static token `"admin123"`. No hashing, no JWT.
- **Fix:** Removed the entire legacy admin login endpoint. Users must use `/api/auth/login` with proper bcrypt-hashed credentials and JWT tokens.

### C2: Hardcoded Super Admin Password in Seed Script (FIXED)
- **File:** `server/seed-super-admin.ts` (line 18)
- **Issue:** Password `"SuperAdmin2024!"` was hardcoded in source code and printed to console logs.
- **Fix:** Script now generates a cryptographically random password using `crypto.randomBytes(24)`. Accepts `SUPER_ADMIN_PASSWORD` and `SUPER_ADMIN_EMAIL` env vars for controlled provisioning.

### C3: Cross-Tenant Vehicle Access in Image Upload (FIXED)
- **File:** `server/routes.ts` (line ~2420)
- **Endpoint:** `POST /api/super-admin/upload-vehicle-images`
- **Issue:** Vehicle query `db.select().from(vehicles).where(eq(vehicles.id, vehicleId))` had no `dealershipId` filter. A super admin could upload images for any vehicle regardless of tenant context.
- **Fix:** Added `and(eq(vehicles.id, vehicleId), eq(vehicles.dealershipId, targetDealershipId))` filter and dealership context validation.

### C4: Cross-Tenant Call Scoring Response Modification (FIXED)
- **File:** `server/routes.ts` (line ~12086)
- **Endpoint:** `PATCH /api/call-scoring/responses/:id`
- **Issue:** Responses were queried/updated by ID only, with no dealership validation. `callScoringResponses` table lacks a `dealershipId` column. Any authenticated manager could modify scoring responses for any dealership.
- **Fix:** Added `INNER JOIN callScoringSheets` to verify dealership ownership before allowing updates. Returns 403 if the response belongs to another dealership.

### C5: innerHTML XSS in Chrome Extension Content Script (FIXED)
- **File:** `chrome-extension/src/content-facebook.ts` (line 498)
- **Issue:** `el.innerHTML = value.replace(/\n/g, '<br>')` - if `value` contains HTML from server data (vehicle descriptions), it would be executed as HTML in the Facebook page context.
- **Fix:** Replaced with safe DOM manipulation using `document.createTextNode()` and `document.createElement('br')`.

---

## HIGH Issues (All Fixed)

### H1: JWT Token Expiry Too Long - 7 Days (FIXED)
- **File:** `server/auth.ts` (line 13)
- **Issue:** `JWT_EXPIRES_IN = "7d"` - compromised tokens remained valid for a full week.
- **Fix:** Reduced to `"1h"`. Note: A refresh token mechanism should be implemented for seamless UX.

### H2: JWT_SECRET / SESSION_SECRET Env Var Mismatch (FIXED)
- **Files:** `server/auth.ts`, `server/tenant-middleware.ts`, `.env.example`
- **Issue:** Code read `JWT_SECRET` but `.env.example` only documented `SESSION_SECRET`. If only `SESSION_SECRET` was set, the code would fall back to a hardcoded dev secret.
- **Fix:** Both files now read `process.env.JWT_SECRET || process.env.SESSION_SECRET`. `.env.example` updated to document both variables.

### H3: EXTENSION_HMAC_SECRET Hardcoded Fallback (FIXED)
- **File:** `server/auth.ts` (line 128)
- **Issue:** `EXTENSION_HMAC_SECRET` fell back to `"extension-hmac-dev-secret"` if env var was missing, even in production.
- **Fix:** Added production guard that throws an error if the env var is not set when `NODE_ENV === "production"`.

### H4: Weak Password Requirements (6 characters) (FIXED)
- **Files:** `server/routes.ts` (multiple endpoints)
- **Issue:** Several endpoints required only 6 characters for passwords:
  - Secrets password: 6 chars (line ~586)
  - Super admin reset: 6 chars (line ~1272)
  - Staff invite: 8 chars (line ~463)
  - Password reset: 8 chars (line ~374)
- **Fix:** All password requirements raised to 12 characters minimum.

### H5: CSP Allows unsafe-eval (FIXED)
- **File:** `server/app.ts` (line ~50)
- **Issue:** `scriptSrc` included `'unsafe-eval'` which defeats XSS protections.
- **Fix:** Removed `'unsafe-eval'` from the CSP `scriptSrc` directive.

### H6: Bcrypt Rounds Too Low (FIXED)
- **File:** `server/auth.ts` (line 30)
- **Issue:** `bcrypt.hash(password, 10)` - 10 rounds is the 2011 minimum.
- **Fix:** Increased to 12 rounds for better protection against GPU-accelerated attacks.

### H7: innerHTML XSS in Photo Overlay (FIXED)
- **File:** `chrome-extension/src/content-facebook.ts` (line ~3421)
- **Issue:** `overlay.innerHTML` used template literals with `folderName` (derived from vehicle data) without sanitization.
- **Fix:** Added HTML entity escaping for `folderName` and numeric coercion for `photoCount` before template insertion.

---

## MEDIUM Issues (Recommendations)

### M1: No Refresh Token Implementation
- **Files:** `server/auth.ts`, `server/routes.ts`
- **Issue:** No refresh token mechanism exists. The logout endpoint doesn't invalidate tokens (stateless JWT). With the new 1h expiry, users will need to re-login frequently.
- **Recommendation:** Implement refresh token rotation with a token blacklist (Redis-backed). Add token invalidation on logout.

### M2: Password Reset Token Validation is O(n)
- **File:** `server/routes.ts` (lines ~348-356)
- **Issue:** `getAllValidPasswordResetTokens()` loads ALL tokens and bcrypt-compares each one. This is slow and could be used for timing attacks.
- **Recommendation:** Encode a token identifier (user ID or random prefix) in the URL to enable indexed lookup. Use a hash (SHA-256) of the token for fast comparison, with bcrypt as secondary verification.

### M3: No Account Lockout After Failed Logins
- **Issue:** Rate limiting (10 attempts/15 min via IP) exists but there's no per-account lockout. An attacker using distributed IPs could try indefinitely.
- **Recommendation:** Implement progressive account lockout (e.g., lock for 15 min after 5 failed attempts, 1h after 10).

### M4: OAuth State Store in Memory
- **File:** `server/routes.ts` (lines ~71-73)
- **Issue:** OAuth CSRF state is stored in an in-memory Map. Server restart loses all state; no multi-instance support.
- **Recommendation:** Use Redis or signed JWTs for OAuth state persistence.

### M5: Missing Input Validation on Many Endpoints
- **File:** `server/routes.ts` (multiple locations)
- **Issue:** Many `req.body` fields are destructured without Zod schema validation. While Drizzle provides some type safety, unvalidated input reaches business logic.
- **Recommendation:** Add Zod validation middleware to all POST/PUT/PATCH endpoints.

### M6: Posting Token Cleanup Was Size-Based (FIXED to time-based)
- **File:** `server/auth.ts`
- **Issue:** Was clearing ALL tokens when Set exceeded 10,000 entries, allowing token reuse.
- **Fix Applied:** Changed to time-based Map cleanup (every 60 seconds, expired tokens removed individually).

### M7: dangerouslySetInnerHTML in Chart Component
- **File:** `client/src/components/ui/chart.tsx` (line 79)
- **Issue:** Uses `dangerouslySetInnerHTML` to inject CSS. Values come from a config object (THEMES), not user input, so risk is low.
- **Recommendation:** Use CSS custom properties via `style` attribute or CSS modules instead.

### M8: CSP Still Has unsafe-inline for Scripts
- **File:** `server/app.ts`
- **Issue:** `'unsafe-inline'` in `scriptSrc` reduces XSS protection. Vite injects inline scripts during development.
- **Recommendation:** Implement CSP nonce generation for inline scripts in production.

---

## LOW Issues (Informational)

### L1: No Audit Trail for Sensitive Operations
- Most endpoints log errors but there's no centralized, immutable audit log for security events (failed logins, permission changes, cross-tenant access attempts).

### L2: Nonce Cache In-Memory Only
- **File:** `server/auth.ts` (line 130)
- HMAC nonce cache is in-memory only. Server restart resets it, briefly allowing nonce reuse.

### L3: Missing Security Headers
- While Helmet is configured, some headers could be tightened:
  - `X-Frame-Options` allows Facebook (intentional for OAuth) but could be more restrictive
  - Consider adding `Permissions-Policy` header

### L4: No Password Complexity Requirements
- Passwords now require 12 characters minimum, but there's no check for uppercase, lowercase, numbers, or special characters.

### L5: Super Admin Can Override Tenant Context via Header
- **File:** `server/tenant-middleware.ts`
- Super admins can set `X-Dealership-Id` header to impersonate any dealership. While intentional for administration, there's no audit trail for this.

---

## What Passed

- **Drizzle ORM:** All queries are parameterized - no SQL injection risk
- **File uploads:** Multer configured with 2MB limit and MIME type validation
- **HMAC validation:** Extension uses proper HMAC-SHA256 with constant-time comparison and nonce replay prevention
- **Tenant middleware:** Well-designed multi-strategy resolution (JWT > subdomain > header) with fail-closed behavior
- **bcrypt password hashing:** All user passwords properly hashed (now 12 rounds)
- **.gitignore:** Properly excludes `.env` and `.env.*` files
- **.env.example:** Contains only placeholder values, no real secrets
- **Rate limiting:** Auth endpoints (10/15min), sensitive ops (5/hr), global (1000/15min)
- **User status check in auth middleware:** JWT tokens are validated against DB on every request (prevents stale tokens for deactivated users)
- **Chrome extension CSP:** Manifest V3 with `script-src 'self'; object-src 'none'`
- **No eval() in extension:** Content scripts use DOM manipulation, not eval

---

## Files Modified

| File | Changes |
|------|---------|
| `server/routes.ts` | Removed hardcoded admin login; raised password mins to 12; added tenant isolation to vehicle image upload and call scoring; added rate limiting to token validation; added path traversal protection |
| `server/auth.ts` | JWT expiry 7d->1h; bcrypt rounds 10->12; JWT_SECRET accepts SESSION_SECRET alias; HMAC secret requires env var in production; time-based token cleanup |
| `server/tenant-middleware.ts` | JWT_SECRET accepts SESSION_SECRET alias |
| `server/seed-super-admin.ts` | Replaced hardcoded password with crypto.randomBytes; accepts env vars |
| `chrome-extension/src/content-facebook.ts` | Replaced innerHTML with safe DOM manipulation; added HTML entity escaping |
| `server/app.ts` | Removed unsafe-eval from CSP scriptSrc |
| `.env.example` | Added JWT_SECRET alongside SESSION_SECRET with documentation |
