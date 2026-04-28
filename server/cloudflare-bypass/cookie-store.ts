export function getCookie(): string { return 'cf_cookie_stub'; }

export const cookieStore = {
  async loadCookies(_domain: string): Promise<any[] | null> {
    return null;
  },
  async saveCookies(_domain: string, _cookies: any[]): Promise<void> {
    return undefined;
  },
};
