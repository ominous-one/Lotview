import type { NormalizedComp, CompScoreExplain, TrimMatchMode } from './comps-types';

const DRIVETRAIN_ALIASES: Array<[RegExp, string]> = [
  [/\b(all[ -]?wheel|awd)\b/i, 'AWD'],
  [/\b(four[ -]?wheel|4wd|4x4)\b/i, '4WD'],
  [/\b(front[ -]?wheel|fwd)\b/i, 'FWD'],
  [/\b(rear[ -]?wheel|rwd)\b/i, 'RWD'],
];

const TRIM_STOP_WORDS = new Set([
  'auto', 'automatic', 'manual', 'cvt', 'at', 'mt', 'nav', 'navigation', 'pkg', 'package',
  'edition', 'model', 'series', 'door', 'dr', 'certified', 'cpo', 'used', 'new', 'local',
]);

function normalizeTrimText(value?: string): string {
  return (value || '')
    .toLowerCase()
    .replace(/[|/\\(),.-]/g, ' ')
    .replace(/\b(all[ -]?wheel|four[ -]?wheel|front[ -]?wheel|rear[ -]?wheel)\b/g, ' ')
    .replace(/\b(awd|4wd|4x4|fwd|rwd)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function trimTokens(value?: string): string[] {
  return normalizeTrimText(value)
    .split(/\s+/)
    .filter(token => token && !TRIM_STOP_WORDS.has(token));
}

export function normalizeDrivetrain(value?: string): string | undefined {
  const raw = (value || '').trim();
  if (!raw) return undefined;
  for (const [pattern, normalized] of DRIVETRAIN_ALIASES) {
    if (pattern.test(raw)) return normalized;
  }
  return raw.toUpperCase();
}

export function extractDrivetrainFromText(value?: string): string | undefined {
  return normalizeDrivetrain(value);
}

export function sourceScore(source?: string): number {
  const s = (source || 'unknown').toLowerCase();
  if (s.includes('marketcheck')) return 10;
  if (s.includes('cargurus')) return 9;
  if (s.includes('autotrader')) return 7;
  if (s.includes('kijiji')) return 6;
  if (s.includes('craigslist')) return 4;
  return 5;
}

export function freshnessScore(scrapedAt?: Date): { score: number; reason: string } {
  if (!scrapedAt) return { score: 2, reason: 'Freshness unknown' };
  const ageDays = Math.max(0, Math.round((Date.now() - scrapedAt.getTime()) / 86400000));
  const score = ageDays <= 3 ? 10 : ageDays <= 7 ? 8 : ageDays <= 14 ? 5 : ageDays <= 30 ? 2 : 0;
  return { score, reason: `Scrape age ${ageDays}d` };
}

export function scoreComp(params: {
  subjectYear?: number;
  subjectMileageKm?: number;
  subjectTrim?: string;
  subjectDrivetrain?: string;
  trimMode: TrimMatchMode;
  comp: NormalizedComp;
}): CompScoreExplain {
  const reasons: string[] = [];

  let yearScore = 0;
  if (params.subjectYear && params.comp.year) {
    const dy = Math.abs(params.subjectYear - params.comp.year);
    yearScore = dy === 0 ? 30 : dy === 1 ? 22 : dy === 2 ? 14 : 0;
    reasons.push(`Year Δ=${dy}`);
  }

  let mileageScore = 0;
  if (typeof params.subjectMileageKm === 'number' && typeof params.comp.mileageKm === 'number') {
    const diff = Math.abs(params.subjectMileageKm - params.comp.mileageKm);
    mileageScore = diff <= 15000 ? 25 : diff <= 40000 ? 18 : diff <= 80000 ? 10 : 0;
    reasons.push(`Mileage Δ=${Math.round(diff / 1000)}k`);
  } else {
    mileageScore = 8;
    reasons.push('Mileage missing on one side');
  }

  let trimScore = 0;
  const subjTrimRaw = (params.subjectTrim || '').trim();
  const compTrimRaw = (params.comp.trim || '').trim();
  const subjTrim = normalizeTrimText(subjTrimRaw);
  const compTrim = normalizeTrimText(compTrimRaw);
  if (!subjTrim || !compTrim) {
    trimScore = 8;
    reasons.push('Trim missing on one side');
  } else if (subjTrim === compTrim) {
    trimScore = 25;
    reasons.push('Exact trim match');
  } else {
    const subj = new Set(trimTokens(subjTrimRaw));
    const comp = new Set(trimTokens(compTrimRaw));
    const overlap = [...subj].filter(t => comp.has(t)).length;
    const totalTokens = Math.max(subj.size, comp.size, 1);
    const overlapRatio = overlap / totalTokens;

    if (params.trimMode === 'near') {
      trimScore = overlapRatio >= 0.8 ? 20 : overlapRatio >= 0.5 ? 16 : overlap >= 1 ? 10 : 2;
      reasons.push(`Near-trim overlap=${overlap}/${totalTokens}`);
    } else {
      trimScore = 0;
      reasons.push('Trim mismatch (exact mode)');
    }
  }

  let drivetrainScore = 6;
  const subjectDrivetrain = normalizeDrivetrain(params.subjectDrivetrain || params.subjectTrim);
  const compDrivetrain = normalizeDrivetrain(params.comp.drivetrain || params.comp.trim);
  if (subjectDrivetrain && compDrivetrain) {
    if (subjectDrivetrain === compDrivetrain) {
      drivetrainScore = 10;
      reasons.push(`Drivetrain match (${subjectDrivetrain})`);
    } else {
      drivetrainScore = 0;
      reasons.push(`Drivetrain mismatch (${subjectDrivetrain} vs ${compDrivetrain})`);
    }
  } else {
    reasons.push('Drivetrain missing on one side');
  }

  const source = sourceScore(params.comp.source);
  const freshness = freshnessScore(params.comp.scrapedAt);
  reasons.push(freshness.reason);

  const dq = 0;
  const total = Math.round(yearScore + mileageScore + trimScore + drivetrainScore + source + freshness.score + dq);
  return {
    total,
    components: {
      year: yearScore,
      mileage: mileageScore,
      trim: trimScore,
      drivetrain: drivetrainScore,
      source,
      freshness: freshness.score,
      dataQuality: dq,
    },
    reasons,
  };
}
