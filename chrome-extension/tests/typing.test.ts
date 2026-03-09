import { DEFAULT_TYPING_SIM, sanitizeForComposer } from "../src/automation/typing";

describe("typing", () => {
  test("sanitizeForComposer trims trailing whitespace", () => {
    expect(sanitizeForComposer("hi   ")).toBe("hi");
  });

  test("DEFAULT_TYPING_SIM has sane bounds", () => {
    expect(DEFAULT_TYPING_SIM.msPerCharMin).toBeGreaterThan(0);
    expect(DEFAULT_TYPING_SIM.msPerCharMax).toBeGreaterThan(DEFAULT_TYPING_SIM.msPerCharMin);
    expect(DEFAULT_TYPING_SIM.minTotalTypingMs).toBeLessThan(DEFAULT_TYPING_SIM.maxTotalTypingMs);
  });
});
