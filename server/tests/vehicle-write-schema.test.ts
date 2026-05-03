import {
  vehicleCreateRequestSchema,
  vehicleUpdateRequestSchema,
  withResolvedVehicleDealership,
} from "../services/vehicle-write-schema";

const completeVehiclePayload = {
  dealershipId: 999,
  normalizedStockNumber: "SPOOFED",
  year: 2003,
  make: "Honda",
  model: "Accord",
  trim: "EX",
  type: "Sedan",
  price: 24995,
  odometer: 120000,
  images: [],
  badges: [],
  location: "Vancouver",
  dealership: "Dealer One",
  description: "Clean local unit",
  vin: "1HGCM82633A004352",
};

describe("vehicle write request schemas", () => {
  const spoofedSystemFields = {
    lastScrapedAt: new Date("2026-01-01T00:00:00.000Z"),
    verificationStatus: "VERIFIED",
    verificationCheckedAt: new Date("2026-01-01T00:00:00.000Z"),
    missedScrapeCount: 99,
    photoStatus: "complete",
    autopostEligible: true,
    autopostBlockReason: "SPOOFED_READY",
    autopostReadyAt: new Date("2026-01-01T00:00:00.000Z"),
    cargurusPrice: 1,
    cargurusUrl: "https://example.com/cargurus",
    dealRating: "Great Deal",
    carfaxUrl: "https://example.com/fake-carfax",
    carfaxBadges: ["No Reported Accidents"],
    carfaxConfidenceScore: 100,
    carfaxLastUpdated: new Date("2026-01-01T00:00:00.000Z"),
    dealerVdpUrl: "https://example.com/source-vdp",
    videoUrl: "https://example.com/spoofed-video",
    socialTemplates: JSON.stringify({ marketplace: { title: "spoofed" } }),
    socialTemplatesGeneratedAt: new Date("2026-01-01T00:00:00.000Z"),
    fbMarketplaceDescription: "Spoofed marketplace copy",
    marketplacePostedAt: new Date("2026-01-01T00:00:00.000Z"),
    marketplacePostedBy: 999,
    deletedAt: new Date("2026-01-01T00:00:00.000Z"),
    deletedByUserId: 999,
    deletedReason: "SPOOFED_DELETE",
    lifecycleStatus: "DELETED",
    photoEnrichFailCount: 99,
    photoEnrichLastAttemptAt: new Date("2026-01-01T00:00:00.000Z"),
    photoEnrichLastError: "spoofed error",
    photoFingerprint: "spoofed-fingerprint",
    lastPriceRefreshAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  function expectSpoofedSystemFieldsStripped(parsedData: Record<string, unknown>): void {
    for (const field of Object.keys(spoofedSystemFields)) {
      expect(parsedData).not.toHaveProperty(field);
    }
  }

  it("does not require or preserve client-supplied tenant, derived identity, manual audit, or system provenance fields on create", () => {
    const parsed = vehicleCreateRequestSchema.safeParse({
      ...completeVehiclePayload,
      manualHeadline: "Spoofed headline",
      manualSubheadline: "Spoofed subheadline",
      manualDescription: "Spoofed manual copy",
      isManuallyEdited: true,
      lastEditedBy: 999,
      lastEditedAt: new Date("2026-01-01T00:00:00.000Z"),
      ...spoofedSystemFields,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("dealershipId");
      expect(parsed.data).not.toHaveProperty("normalizedStockNumber");
      expect(parsed.data).not.toHaveProperty("manualHeadline");
      expect(parsed.data).not.toHaveProperty("manualSubheadline");
      expect(parsed.data).not.toHaveProperty("manualDescription");
      expect(parsed.data).not.toHaveProperty("isManuallyEdited");
      expect(parsed.data).not.toHaveProperty("lastEditedBy");
      expect(parsed.data).not.toHaveProperty("lastEditedAt");
      expectSpoofedSystemFieldsStripped(parsed.data);
      expect(parsed.data.vin).toBe("1HGCM82633A004352");
    }
  });

  it("does not preserve client-supplied tenant, derived identity, manual audit, or system provenance fields on update", () => {
    const parsed = vehicleUpdateRequestSchema.safeParse({
      dealershipId: 999,
      normalizedStockNumber: "SPOOFED",
      manualHeadline: "Spoofed headline",
      manualSubheadline: "Spoofed subheadline",
      manualDescription: "Spoofed manual copy",
      isManuallyEdited: false,
      lastEditedBy: 999,
      lastEditedAt: new Date("2026-01-01T00:00:00.000Z"),
      ...spoofedSystemFields,
      price: 26000,
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({ price: 26000 });
    }
  });

  it("attaches only the server-resolved dealershipId before storage", () => {
    const parsed = vehicleCreateRequestSchema.parse(completeVehiclePayload);

    expect(withResolvedVehicleDealership(parsed, 1)).toMatchObject({
      dealershipId: 1,
      vin: "1HGCM82633A004352",
    });
  });
});
