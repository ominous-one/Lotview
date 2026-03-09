import { sleep } from "./retry";

export interface TypingSimConfig {
  msPerCharMin: number;
  msPerCharMax: number;
  minTotalTypingMs: number;
  maxTotalTypingMs: number;
  chunkSizeCharsMin: number;
  chunkSizeCharsMax: number;
  pauseEveryNChars: number; // 0 disables
  pauseDurationMsMin: number;
  pauseDurationMsMax: number;
  jitterPct: number; // 0..1
  sendAfterTypingDoneDelayMsMin: number;
  sendAfterTypingDoneDelayMsMax: number;
}

export const DEFAULT_TYPING_SIM: TypingSimConfig = {
  msPerCharMin: 35,
  msPerCharMax: 95,
  minTotalTypingMs: 700,
  maxTotalTypingMs: 12000,
  chunkSizeCharsMin: 1,
  chunkSizeCharsMax: 4,
  pauseEveryNChars: 40,
  pauseDurationMsMin: 250,
  pauseDurationMsMax: 900,
  jitterPct: 0.2,
  sendAfterTypingDoneDelayMsMin: 120,
  sendAfterTypingDoneDelayMsMax: 450,
};

export interface TypeIntoOptions {
  abortSignal?: AbortSignal;
  shouldAbort?: () => boolean;
  onProgress?: (typedChars: number, totalChars: number) => void;
}

function randInt(min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function jitterMs(baseMs: number, jitterPct: number): number {
  const jitter = baseMs * jitterPct * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(baseMs + jitter));
}

function checkAbort(opts?: TypeIntoOptions): void {
  if (opts?.abortSignal?.aborted) {
    throw new Error("TYPING_ABORTED_SIGNAL");
  }
  if (opts?.shouldAbort?.()) {
    throw new Error("TYPING_ABORTED_CONDITION");
  }
}

/**
 * Types `text` into a contenteditable by dispatching real input events.
 * Caller must focus the element first.
 */
export async function typeIntoContentEditable(
  el: HTMLElement,
  text: string,
  cfg: TypingSimConfig = DEFAULT_TYPING_SIM,
  opts?: TypeIntoOptions
): Promise<{ totalMs: number }>{
  const start = Date.now();

  const L = text.length;
  const p = randFloat(cfg.msPerCharMin, cfg.msPerCharMax);
  const targetTypingMs = clamp(L * p, cfg.minTotalTypingMs, cfg.maxTotalTypingMs);
  const avgChunk = (cfg.chunkSizeCharsMin + cfg.chunkSizeCharsMax) / 2;
  const expectedChunks = Math.max(1, Math.ceil(L / avgChunk));
  const baseDelayPerChunk = targetTypingMs / expectedChunks;

  let typed = 0;
  while (typed < L) {
    checkAbort(opts);

    const chunkSize = randInt(cfg.chunkSizeCharsMin, cfg.chunkSizeCharsMax);
    const chunk = text.slice(typed, typed + chunkSize);

    // Prefer execCommand for Facebook/Messenger style editors.
    // It triggers input events in most cases.
    try {
      document.execCommand("insertText", false, chunk);
    } catch {
      // Fallback: append textContent and dispatch input.
      el.textContent = (el.textContent || "") + chunk;
    }

    el.dispatchEvent(new Event("input", { bubbles: true }));
    typed += chunk.length;
    opts?.onProgress?.(typed, L);

    if (cfg.pauseEveryNChars > 0 && typed % cfg.pauseEveryNChars === 0 && typed < L) {
      const pauseMs = randInt(cfg.pauseDurationMsMin, cfg.pauseDurationMsMax);
      await sleep(pauseMs);
    }

    const delay = jitterMs(baseDelayPerChunk, cfg.jitterPct);
    await sleep(delay);
  }

  const afterDelay = randInt(cfg.sendAfterTypingDoneDelayMsMin, cfg.sendAfterTypingDoneDelayMsMax);
  await sleep(afterDelay);

  return { totalMs: Date.now() - start };
}

export function sanitizeForComposer(text: string): string {
  // Keep it simple and avoid sending empty/whitespace-only.
  return (text || "").replace(/\s+$/g, "");
}
