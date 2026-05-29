/**
 * Unit tests for scripts/bootstrap-super-admin.ts.
 *
 * The script's exported `bootstrapSuperAdmin(env, deps)` function takes its
 * database dependencies via injection so we can verify behavior without a
 * live Postgres instance.
 *
 * Coverage:
 *   - idempotency (existing super_admin is detected, not recreated)
 *   - refuses to overwrite a non-super-admin user with the same email
 *   - hashes the password (never persists plain text)
 *   - logs an audit row on creation
 *   - new row gets dealershipId=null (cross-tenant) implicitly via the deps
 *     contract — the script only forwards email/name/passwordHash; the dep
 *     is responsible for the role/dealershipId/isActive defaults.
 */

import { describe, expect, it, jest } from "@jest/globals";
import {
  bootstrapSuperAdmin,
  type BootstrapDeps,
} from "../../scripts/bootstrap-super-admin";

function buildDeps(overrides: Partial<BootstrapDeps> = {}): {
  deps: BootstrapDeps;
  calls: {
    hashPassword: jest.Mock;
    findUser: jest.Mock;
    createUser: jest.Mock;
    logAudit: jest.Mock;
  };
} {
  const hashPassword = jest.fn() as any;
  const findUser = jest.fn() as any;
  const createUser = jest.fn() as any;
  const logAudit = jest.fn() as any;

  hashPassword.mockResolvedValue("$2a$12$hashed");
  findUser.mockResolvedValue(null);
  createUser.mockResolvedValue({ id: 99 });
  logAudit.mockResolvedValue(undefined);

  return {
    deps: { hashPassword, findUser, createUser, logAudit, ...overrides },
    calls: { hashPassword, findUser, createUser, logAudit },
  };
}

const baseEnv = {
  email: "rileyabreo@gmail.com",
  password: "Nissan2026!!",
  name: "Riley Abreo",
};

describe("bootstrapSuperAdmin", () => {
  it("creates a new super_admin when none exists", async () => {
    const { deps, calls } = buildDeps();

    const result = await bootstrapSuperAdmin(baseEnv, deps);

    expect(result).toEqual({
      action: "created",
      userId: 99,
      email: "rileyabreo@gmail.com",
    });
    expect(calls.findUser).toHaveBeenCalledWith("rileyabreo@gmail.com");
    expect(calls.hashPassword).toHaveBeenCalledWith("Nissan2026!!");
    expect(calls.createUser).toHaveBeenCalledWith({
      email: "rileyabreo@gmail.com",
      name: "Riley Abreo",
      passwordHash: "$2a$12$hashed",
    });
    expect(calls.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 99,
        email: "rileyabreo@gmail.com",
        action: "super_admin_bootstrap",
      }),
    );
  });

  it("is idempotent — returns already_exists for an existing super_admin", async () => {
    const { deps, calls } = buildDeps();
    (calls.findUser as any).mockResolvedValue({ id: 42, role: "super_admin" });

    const result = await bootstrapSuperAdmin(baseEnv, deps);

    expect(result).toEqual({
      action: "already_exists",
      userId: 42,
      email: "rileyabreo@gmail.com",
    });
    expect(calls.hashPassword).not.toHaveBeenCalled();
    expect(calls.createUser).not.toHaveBeenCalled();
    expect(calls.logAudit).not.toHaveBeenCalled();
  });

  it("refuses to overwrite a non-super-admin user with the same email", async () => {
    const { deps, calls } = buildDeps();
    (calls.findUser as any).mockResolvedValue({ id: 7, role: "master" });

    await expect(bootstrapSuperAdmin(baseEnv, deps)).rejects.toThrow(
      /already exists with role "master"/,
    );
    expect(calls.createUser).not.toHaveBeenCalled();
    expect(calls.logAudit).not.toHaveBeenCalled();
  });

  it("never passes the plaintext password into createUser", async () => {
    const { deps, calls } = buildDeps();

    await bootstrapSuperAdmin(baseEnv, deps);

    const callArgs = calls.createUser.mock.calls[0][0] as { passwordHash: string };
    expect(callArgs.passwordHash).toBe("$2a$12$hashed");
    expect(JSON.stringify(callArgs)).not.toContain("Nissan2026");
  });

  it("uses the provided display name", async () => {
    const { deps, calls } = buildDeps();

    await bootstrapSuperAdmin({ ...baseEnv, name: "Custom Admin" }, deps);

    expect(calls.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Custom Admin" }),
    );
  });

  it("propagates an underlying createUser failure", async () => {
    const { deps, calls } = buildDeps();
    (calls.createUser as any).mockRejectedValue(new Error("unique constraint violated"));

    await expect(bootstrapSuperAdmin(baseEnv, deps)).rejects.toThrow(/unique constraint/);
    expect(calls.logAudit).not.toHaveBeenCalled();
  });
});
