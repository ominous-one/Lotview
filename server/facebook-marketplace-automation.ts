import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import crypto from 'node:crypto';
import { storage } from './storage';

export interface FacebookMarketplacePostData {
  year: number;
  make: string;
  model: string;
  price: number;
  mileage: number;
  description: string;
  exteriorColor?: string;
  interiorColor?: string;
  fuelType?: string;
  transmission?: string;
  bodyStyle?: string;
  condition?: string;
  location?: string;
  imageUrls: string[];
}

export interface PostResult {
  success: boolean;
  listingUrl?: string;
  error?: string;
  screenshots?: string[];
}

interface FacebookSession {
  cookies: any[];
  userId: string;
  createdAt: number;
}

interface ImageDescriptor {
  name: string;
  mimeType: string;
  base64Data: string;
}

const BROWSERLESS_ENDPOINT = 'wss://chrome.browserless.io';
const MAX_IMAGES = 20;
const BATCH_SIZE = 4;
const PER_IMAGE_TIMEOUT_MS = 25000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export class FacebookMarketplaceAutomation {
  private apiKey: string;
  private tempDir: string;

  constructor() {
    this.apiKey = process.env.BROWSERLESS_API_KEY || '';
    this.tempDir = path.join(os.tmpdir(), 'fb-marketplace-images');
    
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private getConnectionUrl(): string {
    return `${BROWSERLESS_ENDPOINT}?token=${this.apiKey}`;
  }

  private async downloadImageToBuffer(
    url: string,
    timeoutMs: number = PER_IMAGE_TIMEOUT_MS
  ): Promise<{ buffer: Buffer; mimeType: string | null } | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      });

      if (!res.ok) {
        console.error(`[FB-Automation] Failed to download image: ${res.status} ${res.statusText}`);
        return null;
      }

      const contentType = res.headers.get('content-type');
      const mimeType = contentType ? contentType.split(';')[0].trim() : null;

      const lengthHeader = res.headers.get('content-length');
      if (lengthHeader) {
        const n = Number(lengthHeader);
        if (Number.isFinite(n) && n > MAX_IMAGE_BYTES) {
          console.error(`[FB-Automation] Image too large: ${n} bytes (limit=${MAX_IMAGE_BYTES})`);
          return null;
        }
      }

      const ab = await res.arrayBuffer();
      const buffer = Buffer.from(ab);

      if (buffer.length > MAX_IMAGE_BYTES) {
        console.error(`[FB-Automation] Image too large after download: ${buffer.length} bytes`);
        return null;
      }

      return { buffer, mimeType };
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        console.error(`[FB-Automation] Image download timeout after ${timeoutMs}ms`);
      } else {
        console.error(`[FB-Automation] Error downloading image ${url}:`, e);
      }
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private guessExtensionFromMime(mimeType: string): string | null {
    const mt = mimeType.toLowerCase();
    if (mt === 'image/jpeg' || mt === 'image/jpg') return 'jpg';
    if (mt === 'image/png') return 'png';
    if (mt === 'image/webp') return 'webp';
    if (mt === 'image/gif') return 'gif';
    return null;
  }

  private guessExtensionFromUrl(url: string): string | null {
    try {
      const u = new URL(url);
      const path = u.pathname.toLowerCase();
      const m = path.match(/\.([a-z0-9]{2,5})$/);
      return m?.[1] ?? null;
    } catch {
      return null;
    }
  }

  private guessImageMimeFromUrl(url: string): string | null {
    const ext = this.guessExtensionFromUrl(url);
    if (!ext) return null;
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      default:
        return null;
    }
  }

  private async injectFilesIntoFileInput(
    page: Page,
    files: ImageDescriptor[],
    selector?: string,
    appendToExisting: boolean = true
  ): Promise<{ inputFileCount: number; usedSelector: string | null; usedHeuristic: boolean }> {
    return await page.evaluate(
      ({ selector, files, appendToExisting }) => {
        function b64ToUint8Array(base64: string): Uint8Array {
          const binary = atob(base64);
          const len = binary.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
          return bytes;
        }

        function scoreInput(input: HTMLInputElement): number {
          let score = 0;
          const accept = (input.getAttribute('accept') || '').toLowerCase();
          if (accept.includes('image')) score += 10;
          if (input.multiple) score += 5;
          if (accept.includes('video')) score += 1;
          if (!input.disabled) score += 1;
          if (input.isConnected) score += 1;
          return score;
        }

        function findBestFileInput(): HTMLInputElement | null {
          const inputs = Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
          if (inputs.length === 0) return null;
          inputs.sort((a, b) => scoreInput(b) - scoreInput(a));
          return inputs[0] ?? null;
        }

        const input: HTMLInputElement | null =
          (selector ? (document.querySelector(selector) as HTMLInputElement | null) : null) || findBestFileInput();

        if (!input) {
          throw new Error('No <input type=file> found on the page (Marketplace uploader not mounted?)');
        }

        const dt = new DataTransfer();

        if (appendToExisting && input.files) {
          for (let i = 0; i < input.files.length; i++) {
            dt.items.add(input.files[i]);
          }
        }

        for (const f of files) {
          const bytes = b64ToUint8Array(f.base64Data);
          const file = new File([bytes], f.name, { type: f.mimeType, lastModified: Date.now() });
          dt.items.add(file);
        }

        input.files = dt.files;

        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));

        return {
          inputFileCount: input.files ? input.files.length : 0,
          usedSelector: selector ?? null,
          usedHeuristic: !selector,
        };
      },
      { selector: selector ?? null, files, appendToExisting }
    );
  }

  private async uploadImagesViaDataTransfer(
    page: Page,
    imageUrls: string[]
  ): Promise<{ attempted: number; uploaded: number; failures: Array<{ url: string; reason: string }> }> {
    const urls = (imageUrls ?? []).filter(Boolean).slice(0, MAX_IMAGES);
    const failures: Array<{ url: string; reason: string }> = [];

    if (urls.length === 0) {
      console.log('[FB-Automation] No image URLs provided, skipping photo upload');
      return { attempted: 0, uploaded: 0, failures: [] };
    }

    console.log(`[FB-Automation] Starting photo upload for ${urls.length} images`);

    // Wait for file input to be available
    await page.waitForSelector('input[type="file"]', { timeout: 30000 });
    
    // Try to click the photo upload area to trigger React's file input handlers
    try {
      const photoAreaClicked = await page.evaluate(() => {
        // Look for photo upload area with common patterns
        const photoSelectors = [
          '[aria-label*="photo"]',
          '[aria-label*="Photo"]',
          '[aria-label*="image"]',
          '[role="button"]:has(svg)',
          'div[class*="photo"]',
          'div[class*="upload"]',
        ];
        
        for (const selector of photoSelectors) {
          try {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
              const text = (el as HTMLElement).innerText?.toLowerCase() || '';
              const ariaLabel = el.getAttribute('aria-label')?.toLowerCase() || '';
              if (text.includes('photo') || ariaLabel.includes('photo') || text.includes('add') || ariaLabel.includes('add')) {
                (el as HTMLElement).click();
                return { clicked: true, selector };
              }
            }
          } catch (e) {}
        }
        return { clicked: false, selector: null };
      });
      
      if (photoAreaClicked.clicked) {
        console.log(`[FB-Automation] Clicked photo area using selector: ${photoAreaClicked.selector}`);
        await this.delay(500);
      }
    } catch (err) {
      console.log('[FB-Automation] Could not click photo area, proceeding with direct injection');
    }

    const pending: ImageDescriptor[] = [];
    let uploaded = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[FB-Automation] Processing image ${i + 1}/${urls.length}: ${url.substring(0, 80)}...`);

      try {
        const result = await this.downloadImageToBuffer(url);
        if (!result) {
          console.warn(`[FB-Automation] Image ${i + 1} download failed`);
          failures.push({ url, reason: 'Failed to download' });
          continue;
        }

        const { buffer, mimeType } = result;
        console.log(`[FB-Automation] Image ${i + 1} downloaded: ${buffer.length} bytes, type: ${mimeType}`);
        const safeMime = mimeType || this.guessImageMimeFromUrl(url) || 'image/jpeg';
        const ext = this.guessExtensionFromMime(safeMime) || this.guessExtensionFromUrl(url) || 'jpg';

        const name = `vehicle-${String(i).padStart(2, '0')}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
        const base64Data = buffer.toString('base64');

        pending.push({ name, mimeType: safeMime, base64Data });

        const isLast = i === urls.length - 1;
        if (pending.length >= BATCH_SIZE || isLast) {
          const batch = pending.splice(0, pending.length);

          const injectResult = await this.injectFilesIntoFileInput(page, batch, undefined, true);

          console.log(`[FB-Automation] Injected batch of ${batch.length} images, total in input: ${injectResult.inputFileCount}`);

          await this.delay(500);
        }
      } catch (err: any) {
        const reason = err?.message ? String(err.message) : String(err);
        failures.push({ url, reason });
        console.warn(`[FB-Automation] Failed to prepare image: ${url} - ${reason}`);
      }
    }

    // Wait for UI to update after injection
    await this.delay(1500);

    // Check if file input has files
    const fileInputState = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
      const inputStates = inputs.map(input => ({
        accept: input.accept,
        multiple: input.multiple,
        fileCount: input.files?.length ?? 0,
        fileNames: input.files ? Array.from(input.files).map(f => f.name).slice(0, 3) : []
      }));
      
      // Check for visual image previews
      const previewImages = document.querySelectorAll('img[src^="blob:"], img[src^="data:"]');
      const previewDivs = document.querySelectorAll('[class*="photo"], [class*="image"], [class*="preview"]');
      
      return {
        inputStates,
        previewImageCount: previewImages.length,
        previewDivCount: previewDivs.length,
      };
    });

    console.log('[FB-Automation] File input state after injection:', JSON.stringify(fileInputState, null, 2));

    const finalFileCount = fileInputState.inputStates.reduce((sum, input) => sum + input.fileCount, 0);
    const expectedCount = urls.length - failures.length;
    
    if (finalFileCount !== expectedCount) {
      console.warn(`[FB-Automation] File count mismatch: expected ${expectedCount}, got ${finalFileCount}`);
    }
    
    if (fileInputState.previewImageCount === 0) {
      console.warn('[FB-Automation] No image previews detected in DOM - React may not have processed the files');
    } else {
      console.log(`[FB-Automation] Found ${fileInputState.previewImageCount} preview images in DOM`);
    }

    console.log(`[FB-Automation] Final verification: ${finalFileCount} files in input`);

    return { attempted: urls.length, uploaded: finalFileCount, failures };
  }

  async postToMarketplace(
    data: FacebookMarketplacePostData,
    sessionCookies: any[]
  ): Promise<PostResult> {
    if (!this.apiKey) {
      return { success: false, error: 'BROWSERLESS_API_KEY not configured' };
    }

    let browser: Browser | null = null;
    const screenshots: string[] = [];

    try {
      console.log('[FB-Automation] Connecting to Browserless...');
      browser = await puppeteer.connect({
        browserWSEndpoint: this.getConnectionUrl(),
      });

      const page = await browser.newPage();
      
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      await page.setViewport({ width: 1920, height: 1080 });

      if (sessionCookies && sessionCookies.length > 0) {
        console.log('[FB-Automation] Setting session cookies...');
        await page.setCookie(...sessionCookies);
      } else {
        return { success: false, error: 'No Facebook session cookies provided' };
      }

      console.log('[FB-Automation] Navigating to Facebook Marketplace create vehicle...');
      await page.goto('https://www.facebook.com/marketplace/create/vehicle', {
        waitUntil: 'networkidle2',
        timeout: 60000,
      });

      await this.delay(3000);

      const currentUrl = page.url();
      if (currentUrl.includes('login') || !currentUrl.includes('marketplace')) {
        return { success: false, error: 'Facebook session expired - please re-authenticate' };
      }

      console.log('[FB-Automation] Uploading images via DataTransfer injection...');
      const uploadResult = await this.uploadImagesViaDataTransfer(page, data.imageUrls);
      
      if (uploadResult.uploaded === 0) {
        return { success: false, error: 'Failed to upload any images' };
      }

      console.log(`[FB-Automation] Successfully uploaded ${uploadResult.uploaded}/${uploadResult.attempted} images`);
      if (uploadResult.failures.length > 0) {
        console.warn(`[FB-Automation] ${uploadResult.failures.length} images failed:`, uploadResult.failures);
      }
      
      await this.delay(3000);

      console.log('[FB-Automation] Selecting vehicle type...');
      await this.selectDropdownOption(page, 'Vehicle type', 'Car/truck');

      console.log('[FB-Automation] Filling year...');
      await this.selectDropdownOption(page, 'Year', String(data.year));

      console.log('[FB-Automation] Filling make...');
      await this.selectDropdownOption(page, 'Make', data.make);

      await this.delay(1500);

      console.log('[FB-Automation] Filling model...');
      await this.selectDropdownOption(page, 'Model', data.model);

      console.log('[FB-Automation] Filling price...');
      await this.fillTextInput(page, 'Price', String(data.price));

      console.log('[FB-Automation] Filling mileage...');
      await this.fillTextInput(page, 'Mileage', String(data.mileage));

      if (data.bodyStyle) {
        console.log('[FB-Automation] Selecting body style...');
        await this.selectDropdownOption(page, 'Body style', data.bodyStyle);
      }

      if (data.exteriorColor) {
        console.log('[FB-Automation] Selecting exterior color...');
        await this.selectDropdownOption(page, 'Exterior color', this.normalizeColor(data.exteriorColor));
      }

      if (data.interiorColor) {
        console.log('[FB-Automation] Selecting interior color...');
        await this.selectDropdownOption(page, 'Interior color', this.normalizeColor(data.interiorColor));
      }

      if (data.fuelType) {
        console.log('[FB-Automation] Selecting fuel type...');
        await this.selectDropdownOption(page, 'Fuel type', this.normalizeFuelType(data.fuelType));
      }

      if (data.transmission) {
        console.log('[FB-Automation] Selecting transmission...');
        await this.selectDropdownOption(page, 'Transmission', this.normalizeTransmission(data.transmission));
      }

      console.log('[FB-Automation] Checking clean title...');
      await this.checkCleanTitle(page);

      console.log('[FB-Automation] Selecting vehicle condition...');
      await this.selectDropdownOption(page, 'Vehicle condition', data.condition || 'Good');

      console.log('[FB-Automation] Filling description...');
      await this.fillDescription(page, data.description);

      if (data.location) {
        console.log('[FB-Automation] Setting location...');
        await this.fillTextInput(page, 'Location', data.location);
      }

      // Take a screenshot before submission
      const screenshotPath = path.join(this.tempDir, `screenshot-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      screenshots.push(screenshotPath);

      console.log('[FB-Automation] Form filled, looking for publish button...');

      // Find and click the "Publish" or "Post" button
      const publishButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('[role="button"], button'));
        for (const btn of buttons) {
          const text = btn.textContent?.toLowerCase() || '';
          if (text.includes('publish') || text.includes('post') || text === 'next') {
            // Check if visible and enabled
            const style = window.getComputedStyle(btn as Element);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              return btn;
            }
          }
        }
        return null;
      });

      if (publishButton) {
        console.log('[FB-Automation] Found publish button, clicking...');
        await (publishButton as ElementHandle<Element>).click();
        await this.delay(5000);

        // Wait for navigation or confirmation
        const currentUrl = page.url();
        
        // Check for success indicators
        const successIndicators = await page.evaluate(() => {
          const text = document.body.innerText.toLowerCase();
          return {
            hasSuccess: text.includes('your listing is live') || text.includes('posted') || text.includes('published'),
            hasError: text.includes('error') || text.includes('couldn\'t post') || text.includes('try again'),
          };
        });

        if (successIndicators.hasSuccess) {
          console.log('[FB-Automation] Listing posted successfully!');
          
          // Try to get the listing URL
          const listingUrl = currentUrl.includes('marketplace/item') ? currentUrl : undefined;
          
          return {
            success: true,
            listingUrl,
            screenshots,
          };
        } else if (successIndicators.hasError) {
          console.log('[FB-Automation] Facebook showed an error after submission');
          return {
            success: false,
            error: 'Facebook showed an error when posting. Please try again.',
            screenshots,
          };
        } else {
          // May have succeeded but unclear - take another screenshot
          const afterScreenshotPath = path.join(this.tempDir, `screenshot-after-${Date.now()}.png`);
          await page.screenshot({ path: afterScreenshotPath, fullPage: true });
          screenshots.push(afterScreenshotPath);
          
          console.log('[FB-Automation] Submission attempted - status unclear');
          return {
            success: true,
            error: 'Submission attempted - please verify in Facebook Marketplace',
            screenshots,
          };
        }
      } else {
        console.log('[FB-Automation] Could not find publish button');
        return {
          success: false,
          error: 'Form filled but could not find publish button. Please submit manually.',
          screenshots,
        };
      }

    } catch (error) {
      console.error('[FB-Automation] Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  private async selectDropdownOption(page: Page, labelText: string, value: string): Promise<boolean> {
    try {
      const dropdown = await page.evaluateHandle((label) => {
        const elements = Array.from(document.querySelectorAll('span, label, div'));
        for (const el of elements) {
          if (el.textContent?.toLowerCase().includes(label.toLowerCase())) {
            let parent = el.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const clickable = parent.querySelector('[role="button"], [role="combobox"], [aria-haspopup="listbox"]');
              if (clickable) return clickable;
              parent = parent.parentElement;
            }
          }
        }
        return null;
      }, labelText);

      if (dropdown) {
        await (dropdown as ElementHandle<Element>).click();
        await this.delay(800);

        const option = await page.evaluateHandle((val) => {
          const options = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], div[data-visualcompletion="ignore-dynamic"]'));
          for (const opt of options) {
            if (opt.textContent?.toLowerCase().includes(val.toLowerCase())) {
              return opt;
            }
          }
          return null;
        }, value);

        if (option) {
          await (option as ElementHandle<Element>).click();
          await this.delay(500);
          return true;
        }
      }
      
      console.warn(`[FB-Automation] Could not select ${labelText}: ${value}`);
      return false;
    } catch (error) {
      console.error(`[FB-Automation] Error selecting ${labelText}:`, error);
      return false;
    }
  }

  private async fillTextInput(page: Page, labelText: string, value: string): Promise<boolean> {
    try {
      const input = await page.evaluateHandle((label) => {
        const elements = Array.from(document.querySelectorAll('span, label'));
        for (const el of elements) {
          if (el.textContent?.toLowerCase().includes(label.toLowerCase())) {
            let parent = el.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const input = parent.querySelector('input[type="text"], input:not([type])');
              if (input) return input;
              parent = parent.parentElement;
            }
          }
        }
        return null;
      }, labelText);

      if (input) {
        await (input as ElementHandle<Element>).click();
        await this.delay(200);
        await page.keyboard.type(value, { delay: 50 });
        await this.delay(300);
        return true;
      }

      console.warn(`[FB-Automation] Could not find input for ${labelText}`);
      return false;
    } catch (error) {
      console.error(`[FB-Automation] Error filling ${labelText}:`, error);
      return false;
    }
  }

  private async fillDescription(page: Page, description: string): Promise<boolean> {
    try {
      const textarea = await page.$('textarea[name="description"], textarea[aria-label*="description" i]');
      if (textarea) {
        await textarea.click();
        await this.delay(200);
        await page.keyboard.type(description, { delay: 10 });
        return true;
      }

      const descInput = await page.evaluateHandle(() => {
        const inputs = Array.from(document.querySelectorAll('div[contenteditable="true"], textarea'));
        return inputs.find(i => {
          const rect = (i as HTMLElement).getBoundingClientRect();
          return rect.height > 100;
        }) || null;
      });

      if (descInput) {
        await (descInput as ElementHandle<Element>).click();
        await this.delay(200);
        await page.keyboard.type(description, { delay: 10 });
        return true;
      }

      return false;
    } catch (error) {
      console.error('[FB-Automation] Error filling description:', error);
      return false;
    }
  }

  private async checkCleanTitle(page: Page): Promise<boolean> {
    try {
      const checkbox = await page.evaluateHandle(() => {
        const elements = Array.from(document.querySelectorAll('span, label'));
        for (const el of elements) {
          if (el.textContent?.toLowerCase().includes('clean title')) {
            let parent = el.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const checkbox = parent.querySelector('input[type="checkbox"], [role="checkbox"]');
              if (checkbox) return checkbox;
              parent = parent.parentElement;
            }
          }
        }
        return null;
      });

      if (checkbox) {
        await (checkbox as ElementHandle<Element>).click();
        await this.delay(300);
        return true;
      }

      return false;
    } catch (error) {
      console.error('[FB-Automation] Error checking clean title:', error);
      return false;
    }
  }

  private normalizeColor(color: string): string {
    const colorMap: Record<string, string> = {
      'black': 'Black',
      'white': 'White',
      'silver': 'Silver',
      'gray': 'Gray',
      'grey': 'Gray',
      'red': 'Red',
      'blue': 'Blue',
      'green': 'Green',
      'brown': 'Brown',
      'tan': 'Beige',
      'beige': 'Beige',
      'gold': 'Gold',
      'orange': 'Orange',
      'yellow': 'Yellow',
      'purple': 'Purple',
    };
    
    const lower = color.toLowerCase();
    for (const [key, value] of Object.entries(colorMap)) {
      if (lower.includes(key)) return value;
    }
    return color;
  }

  private normalizeFuelType(fuel: string): string {
    const fuelMap: Record<string, string> = {
      'gas': 'Gasoline',
      'gasoline': 'Gasoline',
      'petrol': 'Gasoline',
      'diesel': 'Diesel',
      'electric': 'Electric',
      'hybrid': 'Hybrid',
      'flex': 'Flex fuel',
    };
    
    const lower = fuel.toLowerCase();
    for (const [key, value] of Object.entries(fuelMap)) {
      if (lower.includes(key)) return value;
    }
    return fuel;
  }

  private normalizeTransmission(transmission: string): string {
    const lower = transmission.toLowerCase();
    if (lower.includes('auto')) return 'Automatic';
    if (lower.includes('manual') || lower.includes('stick')) return 'Manual';
    if (lower.includes('cvt')) return 'Automatic';
    return 'Automatic';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async saveSession(userId: number, cookies: any[], fbUserId: string): Promise<void> {
    const session: FacebookSession = {
      cookies,
      userId: fbUserId,
      createdAt: Date.now(),
    };
    
    console.log(`[FB-Automation] Session saved for user ${userId}`);
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.apiKey) {
      return { success: false, message: 'BROWSERLESS_API_KEY not configured' };
    }

    try {
      const browser = await puppeteer.connect({
        browserWSEndpoint: this.getConnectionUrl(),
      });

      const page = await browser.newPage();
      await page.goto('https://www.facebook.com', { waitUntil: 'domcontentloaded', timeout: 15000 });
      const title = await page.title();
      await browser.close();

      return {
        success: true,
        message: `Connected to Browserless. Facebook page loaded: ${title}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export const facebookMarketplaceAutomation = new FacebookMarketplaceAutomation();
