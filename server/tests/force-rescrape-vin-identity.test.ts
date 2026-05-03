import { jest } from "@jest/globals";
import { resolveForceRescrapeVINUpdate } from "../services/force-rescrape-vin-identity";

describe("force rescrape VIN identity guard", () => {
  it("ignores missing scraped VINs without a duplicate lookup", async () => {
    const findVehicleByVin = jest.fn() as any;

    await expect(resolveForceRescrapeVINUpdate({
      scrapedVin: undefined,
      vehicle: { id: 42, vin: "1HGCM82633A004352" },
      dealershipId: 7,
      findVehicleByVin,
    })).resolves.toEqual({ ok: true, update: {} });

    expect(findVehicleByVin).not.toHaveBeenCalled();
  });

  it("rejects invalid scraped VINs before storage writes", async () => {
    const findVehicleByVin = jest.fn() as any;

    await expect(resolveForceRescrapeVINUpdate({
      scrapedVin: "1HGCM82643A004352",
      vehicle: { id: 42, vin: "1HGCM82633A004352" },
      dealershipId: 7,
      findVehicleByVin,
    })).resolves.toEqual({
      ok: false,
      status: 422,
      body: {
        error: "Scraped VIN is invalid; refusing to update vehicle from rescrape",
        details: {
          error: "VIN check digit is invalid",
          errorCode: "INVALID_VIN_CHECK_DIGIT",
          vin: "1HGCM82643A004352",
          expectedCheckDigit: "3",
          actualCheckDigit: "4",
        },
      },
    });

    expect(findVehicleByVin).not.toHaveBeenCalled();
  });

  it("rejects scraped VINs that do not match the current vehicle identity", async () => {
    const findVehicleByVin = jest.fn() as any;

    await expect(resolveForceRescrapeVINUpdate({
      scrapedVin: "5FNYF4H97GB045170",
      vehicle: { id: 42, vin: "1HGCM82633A004352" },
      dealershipId: 7,
      findVehicleByVin,
    })).resolves.toEqual({
      ok: false,
      status: 409,
      body: {
        error: "Scraped VIN does not match existing vehicle VIN",
        vehicleId: 42,
        currentVin: "1HGCM82633A004352",
        scrapedVin: "5FNYF4H97GB045170",
      },
    });

    expect(findVehicleByVin).not.toHaveBeenCalled();
  });

  it("rejects scraped VINs that already belong to another same-dealership vehicle", async () => {
    const findVehicleByVin = (jest.fn() as any).mockResolvedValue({
      id: 99,
      year: 2016,
      make: "Honda",
      model: "Pilot",
    });

    await expect(resolveForceRescrapeVINUpdate({
      scrapedVin: "5FNYF4H97GB045170",
      vehicle: { id: 42, vin: null },
      dealershipId: 7,
      findVehicleByVin,
    })).resolves.toEqual({
      ok: false,
      status: 409,
      body: {
        error: "Scraped VIN already belongs to another vehicle",
        existingVehicleId: 99,
        existingVehicle: "2016 Honda Pilot",
        scrapedVin: "5FNYF4H97GB045170",
      },
    });

    expect(findVehicleByVin).toHaveBeenCalledWith("5FNYF4H97GB045170", 7);
  });

  it("allows a valid scraped VIN to fill a missing vehicle VIN", async () => {
    const findVehicleByVin = (jest.fn() as any).mockResolvedValue(undefined);

    await expect(resolveForceRescrapeVINUpdate({
      scrapedVin: " 5fnyf4h97gb045170 ",
      vehicle: { id: 42, vin: null },
      dealershipId: 7,
      findVehicleByVin,
    })).resolves.toEqual({
      ok: true,
      update: { vin: "5FNYF4H97GB045170" },
    });

    expect(findVehicleByVin).toHaveBeenCalledWith("5FNYF4H97GB045170", 7);
  });

  it("normalizes the current VIN when the scraped VIN matches by identity", async () => {
    const findVehicleByVin = (jest.fn() as any).mockResolvedValue({
      id: 42,
      year: 2003,
      make: "Honda",
      model: "Accord",
    });

    await expect(resolveForceRescrapeVINUpdate({
      scrapedVin: "1HGCM82633A004352",
      vehicle: { id: 42, vin: " 1hgcm82633a004352 " },
      dealershipId: 7,
      findVehicleByVin,
    })).resolves.toEqual({
      ok: true,
      update: { vin: "1HGCM82633A004352" },
    });

    expect(findVehicleByVin).toHaveBeenCalledWith("1HGCM82633A004352", 7);
  });
});
