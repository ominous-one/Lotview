export function getProxy(): string { return ''; }

export const proxyManager = {
  getNext(): { server: string; username?: string; password?: string } | null {
    return null;
  },
  async authenticateProxy(_page: any, _proxy: { username?: string; password?: string }): Promise<void> {
    return undefined;
  },
};
