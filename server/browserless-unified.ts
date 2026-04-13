import puppeteer, { Browser, Page } from 'puppeteer';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { extractVehicleImages, validateImages } from './precision-image-extractor';
import { storage } from './storage';

export interface BrowserlessConfig {
  apiKey: string;
  endpoint?: string;
}

export interface VehicleListing {
  year: number;
  make: string;
  model: string;
  trim?: string;
  type?: string;
  price: number | null;
  odometer: number | null;
  images: string[];
  badges: string[];
  location: string;
  dealership: string;
  dealershipId: number;
  description?: string;
  vin?: string;
  stockNumber?: string;
  carfaxUrl?: string;
  dealRating?: string;
  cargurusPrice?: number;
  cargurusUrl?: string;
  dealerVdpUrl?: string;
  exteriorColor?: string;
  interiorColor?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  fuelType?: string;
  features?: string[];
  sellerType?: 'dealer' | 'private';
}

export interface ScrapeResult {
  success: boolean;
  vehicles: VehicleListing[];
  error?: string;
  method: 'browserless' | 'local_puppeteer' | 'zenrows' | 'zyte';
  duration?: number;
  sourceVehicleCount?: number;
  sourceVehicleUrls?: string[];
}

export interface MarketAnalysisResult {
  success: boolean;
  listings: VehicleListing[];
  source: 'cargurus' | 'autotrader' | 'combined';
  error?: string;
}

const DEFAULT_ENDPOINT = 'wss://chrome.browserless.io';
const UNBLOCK_ENDPOINT = 'https://production-sfo.browserless.io/unblock';
const BROWSERQL_ENDPOINT = 'https://production-sfo.browserless.io/stealth/bql';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [3000, 8000, 15000];

interface ChromiumPathResolutionOptions {
  envExecutablePath?: string | null;
  bundledExecutablePath?: string | null;
  pathExists?: (candidate: string) => boolean;
  exec?: (command: string) => string;
  platform?: NodeJS.Platform;
}

interface ExtractedVdpPageData {
  year: number;
  make: string;
  model: string;
  trim?: string;
  type: string;
  price: number | null;
  odometer: number | null;
  fallbackImages: string[];
  badges: string[];
  carfaxBadges: string[];
  location: string;
  dealership: string;
  dealershipId: number;
  description?: string;
  vin?: string;
  stockNumber?: string;
  carfaxUrl?: string | null;
  dealerVdpUrl?: string;
  exteriorColor?: string;
  interiorColor?: string;
  engine?: string;
  transmission?: string;
  drivetrain?: string;
  fuelType?: string;
  features?: string[];
}

function parseExecutableCandidates(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map(candidate => candidate.trim())
    .filter(Boolean);
}

function normalizeCarfaxDetailUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const parsed = new URL(value);
    const host = parsed.host.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    if ((host === 'www.carfax.ca' || host === 'carfax.ca' || host === 'www.carfax.com' || host === 'carfax.com') && pathname === '/') {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

export function resolveLocalChromiumExecutablePath(options: ChromiumPathResolutionOptions = {}): string | null {
  const pathExists = options.pathExists ?? existsSync;
  const exec = options.exec ?? ((command: string) => execSync(command, { encoding: 'utf8' }).trim());
  const platform = options.platform ?? process.platform;

  const candidates: string[] = [];
  const addCandidates = (value: string | null | undefined) => {
    for (const candidate of parseExecutableCandidates(value)) {
      if (!candidates.includes(candidate)) {
        candidates.push(candidate);
      }
    }
  };

  addCandidates(
    options.envExecutablePath ??
    process.env.PUPPETEER_EXECUTABLE_PATH ??
    process.env.CHROME_EXECUTABLE_PATH ??
    process.env.CHROMIUM_EXECUTABLE_PATH ??
    null,
  );

  let bundledExecutablePath = options.bundledExecutablePath ?? null;
  if (!bundledExecutablePath) {
    try {
      bundledExecutablePath = typeof puppeteer.executablePath === 'function'
        ? puppeteer.executablePath()
        : null;
    } catch {
      bundledExecutablePath = null;
    }
  }
  addCandidates(bundledExecutablePath);

  if (platform === 'win32') {
    addCandidates([
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe',
    ].join('\n'));

    for (const command of ['where chrome', 'where msedge', 'where chromium']) {
      try {
        addCandidates(exec(command));
      } catch {
        // Ignore missing executable lookups on this host.
      }
    }
  } else {
    for (const command of [
      'which chromium',
      'which chromium-browser',
      'which google-chrome',
      'which google-chrome-stable',
      'which microsoft-edge',
    ]) {
      try {
        addCandidates(exec(command));
      } catch {
        // Ignore missing executable lookups on this host.
      }
    }

    try {
      addCandidates(exec('find /nix/store -name chromium -type f -path "*/bin/chromium" 2>/dev/null | head -1'));
    } catch {
      // Ignore missing nix store lookup on non-Nix hosts.
    }
  }

  return candidates.find(candidate => pathExists(candidate)) ?? null;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class BrowserlessUnifiedService {
  private apiKey: string;
  private endpoint: string;
  private useBrowserless: boolean;
  private zenrowsApiKey: string;
  private useZenRows: boolean;
  private scrapingBeeApiKey: string;
  private useScrapingBee: boolean;
  private zyteApiKey: string;
  private useZyte: boolean;
  private localBrowser: Browser | null = null;

  constructor(config?: BrowserlessConfig) {
    this.apiKey = config?.apiKey || process.env.BROWSERLESS_API_KEY || '';
    this.zenrowsApiKey = process.env.ZENROWS_API_KEY || '';
    this.scrapingBeeApiKey = process.env.SCRAPINGBEE_API_KEY || '';
    this.zyteApiKey = process.env.ZYTE_API_KEY || '';
    this.endpoint = config?.endpoint || DEFAULT_ENDPOINT;
    this.useBrowserless = !!this.apiKey;
    this.useZenRows = !!this.zenrowsApiKey;
    this.useScrapingBee = !!this.scrapingBeeApiKey;
    this.useZyte = !!this.zyteApiKey;
    
    if (this.useBrowserless) {
      console.log('[BrowserlessUnified] Using Browserless.io cloud scraping (primary)');
    }
    if (this.useZenRows) {
      console.log('[BrowserlessUnified] ZenRows API configured for Cloudflare bypass');
    }
    if (this.useScrapingBee) {
      console.log('[BrowserlessUnified] ScrapingBee API configured for Cloudflare bypass');
    }
    if (this.useZyte) {
      console.log('[BrowserlessUnified] Zyte API configured for Cloudflare bypass');
    }
    if (!this.useBrowserless && !this.useZenRows && !this.useScrapingBee && !this.useZyte) {
      console.log('[BrowserlessUnified] No cloud API keys configured - using local Puppeteer only');
    }
  }

  /**
   * ZenRows scrape - specialized for bypassing Cloudflare Enterprise protection
   * 
   * @param url - The URL to scrape
   * @param options - Scraping options
   * @param options.jsRender - Enable JavaScript rendering (default: true)
   * @param options.premiumProxy - Use premium residential proxies (default: true)
   * @param options.waitMs - Initial wait time in ms (default: 5000)
   * @param options.proxyCountry - Proxy country code (default: 'ca')
   * @param options.scrollToBottom - Enable scroll-to-bottom for lazy loading pages (default: false)
   */
  async zenRowsScrape(url: string, options?: {
    jsRender?: boolean;
    premiumProxy?: boolean;
    waitMs?: number;
    proxyCountry?: string;
    scrollToBottom?: boolean;
  }): Promise<{ success: boolean; html?: string; error?: string }> {
    if (!this.zenrowsApiKey) {
      return { success: false, error: 'No ZenRows API key configured' };
    }

    const { 
      jsRender = true, 
      premiumProxy = true, 
      waitMs = 5000, 
      proxyCountry = 'ca',
      scrollToBottom = false 
    } = options || {};

    try {
      console.log(`[BrowserlessUnified] Using ZenRows for Cloudflare bypass: ${url}`);
      console.log(`[BrowserlessUnified] ZenRows options: jsRender=${jsRender}, premiumProxy=${premiumProxy}, wait=${waitMs}, country=${proxyCountry}, scrollToBottom=${scrollToBottom}`);

      const params = new URLSearchParams({
        url,
        apikey: this.zenrowsApiKey,
        js_render: jsRender.toString(),
        premium_proxy: premiumProxy.toString(),
        proxy_country: proxyCountry,
      });

      // Add scroll instructions for lazy-loading pages
      if (scrollToBottom) {
        const jsInstructions = [
          { "wait": 3000 },
          { "evaluate": "window.scrollTo(0, document.body.scrollHeight / 3)" },
          { "wait": 3000 },
          { "evaluate": "window.scrollTo(0, document.body.scrollHeight * 2 / 3)" },
          { "wait": 3000 },
          { "evaluate": "window.scrollTo(0, document.body.scrollHeight)" },
          { "wait": 4000 },
          { "evaluate": "window.scrollTo(0, document.body.scrollHeight)" },
          { "wait": 4000 },
          { "evaluate": "window.scrollTo(0, document.body.scrollHeight)" },
          { "wait": 5000 }
        ];
        params.set('js_instructions', JSON.stringify(jsInstructions));
        console.log('[BrowserlessUnified] ZenRows: Using enhanced scroll-to-bottom with longer waits for lazy loading');
      } else {
        // Just use simple wait
        params.set('wait', waitMs.toString());
      }

      const ZENROWS_API_URL = 'https://api.zenrows.com/v1/';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(`${ZENROWS_API_URL}?${params.toString()}`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[BrowserlessUnified] ZenRows API error: ${response.status} - ${errorText}`);
        return { success: false, error: `ZenRows API error: ${response.status} - ${errorText}` };
      }

      const html = await response.text();
      console.log(`[BrowserlessUnified] ZenRows successfully retrieved ${html.length} chars of HTML`);

      const htmlLower = html.toLowerCase();
      if (htmlLower.includes('attention required') || 
          (htmlLower.includes('checking your browser') && htmlLower.includes('cloudflare'))) {
        console.log('[BrowserlessUnified] ZenRows still got Cloudflare challenge page');
        return { success: false, error: 'Still received Cloudflare challenge page' };
      }

      return { success: true, html };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BrowserlessUnified] ZenRows error: ${errorMsg}`);
      return { success: false, error: `ZenRows failed: ${errorMsg}` };
    }
  }

  isZenRowsConfigured(): boolean {
    return this.useZenRows;
  }

  isScrapingBeeConfigured(): boolean {
    return this.useScrapingBee;
  }

  isZyteConfigured(): boolean {
    return this.useZyte;
  }

  /**
   * Zyte API scrape - powerful anti-bot bypass using Zyte Smart Proxy Manager
   * Formerly Scrapinghub, excellent for Cloudflare Enterprise protection
   * 
   * @param url - The URL to scrape
   * @param options - Scraping options
   * @param options.browserHtml - Use browser rendering (default: true for JS sites)
   * @param options.javascript - Enable JavaScript (default: true)
   * @param options.waitMs - Wait time after page load in ms (default: 5000)
   * @param options.geolocation - Geolocation for proxy (default: 'CA')
   * @param options.scrollToBottom - Scroll to load lazy content (default: false)
   */
  async zyteScrape(url: string, options?: {
    browserHtml?: boolean;
    javascript?: boolean;
    waitMs?: number;
    geolocation?: string;
    scrollToBottom?: boolean;
  }): Promise<{ success: boolean; html?: string; error?: string }> {
    if (!this.zyteApiKey) {
      return { success: false, error: 'No Zyte API key configured' };
    }

    const { 
      browserHtml = true, 
      javascript = true, 
      waitMs = 5000, 
      geolocation = 'CA',
      scrollToBottom = false 
    } = options || {};

    try {
      console.log(`[BrowserlessUnified] Using Zyte API for Cloudflare bypass: ${url}`);
      console.log(`[BrowserlessUnified] Zyte options: browserHtml=${browserHtml}, javascript=${javascript}, wait=${waitMs}, geo=${geolocation}, scrollToBottom=${scrollToBottom}`);

      const ZYTE_API_URL = 'https://api.zyte.com/v1/extract';
      
      const requestBody: Record<string, any> = {
        url,
        browserHtml,
        javascript,
        geolocation,
      };

      if (scrollToBottom) {
        // Extended scrolling sequence to capture all lazy-loaded content on listing pages
        requestBody.actions = [
          { action: 'scrollBottom' },
          { action: 'waitForTimeout', timeout: 2 },
          { action: 'scrollBottom' },
          { action: 'waitForTimeout', timeout: 2 },
          { action: 'scrollBottom' },
          { action: 'waitForTimeout', timeout: 2 },
          { action: 'scrollBottom' },
          { action: 'waitForTimeout', timeout: 2 },
          { action: 'scrollBottom' },
          { action: 'waitForTimeout', timeout: 2 },
          { action: 'scrollBottom' },
          { action: 'waitForTimeout', timeout: 3 },
        ];
      } else {
        requestBody.actions = [
          { action: 'waitForTimeout', timeout: Math.min(waitMs / 1000, 15) },
        ];
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      const authHeader = 'Basic ' + Buffer.from(this.zyteApiKey + ':').toString('base64');

      const response = await fetch(ZYTE_API_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[BrowserlessUnified] Zyte API error: ${response.status} - ${errorText}`);
        return { success: false, error: `Zyte API error: ${response.status} - ${errorText}` };
      }

      const result = await response.json();
      const html = result.browserHtml || result.httpResponseBody;
      
      if (!html) {
        console.log('[BrowserlessUnified] Zyte API returned no HTML content');
        return { success: false, error: 'Zyte API returned no HTML content' };
      }

      console.log(`[BrowserlessUnified] Zyte successfully retrieved ${html.length} chars of HTML`);

      const htmlLower = html.toLowerCase();
      if (htmlLower.includes('attention required') || 
          (htmlLower.includes('checking your browser') && htmlLower.includes('cloudflare'))) {
        console.log('[BrowserlessUnified] Zyte still got Cloudflare challenge page');
        return { success: false, error: 'Still received Cloudflare challenge page' };
      }

      return { success: true, html };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BrowserlessUnified] Zyte error: ${errorMsg}`);
      return { success: false, error: `Zyte failed: ${errorMsg}` };
    }
  }

  /**
   * ScrapingBee scrape - alternative Cloudflare bypass with stealth proxies
   * 
   * @param url - The URL to scrape
   * @param options - Scraping options
   * @param options.renderJs - Enable JavaScript rendering (default: true)
   * @param options.stealthProxy - Use stealth proxy for Cloudflare bypass (default: true)
   * @param options.countryCode - Proxy country code (default: 'ca')
   * @param options.waitMs - Wait time after page load (default: 5000)
   * @param options.scrollToBottom - Scroll to bottom for lazy loading (default: false)
   */
  async scrapingBeeScrape(url: string, options?: {
    renderJs?: boolean;
    stealthProxy?: boolean;
    countryCode?: string;
    waitMs?: number;
    scrollToBottom?: boolean;
  }): Promise<{ success: boolean; html?: string; error?: string }> {
    if (!this.scrapingBeeApiKey) {
      return { success: false, error: 'No ScrapingBee API key configured' };
    }

    const { 
      renderJs = true, 
      stealthProxy = true, 
      countryCode = 'ca',
      waitMs = 5000,
      scrollToBottom = false 
    } = options || {};

    try {
      console.log(`[BrowserlessUnified] Using ScrapingBee for Cloudflare bypass: ${url}`);
      console.log(`[BrowserlessUnified] ScrapingBee options: renderJs=${renderJs}, stealthProxy=${stealthProxy}, country=${countryCode}, scrollToBottom=${scrollToBottom}`);

      const params = new URLSearchParams({
        api_key: this.scrapingBeeApiKey,
        url,
        render_js: renderJs.toString(),
        stealth_proxy: stealthProxy.toString(),
        country_code: countryCode,
        wait: waitMs.toString(),
      });

      // Add scroll-to-bottom JS instruction if needed
      if (scrollToBottom) {
        // ScrapingBee uses js_scenario for custom JS execution
        const jsScenario = JSON.stringify({
          instructions: [
            { scroll_y: 10000 },
            { wait: 2000 },
            { scroll_y: 20000 },
            { wait: 2000 },
            { scroll_y: 30000 },
            { wait: 3000 }
          ]
        });
        params.set('js_scenario', jsScenario);
        console.log('[BrowserlessUnified] ScrapingBee: Using scroll instructions for lazy loading');
      }

      const SCRAPINGBEE_API_URL = 'https://app.scrapingbee.com/api/v1/';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch(`${SCRAPINGBEE_API_URL}?${params.toString()}`, {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[BrowserlessUnified] ScrapingBee API error: ${response.status} - ${errorText}`);
        return { success: false, error: `ScrapingBee API error: ${response.status} - ${errorText}` };
      }

      const html = await response.text();
      console.log(`[BrowserlessUnified] ScrapingBee successfully retrieved ${html.length} chars of HTML`);

      const htmlLower = html.toLowerCase();
      if (htmlLower.includes('attention required') || 
          (htmlLower.includes('checking your browser') && htmlLower.includes('cloudflare'))) {
        console.log('[BrowserlessUnified] ScrapingBee still got Cloudflare challenge page');
        return { success: false, error: 'Still received Cloudflare challenge page' };
      }

      return { success: true, html };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BrowserlessUnified] ScrapingBee error: ${errorMsg}`);
      return { success: false, error: `ScrapingBee failed: ${errorMsg}` };
    }
  }

  private getConnectionUrl(): string {
    return `${this.endpoint}?token=${this.apiKey}`;
  }

  private async connectBrowser(): Promise<{ browser: Browser; isCloud: boolean }> {
    if (this.useBrowserless) {
      try {
        console.log('[BrowserlessUnified] Connecting to Browserless.io...');
        const browser = await puppeteer.connect({
          browserWSEndpoint: this.getConnectionUrl(),
        });
        return { browser, isCloud: true };
      } catch (error) {
        console.warn('[BrowserlessUnified] Browserless connection failed, falling back to local:', error);
      }
    }

    if (!this.localBrowser) {
      const executablePath = resolveLocalChromiumExecutablePath();
      const launchOptions: Parameters<typeof puppeteer.launch>[0] = {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      };

      if (executablePath) {
        console.log(`[BrowserlessUnified] Using local Chromium: ${executablePath}`);
        launchOptions.executablePath = executablePath;
      } else {
        console.log('[BrowserlessUnified] No explicit Chromium path found; using Puppeteer default browser resolution');
      }

      this.localBrowser = await puppeteer.launch(launchOptions);
    }
    return { browser: this.localBrowser, isCloud: false };
  }

  async testConnection(): Promise<{ success: boolean; message: string; method: string }> {
    try {
      const { browser, isCloud } = await this.connectBrowser();
      const page = await browser.newPage();
      await page.goto('https://example.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      const title = await page.title();
      await page.close();
      if (isCloud) await browser.disconnect();
      
      return {
        success: true,
        message: `Connected successfully. Test page title: ${title}`,
        method: isCloud ? 'browserless' : 'local_puppeteer',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        method: 'failed',
      };
    }
  }

  async close(): Promise<void> {
    if (this.localBrowser) {
      await this.localBrowser.close();
      this.localBrowser = null;
    }
  }

  async unblockAndGetContent(url: string, useResidentialProxy: boolean = false): Promise<{
    success: boolean;
    content?: string;
    cookies?: Array<{ name: string; value: string; domain: string }>;
    browserWSEndpoint?: string;
    error?: string;
  }> {
    if (!this.apiKey) {
      return { success: false, error: 'No Browserless API key configured' };
    }

    const attempts = [
      { proxy: false, name: 'default proxy' },
      { proxy: true, name: 'residential proxy' },
    ];

    for (const attempt of attempts) {
      try {
        console.log(`[BrowserlessUnified] Using /unblock API (${attempt.name}) to bypass protection for: ${url}`);
        
        const proxyParam = attempt.proxy ? '&proxy=residential' : '';
        const unblockUrl = `${UNBLOCK_ENDPOINT}?token=${this.apiKey}${proxyParam}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        
        const response = await fetch(unblockUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url,
            browserWSEndpoint: false,
            cookies: true,
            content: true,
            screenshot: false,
            ttl: 90000,
            waitForTimeout: 10000,
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          console.log(`[BrowserlessUnified] /unblock API (${attempt.name}) returned ${response.status}: ${errorText}`);
          continue;
        }

        const result = await response.json();
        
        if (result.content) {
          const contentLower = result.content.toLowerCase();
          if (contentLower.includes('attention required') || contentLower.includes('cloudflare')) {
            console.log(`[BrowserlessUnified] /unblock API (${attempt.name}) returned Cloudflare page, trying next...`);
            continue;
          }
          
          console.log(`[BrowserlessUnified] Successfully unblocked with ${attempt.name}! Content: ${result.content.length} chars`);
          return {
            success: true,
            content: result.content,
            cookies: result.cookies,
            browserWSEndpoint: result.browserWSEndpoint,
          };
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[BrowserlessUnified] /unblock API (${attempt.name}) failed: ${errorMsg}`);
        continue;
      }
    }

    return { success: false, error: 'All unblock attempts failed (tried default and residential proxies)' };
  }

  async unblockAndConnect(url: string, useResidentialProxy: boolean = true): Promise<{
    success: boolean;
    browser?: Browser;
    cookies?: Array<{ name: string; value: string; domain: string }>;
    error?: string;
  }> {
    if (!this.apiKey) {
      return { success: false, error: 'No Browserless API key configured' };
    }

    try {
      console.log(`[BrowserlessUnified] Using /unblock API with browser reconnect for: ${url}`);
      
      const proxyParam = useResidentialProxy ? '&proxy=residential' : '';
      const unblockUrl = `${UNBLOCK_ENDPOINT}?token=${this.apiKey}${proxyParam}`;
      
      const response = await fetch(unblockUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          browserWSEndpoint: true,
          cookies: true,
          content: false,
          screenshot: false,
          ttl: 120000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `Unblock API error: ${response.status} - ${errorText}` };
      }

      const result = await response.json();
      
      if (result.browserWSEndpoint) {
        console.log('[BrowserlessUnified] Unblock successful, connecting to browser session...');
        const browser = await puppeteer.connect({
          browserWSEndpoint: result.browserWSEndpoint,
        });
        return {
          success: true,
          browser,
          cookies: result.cookies,
        };
      }

      return { success: false, error: 'No browser endpoint returned from unblock API' };
    } catch (error) {
      return { 
        success: false, 
        error: `Unblock API failed: ${error instanceof Error ? error.message : String(error)}` 
      };
    }
  }

  /**
   * BrowserQL with CAPTCHA solving - uses /stealth/bql endpoint with solve mutation
   * This is the most powerful anti-bot bypass method, capable of solving Cloudflare Turnstile
   */
  async browserQLScrape(url: string, options?: {
    timeout?: number;
    waitFor?: string;
    extractVehicleUrls?: boolean;
  }): Promise<{
    success: boolean;
    html?: string;
    vehicleUrls?: string[];
    error?: string;
    captchaSolved?: boolean;
    solveTime?: number;
  }> {
    if (!this.apiKey) {
      return { success: false, error: 'No Browserless API key configured' };
    }

    const { timeout = 120000, waitFor, extractVehicleUrls = true } = options || {};

    try {
      console.log(`[BrowserlessUnified] Using BrowserQL with CAPTCHA solving for: ${url}`);

      // Build the BrowserQL mutation with multiple bypass strategies
      // 1. First use verify for Cloudflare-specific challenges (JS challenges)
      // 2. Then use solve for CAPTCHA-type challenges (Turnstile)
      // Using firstContentfulPaint to start sooner, then wait for page to load
      const bqlMutation = `
        mutation ScrapeWithCaptchaSolve {
          goto(url: "${url}", waitUntil: firstContentfulPaint, timeout: ${timeout}) {
            status
            time
          }
          
          wait1: waitForTimeout(time: 8000) {
            time
          }
          
          solve(timeout: 90000) {
            found
            solved
            time
          }
          
          wait2: waitForTimeout(time: 5000) {
            time
          }
          
          ${waitFor ? `waitForSelector: waitForSelector(selector: "${waitFor}", timeout: 30000) { time }` : ''}
          
          html {
            html
          }
        }
      `;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout + 30000);

      const response = await fetch(`${BROWSERQL_ENDPOINT}?token=${this.apiKey}&proxy=residential`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: bqlMutation,
          variables: {},
          operationName: 'ScrapeWithCaptchaSolve',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`[BrowserlessUnified] BrowserQL returned ${response.status}: ${errorText}`);
        return { success: false, error: `BrowserQL error: ${response.status} - ${errorText}` };
      }

      const result = await response.json();
      
      // Check for GraphQL errors
      if (result.errors && result.errors.length > 0) {
        const errorMsg = result.errors.map((e: any) => e.message).join(', ');
        console.log(`[BrowserlessUnified] BrowserQL GraphQL errors: ${errorMsg}`);
        return { success: false, error: `BrowserQL GraphQL error: ${errorMsg}` };
      }

      const data = result.data;
      if (!data) {
        return { success: false, error: 'BrowserQL returned no data' };
      }

      const gotoResult = data.goto;
      const solveResult = data.solve;
      const htmlResult = data.html;

      console.log(`[BrowserlessUnified] BrowserQL results:`);
      console.log(`  - Page status: ${gotoResult?.status}, load time: ${gotoResult?.time}ms`);
      console.log(`  - CAPTCHA found: ${solveResult?.found}, solved: ${solveResult?.solved}, solve time: ${solveResult?.time}ms`);

      if (!htmlResult?.html) {
        return { success: false, error: 'BrowserQL returned no HTML content' };
      }

      const html = htmlResult.html;
      
      // Check if we still got a Cloudflare page
      const htmlLower = html.toLowerCase();
      if (htmlLower.includes('attention required') || 
          (htmlLower.includes('checking your browser') && htmlLower.includes('cloudflare'))) {
        console.log('[BrowserlessUnified] BrowserQL still got Cloudflare challenge page');
        return { success: false, error: 'Cloudflare protection still active after CAPTCHA solve attempt' };
      }

      console.log(`[BrowserlessUnified] BrowserQL successfully retrieved ${html.length} chars of HTML`);

      // Extract vehicle URLs if requested
      let vehicleUrls: string[] = [];
      if (extractVehicleUrls) {
        // Parse HTML to extract vehicle URLs using regex (cheerio would be better but keeping it simple)
        const urlMatches = html.matchAll(/href=["']([^"']*\/vehicles\/\d{4}\/[^"']+)["']/gi);
        const seen = new Set<string>();
        for (const match of urlMatches) {
          let vdpUrl = match[1];
          // Make absolute URL if needed
          if (vdpUrl.startsWith('/')) {
            const urlObj = new URL(url);
            vdpUrl = `${urlObj.origin}${vdpUrl}`;
          }
          if (!seen.has(vdpUrl)) {
            seen.add(vdpUrl);
            vehicleUrls.push(vdpUrl);
          }
        }
        console.log(`[BrowserlessUnified] BrowserQL extracted ${vehicleUrls.length} vehicle URLs`);
      }

      return {
        success: true,
        html,
        vehicleUrls,
        captchaSolved: solveResult?.solved || false,
        solveTime: solveResult?.time,
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[BrowserlessUnified] BrowserQL error: ${errorMsg}`);
      return { success: false, error: `BrowserQL failed: ${errorMsg}` };
    }
  }

  /**
   * Scrape a single VDP page using BrowserQL with CAPTCHA solving
   */
  async browserQLScrapeVdp(vdpUrl: string, context: {
    dealershipId: number;
    dealershipName: string;
    location: string;
  }): Promise<VehicleListing | null> {
    const result = await this.browserQLScrape(vdpUrl, { extractVehicleUrls: false });
    
    if (!result.success || !result.html) {
      console.warn(`[BrowserlessUnified] BrowserQL VDP scrape failed for ${vdpUrl}: ${result.error}`);
      return null;
    }

    try {
      return this.parseVdpHtml(result.html, vdpUrl, context);
    } catch (error) {
      console.warn(`[BrowserlessUnified] BrowserQL VDP parse error for ${vdpUrl}:`, error);
      return null;
    }
  }

  /**
   * Parse VDP HTML content to extract vehicle data
   */
  private parseVdpHtml(html: string, vdpUrl: string, context: {
    dealershipId: number;
    dealershipName: string;
    location: string;
  }): VehicleListing | null {
    const { dealershipId, dealershipName, location } = context;

    // Extract year/make/model from URL
    const urlMatch = vdpUrl.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\//i);
    if (!urlMatch) return null;

    const [, yearStr, makeSlug, modelSlug] = urlMatch;
    const year = parseInt(yearStr);
    const make = makeSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const model = modelSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

    // Extract price
    let price: number | null = null;
    const pricePatterns = [
      /\$\s*([\d,]+)/,
      /price[:\s]+\$?\s*([\d,]+)/i,
      /dealer\s*price[:\s]+\$?\s*([\d,]+)/i,
    ];
    for (const pattern of pricePatterns) {
      const match = html.match(pattern);
      if (match) {
        const p = parseInt(match[1].replace(/,/g, ''));
        if (p > 1000 && p < 500000) {
          price = p;
          break;
        }
      }
    }

    // Extract odometer
    let odometer: number | null = null;
    const odometerMatch = html.match(/(\d{1,3}(?:,\d{3})*)\s*km/i);
    if (odometerMatch) {
      odometer = parseInt(odometerMatch[1].replace(/,/g, ''));
    }

    // Extract images
    const images: string[] = [];
    const imgMatches = html.matchAll(/src=["']([^"']+(?:vehicle|inventory|car|auto)[^"']*\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi);
    for (const match of imgMatches) {
      const src = match[1];
      if (src.startsWith('http') && !src.includes('placeholder') && !src.includes('logo')) {
        if (!images.includes(src)) images.push(src);
      }
    }

    // Extract VIN
    let vin: string | undefined;
    const vinMatch = html.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
    if (vinMatch) vin = vinMatch[1];

    // Extract stock number
    let stockNumber: string | undefined;
    const stockMatch = html.match(/stock[#:\s]*([A-Z0-9-]+)/i);
    if (stockMatch) stockNumber = stockMatch[1];

    // Extract Carfax URL
    let carfaxUrl: string | undefined;
    const carfaxMatch = html.match(/href=["']([^"']*carfax[^"']*)["']/i);
    if (carfaxMatch) carfaxUrl = carfaxMatch[1];

    // Extract badges
    const badges: string[] = [];
    const htmlLower = html.toLowerCase();
    if (/one owner|1 owner|single owner/.test(htmlLower)) badges.push('One Owner');
    if (/no accidents?|accident[\s-]?free|clean history/.test(htmlLower)) badges.push('No Accidents');
    if (/certified|cpo|certified pre-owned/.test(htmlLower)) badges.push('Certified Pre-Owned');

    // Extract colors
    let exteriorColor: string | undefined;
    const extMatch = html.match(/exterior(?:\s*color)?[:\s]+([A-Za-z\s]+?)(?:<|&|\n|,|$)/i);
    if (extMatch) exteriorColor = extMatch[1].trim();

    let interiorColor: string | undefined;
    const intMatch = html.match(/interior(?:\s*color)?[:\s]+([A-Za-z\s]+?)(?:<|&|\n|,|$)/i);
    if (intMatch) interiorColor = intMatch[1].trim();

    // Extract drivetrain/transmission
    let transmission: string | undefined;
    if (/automatic|auto trans/i.test(html)) transmission = 'Automatic';
    else if (/manual|stick shift/i.test(html)) transmission = 'Manual';
    else if (/cvt/i.test(html)) transmission = 'CVT';

    let drivetrain: string | undefined;
    if (/\bAWD\b|all[\s-]?wheel/i.test(html)) drivetrain = 'AWD';
    else if (/\b4WD\b|four[\s-]?wheel|4x4/i.test(html)) drivetrain = '4WD';
    else if (/\bFWD\b|front[\s-]?wheel/i.test(html)) drivetrain = 'FWD';
    else if (/\bRWD\b|rear[\s-]?wheel/i.test(html)) drivetrain = 'RWD';

    // Determine vehicle type
    let type = 'SUV';
    if (/sedan/i.test(html)) type = 'Sedan';
    else if (/truck|pickup|crew cab/i.test(html)) type = 'Truck';
    else if (/hatchback/i.test(html)) type = 'Hatchback';
    else if (/coupe/i.test(html)) type = 'Coupe';
    else if (/wagon/i.test(html)) type = 'Wagon';
    else if (/minivan|van/i.test(html)) type = 'Minivan';

    return {
      year,
      make,
      model,
      type,
      price,
      odometer,
      images: images.slice(0, 20),
      badges,
      location,
      dealership: dealershipName,
      dealershipId,
      dealerVdpUrl: vdpUrl,
      vin,
      stockNumber,
      carfaxUrl,
      exteriorColor,
      interiorColor,
      transmission,
      drivetrain,
    };
  }

  private async configurePage(page: Page): Promise<void> {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });
  }

  private async prepareVdpPageForExtraction(page: Page): Promise<void> {
    try {
      await page.evaluate(() => {
        const expandSelectors = [
          '[class*="accordion"] button',
          '[class*="accordion"] [class*="trigger"]',
          '[class*="accordion"] [class*="header"]',
          '[class*="collapsible"] button',
          '[class*="expandable"] button',
          'details summary',
          'button[class*="expand"]',
          'button[class*="toggle"]',
          '[class*="show-more"]',
          '[class*="read-more"]',
          '[x-data] button',
        ];

        const clicked = new Set<Element>();
        for (const selector of expandSelectors) {
          document.querySelectorAll(selector).forEach((element) => {
            if (clicked.has(element)) return;
            const text = (element.textContent || '').trim().toLowerCase();
            if (!text || /collapse|less|hide/.test(text)) return;

            const html = element as HTMLElement;
            if (html.offsetParent === null) return;
            clicked.add(element);
            html.click();
          });
        }
      });
      await sleep(500);
    } catch {
      // Expand/collapse failures are non-fatal for VDP extraction.
    }

    try {
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight * 0.65);
      });
      await sleep(700);
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      await sleep(700);
      await page.evaluate(() => {
        window.scrollTo(0, 0);
      });
      await sleep(300);
    } catch {
      // Scroll assistance is best-effort only.
    }
  }

  private async scrapeVdpWithFreshPage(
    browser: Browser,
    vdpUrl: string,
    context: { dealershipId: number; dealershipName: string; location: string },
  ): Promise<VehicleListing | null> {
    const page = await browser.newPage();
    try {
      await this.configurePage(page);
      return await this.scrapeVdpPage(page, vdpUrl, context);
    } finally {
      try {
        await page.close();
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  async scrapeDealerInventory(
    inventoryUrl: string,
    options: {
      dealershipId: number;
      dealershipName: string;
      location?: string;
      scrapeVdp?: boolean;
      maxVehicles?: number;
      timeout?: number;
    }
  ): Promise<ScrapeResult> {
    const startTime = Date.now();
    const { dealershipId, dealershipName, location = 'BC', scrapeVdp = true, maxVehicles = 200, timeout = 120000 } = options;
    
    let browser: Browser | null = null;
    let isCloud = false;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[BrowserlessUnified] Retry attempt ${attempt + 1}/${MAX_RETRIES} after ${RETRY_DELAYS[attempt - 1]}ms`);
          await sleep(RETRY_DELAYS[attempt - 1]);
        }

        const connection = await this.connectBrowser();
        browser = connection.browser;
        isCloud = connection.isCloud;

        const page = await browser.newPage();
        await this.configurePage(page);

        console.log(`[BrowserlessUnified] Navigating to ${inventoryUrl}...`);
        await page.goto(inventoryUrl, { waitUntil: 'networkidle2', timeout });

        await page.waitForSelector('a[href*="/vehicles/"], .vehicle-card, .listing-item', { timeout: 30000 }).catch(() => {
          console.log('[BrowserlessUnified] Standard selectors not found, trying to extract anyway...');
        });

        await this.scrollToLoadAll(page, maxVehicles);

        const vehicleUrls = await this.extractVehicleUrls(page);
        console.log(`[BrowserlessUnified] Found ${vehicleUrls.length} vehicle URLs`);

        const vehicles: VehicleListing[] = [];

        if (scrapeVdp && vehicleUrls.length > 0) {
          for (const url of vehicleUrls.slice(0, maxVehicles)) {
            try {
              const vehicle = await this.scrapeVdpWithFreshPage(browser, url, { dealershipId, dealershipName, location });
              if (vehicle) vehicles.push(vehicle);
              await sleep(500 + Math.random() * 500);
            } catch (vdpError) {
              console.warn(`[BrowserlessUnified] VDP scrape failed for ${url}:`, vdpError);
            }
          }
        } else {
          const listingVehicles = await this.extractFromListingPage(page, { dealershipId, dealershipName, location });
          vehicles.push(...listingVehicles);
        }

        await page.close();
        if (isCloud) await browser.disconnect();

        return {
          success: true,
          vehicles,
          method: isCloud ? 'browserless' : 'local_puppeteer',
          duration: Date.now() - startTime,
          sourceVehicleCount: vehicleUrls.length,
          sourceVehicleUrls: vehicleUrls,
        };

      } catch (error) {
        console.error(`[BrowserlessUnified] Attempt ${attempt + 1} failed:`, error);
        if (browser && isCloud) {
          try { await browser.disconnect(); } catch {}
        }
        
        if (attempt === MAX_RETRIES - 1) {
          return {
            success: false,
            vehicles: [],
            error: error instanceof Error ? error.message : String(error),
            method: isCloud ? 'browserless' : 'local_puppeteer',
            duration: Date.now() - startTime,
            sourceVehicleCount: 0,
            sourceVehicleUrls: [],
          };
        }
      }
    }

    return { success: false, vehicles: [], error: 'Max retries exceeded', method: 'browserless', sourceVehicleCount: 0, sourceVehicleUrls: [] };
  }

  async scrapeVehicleDetail(
    vdpUrl: string,
    options: {
      dealershipId: number;
      dealershipName: string;
      location?: string;
    },
  ): Promise<VehicleListing | null> {
    const { dealershipId, dealershipName, location = 'BC' } = options;
    let browser: Browser | null = null;
    let isCloud = false;
    let page: Page | null = null;

    try {
      const connection = await this.connectBrowser();
      browser = connection.browser;
      isCloud = connection.isCloud;

      page = await browser.newPage();
      await this.configurePage(page);

      return await this.scrapeVdpPage(page, vdpUrl, {
        dealershipId,
        dealershipName,
        location,
      });
    } finally {
      if (page) {
        try {
          await page.close();
        } catch {
          // Best-effort cleanup.
        }
      }

      if (browser) {
        try {
          if (isCloud) {
            await browser.disconnect();
          }
        } catch {
          // Best-effort cleanup.
        }
      }
    }
  }

  private async scrollToLoadAll(page: Page, maxVehicles: number): Promise<void> {
    console.log('[BrowserlessUnified] Scrolling to load lazy content...');
    let previousCount = 0;
    let currentCount = 0;
    let scrollAttempts = 0;
    const maxScrollAttempts = 20;

    do {
      previousCount = currentCount;
      currentCount = await page.evaluate(() => {
        return document.querySelectorAll('a[href*="/vehicles/"], .vehicle-card, .listing-item').length;
      });

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await sleep(1500);
      scrollAttempts++;

      if (currentCount >= maxVehicles) break;
    } while (currentCount > previousCount && scrollAttempts < maxScrollAttempts);

    console.log(`[BrowserlessUnified] Found ${currentCount} items after ${scrollAttempts} scrolls`);
  }

  private async extractVehicleUrls(page: Page): Promise<string[]> {
    return page.evaluate(() => {
      const urls: string[] = [];
      const links = document.querySelectorAll('a[href*="/vehicles/"]');
      const seen = new Set<string>();

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.match(/\/vehicles\/\d{4}\/[a-z-]+\/[a-z0-9-]+\//i)) {
          const fullUrl = href.startsWith('http') ? href : `${window.location.origin}${href}`;
          if (!seen.has(fullUrl)) {
            seen.add(fullUrl);
            urls.push(fullUrl);
          }
        }
      });

      return urls;
    });
  }

  private async extractFromListingPage(
    page: Page,
    context: { dealershipId: number; dealershipName: string; location: string }
  ): Promise<VehicleListing[]> {
    const { dealershipId, dealershipName, location } = context;

    return page.evaluate((ctx) => {
      const vehicles: any[] = [];
      const links = Array.from(document.querySelectorAll('a[href*="/vehicles/"]'));
      const processedUrls = new Set<string>();

      links.forEach(link => {
        const href = link.getAttribute('href');
        if (!href || processedUrls.has(href)) return;

        const match = href.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\//i);
        if (!match) return;

        processedUrls.add(href);
        const [, yearStr, makeSlug, modelSlug] = match;
        const card = link.closest('.vehicle-card, .vehicle-item, .product-item, article, .item, .listing') || link;
        const cardText = card.textContent || '';

        const year = parseInt(yearStr);
        const make = makeSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const model = modelSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        let price: number | null = null;
        const priceElem = card.querySelector('.price, .dealer-price, [class*="price"]');
        if (priceElem) {
          const priceMatch = priceElem.textContent?.match(/\$([0-9,]+)/);
          if (priceMatch) price = parseInt(priceMatch[1].replace(/,/g, ''));
        }

        let odometer: number | null = null;
        const odometerMatch = cardText.match(/(\d+[,\d]*)\s*km/i);
        if (odometerMatch) odometer = parseInt(odometerMatch[1].replace(/,/g, ''));

        const imgElements = card.querySelectorAll('img');
        const images: string[] = [];
        imgElements.forEach((img: Element) => {
          const src = (img as HTMLImageElement).src || img.getAttribute('data-src');
          if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('no-image')) {
            images.push(src);
          }
        });

        let stockNumber: string | undefined;
        const stockMatch = cardText.match(/stock[#:\s]*([A-Z0-9-]+)/i);
        if (stockMatch) stockNumber = stockMatch[1];

        let vin: string | undefined;
        const vinMatch = cardText.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
        if (vinMatch) vin = vinMatch[1];

        const detailUrl = href.startsWith('http') ? href : `${window.location.origin}${href}`;

        vehicles.push({
          year,
          make,
          model,
          price,
          odometer,
          images,
          badges: [],
          location: ctx.location,
          dealership: ctx.dealershipName,
          dealershipId: ctx.dealershipId,
          dealerVdpUrl: detailUrl,
          stockNumber,
          vin,
        });
      });

      return vehicles;
    }, context);
  }

  private async scrapeVdpPage(
    page: Page,
    vdpUrl: string,
    context: { dealershipId: number; dealershipName: string; location: string }
  ): Promise<VehicleListing | null> {
    const { dealershipId, dealershipName, location } = context;

    try {
      await page.goto(vdpUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await Promise.race([
        page.waitForSelector('.price-block__price--primary, .main-price, [data-field="price"], [data-field="sellingPrice"], [itemprop="price"]', { timeout: 10000 }),
        page.waitForSelector('body', { timeout: 10000 }),
      ]).catch(() => undefined);
      await sleep(1500);
      await this.prepareVdpPageForExtraction(page);

      const extracted = await page.evaluate((ctx) => {
        const pageText = document.body.innerText || '';
        const pageTitle = document.querySelector('h1, .vehicle-title, .listing-title')?.textContent?.trim() || document.title || '';

        const urlMatch = window.location.pathname.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\//i);
        if (!urlMatch) return null;

        const [, yearStr, makeSlug, modelSlug] = urlMatch;
        const year = parseInt(yearStr);
        const make = makeSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const model = modelSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const allListItems = Array.from(document.querySelectorAll('li, .spec-item, [class*="spec"], [class*="detail"], dd, dt'));

        let trim = '';
        const trimSelectors = ['[class*="trim"]', '[data-trim]', '[data-field="trim"]', '.vehicle-trim', '.trim-name'];
        for (const selector of trimSelectors) {
          const trimText = document.querySelector(selector)?.textContent?.trim() || '';
          if (trimText && trimText.length < 50 && !/^\d+$/.test(trimText)) {
            trim = trimText;
            break;
          }
        }

        const knownTrims = [
          'Calligraphy', 'Ultimate', 'Preferred', 'Essential', 'Luxury', 'Technik', 'Progressiv',
          'Prestige', 'Platinum', 'Titanium', 'Premium', 'Limited', 'Trailhawk', 'Overland',
          'Touring', 'Sport', 'Hybrid', 'GT-Line', 'GT Line', 'N Line', 'A-Spec', 'Type S',
          'XSE', 'XLE', 'SE', 'SEL', 'LE', 'GT', 'EX', 'LX', 'RS', 'ST',
        ];
        if (!trim) {
          for (const knownTrim of knownTrims) {
            const pattern = new RegExp(`\\b${knownTrim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (pattern.test(pageTitle)) {
              trim = knownTrim;
              break;
            }
          }
        }
        if (!trim) {
          const cleaned = pageTitle
            .replace(new RegExp(`\\b${year}\\b`, 'g'), '')
            .replace(new RegExp(`\\b${make.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), '')
            .replace(new RegExp(`\\b${model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'ig'), '')
            .replace(/\|.*/g, '')
            .replace(/\b\d+\.\d+[LT]?\b/gi, '')
            .replace(/\b(4dr|2dr|sedan|suv|hatchback|coupe|wagon|convertible|awd|fwd|rwd|4wd|4x4)\b/gi, '')
            .replace(/[|()[\]]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          if (cleaned.length >= 2 && cleaned.length <= 40 && !/^\d+$/.test(cleaned)) {
            trim = cleaned;
          }
        }

        let price: number | null = null;
        const authoritativePriceSelectors = [
          '.price-block__price--primary',
          '.price-block__price',
          '.main-price',
          '[data-field="price"]',
          '[data-field="sellingPrice"]',
          '[data-price]',
          '[itemprop="price"]',
          '.vehicle-price__price',
          '.vehicle-price',
          '.dealer-price',
          '.selling-price',
          '.final-price',
          '.sale-price',
          '#vehicle-price',
          '#selling-price',
          '#dealer-price',
        ];
        for (const selector of authoritativePriceSelectors) {
          const priceElement = document.querySelector(selector);
          if (!priceElement) continue;
          const paymentKeywords = /payment|finance|lease|weekly|bi-?weekly|monthly|calculator|estimated/i;
          const currentClass = priceElement.getAttribute('class') || '';
          const currentId = priceElement.getAttribute('id') || '';
          const parentClass = priceElement.parentElement?.getAttribute('class') || '';
          const parentId = priceElement.parentElement?.getAttribute('id') || '';
          if (
            paymentKeywords.test(currentClass) ||
            paymentKeywords.test(currentId) ||
            paymentKeywords.test(parentClass) ||
            paymentKeywords.test(parentId)
          ) {
            continue;
          }
          const priceText =
            priceElement.textContent ||
            priceElement.getAttribute('data-value') ||
            priceElement.getAttribute('data-price') ||
            '';
          const priceMatch = priceText.match(/\$?\s*([0-9,]+)/);
          if (!priceMatch) continue;
          const value = parseInt(priceMatch[1].replace(/,/g, ''));
          if (value >= 1000 && value <= 500000) {
            price = value;
            break;
          }
        }
        if (price == null) {
          const labeledPricePatterns = [
            /(?:Sale|Selling|Asking|Dealer|Final|Internet)\s*Price[:\s]*\$?\s*([0-9,]+)/i,
            /Price[:\s]*\$?\s*([0-9,]+)(?!\s*(?:weekly|monthly|payment))/i,
            /\$\s*([0-9,]+)\s*(?:CAD|CDN|Canadian)?(?!\s*(?:weekly|monthly|payment|per))/i,
          ];
          for (const pattern of labeledPricePatterns) {
            const match = pageText.match(pattern);
            if (!match) continue;
            const value = parseInt(match[1].replace(/,/g, ''));
            if (value >= 1000 && value <= 500000) {
              price = value;
              break;
            }
          }
        }
        if (price == null) {
          const fallbackMatches = [...pageText.matchAll(/\$\s*([0-9,]+)(?!\s*(?:weekly|bi-?weekly|monthly|per\s+month|\/mo|payment))/gi)];
          const candidates = fallbackMatches
            .map((match) => parseInt(match[1].replace(/,/g, '')))
            .filter((value) => value >= 2000 && value <= 500000)
            .sort((a, b) => a - b);
          if (candidates.length > 0) {
            price = candidates[Math.floor((candidates.length - 1) / 2)] ?? null;
          }
        }

        let odometer: number | null = null;
        const odometerSelectors = [
          '[class*="odometer"]',
          '[class*="mileage"]',
          '[class*="km"]',
          '[data-odometer]',
          '.kilometers',
          '.vehicle-odometer',
        ];
        for (const selector of odometerSelectors) {
          const odometerText = document.querySelector(selector)?.textContent || '';
          const match = odometerText.match(/([0-9,]+)/);
          if (!match) continue;
          const value = parseInt(match[1].replace(/,/g, ''));
          if (value >= 500 && value < 500000) {
            odometer = value;
            break;
          }
        }
        if (odometer == null) {
          const odometerPatterns = [
            /odometer[:\s]+([0-9,]+)\s*(km)?/i,
            /mileage[:\s]+([0-9,]+)\s*(km)?/i,
            /kilometers[:\s]+([0-9,]+)/i,
            /([0-9]{1,3}(?:,[0-9]{3})+)\s*km\b/i,
          ];
          for (const pattern of odometerPatterns) {
            const match = pageText.match(pattern);
            if (!match) continue;
            const value = parseInt(match[1].replace(/,/g, ''));
            if (value >= 500 && value < 500000) {
              odometer = value;
              break;
            }
          }
        }

        let vin: string | undefined;
        const vinMatch = pageText.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
        if (vinMatch) vin = vinMatch[1];

        let stockNumber: string | undefined;
        const stockMatch = pageText.match(/stock[#:\s]*([A-Z0-9-]+)/i);
        if (stockMatch) stockNumber = stockMatch[1];

        const fallbackImages: string[] = [];
        const blockedImagePatterns = [
          'logo', 'icon', 'badge', 'banner', 'promo', 'button', 'arrow', 'placeholder',
          'no-image', 'convertus.com/uploads/sites', 'bg-', 'background', 'welcome', 'get-approved',
          '.svg', 'favicon', '/icons/', '/logos/', '/headers/', '/themes/',
        ];
        const trustedImagePatterns = [
          'autotradercdn.ca', 'photos.autotrader', 'homenetiol.com', 'homenet-inc.com',
          'dealercdn.com', 'ddclstatic.com', 'dealerinspire.com', 'photos.dealer.com',
          'spincar.com', 'evoxcdn.com', '/vehicles/', '/inventory/', '/stock/', '/photos/', '/media/', '/gallery/',
        ];
        document.querySelectorAll('img').forEach((img: Element) => {
          const src =
            (img as HTMLImageElement).currentSrc ||
            (img as HTMLImageElement).src ||
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src') ||
            '';
          if (!src) return;
          const lower = src.toLowerCase();
          if (blockedImagePatterns.some((pattern) => lower.includes(pattern))) return;
          if (!trustedImagePatterns.some((pattern) => lower.includes(pattern))) return;
          if (!fallbackImages.includes(src)) {
            fallbackImages.push(src);
          }
        });

        let exteriorColor: string | undefined;
        for (const label of ['Exterior Colou?r', 'Ext\\.?\\s*Colou?r', 'Exterior']) {
          const pattern = new RegExp(label + '[:\\s]+([^\\n|<,;]+)', 'i');
          const match = pageText.match(pattern);
          if (match?.[1]) {
            const value = match[1].trim().replace(/\s+$/, '');
            if (value && value.length < 80) {
              exteriorColor = value;
              break;
            }
          }
        }
        if (!exteriorColor) {
          for (const item of allListItems) {
            const text = item.textContent?.trim() || '';
            const match = text.match(/Exterior\s*Colou?r[:\s]+(.+)/i);
            if (match?.[1]) {
              const value = match[1].trim().split(/[,;|\n]/)[0].trim();
              if (value && value.length < 80) {
                exteriorColor = value;
                break;
              }
            }
          }
        }

        let interiorColor: string | undefined;
        for (const label of ['Interior Colou?r', 'Int\\.?\\s*Colou?r', 'Interior']) {
          const pattern = new RegExp(label + '[:\\s]+([^\\n|<,;]+)', 'i');
          const match = pageText.match(pattern);
          if (match?.[1]) {
            const value = match[1].trim().replace(/\s+$/, '');
            if (value && value.length < 80) {
              interiorColor = value;
              break;
            }
          }
        }
        if (!interiorColor) {
          for (const item of allListItems) {
            const text = item.textContent?.trim() || '';
            const match = text.match(/Interior\s*Colou?r[:\s]+(.+)/i);
            if (match?.[1]) {
              const value = match[1].trim().split(/[,;|\n]/)[0].trim();
              if (value && value.length < 80) {
                interiorColor = value;
                break;
              }
            }
          }
        }

        let engine: string | undefined;
        {
          const match = pageText.match(/Engine[:\s]+([^\n|<,;]+)/i);
          if (match?.[1]) {
            const value = match[1].trim();
            if (value && value.length < 120) {
              engine = value;
            }
          }
        }
        if (!engine) {
          for (const item of allListItems) {
            const text = item.textContent?.trim() || '';
            const match = text.match(/Engine[:\s]+(.+)/i);
            if (match?.[1]) {
              const value = match[1].trim().split(/[,;|\n]/)[0].trim();
              if (value && value.length < 120) {
                engine = value;
                break;
              }
            }
          }
        }

        let transmission: string | undefined;
        for (const label of ['Transmission', 'Trans']) {
          const pattern = new RegExp(label + '[:\\s]+([^\\n|<,;]+)', 'i');
          const match = pageText.match(pattern);
          if (match?.[1]) {
            const value = match[1].trim().replace(/\s+$/, '');
            if (value && value.length < 80) {
              transmission = value;
              break;
            }
          }
        }
        if (!transmission) {
          for (const item of allListItems) {
            const text = item.textContent?.trim() || '';
            const match = text.match(/Transmission[:\s]+(.+)/i);
            if (match?.[1]) {
              const value = match[1].trim().split(/[,;|\n]/)[0].trim();
              if (value && value.length < 80) {
                transmission = value;
                break;
              }
            }
          }
        }
        if (transmission) {
          const lower = transmission.toLowerCase();
          if (lower.includes('automatic') || lower.includes('auto')) transmission = 'Automatic';
          else if (lower.includes('manual') || lower.includes('stick')) transmission = 'Manual';
          else if (lower.includes('cvt')) transmission = 'CVT';
        }

        let drivetrain: string | undefined;
        for (const label of ['Drive\\s*Train', 'Drivetrain', 'Drive\\s*Type']) {
          const pattern = new RegExp(label + '[:\\s]+([^\\n|<,;]+)', 'i');
          const match = pageText.match(pattern);
          if (match?.[1]) {
            const value = match[1].trim().replace(/\s+$/, '');
            if (value && value.length < 80) {
              drivetrain = value;
              break;
            }
          }
        }
        if (!drivetrain) {
          for (const item of allListItems) {
            const text = item.textContent?.trim() || '';
            const match = text.match(/Drive\s*Train[:\s]+(.+)/i) || text.match(/Drivetrain[:\s]+(.+)/i);
            if (match?.[1]) {
              const value = match[1].trim().split(/[,;|\n]/)[0].trim();
              if (value && value.length < 80) {
                drivetrain = value;
                break;
              }
            }
          }
        }
        if (drivetrain) {
          const lower = drivetrain.toLowerCase();
          if (lower.includes('awd') || lower.includes('all wheel') || lower.includes('all-wheel')) drivetrain = 'AWD';
          else if (lower.includes('4wd') || lower.includes('4x4') || lower.includes('four wheel')) drivetrain = '4WD';
          else if (lower.includes('fwd') || lower.includes('front wheel') || lower.includes('front-wheel')) drivetrain = 'FWD';
          else if (lower.includes('rwd') || lower.includes('rear wheel') || lower.includes('rear-wheel')) drivetrain = 'RWD';
        }

        let fuelType = (document.querySelector('input[name="vdp-fuelType"]') as HTMLInputElement | null)?.value || null;
        if (!fuelType) {
          for (const label of ['Fuel\\s*Type', 'Fuel']) {
            const pattern = new RegExp(label + '[:\\s]+([^\\n|<,;]+)', 'i');
            const match = pageText.match(pattern);
            if (match?.[1]) {
              const value = match[1].trim().replace(/\s+$/, '');
              if (value && value.length < 80) {
                fuelType = value;
                break;
              }
            }
          }
        }
        if (!fuelType) {
          for (const item of allListItems) {
            const text = item.textContent?.trim() || '';
            const match = text.match(/Fuel\s*Type[:\s]+(.+)/i) || text.match(/Fuel[:\s]+(.+)/i);
            if (match?.[1]) {
              const value = match[1].trim().split(/[,;|\n]/)[0].trim();
              if (value && value.length < 80) {
                fuelType = value;
                break;
              }
            }
          }
        }
        if (fuelType) {
          const lower = fuelType.toLowerCase();
          if (lower.includes('electric') || lower === 'ev' || lower === 'bev') fuelType = 'Electric';
          else if (lower.includes('plug') && lower.includes('hybrid')) fuelType = 'Hybrid';
          else if (lower.includes('hybrid')) fuelType = 'Hybrid';
          else if (lower.includes('diesel')) fuelType = 'Diesel';
          else if (lower.includes('gas') || lower.includes('petrol') || lower.includes('unleaded')) fuelType = 'Gasoline';
        }

        let bodyStyle: string | undefined;
        for (const label of ['Body\\s*Style', 'Body\\s*Type']) {
          const pattern = new RegExp(label + '[:\\s]+([^\\n|<,;]+)', 'i');
          const match = pageText.match(pattern);
          if (match?.[1]) {
            const value = match[1].trim().replace(/\s+$/, '');
            if (value && value.length < 80) {
              bodyStyle = value;
              break;
            }
          }
        }
        if (!bodyStyle) {
          for (const item of allListItems) {
            const text = item.textContent?.trim() || '';
            const match = text.match(/Body\s*Style[:\s]+(.+)/i) || text.match(/Body\s*Type[:\s]+(.+)/i);
            if (match?.[1]) {
              const value = match[1].trim().split(/[,;|\n]/)[0].trim();
              if (value && value.length < 80) {
                bodyStyle = value;
                break;
              }
            }
          }
        }

        let carfaxUrl: string | null = null;
        const carfaxLinkSelectors = ['a[href*="vhr.carfax"]', 'a[href*="carfax"]', '[data-carfax-url]', '[data-carfax]'];
        for (const selector of carfaxLinkSelectors) {
          const candidates = Array.from(document.querySelectorAll(selector));
          for (const candidate of candidates) {
            const href =
              (candidate as HTMLAnchorElement).href ||
              candidate.getAttribute('data-carfax-url') ||
              candidate.getAttribute('data-carfax') ||
              candidate.getAttribute('data-href') ||
              '';
            if (!href || !/carfax/i.test(href)) continue;
            if (/vhr\.carfax|\/vehicle\/|\/vhr\/|vin=/i.test(href)) {
              carfaxUrl = href;
              break;
            }
            if (!carfaxUrl && !/^https?:\/\/(?:www\.)?carfax\.(?:ca|com)\/?$/i.test(href)) {
              carfaxUrl = href;
            }
          }
          if (carfaxUrl) break;
        }

        const carfaxBadges: string[] = [];
        document.querySelectorAll('img[src*="carfax"], img[data-src*="carfax"], img[data-lazy-src*="carfax"]').forEach((img: Element) => {
          const src = (img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '').toLowerCase();
          const alt = (img.getAttribute('alt') || '').toLowerCase();
          const dataBadge = (img.getAttribute('data-badge') || '').toLowerCase();
          if ((src.includes('oneowner') || alt.includes('one owner') || dataBadge.includes('one owner')) && !carfaxBadges.includes('One Owner')) carfaxBadges.push('One Owner');
          if ((src.includes('accidentfree') || src.includes('noaccident') || alt.includes('accident free') || alt.includes('no reported accident') || dataBadge.includes('accident')) && !carfaxBadges.includes('No Reported Accidents')) carfaxBadges.push('No Reported Accidents');
          if ((src.includes('servicehistory') || alt.includes('service history') || dataBadge.includes('service')) && !carfaxBadges.includes('Service History')) carfaxBadges.push('Service History');
          if ((src.includes('lowkilometer') || src.includes('lowmileage') || alt.includes('low km') || alt.includes('low mileage') || dataBadge.includes('low')) && !carfaxBadges.includes('Low Kilometers')) carfaxBadges.push('Low Kilometers');
        });

        const badges = [...carfaxBadges];
        const badgeText = pageText.toLowerCase();
        if (/one owner|1 owner|single owner/.test(badgeText) && !badges.includes('One Owner')) badges.push('One Owner');
        if (/no accidents?|accident[\s-]?free|clean history/.test(badgeText) && !badges.includes('No Reported Accidents')) badges.push('No Reported Accidents');
        if (/certified|cpo|certified pre-owned/.test(badgeText) && !badges.includes('Certified Pre-Owned')) badges.push('Certified Pre-Owned');

        const descriptionSelectors = ['[class*="description"]', '[class*="details"]', '[class*="comments"]', '.vehicle-description', '#description'];
        let description = '';
        for (const selector of descriptionSelectors) {
          const value = document.querySelector(selector)?.textContent?.trim() || '';
          if (value.length > 50) {
            description = value;
            break;
          }
        }
        if (!description) {
          description = 'Used vehicle. Contact dealer for more information.';
        }

        let type = bodyStyle || 'SUV';
        if (/sedan/i.test(type) || /sedan/i.test(pageText)) type = 'Sedan';
        else if (/truck|pickup|crew cab/i.test(type) || /truck|pickup|crew cab/i.test(pageText)) type = 'Truck';
        else if (/hatchback/i.test(type) || /hatchback/i.test(pageText)) type = 'Hatchback';
        else if (/coupe/i.test(type) || /coupe/i.test(pageText)) type = 'Coupe';
        else if (/wagon/i.test(type) || /wagon/i.test(pageText)) type = 'Wagon';
        else if (/minivan|van/i.test(type) || /minivan|van/i.test(pageText)) type = 'Minivan';
        else if (/suv/i.test(type) || /sport utility/i.test(pageText)) type = 'SUV';

        const features: string[] = [];
        const featurePatterns = [
          /heated seats/i, /sunroof|moonroof/i, /leather/i, /navigation|nav\b/i,
          /backup camera|rear camera/i, /bluetooth/i, /apple carplay|carplay/i,
          /android auto/i, /remote start/i, /lane assist/i, /blind spot/i,
        ];
        for (const pattern of featurePatterns) {
          if (pattern.test(pageText)) {
            const featureName = pattern.source.replace(/\\b|\\s/g, ' ').replace(/\|/g, '/').replace(/[\/\\]/g, '').trim();
            features.push(featureName);
          }
        }

        return {
          year,
          make,
          model,
          trim: trim || undefined,
          type,
          price,
          odometer,
          fallbackImages: fallbackImages.slice(0, 40),
          badges,
          carfaxBadges,
          location: ctx.location,
          dealership: ctx.dealershipName,
          dealershipId: ctx.dealershipId,
          dealerVdpUrl: window.location.href,
          description,
          vin,
          stockNumber,
          carfaxUrl,
          exteriorColor,
          interiorColor,
          engine,
          transmission,
          drivetrain,
          fuelType: fuelType || undefined,
          features,
        } satisfies ExtractedVdpPageData;
      }, context);

      if (!extracted) {
        return null;
      }

      let images = extracted.fallbackImages ?? [];
      try {
        const imageExtraction = await extractVehicleImages(page, extracted.vin ?? null, extracted.stockNumber ?? null);
        const { valid } = validateImages(imageExtraction.images, extracted.vin ?? null, extracted.stockNumber ?? null);
        const precisionImages = valid.map((image) => image.url);
        if (precisionImages.length > 0) {
          images = precisionImages;
        }
      } catch (imageError) {
        console.warn(`[BrowserlessUnified] Precision image extraction fallback for ${vdpUrl}:`, imageError);
      }

      return {
        year: extracted.year,
        make: extracted.make,
        model: extracted.model,
        trim: extracted.trim,
        type: extracted.type,
        price: extracted.price,
        odometer: extracted.odometer,
        images: images.slice(0, 40),
        badges: extracted.badges,
        location,
        dealership: dealershipName,
        dealershipId,
        description: extracted.description,
        vin: extracted.vin,
        stockNumber: extracted.stockNumber,
        carfaxUrl: normalizeCarfaxDetailUrl(extracted.carfaxUrl),
        dealerVdpUrl: extracted.dealerVdpUrl,
        exteriorColor: extracted.exteriorColor,
        interiorColor: extracted.interiorColor,
        engine: extracted.engine,
        transmission: extracted.transmission,
        drivetrain: extracted.drivetrain,
        fuelType: extracted.fuelType,
        features: extracted.features,
      };
    } catch (error) {
      console.warn(`[BrowserlessUnified] VDP scrape error for ${vdpUrl}:`, error);
      return null;
    }
  }

  async scrapeCarGurus(
    searchParams: { make: string; model: string; yearMin?: number; yearMax?: number; postalCode?: string; radiusKm?: number; maxResults?: number }
  ): Promise<MarketAnalysisResult> {
    const { make, model, yearMin, yearMax, postalCode = 'V6B2W2', radiusKm = 100, maxResults = 50 } = searchParams;

    let browser: Browser | null = null;
    let isCloud = false;

    try {
      const connection = await this.connectBrowser();
      browser = connection.browser;
      isCloud = connection.isCloud;

      const page = await browser.newPage();
      await this.configurePage(page);

      const normalizedMake = make.toLowerCase().replace(/\s+/g, '-');
      const normalizedModel = model.toLowerCase().replace(/\s+/g, '-');

      let searchUrl = `https://www.cargurus.ca/Cars/inventorylisting/viewDetailsFilterViewInventoryListing.action?zip=${postalCode}&showNegotiable=true&sortDir=ASC&sourceContext=carGurusHomePage_false_0&distance=${radiusKm}&entitySelectingHelper.selectedEntity=d${normalizedMake[0]}${normalizedMake.slice(1)}${normalizedModel[0].toUpperCase()}${normalizedModel.slice(1)}`;

      if (yearMin) searchUrl += `&startYear=${yearMin}`;
      if (yearMax) searchUrl += `&endYear=${yearMax}`;

      console.log(`[BrowserlessUnified] CarGurus search: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      await this.scrollToLoadAll(page, maxResults);

      // First pass: get listing URLs from search results
      const listingUrls = await page.evaluate(() => {
        const urls: string[] = [];
        const links = document.querySelectorAll('a[href*="/listing/"]');
        links.forEach(link => {
          const href = (link as HTMLAnchorElement).href;
          if (href && href.includes('/listing/') && !urls.includes(href)) {
            urls.push(href);
          }
        });
        return urls;
      });

      console.log(`[BrowserlessUnified] CarGurus found ${listingUrls.length} listing URLs, scraping VDP pages for accurate data...`);

      const vehicles: any[] = [];
      
      // Scrape each VDP page to get accurate mileage and colors
      for (const url of listingUrls.slice(0, maxResults)) {
        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          await sleep(500);

          const vehicleData = await page.evaluate(() => {
            // Get title from h1 or main title element
            const titleEl = document.querySelector('h1, [class*="listing-title"], [data-testid="listing-title"]');
            const title = titleEl?.textContent?.trim() || '';
            
            // Get price
            let price: number | null = null;
            const priceEl = document.querySelector('[class*="price"], [data-testid="price"], .price-section');
            if (priceEl) {
              const priceMatch = priceEl.textContent?.match(/\$([0-9,]+)/);
              if (priceMatch) price = parseInt(priceMatch[1].replace(/,/g, ''));
            }

            // Get mileage - CarGurus VDP shows mileage prominently
            let odometer: number | null = null;
            
            // Method 1: Look for dedicated mileage/odometer element
            const mileageEl = document.querySelector('[class*="mileage"], [class*="odometer"], [data-testid*="mileage"]');
            if (mileageEl) {
              const text = mileageEl.textContent || '';
              const kmMatch = text.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*km/i);
              if (kmMatch) odometer = parseInt(kmMatch[1].replace(/,/g, ''));
            }
            
            // Method 2: Look in specs/details section
            if (odometer === null) {
              const specRows = document.querySelectorAll('[class*="spec"] dt, [class*="spec"] dd, dl dt, dl dd, tr td, tr th');
              let foundMileageLabel = false;
              specRows.forEach((el, i) => {
                const text = el.textContent?.trim().toLowerCase() || '';
                if (text.includes('mileage') || text.includes('kilomet') || text.includes('odometer')) {
                  foundMileageLabel = true;
                } else if (foundMileageLabel && odometer === null) {
                  const kmMatch = text.match(/(\d{1,3}(?:,\d{3})+|\d+)/);
                  if (kmMatch) {
                    odometer = parseInt(kmMatch[1].replace(/,/g, ''));
                    foundMileageLabel = false;
                  }
                }
              });
            }
            
            // Method 3: Look for km pattern in page text with context
            if (odometer === null) {
              const pageText = document.body.textContent || '';
              const mileagePatterns = [
                /(?:mileage|kilomet|odometer)[:\s]+(\d{1,3}(?:,\d{3})+|\d+)\s*(?:km)?/gi,
                /(\d{1,3}(?:,\d{3})+|\d{3,})\s*km(?!\s*\/|\s*per|\/100)/gi,
              ];
              for (const pattern of mileagePatterns) {
                const matches = [...pageText.matchAll(pattern)];
                for (const match of matches) {
                  const value = parseInt(match[1].replace(/,/g, ''));
                  if (!isNaN(value) && value >= 100) {
                    const idx = match.index || 0;
                    const context = pageText.substring(Math.max(0, idx - 30), idx + match[0].length + 20);
                    if (!/L\/100|per\s*100|fuel|consumption|economy|range|battery/i.test(context)) {
                      odometer = value;
                      break;
                    }
                  }
                }
                if (odometer !== null) break;
              }
            }

            // Extract colors from VDP specs - CarGurus has color info in vehicle details
            let exteriorColor: string | undefined;
            let interiorColor: string | undefined;
            
            // Method 1: Look for dt/dd pairs
            const dtElements = document.querySelectorAll('dt');
            dtElements.forEach(dt => {
              const labelText = dt.textContent?.trim().toLowerCase() || '';
              const ddEl = dt.nextElementSibling;
              if (ddEl && ddEl.tagName === 'DD') {
                const value = ddEl.textContent?.trim() || '';
                if ((labelText.includes('exterior') && labelText.includes('colo')) || labelText === 'exterior') {
                  if (value && !exteriorColor) exteriorColor = value;
                }
                if ((labelText.includes('interior') && labelText.includes('colo')) || labelText === 'interior') {
                  if (value && !interiorColor) interiorColor = value;
                }
              }
            });
            
            // Method 2: Look for labeled color sections
            if (!exteriorColor || !interiorColor) {
              const allText = document.body.textContent || '';
              if (!exteriorColor) {
                const extMatch = allText.match(/Exterior(?:\s*(?:Colou?r)?)?[:\s]+([A-Za-z][A-Za-z\s]*?)(?=\s*(?:Interior|Body|Drivetrain|Transmission|Engine|VIN|Stock|$|\n|\|))/i);
                if (extMatch) exteriorColor = extMatch[1].trim();
              }
              if (!interiorColor) {
                const intMatch = allText.match(/Interior(?:\s*(?:Colou?r)?)?[:\s]+([A-Za-z][A-Za-z\s]*?)(?=\s*(?:Body|Drivetrain|Transmission|Engine|VIN|Stock|Fuel|$|\n|\|))/i);
                if (intMatch) interiorColor = intMatch[1].trim();
              }
            }

            // Get location
            const locationEl = document.querySelector('[class*="location"], [class*="dealer-location"], [class*="seller-location"]');
            const location = locationEl?.textContent?.trim() || '';

            // Get dealer name
            const dealerEl = document.querySelector('[class*="dealer-name"], [class*="seller-name"], [data-testid*="dealer"]');
            const dealer = dealerEl?.textContent?.trim() || 'CarGurus Listing';
            
            // Get deal rating
            const dealRatingEl = document.querySelector('[class*="deal-rating"], [class*="deal-badge"], [data-testid*="deal"]');
            const dealRating = dealRatingEl?.textContent?.trim() || '';

            // Get image
            const imgEl = document.querySelector('[class*="gallery"] img, [class*="hero"] img, img[class*="vehicle"]') as HTMLImageElement;
            const image = imgEl?.src || '';

            return { title, price, odometer, exteriorColor, interiorColor, location, dealer, dealRating, image };
          });

          // Parse title
          const titleMatch = vehicleData.title.match(/(\d{4})\s+([A-Za-z]+)\s+(.+)/);
          if (titleMatch) {
            vehicles.push({
              year: parseInt(titleMatch[1]),
              make: titleMatch[2],
              model: titleMatch[3].split(/\s+/).slice(0, 2).join(' '),
              trim: titleMatch[3].split(/\s+/).slice(2).join(' ') || undefined,
              price: vehicleData.price,
              odometer: vehicleData.odometer,
              images: vehicleData.image ? [vehicleData.image] : [],
              badges: [],
              location: vehicleData.location,
              dealership: vehicleData.dealer,
              dealershipId: 0,
              dealRating: vehicleData.dealRating,
              cargurusUrl: url,
              exteriorColor: vehicleData.exteriorColor,
              interiorColor: vehicleData.interiorColor,
              sellerType: 'dealer' as const,
            });
            console.log(`[BrowserlessUnified] CarGurus VDP: ${vehicleData.title} - ${vehicleData.odometer} km, Ext: ${vehicleData.exteriorColor || 'N/A'}, Int: ${vehicleData.interiorColor || 'N/A'}`);
          }
        } catch (vdpError) {
          console.warn(`[BrowserlessUnified] CarGurus VDP scrape failed for ${url}:`, vdpError);
        }
      }

      await page.close();
      if (isCloud) await browser.disconnect();

      console.log(`[BrowserlessUnified] CarGurus scraped ${vehicles.length} vehicles with VDP data`);

      return {
        success: true,
        listings: vehicles,
        source: 'cargurus',
      };

    } catch (error) {
      console.error('[BrowserlessUnified] CarGurus scrape error:', error);
      if (browser && isCloud) {
        try { await browser.disconnect(); } catch {}
      }
      return {
        success: false,
        listings: [],
        source: 'cargurus',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async scrapeAutoTrader(
    searchParams: { make: string; model: string; yearMin?: number; yearMax?: number; postalCode?: string; radiusKm?: number; maxResults?: number }
  ): Promise<MarketAnalysisResult> {
    const { make, model, yearMin, yearMax, postalCode = 'V6B2W2', radiusKm = 100, maxResults = 50 } = searchParams;

    let browser: Browser | null = null;
    let isCloud = false;

    try {
      const connection = await this.connectBrowser();
      browser = connection.browser;
      isCloud = connection.isCloud;

      const page = await browser.newPage();
      await this.configurePage(page);

      const normalizedMake = make.toLowerCase().replace(/\s+/g, '-');
      const normalizedModel = model.toLowerCase().replace(/\s+/g, '-');

      let searchUrl = `https://www.autotrader.ca/cars/${normalizedMake}/${normalizedModel}/?rcp=100&rcs=0&loc=${postalCode.replace(/\s/g, '')}&prx=${radiusKm}&prv=British%20Columbia&sts=Used`;
      
      if (yearMin) searchUrl += `&yRng=${yearMin}%2C${yearMax || new Date().getFullYear()}`;

      console.log(`[BrowserlessUnified] AutoTrader search: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      await sleep(2000);

      // First pass: get listing URLs from search results
      const listingUrls = await page.evaluate(() => {
        const urls: string[] = [];
        const links = document.querySelectorAll('a[href*="/a/"]');
        links.forEach(link => {
          const href = (link as HTMLAnchorElement).href;
          if (href && href.includes('/a/') && !urls.includes(href)) {
            urls.push(href);
          }
        });
        return urls;
      });

      console.log(`[BrowserlessUnified] AutoTrader found ${listingUrls.length} listing URLs, scraping VDP pages...`);

      const vehicles: any[] = [];
      
      // Scrape each VDP page to get accurate mileage and colors
      for (const url of listingUrls.slice(0, maxResults)) {
        try {
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          await sleep(500);

          const vehicleData = await page.evaluate(() => {
            // Get title from h1
            const titleEl = document.querySelector('h1');
            const title = titleEl?.textContent?.trim() || '';
            
            // Get price
            let price: number | null = null;
            const priceEl = document.querySelector('[class*="price"], .price-amount, [data-testid="price"]');
            if (priceEl) {
              const priceMatch = priceEl.textContent?.match(/\$([0-9,]+)/);
              if (priceMatch) price = parseInt(priceMatch[1].replace(/,/g, ''));
            }

            // Get mileage from the subtitle area (appears as "65,987 km | North Vancouver")
            // Strategy: On VDP pages, the actual odometer is displayed prominently in the header area
            // Distance badges (e.g., "6 km away") are in different locations and context
            let odometer: number | null = null;
            
            // Method 1: Look in the subtitle/header area where AutoTrader shows odometer
            const subtitleEl = document.querySelector('[class*="listing-subtitle"], [class*="kms"], .hero-header-secondary, [class*="hero"] [class*="km"], [class*="odometer"]');
            if (subtitleEl) {
              const subtitleText = subtitleEl.textContent || '';
              // Match any km value - on VDP pages this should be the actual mileage
              const kmMatch = subtitleText.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*km/i);
              if (kmMatch) {
                const value = parseInt(kmMatch[1].replace(/,/g, ''));
                // Accept any value - VDP header shows actual odometer
                odometer = value;
              }
            }
            
            // Method 2: Look for dedicated odometer/mileage element
            if (odometer === null) {
              const odometerEl = document.querySelector('[class*="odometer"], [class*="mileage"], [data-testid*="mileage"], [data-testid*="odometer"]');
              if (odometerEl) {
                const text = odometerEl.textContent || '';
                const kmMatch = text.match(/(\d{1,3}(?:,\d{3})+|\d+)\s*km/i);
                if (kmMatch) odometer = parseInt(kmMatch[1].replace(/,/g, ''));
              }
            }
            
            // Method 3: Look in specs section for Kilometres/Odometer label
            if (odometer === null) {
              const dtElements = document.querySelectorAll('dt');
              dtElements.forEach(dt => {
                const labelText = dt.textContent?.trim().toLowerCase() || '';
                if (labelText.includes('kilomet') || labelText.includes('odometer') || labelText.includes('mileage')) {
                  const ddEl = dt.nextElementSibling;
                  if (ddEl && ddEl.tagName === 'DD') {
                    const value = ddEl.textContent?.trim() || '';
                    const kmMatch = value.match(/(\d{1,3}(?:,\d{3})+|\d+)/);
                    if (kmMatch) odometer = parseInt(kmMatch[1].replace(/,/g, ''));
                  }
                }
              });
            }
            
            // Method 4: Final fallback - ONLY accept km values with explicit odometer context
            // This is conservative to avoid misreporting range/distance as mileage
            if (odometer === null) {
              const pageText = document.body.textContent || '';
              // Look for patterns that explicitly mention odometer/kilometres/mileage followed by a number
              // This requires the label to be present, not just any "* km" string
              const odometerContextPatterns = [
                /(?:kilomet(?:re|er)s?|odometer|mileage)[:\s]+(\d{1,3}(?:,\d{3})+|\d+)\s*(?:km)?/gi,
                /(\d{1,3}(?:,\d{3})+|\d+)\s*km\s*\|/gi, // "65,987 km |" pattern common in AutoTrader headers
                /(\d{1,3}(?:,\d{3})+|\d+)\s*kilomet(?:re|er)s?/gi,
              ];
              
              for (const pattern of odometerContextPatterns) {
                const matches = [...pageText.matchAll(pattern)];
                for (const match of matches) {
                  const value = parseInt(match[1].replace(/,/g, ''));
                  if (!isNaN(value) && value > 0) {
                    // Check surrounding context to exclude fuel economy, range, etc.
                    const idx = match.index || 0;
                    const context = pageText.substring(Math.max(0, idx - 30), idx + match[0].length + 20);
                    if (!/L\/100|per\s*100|fuel|consumption|economy|range|battery/i.test(context)) {
                      odometer = value;
                      break;
                    }
                  }
                }
                if (odometer !== null) break;
              }
            }
            
            // If still null after all methods, leave as null rather than guessing
            // This prevents incorrect data from being displayed

            // Extract colors from VDP specs
            let exteriorColor: string | undefined;
            let interiorColor: string | undefined;
            
            // Method 1: Look for dt/dd pairs in spec lists (AutoTrader uses this format)
            const dtElements = document.querySelectorAll('dt');
            dtElements.forEach(dt => {
              const labelText = dt.textContent?.trim().toLowerCase() || '';
              const ddEl = dt.nextElementSibling;
              if (ddEl && ddEl.tagName === 'DD') {
                const value = ddEl.textContent?.trim() || '';
                if (labelText.includes('exterior') && labelText.includes('colo') && value && !exteriorColor) {
                  exteriorColor = value;
                }
                if (labelText.includes('interior') && labelText.includes('colo') && value && !interiorColor) {
                  interiorColor = value;
                }
              }
            });
            
            // Method 2: Look in table rows for color info
            if (!exteriorColor || !interiorColor) {
              const rows = document.querySelectorAll('tr, [class*="spec-row"], [class*="detail-row"]');
              rows.forEach(row => {
                const cells = row.querySelectorAll('td, th, [class*="label"], [class*="value"]');
                if (cells.length >= 2) {
                  const label = cells[0]?.textContent?.trim().toLowerCase() || '';
                  const value = cells[1]?.textContent?.trim() || '';
                  if (label.includes('exterior') && label.includes('colo') && value && !exteriorColor) {
                    exteriorColor = value;
                  }
                  if (label.includes('interior') && label.includes('colo') && value && !interiorColor) {
                    interiorColor = value;
                  }
                }
              });
            }
            
            // Method 3: Search page text for color patterns as fallback
            const pageText = document.body.textContent || '';
            if (!exteriorColor) {
              const extMatch = pageText.match(/Exterior\s*(?:Colou?r)?[:\s]+([A-Za-z][A-Za-z\s]*?)(?=\s*(?:Interior|Body|Drivetrain|Transmission|$|\n|\|))/i);
              if (extMatch) exteriorColor = extMatch[1].trim();
            }
            if (!interiorColor) {
              const intMatch = pageText.match(/Interior\s*(?:Colou?r)?[:\s]+([A-Za-z][A-Za-z\s]*?)(?=\s*(?:Body|Drivetrain|Transmission|Engine|$|\n|\|))/i);
              if (intMatch) interiorColor = intMatch[1].trim();
            }

            // Get location
            const locationEl = document.querySelector('[class*="location"], [class*="dealer-location"], [class*="dealer-address"]');
            const location = locationEl?.textContent?.trim() || '';

            // Get dealer name
            const dealerEl = document.querySelector('[class*="dealer-name"], .seller-name, h2[class*="dealer"]');
            const dealer = dealerEl?.textContent?.trim() || 'AutoTrader Listing';

            // Get image
            const imgEl = document.querySelector('.hero-image img, [class*="gallery"] img, img[class*="vehicle"]') as HTMLImageElement;
            const image = imgEl?.src || '';

            return { title, price, odometer, exteriorColor, interiorColor, location, dealer, image };
          });

          // Parse title
          const titleMatch = vehicleData.title.match(/(\d{4})\s+([A-Za-z]+)\s+(.+)/);
          if (titleMatch) {
            vehicles.push({
              year: parseInt(titleMatch[1]),
              make: titleMatch[2],
              model: titleMatch[3].split(/\s+/).slice(0, 2).join(' '),
              trim: titleMatch[3].split(/\s+/).slice(2).join(' ') || undefined,
              price: vehicleData.price,
              odometer: vehicleData.odometer,
              images: vehicleData.image ? [vehicleData.image] : [],
              badges: [],
              location: vehicleData.location,
              dealership: vehicleData.dealer,
              dealershipId: 0,
              dealerVdpUrl: url,
              exteriorColor: vehicleData.exteriorColor,
              interiorColor: vehicleData.interiorColor,
              sellerType: 'dealer' as const,
            });
            console.log(`[BrowserlessUnified] AutoTrader VDP: ${vehicleData.title} - ${vehicleData.odometer} km, Ext: ${vehicleData.exteriorColor || 'N/A'}, Int: ${vehicleData.interiorColor || 'N/A'}`);
          }
        } catch (vdpError) {
          console.warn(`[BrowserlessUnified] AutoTrader VDP scrape failed for ${url}:`, vdpError);
        }
      }

      await page.close();
      if (isCloud) await browser.disconnect();

      console.log(`[BrowserlessUnified] AutoTrader scraped ${vehicles.length} vehicles with VDP data`);

      return {
        success: true,
        listings: vehicles,
        source: 'autotrader',
      };

    } catch (error) {
      console.error('[BrowserlessUnified] AutoTrader scrape error:', error);
      if (browser && isCloud) {
        try { await browser.disconnect(); } catch {}
      }
      return {
        success: false,
        listings: [],
        source: 'autotrader',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async scrapeMarketComparables(
    searchParams: { make: string; model: string; yearMin?: number; yearMax?: number; postalCode?: string; radiusKm?: number; maxResults?: number }
  ): Promise<MarketAnalysisResult> {
    const { maxResults = 50 } = searchParams;
    
    // CarGurus is PRIMARY source - it has better color and mileage data
    console.log('[BrowserlessUnified] Starting CarGurus scrape (PRIMARY source)...');
    const cargurusResult = await this.scrapeCarGurus(searchParams);
    
    // If CarGurus returned enough results, use them as primary
    // Only use AutoTrader as FALLBACK if CarGurus failed or returned few results
    let autotraderResult: MarketAnalysisResult = { success: false, listings: [], source: 'autotrader' };
    
    const cargurusCount = cargurusResult.listings.length;
    const needsFallback = !cargurusResult.success || cargurusCount < 5;
    
    if (needsFallback) {
      console.log(`[BrowserlessUnified] CarGurus returned ${cargurusCount} listings, using AutoTrader as fallback...`);
      // Small delay between requests to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      autotraderResult = await this.scrapeAutoTrader(searchParams);
    } else {
      console.log(`[BrowserlessUnified] CarGurus returned ${cargurusCount} listings - skipping AutoTrader (not needed)`);
    }

    // Combine listings, prioritizing CarGurus results first
    const combinedListings = [
      ...cargurusResult.listings.map(l => ({ ...l, source: 'cargurus' as const })),
      ...autotraderResult.listings.map(l => ({ ...l, source: 'autotrader' as const })),
    ];

    // Sort by price
    combinedListings.sort((a, b) => (a.price || 0) - (b.price || 0));

    // Limit to maxResults
    const finalListings = combinedListings.slice(0, maxResults);

    console.log(`[BrowserlessUnified] Final: ${finalListings.length} listings (CarGurus: ${cargurusResult.listings.length}, AutoTrader: ${autotraderResult.listings.length})`);

    return {
      success: cargurusResult.success || autotraderResult.success,
      listings: finalListings,
      source: 'combined',
      error: !cargurusResult.success && !autotraderResult.success
        ? `CarGurus: ${cargurusResult.error}, AutoTrader: ${autotraderResult.error}`
        : undefined,
    };
  }
}

let globalService: BrowserlessUnifiedService | null = null;

export function getBrowserlessUnifiedService(): BrowserlessUnifiedService {
  if (!globalService) {
    globalService = new BrowserlessUnifiedService();
  }
  return globalService;
}

export async function getBrowserlessUnifiedServiceForDealership(dealershipId: number): Promise<BrowserlessUnifiedService> {
  try {
    const apiKeys = await storage.getDealershipApiKeys(dealershipId);
    if (apiKeys?.browserlessApiKey) {
      return new BrowserlessUnifiedService({ apiKey: apiKeys.browserlessApiKey });
    }
  } catch (error) {
    console.warn(`[BrowserlessUnified] Error getting API key for dealership ${dealershipId}:`, error);
  }
  return getBrowserlessUnifiedService();
}
