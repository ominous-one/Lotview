/**
 * Browser Utilities
 * 
 * Enhanced browser automation utilities including:
 * - Realistic fingerprint generation
 * - Cloudflare bypass detection and waiting
 * - Human-like behavior simulation
 * - Stable page management to prevent frame detachment
 */

import type { Browser, Page } from 'puppeteer';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Apply stealth plugin
puppeteer.use(StealthPlugin());

export interface BrowserFingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  acceptLanguage: string;
  platform: string;
  webglVendor: string;
  webglRenderer: string;
}

// Realistic Chrome user agents (update these periodically)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1680, height: 1050 },
  { width: 2560, height: 1440 },
];

const LANGUAGES = [
  'en-US,en;q=0.9',
  'en-CA,en;q=0.9,fr-CA;q=0.8',
  'en-GB,en;q=0.9',
];

const WEBGL_VENDORS = [
  'Google Inc. (NVIDIA)',
  'Google Inc. (Intel)',
  'Google Inc. (AMD)',
];

const WEBGL_RENDERERS = [
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)',
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)',
];

/**
 * Generate a random but consistent browser fingerprint
 */
export function generateRandomFingerprint(): BrowserFingerprint {
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const viewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  const acceptLanguage = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
  
  // Match platform to user agent
  let platform = 'Win32';
  if (userAgent.includes('Mac')) platform = 'MacIntel';
  else if (userAgent.includes('Linux')) platform = 'Linux x86_64';
  
  const webglVendor = WEBGL_VENDORS[Math.floor(Math.random() * WEBGL_VENDORS.length)];
  const webglRenderer = WEBGL_RENDERERS[Math.floor(Math.random() * WEBGL_RENDERERS.length)];

  return { userAgent, viewport, acceptLanguage, platform, webglVendor, webglRenderer };
}

/**
 * Apply fingerprint to a page
 */
export async function applyFingerprint(page: Page, fingerprint: BrowserFingerprint): Promise<void> {
  await page.setUserAgent(fingerprint.userAgent);
  await page.setViewport(fingerprint.viewport);
  await page.setExtraHTTPHeaders({
    'Accept-Language': fingerprint.acceptLanguage,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
  });

  // Override navigator properties
  await page.evaluateOnNewDocument((fp) => {
    // Override platform
    Object.defineProperty(navigator, 'platform', { get: () => fp.platform });
    
    // Remove webdriver flag
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    
    // Set realistic plugins count
    Object.defineProperty(navigator, 'plugins', {
      get: () => {
        const plugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
          { name: 'Native Client', filename: 'internal-nacl-plugin' },
        ];
        plugins.length = 3;
        return plugins;
      }
    });
    
    // Set realistic languages
    Object.defineProperty(navigator, 'languages', {
      get: () => fp.acceptLanguage.split(',').map(l => l.split(';')[0].trim())
    });
    
    // Override WebGL
    const getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (parameter === 37445) return fp.webglVendor;
      if (parameter === 37446) return fp.webglRenderer;
      return getParameter.call(this, parameter);
    };
    
    // Chrome object presence check
    (window as any).chrome = {
      runtime: {},
      loadTimes: function() {},
      csi: function() {},
      app: {}
    };
    
    // Permissions API override
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters: any) => (
      parameters.name === 'notifications' ?
        Promise.resolve({ state: Notification.permission } as PermissionStatus) :
        originalQuery(parameters)
    );
    
  }, fingerprint);
}

/**
 * Random delay between min and max milliseconds
 */
export async function randomDelay(min: number = 500, max: number = 2000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Check if page is showing Cloudflare challenge
 */
export async function isCloudflareChallenge(page: Page): Promise<boolean> {
  try {
    const indicators = await page.evaluate(() => {
      const content = document.body?.textContent || '';
      const title = document.title || '';
      
      return {
        checkingBrowser: content.includes('Checking your browser'),
        cloudflareText: content.includes('cloudflare'),
        cfVerification: content.includes('cf-browser-verification'),
        cfClearance: content.includes('cf_clearance'),
        justAMoment: title.includes('Just a moment'),
        challengeRunning: !!document.querySelector('#challenge-running'),
        rayId: content.includes('Ray ID'),
      };
    });
    
    return Object.values(indicators).some(v => v === true);
  } catch {
    return false;
  }
}

/**
 * Wait for Cloudflare challenge to resolve
 */
export async function waitForCloudflareResolution(
  page: Page, 
  maxWaitSeconds: number = 60,
  checkInterval: number = 2000
): Promise<boolean> {
  const maxAttempts = Math.ceil((maxWaitSeconds * 1000) / checkInterval);
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const isChallenged = await isCloudflareChallenge(page);
    
    if (!isChallenged) {
      // Wait a bit more for page to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000));
      return true;
    }
    
    if (attempt % 5 === 0 && attempt > 0) {
      console.log(`    Still waiting for Cloudflare... (${attempt * checkInterval / 1000}s)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
  }
  
  return false;
}

/**
 * Human-like scrolling behavior
 */
export async function humanLikeScroll(page: Page, scrolls: number = 5): Promise<void> {
  await page.evaluate(async (numScrolls) => {
    for (let i = 0; i < numScrolls; i++) {
      const scrollAmount = Math.floor(Math.random() * 400) + 200;
      window.scrollBy(0, scrollAmount);
      await new Promise(r => setTimeout(r, Math.random() * 300 + 100));
    }
    // Scroll back to top
    window.scrollTo(0, 0);
  }, scrolls);
}

/**
 * Scroll to load all lazy content (infinite scroll handling)
 */
export async function scrollToLoadAll(
  page: Page,
  itemSelector: string,
  maxScrolls: number = 30,
  scrollDelay: number = 1500
): Promise<number> {
  let previousCount = 0;
  let stableCount = 0;
  
  for (let i = 0; i < maxScrolls; i++) {
    // Scroll to bottom
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    
    await new Promise(resolve => setTimeout(resolve, scrollDelay));
    
    // Count items
    const currentCount = await page.evaluate((selector) => {
      return document.querySelectorAll(selector).length;
    }, itemSelector);
    
    console.log(`    Scroll ${i + 1}: Found ${currentCount} items`);
    
    if (currentCount === previousCount) {
      stableCount++;
      if (stableCount >= 3) {
        console.log(`    ✓ No new items after 3 scrolls, stopping.`);
        break;
      }
    } else {
      stableCount = 0;
    }
    
    previousCount = currentCount;
  }
  
  // Scroll back to top
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return previousCount;
}

/**
 * Launch browser with stealth settings
 */
export async function launchStealthBrowser(
  chromiumPath: string,
  options?: { headless?: boolean; proxy?: string }
): Promise<Browser> {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--window-size=1920,1080',
    '--start-maximized',
  ];
  
  if (options?.proxy) {
    args.push(`--proxy-server=${options.proxy}`);
  }
  
  return puppeteer.launch({
    headless: options?.headless ?? true,
    executablePath: chromiumPath,
    args,
    defaultViewport: null,
  });
}

/**
 * Create a fresh page with fingerprint
 * Use this when you need to reset page state to avoid frame detachment
 */
export async function createFreshPage(
  browser: Browser,
  fingerprint: BrowserFingerprint,
  cookies?: any[]
): Promise<Page> {
  const page = await browser.newPage();
  await applyFingerprint(page, fingerprint);
  
  if (cookies && cookies.length > 0) {
    await page.setCookie(...cookies);
  }
  
  // Set reasonable timeouts
  page.setDefaultNavigationTimeout(30000);
  page.setDefaultTimeout(15000);
  
  return page;
}

/**
 * Safe page navigation with Cloudflare handling
 */
export async function safeNavigate(
  page: Page,
  url: string,
  options?: { waitForSelector?: string; handleCloudflare?: boolean }
): Promise<boolean> {
  try {
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 30000 
    });
    
    // Handle Cloudflare if needed
    if (options?.handleCloudflare !== false) {
      const isChallenged = await isCloudflareChallenge(page);
      if (isChallenged) {
        console.log('    ⚠ Cloudflare challenge detected, waiting...');
        const resolved = await waitForCloudflareResolution(page, 60);
        if (!resolved) {
          console.log('    ✗ Cloudflare challenge did not resolve');
          return false;
        }
        console.log('    ✓ Cloudflare challenge resolved');
      }
    }
    
    // Wait for specific selector if provided
    if (options?.waitForSelector) {
      await page.waitForSelector(options.waitForSelector, { timeout: 15000 });
    }
    
    return true;
  } catch (error) {
    console.log(`    ✗ Navigation error: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
