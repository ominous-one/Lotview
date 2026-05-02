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

  it("normalizes relative image URLs against the inventory page origin", () => {
    const vehicles = extractVehiclesFromHtml(
      [
        '<article data-vin="1HGCM82633A004352"',
        ' data-year="2023"',
        ' data-make="Honda"',
        ' data-model="Accord"',
        ' data-image="/photos/a.jpg"></article>',
      ].join(""),
      "https://olympichyundaivancouver.com/vehicles/?sale_class=used"
    );

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].images).toEqual(["https://olympichyundaivancouver.com/photos/a.jpg"]);
  });

  it("filters non-http scraped image URLs", () => {
    const vehicles = extractVehiclesFromHtml(
      [
        '<article data-vin="1HGCM82633A004352"',
        ' data-year="2023"',
        ' data-make="Honda"',
        ' data-model="Accord"',
        ' data-image="javascript:alert(1)"></article>',
      ].join(""),
      BASE_URL
    );

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].images).toEqual([]);
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

  it("parses JSON-LD currency and mileage facts strictly", () => {
    const vehicles = extractVehiclesFromHtml(
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "Vehicle",
        vehicleIdentificationNumber: "1HGCM82633A004352",
        offers: { price: "$24,995.50" },
        msrp: "32,000",
        mileageFromOdometer: { value: "12,345" },
      })}</script>`,
      BASE_URL
    );

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0]).toMatchObject({
      price: 24995.5,
      msrp: 32000,
      odometer: 12345,
    });
  });

  it("omits invalid JSON-LD numeric facts instead of emitting bad scrape facts", () => {
    const vehicles = extractVehiclesFromHtml(
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "Vehicle",
        vehicleIdentificationNumber: "1HGCM82633A004352",
        offers: { price: "-1" },
        msrp: "not-a-price",
        mileageFromOdometer: { value: "-10" },
      })}</script>`,
      BASE_URL
    );

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].price).toBeUndefined();
    expect(vehicles[0].msrp).toBeUndefined();
    expect(vehicles[0].odometer).toBeUndefined();
  });

  it("does not emit zero data-attribute prices as source facts", () => {
    const vehicles = extractVehiclesFromHtml(
      [
        '<article data-vin="1HGCM82633A004352"',
        ' data-year="2023"',
        ' data-make="Honda"',
        ' data-model="Accord"',
        ' data-price="0"',
        ' data-mileage="0"></article>',
      ].join(""),
      BASE_URL
    );

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].price).toBeUndefined();
    expect(vehicles[0].odometer).toBe(0);
  });

  it("normalizes and deduplicates JSON-LD image arrays", () => {
    const vehicles = extractVehiclesFromHtml(
      `<script type="application/ld+json">${JSON.stringify({
        "@type": "Vehicle",
        vehicleIdentificationNumber: "1HGCM82633A004352",
        image: ["/photos/front.jpg", "/photos/front.jpg", "ftp://example.com/bad.jpg"],
        url: "/vehicles/1HGCM82633A004352/",
      })}</script>`,
      BASE_URL
    );

    expect(vehicles).toHaveLength(1);
    expect(vehicles[0].images).toEqual(["https://olympichyundaivancouver.com/photos/front.jpg"]);
    expect(vehicles[0].sourceUrl).toBe("https://olympichyundaivancouver.com/vehicles/1HGCM82633A004352/");
  });

  it("surfaces storage integration failures instead of hiding them", () => {
    const source = readFileSync(resolve(process.cwd(), "server/services/scraper-olympic-hyundai.ts"), "utf8");

    expect(source).toContain("errors.push(`Vehicle dedup service unavailable: ${message}`)");
    expect(source).not.toContain("} catch {\n      console.log");
  });
});
