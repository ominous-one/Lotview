import { promises as fs } from 'fs';
import path from 'path';

interface StoredCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

interface StoredCookies {
  domain: string;
  cookies: StoredCookie[];
  timestamp: number;
  expiresAt: number;
}

const COOKIE_DIR = path.join(process.cwd(), '.cloudflare-cookies');
const COOKIE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export class CookieStore {
  private ensureDir = async () => {
    try {
      await fs.mkdir(COOKIE_DIR, { recursive: true });
    } catch (error) {
      console.error('Failed to create cookie directory:', error);
    }
  };

  private getCookieFilePath = (domain: string): string => {
    const safeDomain = domain.replace(/[^a-z0-9]/gi, '_');
    return path.join(COOKIE_DIR, `${safeDomain}.json`);
  };

  async saveCookies(domain: string, cookies: any[]): Promise<void> {
    await this.ensureDir();
    
    const stored: StoredCookies = {
      domain,
      cookies,
      timestamp: Date.now(),
      expiresAt: Date.now() + COOKIE_TTL
    };

    const filePath = this.getCookieFilePath(domain);
    await fs.writeFile(filePath, JSON.stringify(stored, null, 2), 'utf-8');
    console.log(`✓ Saved ${cookies.length} cookies for ${domain}`);
  }

  async loadCookies(domain: string): Promise<StoredCookie[] | null> {
    try {
      await this.ensureDir();
      const filePath = this.getCookieFilePath(domain);
      
      const content = await fs.readFile(filePath, 'utf-8');
      const stored: StoredCookies = JSON.parse(content);

      // Check if cookies are expired
      if (Date.now() > stored.expiresAt) {
        console.log(`⚠ Cookies for ${domain} have expired, will need fresh challenge solve`);
        await this.deleteCookies(domain);
        return null;
      }

      // Validate cf_clearance cookie exists
      const hasCfClearance = stored.cookies.some(c => c.name === 'cf_clearance');
      if (!hasCfClearance) {
        console.log(`⚠ No cf_clearance cookie found for ${domain}`);
        return null;
      }

      console.log(`✓ Loaded ${stored.cookies.length} valid cookies for ${domain}`);
      return stored.cookies;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Error loading cookies for ${domain}:`, error);
      }
      return null;
    }
  }

  async deleteCookies(domain: string): Promise<void> {
    try {
      const filePath = this.getCookieFilePath(domain);
      await fs.unlink(filePath);
      console.log(`✓ Deleted expired cookies for ${domain}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`Error deleting cookies for ${domain}:`, error);
      }
    }
  }

  async clearAll(): Promise<void> {
    try {
      await this.ensureDir();
      const files = await fs.readdir(COOKIE_DIR);
      
      await Promise.all(
        files.map(file => fs.unlink(path.join(COOKIE_DIR, file)))
      );
      
      console.log(`✓ Cleared all stored cookies (${files.length} domains)`);
    } catch (error) {
      console.error('Error clearing cookie store:', error);
    }
  }
}

export const cookieStore = new CookieStore();
