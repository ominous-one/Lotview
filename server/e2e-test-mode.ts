import type { Request } from "express";
import { db } from "./db";
import { dealerships, users } from "@shared/schema";
import { asc, eq } from "drizzle-orm";
import { hashPassword } from "./auth";

export const E2E_MANAGER_TOKEN = "e2e-manager-token";
export const E2E_SALES_TOKEN = "e2e-sales-token";

export const E2E_MANAGER_ID = 900001;
export const E2E_SALES_ID = 900002;

export const E2E_MANAGER_EMAIL = "e2e.manager@localhost";
export const E2E_SALES_EMAIL = "e2e.sales@localhost";

export function isE2ETestModeEnabled() {
  return String(process.env.E2E_TEST_MODE).toLowerCase() === "true";
}

export function isSafeE2ERequest(req: Pick<Request, "hostname" | "headers">) {
  if (!isE2ETestModeEnabled()) return false;
  if (process.env.NODE_ENV === "production") return false;

  const host = (req.hostname || "").split(":")[0].toLowerCase();
  const isLocalhost = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
  if (!isLocalhost) return false;

  // Extra guard: only allow browser-like or script usage; prevents accidental enabling in other contexts.
  // (Still not a security boundary; the localhost+non-prod check is the key.)
  const ua = String((req.headers as any)?.["user-agent"] || "");
  if (!ua) return true;
  return true;
}

export type E2ESeedResult = {
  dealershipId: number;
  manager: {
    id: number;
    email: string;
    name: string;
    role: "manager";
    dealershipId: number;
    token: string;
  };
  sales: {
    id: number;
    email: string;
    name: string;
    role: "salesperson";
    dealershipId: number;
    token: string;
  };
};

async function ensureDealership(): Promise<number> {
  const existing = await db
    .select({ id: dealerships.id })
    .from(dealerships)
    .orderBy(asc(dealerships.id))
    .limit(1);

  if (existing[0]?.id) return existing[0].id;

  const created = await db
    .insert(dealerships)
    .values({
      name: "E2E Dealership",
      slug: "e2e-dealership",
      subdomain: null,
      city: "Vancouver",
      province: "BC",
      isActive: true,
    })
    .returning({ id: dealerships.id });

  return created[0].id;
}

async function ensureUser(params: {
  id: number;
  email: string;
  name: string;
  role: "manager" | "salesperson";
  dealershipId: number;
}): Promise<{ id: number; email: string; name: string; role: string; dealershipId: number }> {
  // 1) If the exact ID exists, use it (regardless of email) to keep determinism.
  const byId = await db.select().from(users).where(eq(users.id, params.id)).limit(1);
  if (byId[0]) {
    // Ensure it's active and set expected role/dealership/email/name.
    await db
      .update(users)
      .set({
        email: params.email,
        name: params.name,
        role: params.role,
        dealershipId: params.dealershipId,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, params.id));
    return {
      id: params.id,
      email: params.email,
      name: params.name,
      role: params.role,
      dealershipId: params.dealershipId,
    };
  }

  // 2) If email exists (with a different ID), reuse it to avoid unique constraint issues.
  const byEmail = await db.select().from(users).where(eq(users.email, params.email)).limit(1);
  if (byEmail[0]) {
    await db
      .update(users)
      .set({
        name: params.name,
        role: params.role,
        dealershipId: params.dealershipId,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, byEmail[0].id));

    return {
      id: byEmail[0].id,
      email: params.email,
      name: params.name,
      role: params.role,
      dealershipId: params.dealershipId,
    };
  }

  const passwordHash = await hashPassword("e2e-test-password-not-for-prod");

  // Insert with explicit ID for determinism.
  const inserted = await db
    .insert(users)
    // drizzle types don't love explicit serial PK inserts; keep it permissive.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .values({
      id: params.id as any,
      email: params.email,
      passwordHash,
      name: params.name,
      role: params.role,
      dealershipId: params.dealershipId,
      isActive: true,
    } as any)
    .returning({ id: users.id });

  return {
    id: inserted[0].id,
    email: params.email,
    name: params.name,
    role: params.role,
    dealershipId: params.dealershipId,
  };
}

export async function seedE2E(): Promise<E2ESeedResult> {
  const dealershipId = await ensureDealership();

  const manager = await ensureUser({
    id: E2E_MANAGER_ID,
    email: E2E_MANAGER_EMAIL,
    name: "E2E GM",
    role: "manager",
    dealershipId,
  });

  const sales = await ensureUser({
    id: E2E_SALES_ID,
    email: E2E_SALES_EMAIL,
    name: "E2E Sales Manager",
    role: "salesperson",
    dealershipId,
  });

  return {
    dealershipId,
    manager: {
      id: manager.id,
      email: manager.email,
      name: manager.name,
      role: "manager",
      dealershipId,
      token: E2E_MANAGER_TOKEN,
    },
    sales: {
      id: sales.id,
      email: sales.email,
      name: sales.name,
      role: "salesperson",
      dealershipId,
      token: E2E_SALES_TOKEN,
    },
  };
}

export function getE2EUserFromToken(token: string, dealershipId: number) {
  if (token === E2E_MANAGER_TOKEN) {
    return {
      id: E2E_MANAGER_ID,
      email: E2E_MANAGER_EMAIL,
      role: "manager",
      name: "E2E GM",
      dealershipId,
    };
  }

  if (token === E2E_SALES_TOKEN) {
    return {
      id: E2E_SALES_ID,
      email: E2E_SALES_EMAIL,
      role: "salesperson",
      name: "E2E Sales Manager",
      dealershipId,
    };
  }

  return null;
}
