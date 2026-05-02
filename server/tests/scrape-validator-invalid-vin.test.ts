import { beforeAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { calculateVINCheckDigit } from "../vin-validation";

const getVehiclesByDealershipMock = jest.fn() as any;
const sendScrapeFailureAlertMock = jest.fn() as any;
const sendPartialScrapeAlertMock = jest.fn() as any;
const sendQualityAlertMock = jest.fn() as any;

let scrapeValidator: typeof import("../services/scrape-validator");

beforeAll(async () => {
  await (jest as any).unstable_mockModule("../storage", () => ({
    storage: {
      getVehiclesByDealership: getVehiclesByDealershipMock,
    },
  }));

  await (jest as any).unstable_mockModule("../services/scrape-alerts", () => ({
    sendScrapeFailureAlert: sendScrapeFailureAlertMock,
    sendPartialScrapeAlert: sendPartialScrapeAlertMock,
    sendQualityAlert: sendQualityAlertMock,
  }));

  scrapeValidator = await import("../services/scrape-validator");
});

beforeEach(() => {
  jest.clearAllMocks();
  getVehiclesByDealershipMock.mockResolvedValue([]);
  sendScrapeFailureAlertMock.mockResolvedValue(undefined);
  sendPartialScrapeAlertMock.mockResolvedValue(undefined);
  sendQualityAlertMock.mockResolvedValue(undefined);
});

function validVin(index: number): string {
  const body = `1HGCM82603A${String(index).padStart(6, "0")}`;
  const checkDigit = calculateVINCheckDigit(body);

  if (!checkDigit) {
    throw new Error(`Unable to create test VIN for index ${index}`);
  }

  return `${body.slice(0, 8)}${checkDigit}${body.slice(9)}`;
}

function scrapedVehicle(index: number, vin = validVin(index)) {
  return {
    vin,
    price: 24000 + index,
    year: 2003,
    make: "Honda",
    model: "Accord",
    photos: [`vehicle-${index}.jpg`],
  };
}

describe("scrape validator invalid VIN handling", () => {
  it("fails closed when any scraped VIN fails full validation", async () => {
    const invalidVin = "1HGCM82643A004352";
    const vehicles = [
      ...Array.from({ length: 9 }, (_, index) => scrapedVehicle(index + 1)),
      scrapedVehicle(10, invalidVin),
    ];

    const result = await scrapeValidator.validateScrape(7, vehicles);

    expect(result).toMatchObject({
      isValid: false,
      vehiclesFound: 10,
      validVins: 9,
      invalidVins: [invalidVin],
    });
    expect(result.errors).toContain(`Invalid VINs present in scrape result: ${invalidVin}`);
    expect(sendScrapeFailureAlertMock).toHaveBeenCalledWith(
      7,
      expect.stringContaining(invalidVin)
    );
    expect(sendQualityAlertMock).toHaveBeenCalledWith(7, 0.9, 1);
  });

  it("fails closed when a scraped vehicle is missing identity facts", async () => {
    const vinMissingFacts = validVin(11);
    const vehicles = [
      ...Array.from({ length: 9 }, (_, index) => scrapedVehicle(index + 1)),
      {
        vin: vinMissingFacts,
        price: 24995,
        photos: ["missing-identity.jpg"],
      },
    ];

    const result = await scrapeValidator.validateScrape(7, vehicles);

    expect(result).toMatchObject({
      isValid: false,
      vehiclesFound: 10,
      validVins: 10,
      invalidVins: [],
      missingRequiredFields: [
        {
          vin: vinMissingFacts,
          missing: ["year", "make", "model"],
        },
      ],
    });
    expect(result.errors).toContain(
      `Missing required identity fields in scrape result: ${vinMissingFacts}(year,make,model)`
    );
    expect(sendScrapeFailureAlertMock).toHaveBeenCalledWith(
      7,
      expect.stringContaining(vinMissingFacts)
    );
    expect(sendQualityAlertMock).not.toHaveBeenCalled();
  });
});
