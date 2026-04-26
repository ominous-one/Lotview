import { describe, expect, it, beforeEach } from "vitest";

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
});

describe("Lotview frontend boot", () => {
  it("renders the application shell into #root", async () => {
    await import("./main");

    expect(document.querySelector("h1")?.textContent).toBe("Lotview");
    expect(document.body.textContent).toContain("Dealership inventory and automation platform");
  });
});
