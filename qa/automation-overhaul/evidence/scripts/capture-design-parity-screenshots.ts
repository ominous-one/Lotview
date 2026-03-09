import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import process from "node:process";
import puppeteer, { type Browser, type Page } from "puppeteer";

type CliOpts = {
  baseUrl: string;
  outDir: string;
  startDevServer: boolean;
  headful: boolean;
};

function parseArgs(argv: string[]): CliOpts {
  const get = (name: string) => {
    const idx = argv.indexOf(name);
    if (idx === -1) return undefined;
    return argv[idx + 1];
  };

  const has = (name: string) => argv.includes(name);

  const baseUrl =
    get("--baseUrl") ||
    process.env.E2E_BASE_URL ||
    "http://localhost:5000";

  const outDir =
    get("--outDir") ||
    process.env.E2E_SCREENSHOT_DIR ||
    path.resolve(
      process.cwd(),
      "qa/automation-overhaul/evidence/screenshots"
    );

  return {
    baseUrl,
    outDir,
    startDevServer: has("--start"),
    headful: has("--headful"),
  };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitForHttpOk(url: string, timeoutMs: number) {
  const started = Date.now();
  let lastErr: any = null;

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      // Accept 200-399 (vite dev often redirects)
      if (res.status >= 200 && res.status < 400) return;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }

    await sleep(350);
  }

  throw new Error(
    `Timed out waiting for server at ${url}. Last error: ${String(
      lastErr
    )}`
  );
}

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function safeName(s: string) {
  return s
    .replace(/^https?:\/\//, "")
    .replace(/[\/?#:&=]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

async function newAuthedPage(browser: Browser, user: any) {
  const page = await browser.newPage();

  // Deterministic auth seed (client-side route guards check localStorage)
  await page.evaluateOnNewDocument((u) => {
    try {
      localStorage.setItem("auth_token", String(u?.token || ""));
      localStorage.setItem("user", JSON.stringify({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        dealershipId: u.dealershipId,
      }));
      localStorage.setItem("olympic-theme", "light");
    } catch {
      // ignore
    }
  }, user);

  // Stabilize screenshots
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
  ]);

  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(90_000);

  return page;
}

async function gotoAndShot(page: Page, url: string, outPath: string) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  // give React + queries a beat to paint
  await page.waitForSelector("body");
  await sleep(750);

  await page.screenshot({
    path: outPath,
    fullPage: true,
  });
}

async function capture(cli: CliOpts) {
  ensureDir(cli.outDir);

  let devProc: ReturnType<typeof spawn> | null = null;

  if (cli.startDevServer) {
    // NOTE: this is best-effort. If you already have a dev server running,
    // omit --start and the script will just connect.
    devProc = spawn("npm", ["run", "dev"], {
      stdio: "inherit",
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || "development",
        // Deterministic E2E auth/tenancy bypass (LOCALHOST + NON-PROD ONLY)
        E2E_TEST_MODE: "true",
      },
    });

    // Wait for server root to respond.
    await waitForHttpOk(cli.baseUrl, 180_000);
  } else {
    await waitForHttpOk(cli.baseUrl, 20_000);
  }

  // Seed deterministic test users + dealership (requires server started with E2E_TEST_MODE=true)
  const seedRes = await fetch(`${cli.baseUrl}/api/e2e/seed`, {
    method: "POST",
    headers: { "content-type": "application/json" },
  });
  if (!seedRes.ok) {
    throw new Error(`E2E seed failed: HTTP ${seedRes.status}`);
  }
  const seeded = (await seedRes.json()) as any;
  if (!seeded?.success) {
    throw new Error(`E2E seed failed: ${JSON.stringify(seeded)}`);
  }

  const browser = await puppeteer.launch({
    headless: cli.headful ? false : "new",
    defaultViewport: null,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-features=Translate,BackForwardCache",
    ],
  });

  const userManager = seeded.manager;
  const userSales = seeded.sales;

  try {
    // === Sales: FB Inbox ===
    {
      const page = await newAuthedPage(browser, userSales);
      await gotoAndShot(
        page,
        `${cli.baseUrl}/sales/fb-inbox`,
        path.join(cli.outDir, "sales-fb-inbox.png")
      );
      await page.close();
    }

    // === Sales: FB Automation Settings ===
    {
      const page = await newAuthedPage(browser, userSales);
      await gotoAndShot(
        page,
        `${cli.baseUrl}/sales/fb-automation`,
        path.join(cli.outDir, "sales-fb-automation.png")
      );
      await page.close();
    }

    // === Sales: FB Audit Console ===
    {
      const page = await newAuthedPage(browser, userSales);
      await gotoAndShot(
        page,
        `${cli.baseUrl}/sales/fb-audit`,
        path.join(cli.outDir, "sales-fb-audit.png")
      );
      await page.close();
    }

    // === Manager: Competitive Report tab ===
    {
      const page = await newAuthedPage(browser, userManager);
      await page.goto(`${cli.baseUrl}/manager`, { waitUntil: "domcontentloaded" });

      // The manager page may render different initial cards depending on tenant/user.
      // Use the Competitive Report tab testid as the stable sync point.
      const tabSelector = '[data-testid="tab-competitive-report"]';
      await page.waitForSelector(tabSelector, { timeout: 60000 });
      await page.click(tabSelector);

      await page.waitForSelector('[data-testid="tab-content-competitive"]', { timeout: 60000 });
      await sleep(750);

      await page.screenshot({
        path: path.join(cli.outDir, "manager-competitive-report.png"),
        fullPage: true,
      });

      await page.close();
    }

    // Bonus: Manager default (Appraisal) hero for parity pack context
    {
      const page = await newAuthedPage(browser, userManager);
      await gotoAndShot(
        page,
        `${cli.baseUrl}/manager`,
        path.join(cli.outDir, "manager-dashboard.png")
      );
      await page.close();
    }

    console.log(`\n✅ Screenshots written to: ${cli.outDir}`);
  } finally {
    await browser.close();

    if (devProc) {
      // Best-effort shutdown
      devProc.kill();
    }
  }
}

const cli = parseArgs(process.argv.slice(2));

capture(cli).catch((err) => {
  console.error("\n❌ capture-design-parity-screenshots failed\n");
  console.error(err);
  process.exitCode = 1;
});
