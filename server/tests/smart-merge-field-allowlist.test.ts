import {
  applyMerge,
  buildSmartMergeStoragePatch,
  createDefaultMergeRules,
  isSmartMergeScrapeField,
  smartMerge,
  validateSmartMergeScrapeValue,
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

  it("rejects invalid values for otherwise allowed scrape fields", () => {
    const result = smartMerge(
      currentVehicle,
      {
        price: "26000",
        year: 3026,
        odometer: 1_500_001,
        images: ["javascript:alert(1)"],
        dealerVdpUrl: "ftp://dealer.example/vdp",
        carfaxConfidenceScore: 101,
        verificationStatus: "READY",
      },
      createDefaultMergeRules(1, 42),
      "manager",
      "scrape",
    );

    expect(result.updated).toEqual({});
    expect(buildSmartMergeStoragePatch(result)).toEqual({});
    expect(result.skipped.price?.reason).toBe("Field must be an integer");
    expect(result.skipped.year?.reason).toBe("Vehicle year is outside the allowed range");
    expect(result.skipped.odometer?.reason).toBe("Vehicle odometer is outside the allowed range");
    expect(result.skipped.images?.reason).toBe("Image URLs must be HTTP or HTTPS URLs");
    expect(result.skipped.dealerVdpUrl?.reason).toBe("Field must be an HTTP or HTTPS URL");
    expect(result.skipped.carfaxConfidenceScore?.reason).toBe("Carfax confidence score must be between 0 and 100");
    expect(result.skipped.verificationStatus?.reason).toBe("Verification status is not allowed");
  });

  it("stores added photos as an image array instead of a photo count", () => {
    const result = smartMerge(
      {
        ...currentVehicle,
        images: ["https://cdn.lotview.test/current.jpg"],
      },
      {
        images: [
          "https://cdn.lotview.test/current.jpg?size=large",
          "https://cdn.lotview.test/new.jpg",
        ],
      },
      createDefaultMergeRules(1, 42),
      "manager",
      "scrape",
    );

    expect(result.updated.images?.new).toEqual([
      "https://cdn.lotview.test/current.jpg",
      "https://cdn.lotview.test/new.jpg",
    ]);
    expect(buildSmartMergeStoragePatch(result)).toEqual({
      images: [
        "https://cdn.lotview.test/current.jpg",
        "https://cdn.lotview.test/new.jpg",
      ],
    });
  });

  it("normalizes valid string and date scrape values before merge", () => {
    expect(validateSmartMergeScrapeValue("dealerVdpUrl", " https://dealer.example/vdp/42 ")).toEqual({
      ok: true,
      value: "https://dealer.example/vdp/42",
    });

    const dateResult = validateSmartMergeScrapeValue("lastScrapedAt", "2026-05-03T12:00:00.000Z");
    expect(dateResult.ok).toBe(true);
    if (dateResult.ok) {
      expect(dateResult.value).toBeInstanceOf(Date);
      expect(dateResult.value.toISOString()).toBe("2026-05-03T12:00:00.000Z");
    }
  });
});
