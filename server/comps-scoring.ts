import type { NormalizedComp, CompScoreExplain, TrimMatchMode } from './comps-types';

export function scoreComp(params: {
  subjectYear?: number;
  subjectMileageKm?: number;
  subjectTrim?: string;
  trimMode: TrimMatchMode;
  comp: NormalizedComp;
}): CompScoreExplain {
  const reasons: string[] = [];

  // Year score (0-30)
  let yearScore = 0;
  if (params.subjectYear && params.comp.year) {
    const dy = Math.abs(params.subjectYear - params.comp.year);
    yearScore = dy === 0 ? 30 : dy === 1 ? 22 : dy === 2 ? 14 : 0;
    reasons.push(`Year Δ=${dy}`);
  }

  // Mileage score (0-25)
  let mileageScore = 0;
  if (typeof params.subjectMileageKm === 'number' && typeof params.comp.mileageKm === 'number') {
    const diff = Math.abs(params.subjectMileageKm - params.comp.mileageKm);
    mileageScore = diff <= 15000 ? 25 : diff <= 40000 ? 18 : diff <= 80000 ? 10 : 0;
    reasons.push(`Mileage Δ=${Math.round(diff / 1000)}k`);
  } else {
    mileageScore = 8;
    reasons.push('Mileage missing on one side');
  }

  // Trim score (0-25)
  let trimScore = 0;
  const subjTrim = (params.subjectTrim || '').trim().toLowerCase();
  const compTrim = (params.comp.trim || '').trim().toLowerCase();
  if (!subjTrim || !compTrim) {
    trimScore = 8;
    reasons.push('Trim missing on one side');
  } else if (subjTrim === compTrim) {
    trimScore = 25;
    reasons.push('Exact trim match');
  } else {
    if (params.trimMode === 'near') {
      const subjTokens = new Set(subjTrim.split(/\s+/g));
      const compTokens = new Set(compTrim.split(/\s+/g));
      const overlap = [...subjTokens].filter(t => compTokens.has(t)).length;
      trimScore = overlap >= 2 ? 18 : overlap >= 1 ? 12 : 4;
      reasons.push(`Near-trim overlap=${overlap}`);
    } else {
      trimScore = 0;
      reasons.push('Trim mismatch (exact mode)');
    }
  }

  // Source score (0-10)
  const s = (params.comp.source || 'unknown').toLowerCase();
  const source = s.includes('marketcheck') ? 10 : s.includes('cargurus') ? 9 : s.includes('autotrader') ? 7 : s.includes('kijiji') ? 6 : s.includes('craigslist') ? 4 : 5;

  // Data quality (0-10) is computed by caller
  const dq = 0;

  const total = Math.round(yearScore + mileageScore + trimScore + source + dq);
  return {
    total,
    components: { year: yearScore, mileage: mileageScore, trim: trimScore, source, dataQuality: dq },
    reasons,
  };
}
