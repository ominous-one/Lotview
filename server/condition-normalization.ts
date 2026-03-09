export type NormalizedCondition = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

export interface ConditionCandidate {
  raw?: unknown;
  source?: string;
}

const SOURCE_PRIORITY: Record<string, number> = {
  // Higher is better
  marketcheck: 100,
  cargurus: 90,
  cargurus_browserless: 85,
  autotrader_browserless: 80,
  apify: 70,
  autotrader_scraper: 60,
  kijiji: 50,
  craigslist: 40,
};

function asString(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'object') {
    try {
      return JSON.stringify(raw);
    } catch {
      return '';
    }
  }
  return String(raw);
}

export function mapConditionEnum(raw: unknown): NormalizedCondition {
  const s = asString(raw).trim().toLowerCase();
  if (!s) return 'unknown';

  // Canonical forms
  if (s === 'excellent' || s === 'like new' || s === 'likenew' || s === 'near new') return 'excellent';
  if (s === 'very good' || s === 'verygood' || s === 'good') return 'good';
  if (s === 'fair' || s === 'average') return 'fair';
  if (s === 'poor' || s === 'rough' || s === 'needs work' || s === 'needswork') return 'poor';

  // Heuristic pattern matches
  if (/(excellent|like\s*new|near\s*new|mint)/i.test(s)) return 'excellent';
  if (/(very\s*good|great\s*condition|good\s*condition|well\s*kept)/i.test(s)) return 'good';
  if (/(fair\s*condition|average\s*condition)/i.test(s)) return 'fair';
  if (/(poor\s*condition|rough\s*condition|needs\s*work|salvage|rebuilt)/i.test(s)) return 'poor';

  // "new" is not part of the report enum; treat it as excellent (conservative for market comps).
  if (/(\bnew\b|brand\s*new)/i.test(s)) return 'excellent';

  return 'unknown';
}

/**
 * Choose the best condition value from multiple candidates using:
 * 1) Source priority order
 * 2) Enum mapping to: excellent|good|fair|poor|unknown
 */
export function normalizeCondition(candidates: ConditionCandidate[]): { condition: NormalizedCondition; chosenSource?: string; raw?: unknown } {
  if (!candidates || candidates.length === 0) return { condition: 'unknown' };

  const scored = candidates
    .map(c => {
      const source = (c.source || 'unknown').toLowerCase();
      const pri = SOURCE_PRIORITY[source] ?? 0;
      const mapped = mapConditionEnum(c.raw);
      return { ...c, source, pri, mapped };
    })
    // Prefer known mapped values; then source priority.
    .sort((a, b) => {
      const aKnown = a.mapped === 'unknown' ? 0 : 1;
      const bKnown = b.mapped === 'unknown' ? 0 : 1;
      if (aKnown !== bKnown) return bKnown - aKnown;
      return (b.pri - a.pri);
    });

  const best = scored[0];
  return { condition: best.mapped, chosenSource: best.source, raw: best.raw };
}

/**
 * UI display helper:
 * - If unknown → return null so UIs can show an em dash and a tooltip.
 */
export function conditionForDisplay(condition: NormalizedCondition): string | null {
  if (!condition || condition === 'unknown') return null;
  return condition;
}
