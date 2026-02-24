/**
 * Color Match Scoring Unit Tests (Jest version)
 * Tests the vehicle color matching algorithm used in market pricing
 */

// Mock storage/db to avoid DB connections
jest.mock('../storage', () => ({ storage: {} }));
jest.mock('../db', () => ({ db: { execute: jest.fn() } }));

import { calculateColorMatchScore } from '../market-pricing';

describe('Color Match Scoring', () => {
  describe('Exact matches', () => {
    it('should return 100 for exact color match', () => {
      expect(calculateColorMatchScore('Black', 'Black')).toBe(100);
      expect(calculateColorMatchScore('white', 'white')).toBe(100);
      expect(calculateColorMatchScore('RED', 'red')).toBe(100);
    });

    it('should be case insensitive', () => {
      expect(calculateColorMatchScore('BLACK', 'black')).toBe(100);
      expect(calculateColorMatchScore('JET BLACK', 'jet black')).toBe(100);
      expect(calculateColorMatchScore('PEARL WHITE', 'pearl white')).toBe(100);
    });

    it('should strip special characters', () => {
      expect(calculateColorMatchScore('Black-Leather', 'BlackLeather')).toBe(100);
      expect(calculateColorMatchScore('Jet/Black', 'JetBlack')).toBe(100);
      expect(calculateColorMatchScore('Pearl (White)', 'PearlWhite')).toBe(100);
    });

    it('should handle whitespace correctly', () => {
      expect(calculateColorMatchScore('  Black  ', 'Black')).toBe(100);
      expect(calculateColorMatchScore('Black', '  Black  ')).toBe(100);
    });
  });

  describe('Partial matches', () => {
    it('should return 85 for partial color match (one contains the other)', () => {
      expect(calculateColorMatchScore('Jet Black', 'Black')).toBe(85);
      expect(calculateColorMatchScore('Black Leather', 'Black')).toBe(85);
      expect(calculateColorMatchScore('Pearl White', 'White')).toBe(85);
    });
  });

  describe('Color family matches', () => {
    it('should return 70 for same color family', () => {
      expect(calculateColorMatchScore('Jet Black', 'Ebony')).toBe(70);
      expect(calculateColorMatchScore('Pearl White', 'Ivory')).toBe(70);
      expect(calculateColorMatchScore('Silver', 'Graphite')).toBe(70);
      expect(calculateColorMatchScore('Navy', 'Cobalt')).toBe(70);
      expect(calculateColorMatchScore('Tan', 'Beige')).toBe(70);
    });

    it('should match gray/grey variants', () => {
      expect(calculateColorMatchScore('Gray', 'Grey')).toBe(70);
      expect(calculateColorMatchScore('Grey Leather', 'Gray Interior')).toBe(70);
    });

    it('should match brown family colors', () => {
      expect(calculateColorMatchScore('Cognac', 'Saddle')).toBe(70);
      expect(calculateColorMatchScore('Tan', 'Caramel')).toBe(70);
      expect(calculateColorMatchScore('Espresso', 'Mocha')).toBe(70);
    });
  });

  describe('Different colors', () => {
    it('should return 30 for unrelated colors', () => {
      expect(calculateColorMatchScore('Black', 'White')).toBe(30);
      expect(calculateColorMatchScore('Red', 'Blue')).toBe(30);
      expect(calculateColorMatchScore('Green', 'Orange')).toBe(30);
    });
  });

  describe('Missing colors', () => {
    it('should return neutral 50 when colors are missing', () => {
      expect(calculateColorMatchScore(undefined, 'Black')).toBe(50);
      expect(calculateColorMatchScore('Black', undefined)).toBe(50);
      expect(calculateColorMatchScore(undefined, undefined)).toBe(50);
    });
  });

  describe('Weighted scoring', () => {
    it('should calculate correct weighted score (60% interior, 40% exterior)', () => {
      const interiorScore = calculateColorMatchScore('Black', 'Black'); // 100
      const exteriorScore = calculateColorMatchScore('Red', 'Blue'); // 30
      const weightedScore = Math.round(interiorScore * 0.6 + exteriorScore * 0.4);
      expect(weightedScore).toBe(72); // 100*0.6 + 30*0.4 = 60 + 12 = 72
    });
  });
});
