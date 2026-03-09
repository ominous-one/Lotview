import { classifyIntent, DEFAULT_SAFETY_ENVELOPE, isWithinBusinessHours } from "../src/automation/fbPolicy";

describe("fbPolicy", () => {
  test("classifyIntent detects DNC", () => {
    const r = classifyIntent("Please stop messaging me");
    expect(r.intent).toBe("DNC");
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  test("classifyIntent allowlists availability", () => {
    const r = classifyIntent("Is this still available?");
    expect(r.intent).toBe("AVAILABILITY_CHECK");
  });

  test("classifyIntent detects negotiation", () => {
    const r = classifyIntent("What's your lowest price?");
    expect(r.intent).toBe("PRICE_NEGOTIATION");
  });

  test("business hours defaults exclude Sunday", () => {
    const sunday = new Date("2026-03-08T10:00:00"); // Sunday
    expect(isWithinBusinessHours(sunday, DEFAULT_SAFETY_ENVELOPE)).toBe(false);
  });
});
