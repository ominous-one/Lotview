import { extractVehiclesFromHtml } from "../services/scraper-olympic-hyundai";

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
});
