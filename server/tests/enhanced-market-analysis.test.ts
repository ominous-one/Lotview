import { EnhancedMarketAnalysisService } from '../enhanced-market-analysis';

describe('enhanced market analysis quality', () => {
  it('carries proof counters into analysis quality output', () => {
    const service = new EnhancedMarketAnalysisService() as any;

    const result = service.buildAnalysisQuality(
      18,
      9,
      3,
      0.75,
      12,
      2,
      4,
      1,
      [],
    );

    expect(result.confidence).toBe('high');
    expect(result.proof).toEqual({
      directTrimMatches: 12,
      fallbackNoTrimCount: 2,
      zeroPriceFiltered: 4,
      outlierPriceFiltered: 1,
    });
  });

  it('downgrades confidence when trim match rate is weak', () => {
    const service = new EnhancedMarketAnalysisService() as any;

    const result = service.buildAnalysisQuality(
      18,
      9,
      3,
      0.2,
      4,
      10,
      0,
      0,
      ['Trim data fallback was used'],
    );

    expect(result.confidence).toBe('medium');
    expect(result.notes).toEqual(expect.arrayContaining([
      'Only 20% of cached comps had a direct trim match.',
      'Trim coverage fallback was used for part of this analysis.',
    ]));
  });
});
