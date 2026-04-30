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
  it("does not require or preserve client-supplied tenant or derived identity fields on create", () => {
    const parsed = vehicleCreateRequestSchema.safeParse(completeVehiclePayload);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("dealershipId");
      expect(parsed.data).not.toHaveProperty("normalizedStockNumber");
      expect(parsed.data.vin).toBe("1HGCM82633A004352");
    }
  });

  it("does not preserve client-supplied tenant or derived identity fields on update", () => {
    const parsed = vehicleUpdateRequestSchema.safeParse({
      dealershipId: 999,
      normalizedStockNumber: "SPOOFED",
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
