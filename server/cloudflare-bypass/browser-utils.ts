import type { Page } from 'puppeteer';

export interface BrowserFingerprint {
  userAgent: string;
  viewport: { width: number; height: number };
  acceptLanguage: string;
  platform: string;
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 }
];

const LANGUAGES = [
  'en-US,en;q=0.9',
  'en-CA,en;q=0.9',
  'en-GB,en;q=0.9'
];

export function generateRandomFingerprint(): BrowserFingerprint {
  const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
  const viewport = VIEWPORTS[Math.floor(Math.random() * VIEWPORTS.length)];
  const acceptLanguage = LANGUAGES[Math.floor(Math.random() * LANGUAGES.length)];
  
  const platform = userAgent.includes('Windows') ? 'Win32' : 
                   userAgent.includes('Mac') ? 'MacIntel' : 'Linux x86_64';

  return { userAgent, viewport, acceptLanguage, platform };
}

export async function applyFingerprint(page: Page, fingerprint: BrowserFingerprint): Promise<void> {
  await page.setUserAgent(fingerprint.userAgent);
  await page.setViewport(fingerprint.viewport);
  await page.setExtraHTTPHeaders({
    'Accept-Language': fingerprint.acceptLanguage,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  });

  // Override navigator properties to match fingerprint
  await page.evaluateOnNewDocument((platform) => {
    Object.defineProperty(navigator, 'platform', {
      get: () => platform
    });
    
    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
    
    // Add realistic plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });
  }, fingerprint.platform);
}

export async function randomDelay(min: number = 1000, max: number = 3000): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  await new Promise(resolve => setTimeout(resolve, delay));
}

export async function isCloudflareChallenge(page: Page): Promise<boolean> {
  const content = await page.content();
  const title = await page.title().catch(() => '');
  
  return (
    content.includes('Checking your browser') ||
    content.includes('cloudflare') ||
    content.includes('cf-browser-verification') ||
    content.includes('cf_clearance') ||
    title.includes('Just a moment')
  );
}

export async function humanLikeScroll(page: Page): Promise<void> {
  // Simulate human-like scrolling behavior
  await page.evaluate(async () => {
    const scrollHeight = document.body.scrollHeight;
    const viewportHeight = window.innerHeight;
    let currentScroll = 0;
    
    while (currentScroll < scrollHeight - viewportHeight) {
      const scrollAmount = Math.floor(Math.random() * 200) + 100;
      currentScroll += scrollAmount;
      window.scrollTo(0, currentScroll);
      
      // Random delay between scrolls
      await new Promise(resolve => setTimeout(resolve, Math.random() * 300 + 100));
    }
    
    // Scroll back to top
    window.scrollTo(0, 0);
  });
}
