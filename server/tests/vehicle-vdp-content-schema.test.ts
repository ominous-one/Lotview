import {
  legacyVehicleVdpContentUpdateSchema,
  vehicleVdpContentUpdateSchema,
} from "../services/vehicle-vdp-content-schema";

describe("vehicle VDP content update schemas", () => {
  it("requires at least one legacy manual VDP content field", () => {
    const parsed = legacyVehicleVdpContentUpdateSchema.safeParse({});

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        "At least one field (manualHeadline, manualSubheadline, manualDescription) is required",
      );
    }
  });

  it("rejects non-string legacy manual VDP content", () => {
    const parsed = legacyVehicleVdpContentUpdateSchema.safeParse({ manualHeadline: 123 });

    expect(parsed.success).toBe(false);
  });

  it("trims and accepts nullable legacy manual VDP content", () => {
    expect(legacyVehicleVdpContentUpdateSchema.parse({
      manualHeadline: "  Certified local trade  ",
      manualSubheadline: null,
    })).toEqual({
      manualHeadline: "Certified local trade",
      manualSubheadline: null,
    });
  });

  it("rejects overlong legacy manual headline content", () => {
    const parsed = legacyVehicleVdpContentUpdateSchema.safeParse({
      manualHeadline: "x".repeat(181),
    });

    expect(parsed.success).toBe(false);
  });

  it("requires at least one modular VDP content field", () => {
    const parsed = vehicleVdpContentUpdateSchema.safeParse({});

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        "At least one field (description, videoUrl, videoProvider) is required",
      );
    }
  });

  it("rejects unsafe video URLs", () => {
    const parsed = vehicleVdpContentUpdateSchema.safeParse({
      videoUrl: "javascript:alert(1)",
    });

    expect(parsed.success).toBe(false);
  });

  it("trims accepted modular VDP content values", () => {
    expect(vehicleVdpContentUpdateSchema.parse({
      description: "  Fresh service completed  ",
      videoUrl: "",
      videoProvider: "  walkaround  ",
    })).toEqual({
      description: "Fresh service completed",
      videoUrl: "",
      videoProvider: "walkaround",
    });
  });
});
