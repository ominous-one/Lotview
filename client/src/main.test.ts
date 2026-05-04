import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shouldRenderMarketingSite } from "./routing";

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

function buttonByLabel(label: string): HTMLButtonElement {
  const button = document.querySelector(`button[aria-label="${label}"]`);
  if (!button) {
    throw new Error(`Button not found: ${label}`);
  }

  return button as HTMLButtonElement;
}

async function clickButton(text: string): Promise<void> {
  buttonByText(text).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function clickButtonByLabel(label: string): Promise<void> {
  buttonByLabel(label).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function typeIntoInput(name: string, value: string): Promise<void> {
  const input = document.querySelector(`input[name="${name}"]`) as HTMLInputElement | null;
  if (!input) {
    throw new Error(`Input not found: ${name}`);
  }

  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Lotview frontend operations workflow", () => {
  it("routes apex and www hosts to marketing while keeping app hosts on operations", () => {
    expect(shouldRenderMarketingSite("lotview.ai")).toBe(true);
    expect(shouldRenderMarketingSite("www.lotview.ai")).toBe(true);
    expect(shouldRenderMarketingSite("app.lotview.ai")).toBe(false);
    expect(shouldRenderMarketingSite("lotview.onrender.com")).toBe(false);
    expect(shouldRenderMarketingSite("localhost", "?site=marketing")).toBe(true);
  });

  it("fetches backend health, readiness, and tenant-scoped inventory before rendering live rows", async () => {
    window.sessionStorage.setItem("lotview.auth.token", "existing-session-token");
    const fetchMock = mockFetchSequence([
      { body: { status: "healthy" } },
      { body: { status: "ready" } },
      {
        body: {
          user: {
            id: 12,
            name: "Avery Manager",
            email: "avery@example.com",
            role: "manager",
            dealershipId: 7,
            dealershipName: "Olympic Hyundai",
          },
        },
      },
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
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({ Authorization: "Bearer existing-session-token" }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/vehicles?limit=10",
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({ Authorization: "Bearer existing-session-token" }),
      }),
    );
    expect(document.body.textContent).toContain("Avery Manager");
    expect(document.body.textContent).toContain("Olympic Hyundai");
    expect(document.body.textContent).toContain("Session: authenticated");
    expect(document.body.textContent).toContain("Live vehicles from Lotview API");
    expect(document.body.textContent).toContain("HY-API-1");
    expect(document.body.textContent).toContain("$27,995");
    expect(document.body.textContent).toContain("VIN present from API");
    expect(document.body.textContent).not.toContain("H24019");
  });

  it("lets authenticated users inspect a selected vehicle row without loading unscoped detail data", async () => {
    window.sessionStorage.setItem("lotview.auth.token", "existing-session-token");
    const fetchMock = mockFetchSequence([
      { body: { status: "healthy" } },
      { body: { status: "ready" } },
      {
        body: {
          user: {
            id: 12,
            name: "Avery Manager",
            email: "avery@example.com",
            role: "manager",
            dealershipId: 7,
            dealershipName: "Olympic Hyundai",
          },
        },
      },
      {
        body: {
          data: [
            {
              stockNumber: "HY-API-1",
              vin: "KM8J33A40MU320000",
              year: 2021,
              make: "Hyundai",
              model: "Tucson",
              price: 27995,
              source: "Lotview API fixture",
              status: "active",
            },
            {
              stockNumber: "HY-API-2",
              vin: "5NMS4DAL4NH420001",
              year: 2022,
              make: "Hyundai",
              model: "Santa Fe",
              price: 34995,
              source: "Lotview API fixture",
              status: "pending_review",
            },
          ],
          pagination: { total: 2 },
        },
      },
    ]);

    await renderApp();
    await waitForText("HY-API-2");

    expect(document.body.textContent).toContain("2021 Hyundai Tucson");

    await clickButtonByLabel("Inspect HY-API-2");

    expect(document.body.textContent).toContain("2022 Hyundai Santa Fe");
    expect(document.body.textContent).toContain("5NMS4DAL4NH420001");
    expect(document.body.textContent).toContain("$34,995");
    expect(buttonByLabel("Inspect HY-API-2").getAttribute("aria-pressed")).toBe("true");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("fails closed before inventory loads when the session is unauthenticated", async () => {
    const fetchMock = mockFetchSequence([
      { body: { status: "healthy" } },
      { body: { status: "ready" } },
      { body: { error: "No token provided" }, status: 401 },
    ]);

    await renderApp();
    await waitForText("Sign In");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me", expect.objectContaining({ credentials: "same-origin" }));
    expect(document.body.textContent).toContain("No token provided");
    expect(document.body.textContent).toContain("Session: unauthenticated");
    expect(document.body.textContent).toContain("Lotview requires an authenticated dealership session.");
    expect(document.body.textContent).not.toContain("HY-API-1");
  });

  it("logs in with backend credentials before loading tenant inventory", async () => {
    const fetchMock = mockFetchSequence([
      { body: { status: "healthy" } },
      { body: { status: "ready" } },
      { body: { error: "No token provided" }, status: 401 },
      {
        body: {
          success: true,
          token: "fresh-session-token",
          user: {
            id: 31,
            name: "Login Manager",
            email: "login@example.com",
            role: "manager",
            dealershipId: 7,
            dealershipName: "Olympic Hyundai",
          },
        },
      },
      { body: { status: "healthy" } },
      { body: { status: "ready" } },
      {
        body: {
          user: {
            id: 31,
            name: "Login Manager",
            email: "login@example.com",
            role: "manager",
            dealershipId: 7,
            dealershipName: "Olympic Hyundai",
          },
        },
      },
      {
        body: {
          data: [
            {
              stockNumber: "HY-LOGIN-1",
              vin: "KM8J33A40MU320001",
              year: 2022,
              make: "Hyundai",
              model: "Santa Fe",
              price: 31995,
              source: "Lotview API fixture",
              status: "active",
            },
          ],
          pagination: { total: 1 },
        },
      },
    ]);

    await renderApp();
    await waitForText("Sign In");

    await typeIntoInput("email", "login@example.com");
    await typeIntoInput("password", "correct horse battery staple");
    await clickButton("Sign In");
    await waitForText("HY-LOGIN-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.objectContaining({
        body: JSON.stringify({ email: "login@example.com", password: "correct horse battery staple" }),
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/vehicles?limit=10",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer fresh-session-token" }),
      }),
    );
    expect(window.sessionStorage.getItem("lotview.auth.token")).toBe("fresh-session-token");
    expect(document.body.textContent).toContain("Login Manager");
    expect(document.body.textContent).toContain("Session: authenticated");
  });

  it("fails closed when inventory API lacks dealership context instead of showing static vehicle facts", async () => {
    window.sessionStorage.setItem("lotview.auth.token", "tenant-session-token");
    mockFetchSequence([
      { body: { status: "healthy" } },
      { body: { status: "ready" } },
      {
        body: {
          user: {
            id: 13,
            name: "No Tenant User",
            email: "no-tenant@example.com",
            role: "manager",
            dealershipId: 7,
          },
        },
      },
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
    window.sessionStorage.setItem("lotview.auth.token", "proof-session-token");
    mockFetchSequence([
      { body: { status: "healthy" } },
      { body: { status: "ready" } },
      {
        body: {
          user: {
            id: 14,
            name: "Proof Reviewer",
            email: "proof@example.com",
            role: "manager",
            dealershipId: 7,
          },
        },
      },
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
