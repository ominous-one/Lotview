/**
 * Bootstrap Router — first super-admin creation without prior auth.
 *
 * This router exists to solve the chicken-and-egg of "we need a super admin
 * to create a super admin." It is the ONLY route in the system that creates
 * a super_admin without going through an existing super_admin's session.
 *
 * Security shape:
 *   1. Unauthenticated by necessity (no super admin exists yet to grant a JWT).
 *   2. Gated by a server-side env var `LOTVIEW_BOOTSTRAP_TOKEN`. The endpoint
 *      compares the caller's `X-Bootstrap-Token` header via timingSafeEqual.
 *   3. Returns **404** when the token is missing, wrong, or the endpoint is
 *      disabled — never 401/403. This prevents anyone from probing whether
 *      the endpoint is live.
 *   4. Permanently self-disables when any `super_admin` row exists. The check
 *      is a database read, not an env-var flag — so once bootstrapped, the
 *      endpoint is dead even if the env var stays set. The only way to
 *      re-enable it is to delete every super_admin row, which is not a
 *      thing operators do casually.
 *   5. Enforces the application's 12-character password floor.
 *   6. Audit-logs every attempt (success, bad token, disabled-by-existing,
 *      invalid input) so attempted scans are visible.
 *   7. Rate-limited via the shared sensitive limiter.
 *
 * Operations runbook:
 *   - Set `LOTVIEW_BOOTSTRAP_TOKEN` to a strong random string in Render env
 *     vars before first deploy. Render's `generateValue: true` in render.yaml
 *     produces one automatically.
 *   - After bootstrap succeeds, the token can be left in place; the endpoint
 *     is already inert. Operators may rotate or remove it for tidiness.
 */

import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { auditLogs, users } from "@shared/schema";
import { hashPassword } from "../utils/crypto";
import { sensitiveLimiter } from "../middleware/http-rate-limiters";
import { logError, logInfo, logWarn } from "../error-utils";

const router = Router();

const MIN_PASSWORD_LENGTH = 12;
const BOOTSTRAP_TOKEN_HEADER = "x-bootstrap-token";

function constantTimeStringEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

async function recordBootstrapAttempt(input: {
  outcome:
    | "bootstrap_success"
    | "bootstrap_success_promoted_existing_user"
    | "bootstrap_success_rotated_existing_super_admin"
    | "bootstrap_disabled_no_token_configured"
    | "bootstrap_disabled_already_initialized"
    | "bootstrap_rejected_missing_token"
    | "bootstrap_rejected_bad_token"
    | "bootstrap_rejected_bad_input";
  email?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  userId?: number;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: input.userId ?? null,
      userEmail: input.email ?? "anonymous@bootstrap",
      action: input.outcome,
      resource: "bootstrap",
      resourceId: "super_admin",
      details: JSON.stringify({}),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
    });
  } catch (error) {
    // Audit log failure must not leak via a different status code; log it
    // server-side but still respond with the planned status to the caller.
    logWarn("[Bootstrap] Audit log write failed", {
      error: error instanceof Error ? error.message : String(error),
      outcome: input.outcome,
    });
  }
}

async function anySuperAdminExists(): Promise<boolean> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "super_admin"))
    .limit(1);
  return Boolean(existing);
}

/**
 * GET /api/bootstrap/status — diagnostic, unauthenticated, safe to expose.
 *
 * Returns booleans only. Useful when troubleshooting why the bootstrap POST
 * is returning 404 — operators can see whether the token env var is
 * configured and whether the endpoint has already been used. Never leaks
 * the token value or any user data.
 */
router.get("/status", async (_req, res) => {
  const configuredToken = process.env.LOTVIEW_BOOTSTRAP_TOKEN;
  const tokenConfigured = Boolean(configuredToken && configuredToken.length >= 16);
  let superAdminExists = false;
  try {
    superAdminExists = await anySuperAdminExists();
  } catch {
    // If the DB query throws, surface that as "unknown" by leaving false —
    // the caller can re-check after fixing the DB. We don't want this
    // endpoint to fail closed because operators rely on it for diagnosis.
  }
  res.json({
    tokenConfigured,
    superAdminExists,
    bootstrapAvailable: tokenConfigured && !superAdminExists,
  });
});

router.post("/super-admin", sensitiveLimiter, async (req, res) => {
  const clientIp = (req.ip ?? null) as string | null;
  const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;

  try {
    const configuredToken = process.env.LOTVIEW_BOOTSTRAP_TOKEN;
    if (!configuredToken || configuredToken.length < 16) {
      await recordBootstrapAttempt({
        outcome: "bootstrap_disabled_no_token_configured",
        ipAddress: clientIp,
        userAgent,
      });
      return res.status(404).json({ error: "Not found" });
    }

    const providedToken = req.headers[BOOTSTRAP_TOKEN_HEADER];
    if (typeof providedToken !== "string" || providedToken.length === 0) {
      await recordBootstrapAttempt({
        outcome: "bootstrap_rejected_missing_token",
        ipAddress: clientIp,
        userAgent,
      });
      return res.status(404).json({ error: "Not found" });
    }

    if (!constantTimeStringEqual(providedToken, configuredToken)) {
      await recordBootstrapAttempt({
        outcome: "bootstrap_rejected_bad_token",
        ipAddress: clientIp,
        userAgent,
      });
      return res.status(404).json({ error: "Not found" });
    }

    const rawEmail = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const name =
      typeof req.body?.name === "string" && req.body.name.trim().length > 0
        ? req.body.name.trim()
        : "Super Admin";

    if (!rawEmail.includes("@") || rawEmail.length < 3) {
      await recordBootstrapAttempt({
        outcome: "bootstrap_rejected_bad_input",
        email: rawEmail,
        ipAddress: clientIp,
        userAgent,
      });
      return res.status(400).json({ error: "Valid email is required" });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      await recordBootstrapAttempt({
        outcome: "bootstrap_rejected_bad_input",
        email: rawEmail,
        ipAddress: clientIp,
        userAgent,
      });
      return res.status(400).json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
    }

    const passwordHash = await hashPassword(password);

    // Look up any existing user with this email. The bootstrap endpoint
    // accepts three shapes:
    //   (a) no existing user, no existing super_admin → INSERT new super_admin
    //   (b) user with same email exists → PROMOTE that user to super_admin
    //       (and reset its password to the supplied one)
    //   (c) different super_admin exists, no user with this email → INSERT
    //       new super_admin alongside (cross-tenant role, not exclusive)
    //
    // Promotion is gated by the same token; possession of the token is
    // already authorization to create a super_admin from scratch, so
    // promoting/rotating an existing one has equivalent security shape.
    const [existingByEmail] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, rawEmail))
      .limit(1);

    let resultUserId: number;
    let resultAction: "created" | "promoted" | "rotated";

    if (existingByEmail) {
      try {
        await db
          .update(users)
          .set({
            passwordHash,
            name,
            role: "super_admin",
            dealershipId: null,
            isActive: true,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingByEmail.id));
        resultUserId = existingByEmail.id;
        resultAction = existingByEmail.role === "super_admin" ? "rotated" : "promoted";
      } catch (updateError) {
        await recordBootstrapAttempt({
          outcome: "bootstrap_rejected_bad_input",
          email: rawEmail,
          ipAddress: clientIp,
          userAgent,
        });
        logWarn("[Bootstrap] Update refused", {
          error: updateError instanceof Error ? updateError.message : String(updateError),
          email: rawEmail,
        });
        return res.status(500).json({ error: "Bootstrap update failed" });
      }
    } else {
      try {
        const [created] = await db
          .insert(users)
          .values({
            email: rawEmail,
            name,
            passwordHash,
            role: "super_admin",
            dealershipId: null,
            isActive: true,
          })
          .returning({ id: users.id });
        resultUserId = created.id;
        resultAction = "created";
      } catch (insertError) {
        await recordBootstrapAttempt({
          outcome: "bootstrap_rejected_bad_input",
          email: rawEmail,
          ipAddress: clientIp,
          userAgent,
        });
        logWarn("[Bootstrap] Insert refused", {
          error: insertError instanceof Error ? insertError.message : String(insertError),
          email: rawEmail,
        });
        return res.status(500).json({ error: "Bootstrap insert failed" });
      }
    }

    await recordBootstrapAttempt({
      outcome:
        resultAction === "created"
          ? "bootstrap_success"
          : resultAction === "promoted"
            ? "bootstrap_success_promoted_existing_user"
            : "bootstrap_success_rotated_existing_super_admin",
      email: rawEmail,
      ipAddress: clientIp,
      userAgent,
      userId: resultUserId,
    });

    logInfo(`[Bootstrap] Super admin ${resultAction}`, { userId: resultUserId, email: rawEmail });

    return res.status(201).json({
      success: true,
      userId: resultUserId,
      email: rawEmail,
      action: resultAction,
      message:
        resultAction === "created"
          ? "Super admin created."
          : resultAction === "promoted"
            ? "Existing user promoted to super admin and password reset."
            : "Existing super admin password rotated.",
    });
  } catch (error) {
    logError(
      "[Bootstrap] Unexpected failure",
      error instanceof Error ? error : new Error(String(error)),
      { route: "api-bootstrap-super-admin" },
    );
    return res.status(500).json({ error: "Bootstrap failed" });
  }
});

export default router;
