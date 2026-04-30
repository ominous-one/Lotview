import { extractVehiclesFromHtml, toDedupVehicleData } from "../services/scraper-olympic-hyundai";
import { readFileSync } from "fs";
import { resolve } from "path";

const BASE_URL = "https://olympichyundaivancouver.com/vehicles/";

describe("Olympic Hyundai scraper extraction", () => {
  it("does not fabricate year, make, or model when data attributes are missing", () => {
    const vehicles = extractVehiclesFromHtml(
      '<article data-vin="1HGCM82633A004352" data-price="24,995"></article>',
      BASE_URL
    );

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]).toMatchObject({
      vin: "1HGCM82633A004352",
      price: 24995,
    });
    expect(vehicles[0].year).toBeUndefined();
    expect(vehicles[0].make).toBeUndefined();
    expect(vehicles[0].model).toBeUndefined();
  });

  it("keeps blank source strings undefined instead of treating them as facts", () => {
    const vehicles = extractVehiclesFromHtml(
      [
        '<article data-vin="1HGCM82633A004352"',
        ' data-year=""',
        ' data-make="   "',
        ' data-model=""',
        ' data-trim=" "',
        ' data-stock=" "></article>',
      ].join(""),
      BASE_URL
    );

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].year).toBeUndefined();
    expect(vehicles[0].make).toBeUndefined();
    expect(vehicles[0].model).toBeUndefined();
    expect(vehicles[0].trim).toBeUndefined();
    expect(vehicles[0].stockNumber).toBeUndefined();
  });

  it("extracts provided source facts without changing them", () => {
    const vehicles = extractVehiclesFromHtml(
      [
        '<article data-vin="1HGCM82633A004352"',
        ' data-year="2023"',
        ' data-make="Honda"',
        ' data-model="Accord"',
        ' data-trim="EX-L"',
        ' data-stock="A123"',
        ' data-image="/photos/a.jpg"></article>',
      ].join(""),
      BASE_URL
    );

    expect(vehicles[0]).toMatchObject({
      year: 2023,
      make: "Honda",
      model: "Accord",
      trim: "EX-L",
      stockNumber: "A123",
    });
    expect(vehicles[0].images).toHaveLength(1);
  });

  it("maps extracted vehicle facts into the dedup storage contract", () => {
    const scrapedAt = new Date("2026-04-30T00:00:00.000Z");

    const payload = toDedupVehicleData({
      vin: "1HGCM82633A004352",
      year: 2003,
      make: "Honda",
      model: "Accord",
      trim: "EX-L",
      stockNumber: "A123",
      price: 24995,
      odometer: 88000,
      exteriorColor: "Blue",
      interiorColor: "Black",
      bodyStyle: "Sedan",
      transmission: "Automatic",
      engine: "2.4L",
      drivetrain: "FWD",
      fuelType: "Gasoline",
      images: ["https://cdn.example.com/front.jpg"],
      description: "Dealer supplied description",
      sourceUrl: "https://example.com/vdp",
      scrapedAt,
    });

    expect(payload).toMatchObject({
      vin: "1HGCM82633A004352",
      year: 2003,
      make: "Honda",
      model: "Accord",
      trim: "EX-L",
      stockNumber: "A123",
      price: 24995,
      mileage: 88000,
      photos: ["https://cdn.example.com/front.jpg"],
      color: "Blue",
      exteriorColor: "Blue",
      interiorColor: "Black",
      bodyStyle: "Sedan",
      transmission: "Automatic",
      engine: "2.4L",
      drivetrain: "FWD",
      fuelType: "Gasoline",
      dealership: "Olympic Hyundai Vancouver",
      location: "Vancouver",
      description: "Dealer supplied description",
      sourceUrl: "https://example.com/vdp",
      sourceType: "olympichyundai",
      scrapedAt,
    });
  });

  it("does not fabricate JSON-LD year, make, or model fallback values", () => {
    const vehicles = extractVehiclesFromHtml(
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "Vehicle",
        vehicleIdentificationNumber: "1HGCM82633A004352",
        offers: { price: "24995" },
      })}</script>`,
      BASE_URL
    );

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]).toMatchObject({
      vin: "1HGCM82633A004352",
      price: 24995,
      sourceUrl: BASE_URL,
    });
    expect(vehicles[0].year).toBeUndefined();
    expect(vehicles[0].make).toBeUndefined();
    expect(vehicles[0].model).toBeUndefined();
  });

  it("surfaces storage integration failures instead of hiding them", () => {
    const source = readFileSync(resolve(process.cwd(), "server/services/scraper-olympic-hyundai.ts"), "utf8");

    expect(source).toContain("errors.push(`Vehicle dedup service unavailable: ${message}`)");
    expect(source).not.toContain("} catch {\n      console.log");
  });
});
