export function bypassCloudflare(url: string): Promise<string> { return Promise.resolve(''); }

export function generateRandomFingerprint(): Record<string, unknown> {
  return {};
}

export async function applyFingerprint(_page: any, _fingerprint: Record<string, unknown>): Promise<void> {
  return undefined;
}

export async function randomDelay(_minMs = 0, _maxMs = 0): Promise<void> {
  return undefined;
}

export async function humanLikeScroll(_page: any): Promise<void> {
  return undefined;
}
