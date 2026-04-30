import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const returningMock = jest.fn() as any;
const whereMock = jest.fn() as any;
const setMock = jest.fn() as any;
const updateMock = jest.fn() as any;
const deleteWhereMock = jest.fn() as any;
const deleteMock = jest.fn() as any;

let DatabaseStorageClass: typeof import("../storage").DatabaseStorage;

function getMethodSource(storageSource: string, start: string, end: string): string {
  const methodStart = storageSource.indexOf(start);
  const methodEnd = storageSource.indexOf(end, methodStart);
  return storageSource.slice(methodStart, methodEnd);
}

beforeAll(async () => {
  whereMock.mockReturnValue({ returning: returningMock });
  setMock.mockReturnValue({ where: whereMock });
  updateMock.mockReturnValue({ set: setMock });
  deleteMock.mockReturnValue({ where: deleteWhereMock });

  await (jest as any).unstable_mockModule("../db.ts", () => ({
    db: {
      update: updateMock,
      delete: deleteMock,
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
  deleteMock.mockReturnValue({ where: deleteWhereMock });
});

describe("scrape queue storage tenant boundary", () => {
  it("keeps scrape queue reads and writes scoped to dealership id", () => {
    const storageSource = readFileSync(join(process.cwd(), "server/storage.ts"), "utf8");

    expect(getMethodSource(
      storageSource,
      "async getPendingScrapeQueueItems",
      "async getIncompleteScrapeQueue"
    )).toContain("eq(scrapeQueue.dealershipId, dealershipId)");

    expect(getMethodSource(
      storageSource,
      "async updateScrapeQueueItem",
      "async markScrapeQueueCompleted"
    )).toContain("eq(scrapeQueue.dealershipId, dealershipId)");

    expect(getMethodSource(
      storageSource,
      "async markScrapeQueueCompleted",
      "async markScrapeQueueFailed"
    )).toContain("eq(scrapeQueue.dealershipId, dealershipId)");

    expect(getMethodSource(
      storageSource,
      "async markScrapeQueueFailed",
      "async clearScrapeQueue"
    )).toContain("eq(scrapeQueue.dealershipId, dealershipId)");

    expect(getMethodSource(
      storageSource,
      "async clearScrapeQueue",
      "// ====== FB MARKETPLACE REPLIES"
    )).toContain("eq(scrapeQueue.dealershipId, dealershipId)");
  });

  it("returns undefined when a dealership-scoped queue item update misses", async () => {
    returningMock.mockResolvedValue([]);
    const storage = new DatabaseStorageClass();

    const updated = await storage.updateScrapeQueueItem(42, 7, { status: "processing" });

    expect(updated).toBeUndefined();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(setMock).toHaveBeenCalledWith({ status: "processing" });
    expect(whereMock).toHaveBeenCalledTimes(1);
  });

  it("reports false when completing a queue item outside the dealership boundary", async () => {
    returningMock.mockResolvedValue([]);
    const storage = new DatabaseStorageClass();

    const completed = await storage.markScrapeQueueCompleted(42, 7, 1001);

    expect(completed).toBe(false);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "completed",
      vehicleId: 1001,
    }));
  });

  it("reports true when failing a queue item inside the dealership boundary", async () => {
    returningMock.mockResolvedValue([{ id: 42 }]);
    const storage = new DatabaseStorageClass();

    const failed = await storage.markScrapeQueueFailed(42, 7, "blocked");

    expect(failed).toBe(true);
    expect(setMock).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      errorMessage: "blocked",
    }));
  });

  it("clears queue rows only within the dealership boundary", async () => {
    const storage = new DatabaseStorageClass();

    await storage.clearScrapeQueue(99, 7);

    expect(deleteMock).toHaveBeenCalledTimes(1);
    expect(deleteWhereMock).toHaveBeenCalledTimes(1);
  });
});
