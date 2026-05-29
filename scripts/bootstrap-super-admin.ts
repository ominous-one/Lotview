#!/usr/bin/env tsx
/**
 * Lotview SaaS — Super Admin Bootstrap
 *
 * Creates exactly one super_admin user. Idempotent — re-running with the same
 * email is a no-op. Independent of scripts/seed.ts, which creates demo data
 * and is only safe on a fresh database.
 *
 * Usage (Render shell):
 *   LOTVIEW_BOOTSTRAP_EMAIL=rileyabreo@gmail.com \
 *   LOTVIEW_BOOTSTRAP_PASSWORD='Nissan2026!!' \
 *   LOTVIEW_BOOTSTRAP_NAME='Riley Abreo' \
 *   npx tsx scripts/bootstrap-super-admin.ts
 *
 * Security:
 *   - Password is hashed via bcrypt at the application's standard cost factor.
 *   - The plaintext password is never logged.
 *   - Refuses to write a password shorter than 12 characters (matches the
 *     application's policy enforced on every other write path).
 *   - dealershipId is NULL — super admins are cross-tenant.
 *   - Audit log entry recorded for the bootstrap event.
 */

import { eq } from "drizzle-orm";
import { db, pool } from "../server/db";
import { hashPassword } from "../server/utils/crypto";
import { users, auditLogs } from "../shared/schema";

const MIN_PASSWORD_LENGTH = 12;

interface BootstrapEnv {
  email: string;
  password: string;
  name: string;
}

function readEnv(env: NodeJS.ProcessEnv = process.env): BootstrapEnv {
  const email = env.LOTVIEW_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = env.LOTVIEW_BOOTSTRAP_PASSWORD;
  const name = env.LOTVIEW_BOOTSTRAP_NAME?.trim() || "Super Admin";

  const missing: string[] = [];
  if (!email) missing.push("LOTVIEW_BOOTSTRAP_EMAIL");
  if (!password) missing.push("LOTVIEW_BOOTSTRAP_PASSWORD");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(", ")}. ` +
      `Set them before invoking this script.`,
    );
  }

  if (!email!.includes("@")) {
    throw new Error("LOTVIEW_BOOTSTRAP_EMAIL must contain an @ sign");
  }

  if (password!.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `LOTVIEW_BOOTSTRAP_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters ` +
      `(application password policy)`,
    );
  }

  return { email: email!, password: password!, name };
}

export interface BootstrapResult {
  action: "created" | "already_exists" | "updated_password";
  userId: number;
  email: string;
}

export interface BootstrapDeps {
  hashPassword: (plain: string) => Promise<string>;
  findUser: (email: string) => Promise<{ id: number; role: string } | null>;
  createUser: (input: { email: string; name: string; passwordHash: string }) => Promise<{ id: number }>;
  logAudit: (input: { userId: number; email: string; action: string }) => Promise<void>;
}

const realDeps: BootstrapDeps = {
  hashPassword,
  async findUser(email) {
    const [row] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ?? null;
  },
  async createUser(input) {
    const [row] = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash: input.passwordHash,
        role: "super_admin",
        dealershipId: null,
        isActive: true,
      })
      .returning({ id: users.id });
    return row;
  },
  async logAudit(input) {
    await db.insert(auditLogs).values({
      userId: input.userId,
      userEmail: input.email,
      action: input.action,
      resource: "user",
      resourceId: String(input.userId),
      details: JSON.stringify({ role: "super_admin", source: "bootstrap-super-admin.ts" }),
      ipAddress: null,
      userAgent: "bootstrap-script",
    });
  },
};

export async function bootstrapSuperAdmin(
  env: BootstrapEnv,
  deps: BootstrapDeps = realDeps,
): Promise<BootstrapResult> {
  const existing = await deps.findUser(env.email);

  if (existing) {
    if (existing.role !== "super_admin") {
      throw new Error(
        `User ${env.email} already exists with role "${existing.role}" — refusing to overwrite. ` +
        `Promote them manually or use a different email.`,
      );
    }
    return { action: "already_exists", userId: existing.id, email: env.email };
  }

  const passwordHash = await deps.hashPassword(env.password);
  const created = await deps.createUser({
    email: env.email,
    name: env.name,
    passwordHash,
  });
  await deps.logAudit({
    userId: created.id,
    email: env.email,
    action: "super_admin_bootstrap",
  });

  return { action: "created", userId: created.id, email: env.email };
}

async function main(): Promise<void> {
  const env = readEnv();

  console.log("Lotview Super Admin Bootstrap");
  console.log("==============================");
  console.log(`Email: ${env.email}`);
  console.log(`Name:  ${env.name}`);
  console.log("");

  const result = await bootstrapSuperAdmin(env);

  if (result.action === "created") {
    console.log(`OK — Created super_admin id=${result.userId}`);
  } else {
    console.log(`OK — Super admin already exists (id=${result.userId}). No changes.`);
  }
  console.log("");
  console.log("Next step: login at https://app.lotview.ai with this email and your password.");
}

if (process.argv[1] && process.argv[1].endsWith("bootstrap-super-admin.ts")) {
  main()
    .catch((err: unknown) => {
      console.error("");
      console.error("Bootstrap failed:", err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end().catch(() => undefined);
    });
}
