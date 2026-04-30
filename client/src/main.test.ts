import { beforeEach, describe, expect, it, vi } from "vitest";

async function renderApp() {
  await import("./main");
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function buttonByText(text: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text)
  );

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button as HTMLButtonElement;
}

async function clickButton(text: string): Promise<void> {
  buttonByText(text).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
});

describe("Lotview frontend operations workflow", () => {
  it("renders an operations dashboard with tenant, inventory, and readiness proof signals", async () => {
    await renderApp();

    expect(document.querySelector("h1")?.textContent).toBe("Dealership Operations");
    expect(document.body.textContent).toContain("Tenant: Olympic Hyundai Vancouver");
    expect(document.body.textContent).toContain("Inventory Control");
    expect(document.body.textContent).toContain("1HGCM82633A004352");
    expect(document.body.textContent).toContain("Invalid VIN blocked");
    expect(document.body.textContent).toContain("Staging proof pending");
  });

  it("lets users switch from inventory to lead inbox state", async () => {
    await renderApp();

    await clickButton("Leads");

    expect(document.body.textContent).toContain("Lead Inbox");
    expect(document.body.textContent).toContain("Maya C.");
    expect(document.body.textContent).toContain("AI draft ready");
    expect(document.body.textContent).not.toContain("Inventory Control");
  });

  it("lets users inspect scrape proof blockers", async () => {
    await renderApp();

    await clickButton("Scrape Proof");

    expect(document.body.textContent).toContain("Scrape Run Review");
    expect(document.body.textContent).toContain("Live pagination proof missing");
    expect(document.body.textContent).toContain("Source-truth artifact missing");
    expect(document.body.textContent).toContain("Invalid VIN active-store guard tested");
  });
});
