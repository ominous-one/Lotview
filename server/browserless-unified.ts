import puppeteer, { Browser, Page } from 'puppeteer';
import { execSync } from 'child_process';
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

  private async getLocalChromiumPath(): Promise<string> {
    try {
      return execSync('which chromium 2>/dev/null || which chromium-browser 2>/dev/null', { encoding: 'utf8' }).trim();
    } catch {
      try {
        return execSync('find /nix/store -name chromium -type f -path "*/bin/chromium" 2>/dev/null | head -1', { encoding: 'utf8' }).trim();
      } catch {
        throw new Error('Chromium not found');
      }
    }
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
      const executablePath = await this.getLocalChromiumPath();
      console.log(`[BrowserlessUnified] Using local Chromium: ${executablePath}`);
      this.localBrowser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
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
              const vehicle = await this.scrapeVdpPage(page, url, { dealershipId, dealershipName, location });
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
          };
        }
      }
    }

    return { success: false, vehicles: [], error: 'Max retries exceeded', method: 'browserless' };
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
      await page.goto(vdpUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await sleep(1000);

      const vehicle = await page.evaluate((ctx) => {
        const getText = (selector: string): string => {
          const el = document.querySelector(selector);
          return el?.textContent?.trim() || '';
        };

        const pageText = document.body.innerText || '';
        const pageTitle = document.querySelector('h1, .vehicle-title, .listing-title')?.textContent?.trim() || '';

        const urlMatch = window.location.pathname.match(/\/vehicles\/(\d{4})\/([a-z-]+)\/([a-z0-9-]+)\//i);
        if (!urlMatch) return null;

        const [, yearStr, makeSlug, modelSlug] = urlMatch;
        const year = parseInt(yearStr);
        const make = makeSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const model = modelSlug.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

        let trim = '';
        const trimPatterns = [
          /(?:trim|edition|package)[:\s]+([A-Za-z0-9\s]+)/i,
          new RegExp(`${model}\\s+([A-Z][A-Za-z0-9\\s]+?)(?:\\s|,|$)`),
        ];
        for (const pattern of trimPatterns) {
          const match = pageTitle.match(pattern) || pageText.match(pattern);
          if (match) {
            trim = match[1].trim();
            break;
          }
        }

        let price: number | null = null;
        const pricePatterns = [
          /\$\s*([\d,]+)/,
          /price[:\s]+\$?\s*([\d,]+)/i,
          /dealer\s*price[:\s]+\$?\s*([\d,]+)/i,
        ];
        for (const pattern of pricePatterns) {
          const match = pageText.match(pattern);
          if (match) {
            const p = parseInt(match[1].replace(/,/g, ''));
            if (p > 1000 && p < 500000) {
              price = p;
              break;
            }
          }
        }

        let odometer: number | null = null;
        const odometerMatch = pageText.match(/(\d{1,3}(?:,\d{3})*)\s*km/i);
        if (odometerMatch) {
          odometer = parseInt(odometerMatch[1].replace(/,/g, ''));
        }

        const images: string[] = [];
        const imgSelectors = [
          '.gallery img', '.carousel img', '.slider img', '.vehicle-images img',
          '.photo-gallery img', '[class*="image"] img', '.main-image img',
        ];
        for (const selector of imgSelectors) {
          document.querySelectorAll(selector).forEach((img: Element) => {
            const src = (img as HTMLImageElement).src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
            if (src && src.startsWith('http') && !src.includes('placeholder') && !src.includes('thumbnail')) {
              const highRes = src.replace(/\d{2,3}x\d{2,3}/, '1200x800').replace('thumbnail', 'full');
              if (!images.includes(highRes)) images.push(highRes);
            }
          });
        }
        if (images.length === 0) {
          document.querySelectorAll('img').forEach((img: Element) => {
            const src = (img as HTMLImageElement).src;
            if (src && src.includes('vehicle') && src.startsWith('http') && !src.includes('logo')) {
              images.push(src);
            }
          });
        }

        let vin: string | undefined;
        const vinMatch = pageText.match(/\b([A-HJ-NPR-Z0-9]{17})\b/);
        if (vinMatch) vin = vinMatch[1];

        let stockNumber: string | undefined;
        const stockMatch = pageText.match(/stock[#:\s]*([A-Z0-9-]+)/i);
        if (stockMatch) stockNumber = stockMatch[1];

        let carfaxUrl: string | undefined;
        const carfaxLink = document.querySelector('a[href*="carfax"], a[href*="CARFAX"]') as HTMLAnchorElement;
        if (carfaxLink) carfaxUrl = carfaxLink.href;

        const badges: string[] = [];
        const badgeText = pageText.toLowerCase();
        if (/one owner|1 owner|single owner/.test(badgeText)) badges.push('One Owner');
        if (/no accidents?|accident[\s-]?free|clean history/.test(badgeText)) badges.push('No Accidents');
        if (/certified|cpo|certified pre-owned/.test(badgeText)) badges.push('Certified Pre-Owned');

        let exteriorColor: string | undefined;
        const extMatch = pageText.match(/exterior(?:\s*color)?[:\s]+([A-Za-z\s]+?)(?:\n|,|$)/i);
        if (extMatch) exteriorColor = extMatch[1].trim();

        let interiorColor: string | undefined;
        const intMatch = pageText.match(/interior(?:\s*color)?[:\s]+([A-Za-z\s]+?)(?:\n|,|$)/i);
        if (intMatch) interiorColor = intMatch[1].trim();

        let engine: string | undefined;
        const engMatch = pageText.match(/engine[:\s]+([A-Za-z0-9\s.]+?)(?:\n|,|$)/i);
        if (engMatch) engine = engMatch[1].trim();

        let transmission: string | undefined;
        if (/automatic|auto trans/i.test(pageText)) transmission = 'Automatic';
        else if (/manual|stick shift/i.test(pageText)) transmission = 'Manual';
        else if (/cvt/i.test(pageText)) transmission = 'CVT';

        let drivetrain: string | undefined;
        if (/\bAWD\b|all[\s-]?wheel/i.test(pageText)) drivetrain = 'AWD';
        else if (/\b4WD\b|four[\s-]?wheel|4x4/i.test(pageText)) drivetrain = '4WD';
        else if (/\bFWD\b|front[\s-]?wheel/i.test(pageText)) drivetrain = 'FWD';
        else if (/\bRWD\b|rear[\s-]?wheel/i.test(pageText)) drivetrain = 'RWD';

        let fuelType: string | undefined;
        if (/electric|ev\b|battery/i.test(pageText)) fuelType = 'Electric';
        else if (/hybrid|phev/i.test(pageText)) fuelType = 'Hybrid';
        else if (/diesel/i.test(pageText)) fuelType = 'Diesel';
        else if (/gasoline|gas|petrol/i.test(pageText)) fuelType = 'Gasoline';

        let type = 'SUV';
        if (/sedan/i.test(pageText)) type = 'Sedan';
        else if (/truck|pickup|crew cab/i.test(pageText)) type = 'Truck';
        else if (/hatchback/i.test(pageText)) type = 'Hatchback';
        else if (/coupe/i.test(pageText)) type = 'Coupe';
        else if (/wagon/i.test(pageText)) type = 'Wagon';
        else if (/minivan|van/i.test(pageText)) type = 'Minivan';

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
          images: images.slice(0, 20),
          badges,
          location: ctx.location,
          dealership: ctx.dealershipName,
          dealershipId: ctx.dealershipId,
          dealerVdpUrl: window.location.href,
          vin,
          stockNumber,
          carfaxUrl,
          exteriorColor,
          interiorColor,
          engine,
          transmission,
          drivetrain,
          fuelType,
          features,
        };
      }, context);

      return vehicle;
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
