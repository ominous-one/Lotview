import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MockResponse = {
  body: Record<string, unknown>;
  status?: number;
};

function jsonResponse({ body, status = 200 }: MockResponse): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function mockFetchSequence(responses: MockResponse[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(jsonResponse(response));
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function renderApp() {
  await import("./main");
  await waitForText("Dealership Operations");
}

async function waitForText(text: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (document.body.textContent?.includes(text)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error(`Text not found: ${text}`);
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Lotview frontend operations workflow", () => {
  it("fetches backend health, readiness, and tenant-scoped inventory before rendering live rows", async () => {
    const fetchMock = mockFetchSequence([
      { body: { status: "healthy" } },
      { body: { status: "ready" } },
      {
        body: {
          data: [
            {
              stockNumber: "HY-API-1",
              vin: "KM8J33A40MU320000",
              year: 2021,
              make: "Hyundai",
              model: "Tucson",
              trim: "Preferred",
              price: 27995,
              source: "Lotview API fixture",
              status: "active",
            },
          ],
          pagination: { total: 1 },
        },
      },
    ]);

    await renderApp();
    await waitForText("KM8J33A40MU320000");

    expect(fetchMock).toHaveBeenCalledWith("/api/health", expect.objectContaining({ credentials: "same-origin" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/ready", expect.objectContaining({ credentials: "same-origin" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/vehicles?limit=10", expect.objectContaining({ credentials: "same-origin" }));
    expect(document.body.textContent).toContain("Live vehicles from Lotview API");
    expect(document.body.textContent).toContain("HY-API-1");
    expect(document.body.textContent).toContain("$27,995");
    expect(document.body.textContent).toContain("VIN present from API");
    expect(document.body.textContent).not.toContain("H24019");
  });

  it("fails closed when inventory API lacks dealership context instead of showing static vehicle facts", async () => {
    mockFetchSequence([
      { body: { status: "healthy" } },
      { body: { status: "ready" } },
      { body: { error: "Dealership context required" }, status: 400 },
    ]);

    await renderApp();
    await waitForText("No live inventory is shown");

    expect(document.body.textContent).toContain("Dealership context required");
    expect(document.body.textContent).toContain("No unverified inventory shown");
    expect(document.body.textContent).not.toContain("1HGCM82633A004352");
    expect(document.body.textContent).not.toContain("2INVALIDVIN00000");
  });

  it("lets users inspect lead and scrape blockers without presenting fake customer data as live", async () => {
    mockFetchSequence([
      { body: { status: "healthy" } },
      { body: { status: "ready" } },
      { body: { error: "Dealership context required" }, status: 400 },
    ]);

    await renderApp();

    await clickButton("Leads");

    expect(document.body.textContent).toContain("Lead Inbox");
    expect(document.body.textContent).toContain("No live lead data is displayed");
    expect(document.body.textContent).not.toContain("Maya C.");

    await clickButton("Scrape Proof");

    expect(document.body.textContent).toContain("Scrape Run Review");
    expect(document.body.textContent).toContain("Live pagination proof missing");
    expect(document.body.textContent).toContain("Source-truth artifact missing");
    expect(document.body.textContent).toContain("Invalid VIN active-store guard tested");
  });
});
