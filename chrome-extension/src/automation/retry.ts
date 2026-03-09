export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterPct: number; // 0..1
  retryIf?: (err: unknown) => boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  const retryIf = opts.retryIf ?? (() => true);
  let lastErr: unknown;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= opts.retries || !retryIf(err)) throw err;

      const exp = opts.baseDelayMs * Math.pow(2, attempt);
      const capped = Math.min(exp, opts.maxDelayMs);
      const jitter = capped * opts.jitterPct * (Math.random() * 2 - 1);
      const delay = Math.max(0, Math.round(capped + jitter));
      await sleep(delay);
    }
  }

  throw lastErr;
}
