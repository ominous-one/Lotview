/**
 * Cookie Store
 * 
 * Persists Cloudflare bypass cookies with automatic expiration.
 * Helps avoid repeated Cloudflare challenges by reusing valid sessions.
 */

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

interface CookieData {
  domain: string;
  cookies: StoredCookie[];
  timestamp: number;
  expiresAt: number;
}

const DEFAULT_TTL_HOURS = 24;

export class CookieStore {
  private cookieDir: string;
  private ttlMs: number;
  
  constructor(options?: { directory?: string; ttlHours?: number }) {
    this.cookieDir = options?.directory || path.join(process.cwd(), '.cloudflare-cookies');
    this.ttlMs = (options?.ttlHours || DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
  }
  
  private async ensureDir(): Promise<void> {
    try {
      await fs.mkdir(this.cookieDir, { recursive: true });
    } catch (error) {
      // Directory may already exist
    }
  }
  
  private getFilePath(domain: string): string {
    const safeDomain = domain.replace(/[^a-z0-9.-]/gi, '_');
    return path.join(this.cookieDir, `${safeDomain}.json`);
  }
  
  /**
   * Save cookies for a domain
   */
  async saveCookies(domain: string, cookies: StoredCookie[]): Promise<void> {
    await this.ensureDir();
    
    const data: CookieData = {
      domain,
      cookies,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.ttlMs
    };
    
    const filePath = this.getFilePath(domain);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    
    console.log(`  ✓ Saved ${cookies.length} cookies for ${domain}`);
  }
  
  /**
   * Load cookies for a domain (returns null if expired or missing)
   */
  async loadCookies(domain: string): Promise<StoredCookie[] | null> {
    try {
      await this.ensureDir();
      const filePath = this.getFilePath(domain);
      
      const content = await fs.readFile(filePath, 'utf-8');
      const data: CookieData = JSON.parse(content);
      
      // Check expiration
      if (Date.now() > data.expiresAt) {
        console.log(`  ⚠ Cookies for ${domain} expired, deleting...`);
        await this.deleteCookies(domain);
        return null;
      }
      
      // Validate cf_clearance cookie exists
      const hasCfClearance = data.cookies.some(c => c.name === 'cf_clearance');
      if (!hasCfClearance) {
        console.log(`  ⚠ No cf_clearance cookie for ${domain}`);
        return null;
      }
      
      const ageHours = Math.round((Date.now() - data.timestamp) / (60 * 60 * 1000));
      console.log(`  ✓ Loaded ${data.cookies.length} cookies for ${domain} (${ageHours}h old)`);
      
      return data.cookies;
      
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`  ✗ Error loading cookies for ${domain}:`, error);
      }
      return null;
    }
  }
  
  /**
   * Delete cookies for a domain
   */
  async deleteCookies(domain: string): Promise<void> {
    try {
      const filePath = this.getFilePath(domain);
      await fs.unlink(filePath);
      console.log(`  ✓ Deleted cookies for ${domain}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`  ✗ Error deleting cookies for ${domain}:`, error);
      }
    }
  }
  
  /**
   * Clear all stored cookies
   */
  async clearAll(): Promise<void> {
    try {
      await this.ensureDir();
      const files = await fs.readdir(this.cookieDir);
      
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.cookieDir, file)))
      );
      
      console.log(`  ✓ Cleared ${files.length} cookie files`);
    } catch (error) {
      console.error(`  ✗ Error clearing cookies:`, error);
    }
  }
  
  /**
   * Get stats about stored cookies
   */
  async getStats(): Promise<{ domain: string; ageHours: number; expiresIn: number }[]> {
    try {
      await this.ensureDir();
      const files = await fs.readdir(this.cookieDir);
      const stats: { domain: string; ageHours: number; expiresIn: number }[] = [];
      
      for (const file of files) {
        try {
          const content = await fs.readFile(path.join(this.cookieDir, file), 'utf-8');
          const data: CookieData = JSON.parse(content);
          
          stats.push({
            domain: data.domain,
            ageHours: Math.round((Date.now() - data.timestamp) / (60 * 60 * 1000)),
            expiresIn: Math.round((data.expiresAt - Date.now()) / (60 * 60 * 1000))
          });
        } catch {
          // Skip invalid files
        }
      }
      
      return stats;
    } catch {
      return [];
    }
  }
}

// Singleton instance
export const cookieStore = new CookieStore();
