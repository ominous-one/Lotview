/**
 * HTTP contract tests for the bootstrap router (POST /api/bootstrap/super-admin).
 *
 * Coverage:
 *  - 404 when LOTVIEW_BOOTSTRAP_TOKEN is unset
 *  - 404 when LOTVIEW_BOOTSTRAP_TOKEN is too short (operator misconfig)
 *  - 404 when the X-Bootstrap-Token header is absent
 *  - 404 when the X-Bootstrap-Token header value is wrong
 *  - 404 when a super_admin already exists (permanent self-disable)
 *  - 400 when the email is malformed
 *  - 400 when the password is shorter than the 12-char floor
 *  - 201 when token + payload are valid and no super_admin yet exists
 *  - 404 on database insert failure (does not leak duplicate-email info)
 *  - audit_logs row is written for every outcome
 *
 * The tests inject the database via unstable_mockModule so they run without
 * a real Postgres instance. Auditing assertions verify the action field
 * exactly so any future renaming surfaces in CI.
 */

import express, { type Express } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

interface InsertRecord {
  table: string;
  values: Record<string, unknown>;
}

const dbCalls: InsertRecord[] = [];
const findFirstSuperAdmin = jest.fn() as any;
const insertReturning = jest.fn() as any;

const dbMock = {
  select: () => ({
    from: () => ({
      where: () => ({
        limit: async () => {
          const result = await findFirstSuperAdmin();
          return result;
        },
      }),
    }),
  }),
  insert: (table: { name?: string } | unknown) => ({
    values: (values: Record<string, unknown>) => {
      const tableName =
        typeof table === "object" && table !== null && "name" in (table as Record<string, unknown>)
          ? String((table as { name?: unknown }).name ?? "unknown")
          : "unknown";

      dbCalls.push({ table: tableName, values });

      return {
        returning: async () => {
          const ret = await insertReturning(tableName, values);
          return ret;
        },
        // Audit log writes don't chain .returning(); the call is awaited
        // directly. Make the values() call await-able by returning a thenable
        // when used without .returning().
        then: (resolve: (value?: unknown) => unknown) => resolve(undefined),
      };
    },
  }),
};

const hashPasswordMock = jest.fn() as any;

let app: Express;
const ORIGINAL_TOKEN = process.env.LOTVIEW_BOOTSTRAP_TOKEN;

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../db", () => ({ db: dbMock }));
  await (jest as any).unstable_mockModule("../utils/crypto", () => ({
    hashPassword: hashPasswordMock,
  }));
  await (jest as any).unstable_mockModule("../middleware/http-rate-limiters", () => ({
    sensitiveLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
  }));

  const { default: bootstrapRouter } = await import("../routes/bootstrap");
  app = express();
  app.use(express.json());
  app.use("/api/bootstrap", bootstrapRouter);
});

beforeEach(() => {
  dbCalls.length = 0;
  findFirstSuperAdmin.mockResolvedValue([]);
  insertReturning.mockResolvedValue([{ id: 1 }]);
  hashPasswordMock.mockResolvedValue("$2a$12$hashed");
  process.env.LOTVIEW_BOOTSTRAP_TOKEN = "this-is-a-strong-secret-token-32-chars";
});

afterAll(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.LOTVIEW_BOOTSTRAP_TOKEN;
  } else {
    process.env.LOTVIEW_BOOTSTRAP_TOKEN = ORIGINAL_TOKEN;
  }
});

const validBody = {
  email: "rileyabreo@gmail.com",
  password: "Nissan2026!!",
  name: "Riley Abreo",
};

function findAuditAction(): string | null {
  const entry = dbCalls.find(call => typeof call.values?.action === "string");
  return entry ? (entry.values.action as string) : null;
}

describe("POST /api/bootstrap/super-admin — disabled paths", () => {
  it("returns 404 when LOTVIEW_BOOTSTRAP_TOKEN is unset", async () => {
    delete process.env.LOTVIEW_BOOTSTRAP_TOKEN;

    await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "anything")
      .send(validBody)
      .expect(404);

    expect(findAuditAction()).toBe("bootstrap_disabled_no_token_configured");
  });

  it("returns 404 when LOTVIEW_BOOTSTRAP_TOKEN is too short (operator misconfig)", async () => {
    process.env.LOTVIEW_BOOTSTRAP_TOKEN = "short";

    await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "short")
      .send(validBody)
      .expect(404);

    expect(findAuditAction()).toBe("bootstrap_disabled_no_token_configured");
  });
});

describe("POST /api/bootstrap/super-admin — token gating", () => {
  it("returns 404 when X-Bootstrap-Token header is missing", async () => {
    await request(app)
      .post("/api/bootstrap/super-admin")
      .send(validBody)
      .expect(404);

    expect(findAuditAction()).toBe("bootstrap_rejected_missing_token");
  });

  it("returns 404 when X-Bootstrap-Token header value is wrong", async () => {
    await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "not-the-real-token-just-as-long-as-needed")
      .send(validBody)
      .expect(404);

    expect(findAuditAction()).toBe("bootstrap_rejected_bad_token");
  });

  it("does not leak whether the token is correct via the response body", async () => {
    const res = await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "wrong-token-but-correct-length-padding!!")
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
  });
});

describe("POST /api/bootstrap/super-admin — self-disable on existing super admin", () => {
  it("returns 404 when at least one super_admin already exists", async () => {
    findFirstSuperAdmin.mockResolvedValue([{ id: 99 }]);

    await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "this-is-a-strong-secret-token-32-chars")
      .send(validBody)
      .expect(404);

    expect(findAuditAction()).toBe("bootstrap_disabled_already_initialized");

    // Critically — the password was never hashed, the user was never inserted
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/bootstrap/super-admin — input validation", () => {
  it("returns 400 when email is missing or malformed", async () => {
    await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "this-is-a-strong-secret-token-32-chars")
      .send({ ...validBody, email: "no-at-sign" })
      .expect(400)
      .expect({ error: "Valid email is required" });

    expect(findAuditAction()).toBe("bootstrap_rejected_bad_input");
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });

  it("returns 400 when password is shorter than 12 characters", async () => {
    await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "this-is-a-strong-secret-token-32-chars")
      .send({ ...validBody, password: "tooShort" })
      .expect(400);

    expect(findAuditAction()).toBe("bootstrap_rejected_bad_input");
    expect(hashPasswordMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/bootstrap/super-admin — success", () => {
  it("creates a super_admin with hashed password, dealershipId=null, isActive=true", async () => {
    insertReturning.mockResolvedValue([{ id: 42 }]);

    const response = await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "this-is-a-strong-secret-token-32-chars")
      .send(validBody)
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      userId: 42,
      email: "rileyabreo@gmail.com",
    });

    expect(hashPasswordMock).toHaveBeenCalledWith("Nissan2026!!");

    const userInsert = dbCalls.find(call => call.values?.role === "super_admin");
    expect(userInsert).toBeDefined();
    expect(userInsert?.values).toMatchObject({
      email: "rileyabreo@gmail.com",
      name: "Riley Abreo",
      passwordHash: "$2a$12$hashed",
      role: "super_admin",
      dealershipId: null,
      isActive: true,
    });

    expect(findAuditAction()).toBe("bootstrap_success");
  });

  it("normalizes the email to lowercase before insert", async () => {
    await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "this-is-a-strong-secret-token-32-chars")
      .send({ ...validBody, email: "RileyAbreo@Gmail.com" })
      .expect(201);

    const userInsert = dbCalls.find(call => call.values?.role === "super_admin");
    expect(userInsert?.values.email).toBe("rileyabreo@gmail.com");
  });

  it("falls back to a default display name when none is supplied", async () => {
    await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "this-is-a-strong-secret-token-32-chars")
      .send({ email: "rileyabreo@gmail.com", password: "Nissan2026!!" })
      .expect(201);

    const userInsert = dbCalls.find(call => call.values?.role === "super_admin");
    expect(userInsert?.values.name).toBe("Super Admin");
  });
});

describe("POST /api/bootstrap/super-admin — insert failure", () => {
  it("returns 404 (not 400/409) when the unique-email constraint fires", async () => {
    insertReturning.mockRejectedValue(new Error("duplicate key value violates unique constraint \"users_email_key\""));

    const response = await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "this-is-a-strong-secret-token-32-chars")
      .send(validBody);

    expect(response.status).toBe(404);
    expect(findAuditAction()).toBe("bootstrap_rejected_bad_input");
  });
});

describe("POST /api/bootstrap/super-admin — timing-safe token compare", () => {
  it("rejects a same-prefix-different-suffix attempt the same as a fully different one", async () => {
    const a = await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "this-is-a-strong-secret-token-32-charX")
      .send(validBody);

    const b = await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz")
      .send(validBody);

    expect(a.status).toBe(404);
    expect(b.status).toBe(404);
    expect(a.body).toEqual(b.body);
  });

  it("rejects a token longer than the configured one", async () => {
    await request(app)
      .post("/api/bootstrap/super-admin")
      .set("X-Bootstrap-Token", "this-is-a-strong-secret-token-32-chars-AND-MORE")
      .send(validBody)
      .expect(404);
  });
});
