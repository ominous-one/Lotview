interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

export class ProxyManager {
  private proxies: ProxyConfig[] = [];
  private currentIndex = 0;
  private enabled = false;

  constructor() {
    this.loadProxiesFromEnv();
  }

  private loadProxiesFromEnv(): void {
    const proxyString = process.env.SCRAPER_PROXIES;
    
    if (!proxyString) {
      console.log('ℹ No proxies configured (SCRAPER_PROXIES env not set)');
      return;
    }

    try {
      // Format: http://user:pass@host:port,http://user:pass@host:port
      // Or simply: http://host:port,http://host:port
      const proxyUrls = proxyString.split(',').map(p => p.trim());
      
      for (const url of proxyUrls) {
        const parsed = new URL(url);
        
        this.proxies.push({
          server: `${parsed.protocol}//${parsed.host}`,
          username: parsed.username || undefined,
          password: parsed.password || undefined
        });
      }

      this.enabled = this.proxies.length > 0;
      console.log(`✓ Loaded ${this.proxies.length} proxy servers`);
    } catch (error) {
      console.error('Error parsing SCRAPER_PROXIES:', error);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getNext(): ProxyConfig | null {
    if (!this.enabled || this.proxies.length === 0) {
      return null;
    }

    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    
    return proxy;
  }

  async authenticateProxy(page: any, proxy: ProxyConfig): Promise<void> {
    if (proxy.username && proxy.password) {
      await page.authenticate({
        username: proxy.username,
        password: proxy.password
      });
      console.log(`  ✓ Authenticated with proxy: ${proxy.server}`);
    }
  }
}

export const proxyManager = new ProxyManager();
