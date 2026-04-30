import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";

const storageMock = {
  createVehicle: jest.fn() as any,
  getVehicleByVin: jest.fn() as any,
};

const isEnabledMock = jest.fn() as any;
const validateScrapeMock = jest.fn() as any;
const deduplicateAndStoreMock = jest.fn() as any;
const enrichPhotosSafelyMock = jest.fn() as any;
const runScheduledAlertChecksMock = jest.fn() as any;

let schedulerIntegration: typeof import("../services/scheduler-integration");

const scrapedVehicles = [
  {
    vin: "1HGCM82633A004352",
    price: 24995,
    year: 2003,
    make: "Honda",
    model: "Accord",
    photos: ["front.jpg"],
  },
];

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../storage", () => ({
    storage: storageMock,
  }));

  await (jest as any).unstable_mockModule("../services/feature-flags", () => ({
    isEnabled: isEnabledMock,
  }));

  await (jest as any).unstable_mockModule("../services/scrape-validator", () => ({
    validateScrape: validateScrapeMock,
  }));

  await (jest as any).unstable_mockModule("../services/vehicle-dedup", () => ({
    deduplicateAndStore: deduplicateAndStoreMock,
  }));

  await (jest as any).unstable_mockModule("../services/photo-guard", () => ({
    enrichPhotosSafely: enrichPhotosSafelyMock,
  }));

  await (jest as any).unstable_mockModule("../services/scrape-alerts", () => ({
    runScheduledAlertChecks: runScheduledAlertChecksMock,
  }));

  await (jest as any).unstable_mockModule("../services/ai-cost-tracker", () => ({
    recordAICall: jest.fn(),
    isUnderBudget: jest.fn(),
    selectModel: jest.fn(),
  }));

  await (jest as any).unstable_mockModule("../services/fb-ban-recovery", () => ({
    checkAccountHealth: jest.fn(),
    getCurrentPostingLimit: jest.fn(),
    recordPostAttempt: jest.fn(),
  }));

  await (jest as any).unstable_mockModule("../services/ai-posting-optimizer", () => ({
    getOptimizedPosting: jest.fn(),
    recordPostingResult: jest.fn(),
  }));

  await (jest as any).unstable_mockModule("../services/calendar-sync", () => ({
    sendAppointmentReminders: jest.fn(),
  }));

  await (jest as any).unstable_mockModule("../services/webhook-verifier", () => ({
    processWebhookRetries: jest.fn(),
  }));

  schedulerIntegration = await import("../services/scheduler-integration");
});

beforeEach(() => {
  jest.clearAllMocks();
  isEnabledMock.mockResolvedValue(true);
  validateScrapeMock.mockResolvedValue({
    isValid: true,
    score: 96,
    vehiclesFound: scrapedVehicles.length,
    errors: [],
  });
  deduplicateAndStoreMock.mockResolvedValue({
    inserted: 1,
    merged: 0,
    skipped: 0,
  });
  storageMock.getVehicleByVin.mockResolvedValue({ id: 42 });
});

describe("scrape pipeline fail-closed behavior", () => {
  it("does not store active inventory when scrape validation is disabled", async () => {
    isEnabledMock.mockImplementation(async (flag: string) => flag !== "scrape_validation");

    const result = await schedulerIntegration.runEnhancedScrape(7, scrapedVehicles);

    expect(result).toMatchObject({
      success: false,
      validation: { isValid: false, score: 0, vehiclesFound: 1 },
      dedup: { inserted: 0, merged: 0, skipped: 0 },
      error: "scrape_validation_disabled",
    });
    expect(validateScrapeMock).not.toHaveBeenCalled();
    expect(deduplicateAndStoreMock).not.toHaveBeenCalled();
    expect(storageMock.createVehicle).not.toHaveBeenCalled();
  });

  it("does not store active inventory when vehicle deduplication is disabled", async () => {
    isEnabledMock.mockImplementation(async (flag: string) => flag !== "vehicle_deduplication");

    const result = await schedulerIntegration.runEnhancedScrape(7, scrapedVehicles);

    expect(validateScrapeMock).toHaveBeenCalledWith(7, scrapedVehicles);
    expect(result).toMatchObject({
      success: false,
      validation: { isValid: true, score: 96, vehiclesFound: 1 },
      dedup: { inserted: 0, merged: 0, skipped: 0 },
      error: "vehicle_deduplication_disabled",
    });
    expect(deduplicateAndStoreMock).not.toHaveBeenCalled();
    expect(storageMock.createVehicle).not.toHaveBeenCalled();
    expect(enrichPhotosSafelyMock).not.toHaveBeenCalled();
  });

  it("uses validation, deduplication, and scoped photo enrichment when safety flags are enabled", async () => {
    const result = await schedulerIntegration.runEnhancedScrape(7, scrapedVehicles);

    expect(validateScrapeMock).toHaveBeenCalledWith(7, scrapedVehicles);
    expect(deduplicateAndStoreMock).toHaveBeenCalledWith(7, scrapedVehicles);
    expect(storageMock.getVehicleByVin).toHaveBeenCalledWith("1HGCM82633A004352", 7);
    expect(enrichPhotosSafelyMock).toHaveBeenCalledWith(7, 42, ["front.jpg"]);
    expect(result).toMatchObject({
      success: true,
      validation: { isValid: true, score: 96, vehiclesFound: 1 },
      dedup: { inserted: 1, merged: 0, skipped: 0 },
    });
  });
});
