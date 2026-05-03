import {
  applyMerge,
  buildSmartMergeStoragePatch,
  createDefaultMergeRules,
  isSmartMergeScrapeField,
  smartMerge,
} from "../services/smart-merge";

const currentVehicle = {
  id: 42,
  dealershipId: 1,
  year: 2024,
  make: "Honda",
  model: "Accord",
  trim: "EX",
  type: "Sedan",
  price: 25000,
  odometer: 12000,
  images: ["https://cdn.lotview.test/current.jpg"],
  badges: [],
  location: "Vancouver",
  dealership: "Dealer One",
  description: "Manual description",
  description_source: "manual",
  lifecycleStatus: "ACTIVE",
};

describe("smart merge field allowlist", () => {
  it("allows expected scrape fields while skipping tenant, identity, and system fields", () => {
    const result = smartMerge(
      currentVehicle,
      {
        price: 26000,
        dealershipId: 999,
        id: 999,
        vin: "1HGCM82633A004352",
        stockNumber: "SPOOFED",
        normalizedStockNumber: "SPOOFED",
        lifecycleStatus: "DELETED",
        deletedAt: "2026-01-01T00:00:00.000Z",
        lastEditedBy: 999,
        marketplacePostedBy: 999,
        unknownAdminFlag: true,
      },
      createDefaultMergeRules(1, 42),
      "manager",
      "scrape",
    );

    expect(result.updated).toMatchObject({
      price: {
        old: 25000,
        new: 26000,
        source: "scrape",
      },
    });

    for (const field of [
      "dealershipId",
      "id",
      "vin",
      "stockNumber",
      "normalizedStockNumber",
      "lifecycleStatus",
      "deletedAt",
      "lastEditedBy",
      "marketplacePostedBy",
      "unknownAdminFlag",
    ]) {
      expect(result.updated).not.toHaveProperty(field);
      expect(result.skipped[field]?.reason).toBe("Field is not allowed for scrape smart merge");
    }
  });

  it("builds storage patches from changed scrape fields only", () => {
    const result = smartMerge(
      currentVehicle,
      {
        price: 26000,
        dealershipId: 999,
        id: 999,
        normalizedStockNumber: "SPOOFED",
      },
      createDefaultMergeRules(1, 42),
      "manager",
      "scrape",
    );

    expect(buildSmartMergeStoragePatch(result)).toEqual({ price: 26000 });
  });

  it("does not let applyMerge rewrite tenant ownership from rejected incoming fields", () => {
    const result = smartMerge(
      currentVehicle,
      {
        dealershipId: 999,
        id: 999,
        price: 26000,
      },
      createDefaultMergeRules(1, 42),
      "manager",
      "scrape",
    );

    const updated = applyMerge(currentVehicle, result, "scrape");

    expect(updated.id).toBe(42);
    expect(updated.dealershipId).toBe(1);
    expect(updated.price).toBe(26000);
  });

  it("keeps manual source preservation for allowed scrape fields", () => {
    const result = smartMerge(
      currentVehicle,
      {
        description: "Scraped overwrite attempt",
      },
      createDefaultMergeRules(1, 42),
      "manager",
      "scrape",
    );

    expect(isSmartMergeScrapeField("description")).toBe(true);
    expect(result.updated).not.toHaveProperty("description");
    expect(result.skipped.description?.reason).toContain("preserved");
  });
});
