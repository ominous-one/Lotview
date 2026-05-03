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
  it("normalizes scraped VINs before duplicate detection", async () => {
    const canonicalVin = validVin(20);
    const vehicles = [
      scrapedVehicle(20, ` ${canonicalVin.toLowerCase()} `),
      scrapedVehicle(21, canonicalVin),
    ];

    const result = await scrapeValidator.validateScrape(7, vehicles);

    expect(result).toMatchObject({
      isValid: true,
      vehiclesFound: 2,
      validVins: 2,
      invalidVins: [],
      duplicateCount: 1,
      duplicates: [{ vin: canonicalVin, count: 2 }],
    });
    expect(result.warnings).toContain("1 duplicate vehicles detected (will be merged)");
    expect(sendScrapeFailureAlertMock).not.toHaveBeenCalled();
    expect(sendQualityAlertMock).not.toHaveBeenCalled();
  });

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

  it("fails closed when a scraped vehicle is missing required price facts", async () => {
    const vinMissingPrice = validVin(12);
    const vehicles = [
      ...Array.from({ length: 9 }, (_, index) => scrapedVehicle(index + 1)),
      {
        vin: vinMissingPrice,
        year: 2003,
        make: "Honda",
        model: "Accord",
        photos: ["missing-price.jpg"],
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
          vin: vinMissingPrice,
          missing: ["price"],
        },
      ],
    });
    expect(result.errors).toContain(
      `Missing required scrape fields in scrape result: ${vinMissingPrice}(price)`
    );
    expect(sendScrapeFailureAlertMock).toHaveBeenCalledWith(
      7,
      expect.stringContaining(vinMissingPrice)
    );
    expect(sendQualityAlertMock).not.toHaveBeenCalled();
  });

  it("fails closed when scraped price facts are non-positive or non-numeric", async () => {
    const zeroPriceVin = validVin(13);
    const stringPriceVin = validVin(14);
    const vehicles = [
      ...Array.from({ length: 8 }, (_, index) => scrapedVehicle(index + 1)),
      {
        ...scrapedVehicle(13, zeroPriceVin),
        price: 0,
      },
      {
        ...scrapedVehicle(14, stringPriceVin),
        price: "24995" as any,
      },
    ];

    const result = await scrapeValidator.validateScrape(7, vehicles);

    expect(result).toMatchObject({
      isValid: false,
      vehiclesFound: 10,
      validVins: 10,
      invalidVins: [],
      missingRequiredFields: [],
    });
    expect(result.errors).toContain(
      `Invalid required price facts in scrape result: ${zeroPriceVin}(0); ${stringPriceVin}(24995)`
    );
    expect(sendScrapeFailureAlertMock).toHaveBeenCalledWith(
      7,
      expect.stringContaining("Invalid required price facts")
    );
    expect(sendQualityAlertMock).not.toHaveBeenCalled();
  });

  it("fails closed when scraped mileage facts are negative or non-numeric", async () => {
    const negativeMileageVin = validVin(15);
    const stringOdometerVin = validVin(16);
    const vehicles = [
      ...Array.from({ length: 8 }, (_, index) => scrapedVehicle(index + 1)),
      {
        ...scrapedVehicle(15, negativeMileageVin),
        mileage: -1,
      },
      {
        ...scrapedVehicle(16, stringOdometerVin),
        odometer: "88000" as any,
      },
    ];

    const result = await scrapeValidator.validateScrape(7, vehicles);

    expect(result).toMatchObject({
      isValid: false,
      vehiclesFound: 10,
      validVins: 10,
      invalidVins: [],
      missingRequiredFields: [],
    });
    expect(result.errors).toContain(
      `Invalid scraped mileage facts in scrape result: ${negativeMileageVin}(mileage=-1); ${stringOdometerVin}(odometer=88000)`
    );
    expect(sendScrapeFailureAlertMock).toHaveBeenCalledWith(
      7,
      expect.stringContaining("Invalid scraped mileage facts")
    );
    expect(sendQualityAlertMock).not.toHaveBeenCalled();
  });

  it("fails closed when required identity facts have invalid runtime values", async () => {
    const invalidYearVin = validVin(17);
    const invalidMakeVin = validVin(18);
    const invalidModelVin = validVin(19);
    const vehicles = [
      ...Array.from({ length: 7 }, (_, index) => scrapedVehicle(index + 1)),
      {
        ...scrapedVehicle(17, invalidYearVin),
        year: 0,
      },
      {
        ...scrapedVehicle(18, invalidMakeVin),
        make: 123 as any,
      },
      {
        ...scrapedVehicle(19, invalidModelVin),
        model: "   ",
      },
    ];

    const result = await scrapeValidator.validateScrape(7, vehicles);

    expect(result).toMatchObject({
      isValid: false,
      vehiclesFound: 10,
      validVins: 10,
      invalidVins: [],
      missingRequiredFields: [],
    });
    expect(result.errors).toContain(
      `Invalid required identity facts in scrape result: ${invalidYearVin}(year=0); ${invalidMakeVin}(make=123); ${invalidModelVin}(model=   )`
    );
    expect(sendScrapeFailureAlertMock).toHaveBeenCalledWith(
      7,
      expect.stringContaining("Invalid required identity facts")
    );
    expect(sendQualityAlertMock).not.toHaveBeenCalled();
  });
});
