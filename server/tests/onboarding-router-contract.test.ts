/**
 * HTTP contract tests for the self-service onboarding router.
 *
 * Covers 200, 201, 400, and 500 cases for:
 *   POST /api/onboarding/signup
 *   POST /api/onboarding/validate-url
 *
 * The onboarding router is unauthenticated by design (self-service signup),
 * so 401/403 cases do not apply.
 */

import express, { type Express } from "express";
import request from "supertest";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const storageMock = {
  getUserByEmail: jest.fn() as any,
  getAllDealerships: jest.fn() as any,
  createDealership: jest.fn() as any,
  createUser: jest.fn() as any,
  createScrapeSource: jest.fn() as any,
  setBrowserScript: jest.fn() as any,
};

const hashPasswordMock = jest.fn() as any;
const generateTokenMock = jest.fn() as any;
const originalFetch = global.fetch;

let app: Express;

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../storage", () => ({ storage: storageMock }));
  await (jest as any).unstable_mockModule("../utils/crypto", () => ({
    hashPassword: hashPasswordMock,
  }));
  await (jest as any).unstable_mockModule("../auth", () => ({
    generateToken: generateTokenMock,
  }));

  const { default: onboardingRouter } = await import("../routes/onboarding");
  app = express();
  app.use(express.json());
  app.use("/api/onboarding", onboardingRouter);
});

beforeEach(() => {
  jest.clearAllMocks();
  storageMock.getUserByEmail.mockResolvedValue(undefined);
  storageMock.getAllDealerships.mockResolvedValue([]);
  storageMock.createScrapeSource.mockResolvedValue(undefined);
  storageMock.setBrowserScript.mockResolvedValue(undefined);
  hashPasswordMock.mockResolvedValue("$2a$12$hashed");
  generateTokenMock.mockReturnValue("signed.jwt.token");
});

afterAll(() => {
  global.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// POST /api/onboarding/signup
// ---------------------------------------------------------------------------

describe("POST /api/onboarding/signup", () => {
  const validBody = {
    dealershipName: "New Dealership",
    websiteUrl: "https://new.dealer.com",
    managerEmail: "owner@new.dealer.com",
    managerName: "Owner",
    managerPassword: "very-strong-pass-1234",
  };

  it("returns 400 when required fields are missing", async () => {
    await request(app)
      .post("/api/onboarding/signup")
      .send({ dealershipName: "New" })
      .expect(400)
      .expect({ error: "Dealership name, website URL, manager email, and password are required" });

    expect(storageMock.createDealership).not.toHaveBeenCalled();
  });

  it("returns 400 when password is shorter than 12 characters", async () => {
    await request(app)
      .post("/api/onboarding/signup")
      .send({ ...validBody, managerPassword: "short" })
      .expect(400)
      .expect({ error: "Password must be at least 12 characters" });
  });

  it("returns 400 when the manager email is already registered", async () => {
    storageMock.getUserByEmail.mockResolvedValue({ id: 99, email: "owner@new.dealer.com" });

    await request(app)
      .post("/api/onboarding/signup")
      .send(validBody)
      .expect(400)
      .expect({ error: "An account with this email already exists" });

    expect(storageMock.createDealership).not.toHaveBeenCalled();
  });

  it("returns 400 when the derived subdomain is already taken", async () => {
    storageMock.getAllDealerships.mockResolvedValue([
      { id: 1, subdomain: "newdealership" },
    ]);

    await request(app)
      .post("/api/onboarding/signup")
      .send(validBody)
      .expect(400)
      .expect({ error: "Dealership name already taken, please try a different name" });

    expect(storageMock.createDealership).not.toHaveBeenCalled();
  });

  it("returns 201 with dealership, user, token, and detected platform on success", async () => {
    storageMock.createDealership.mockResolvedValue({
      id: 7,
      name: "New Dealership",
      subdomain: "newdealership",
      websiteUrl: "https://new.dealer.com",
    });
    storageMock.createUser.mockResolvedValue({
      id: 50,
      email: "owner@new.dealer.com",
      name: "Owner",
      role: "master",
      dealershipId: 7,
    });

    const response = await request(app)
      .post("/api/onboarding/signup")
      .send(validBody)
      .expect(201);

    expect(response.body).toMatchObject({
      success: true,
      dealership: {
        id: 7,
        name: "New Dealership",
        subdomain: "newdealership",
        websiteUrl: "https://new.dealer.com",
      },
      user: {
        id: 50,
        email: "owner@new.dealer.com",
        role: "master",
      },
      token: "signed.jwt.token",
      platform: {
        detected: "dealer_com",
      },
    });
    expect(response.body.nextSteps).toEqual(expect.arrayContaining([
      expect.stringMatching(/Facebook/),
      expect.stringMatching(/GoHighLevel/),
    ]));

    expect(storageMock.createDealership).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "New Dealership",
        slug: "newdealership",
        subdomain: "newdealership",
        websiteUrl: "https://new.dealer.com",
        status: "active",
      })
    );
    expect(storageMock.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@new.dealer.com",
        role: "master",
        dealershipId: 7,
        isActive: true,
        passwordHash: "$2a$12$hashed",
      })
    );
    expect(storageMock.createScrapeSource).toHaveBeenCalledWith(
      expect.objectContaining({ dealershipId: 7, sourceUrl: "https://new.dealer.com" })
    );
    expect(storageMock.setBrowserScript).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ platform: "dealer_com" })
    );
  });

  it("returns 500 when dealership creation fails", async () => {
    storageMock.createDealership.mockRejectedValue(new Error("boom"));

    await request(app)
      .post("/api/onboarding/signup")
      .send(validBody)
      .expect(500)
      .expect({ error: "Failed to create dealership" });

    expect(storageMock.createUser).not.toHaveBeenCalled();
  });

  it("does not leak the manager password back to the client", async () => {
    storageMock.createDealership.mockResolvedValue({
      id: 8,
      name: "New Dealership",
      subdomain: "newdealership",
      websiteUrl: "https://new.dealer.com",
    });
    storageMock.createUser.mockResolvedValue({
      id: 51,
      email: "owner@new.dealer.com",
      passwordHash: "$2a$12$hashed",
      role: "master",
      dealershipId: 8,
      name: "Owner",
    });

    const response = await request(app)
      .post("/api/onboarding/signup")
      .send(validBody)
      .expect(201);

    expect(response.body.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(response.body)).not.toContain("very-strong-pass-1234");
  });
});

// ---------------------------------------------------------------------------
// POST /api/onboarding/validate-url
// ---------------------------------------------------------------------------

describe("POST /api/onboarding/validate-url", () => {
  it("returns 400 when websiteUrl is missing", async () => {
    await request(app)
      .post("/api/onboarding/validate-url")
      .send({})
      .expect(400)
      .expect({ error: "Website URL is required" });
  });

  it("returns 400 for malformed URLs", async () => {
    await request(app)
      .post("/api/onboarding/validate-url")
      .send({ websiteUrl: "not-a-url" })
      .expect(400)
      .expect({ error: "Invalid URL format" });
  });

  it("returns 400 when the URL protocol is not http/https", async () => {
    await request(app)
      .post("/api/onboarding/validate-url")
      .send({ websiteUrl: "ftp://example.com" })
      .expect(400)
      .expect({ error: "URL must start with http:// or https://" });
  });

  it("returns 200 with detected platform and accessible=true when the site is reachable", async () => {
    global.fetch = (jest.fn() as any).mockResolvedValue({ ok: true }) as any;

    const response = await request(app)
      .post("/api/onboarding/validate-url")
      .send({ websiteUrl: "https://lot.dealerinspire.com" })
      .expect(200);

    expect(response.body).toMatchObject({
      valid: true,
      url: "https://lot.dealerinspire.com",
      platform: "dealer_inspire",
      accessible: true,
    });
  });

  it("returns 200 with accessible=false when the site is not reachable", async () => {
    global.fetch = (jest.fn() as any).mockRejectedValue(new Error("network down")) as any;

    const response = await request(app)
      .post("/api/onboarding/validate-url")
      .send({ websiteUrl: "https://example.com" })
      .expect(200);

    expect(response.body).toMatchObject({
      valid: true,
      platform: "generic",
      accessible: false,
    });
  });
});
