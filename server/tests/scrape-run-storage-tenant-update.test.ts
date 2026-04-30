import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const returningMock = jest.fn() as any;
const whereMock = jest.fn() as any;
const setMock = jest.fn() as any;
const updateMock = jest.fn() as any;

let DatabaseStorageClass: typeof import("../storage").DatabaseStorage;

beforeAll(async () => {
  whereMock.mockReturnValue({ returning: returningMock });
  setMock.mockReturnValue({ where: whereMock });
  updateMock.mockReturnValue({ set: setMock });

  await (jest as any).unstable_mockModule("../db.ts", () => ({
    db: {
      update: updateMock,
    },
  }));

  const storageModule = await import("../storage");
  DatabaseStorageClass = storageModule.DatabaseStorage;
});

beforeEach(() => {
  jest.clearAllMocks();
  whereMock.mockReturnValue({ returning: returningMock });
  setMock.mockReturnValue({ where: whereMock });
  updateMock.mockReturnValue({ set: setMock });
});

describe("scrape run storage tenant update boundary", () => {
  it("requires scrape run updates to include the dealership boundary", () => {
    const storageSource = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");
    const methodStart = storageSource.indexOf("async updateScrapeRun");
    const methodEnd = storageSource.indexOf("async getScrapeRuns", methodStart);
    const methodSource = storageSource.slice(methodStart, methodEnd);

    expect(methodSource).toContain("eq(scrapeRuns.id, id)");
    expect(methodSource).toContain("eq(scrapeRuns.dealershipId, dealershipId)");
    expect(methodSource).toContain("isNull(scrapeRuns.dealershipId)");
  });

  it("returns undefined when no dealership-scoped scrape run row is updated", async () => {
    returningMock.mockResolvedValue([]);
    const storage = new DatabaseStorageClass();

    const updated = await storage.updateScrapeRun(42, 7, { status: "success" });

    expect(updated).toBeUndefined();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ status: "success" });
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it("returns the updated scrape run when the dealership-scoped row matches", async () => {
    returningMock.mockResolvedValue([{ id: 42, dealershipId: 7, status: "success" }]);
    const storage = new DatabaseStorageClass();

    const updated = await storage.updateScrapeRun(42, 7, { status: "success" });

    expect(updated).toEqual({ id: 42, dealershipId: 7, status: "success" });
  });
});
