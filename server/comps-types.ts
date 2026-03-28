export type TrimMatchMode = 'exact' | 'near';

import type { NormalizedCondition } from './condition-normalization';

export interface NormalizedComp {
  listingUrl: string;
  source: string;
  sellerName?: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  drivetrain?: string;
  price: number;
  mileageKm?: number;
  daysOnLot?: number;
  scrapedAt?: Date;
  sourceConfidence?: number;
  /**
   * Normalized condition enum. When unavailable, this is omitted (UI should display as unknown).
   */
  condition?: Exclude<NormalizedCondition, 'unknown'>;
  accidentHistory: 'accident_free' | 'reported' | 'unknown';
  exteriorColor?: string;
  interiorColor?: string;
}

export interface CompScoreExplain {
  total: number;
  components: {
    year: number;
    mileage: number;
    trim: number;
    drivetrain: number;
    source: number;
    freshness: number;
    dataQuality: number;
  };
  reasons: string[];
}
