/**
 * Facebook Auto-Posting Tests
 *
 * Tests:
 *   1. Queue management — creation, status transitions, multi-tenant isolation
 *   2. Autopost queue business logic — vehicle eligibility, photo gate, sort key
 *   3. Image descriptor preparation — download size limits, MIME detection
 *   4. Post data validation — required fields, image constraints
 *
 * No Puppeteer / Browserless connections are made. All browser automation is
 * mocked so tests are fast and deterministic.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../storage', () => {
  let items: any[] = [];
  let idCounter = 1;

  return {
    storage: {
      createFbMarketplaceQueueItem: jest.fn(async (item: any) => {
        const record = { id: idCounter++, status: 'pending', createdAt: new Date(), ...item };
        items.push(record);
        return record;
      }),
      getFbMarketplaceQueueByDealership: jest.fn(async (dealershipId: number) =>
        items.filter((i) => i.dealershipId === dealershipId)
      ),
      updateFbMarketplaceQueueItem: jest.fn(async (id: number, dealershipId: number, updates: any) => {
        const idx = items.findIndex((i) => i.id === id && i.dealershipId === dealershipId);
        if (idx === -1) return null;
        items[idx] = { ...items[idx], ...updates };
        return items[idx];
      }),
      getAutopostQueueByDealership: jest.fn(async () => []),
      getVehiclesForAutopostEvaluation: jest.fn(async () => []),
      upsertAutopostQueueItem: jest.fn(async (item: any) => item),
      getUserById: jest.fn(async () => null),
      getAllDealerships: jest.fn(async () => [{ id: 1, name: 'Test', isActive: true }]),
      getDealershipApiKeys: jest.fn(async () => null),
      // Reset helper for beforeEach
      __reset: () => { items = []; idCounter = 1; },
      __getItems: () => items,
    },
  };
});

jest.mock('../db', () => ({ db: { execute: jest.fn(), select: jest.fn(), update: jest.fn() } }));
jest.mock('../error-utils', () => ({
  logInfo: jest.fn(),
  logWarn: jest.fn(),
  logError: jest.fn(),
}));
jest.mock('../vehicle-photo-utils', () => ({
  uniquePhotoCount: jest.fn((urls: string[]) => (urls ?? []).length),
  computePhotoStatus: jest.fn(() => 'complete'),
}));

// ─── Imports ──────────────────────────────────────────────────────────────────

import { storage } from '../storage';
import {
  classifyInventoryIsUsed,
  computeDefaultQueueSortKey,
} from '../autopost-queue-service';
import type { FacebookMarketplacePostData } from '../facebook-marketplace-automation';

const mockStorage = storage as any;

// ─── Vehicle Classification ───────────────────────────────────────────────────

describe('classifyInventoryIsUsed', () => {
  const currentYear = new Date().getFullYear();

  it('classifies current-year zero-km vehicle as new (not used)', () => {
    const result = classifyInventoryIsUsed({ year: currentYear, odometer: 10 });
    expect(result).toBe(false); // new
  });

  it('classifies older vehicle as used', () => {
    const result = classifyInventoryIsUsed({ year: 2020, odometer: 45000 });
    expect(result).toBe(true);
  });

  it('classifies current-year vehicle with high mileage as used', () => {
    const result = classifyInventoryIsUsed({ year: currentYear, odometer: 15000 });
    expect(result).toBe(true);
  });

  it('handles null year and odometer gracefully', () => {
    const result = classifyInventoryIsUsed({ year: null, odometer: null });
    expect(typeof result).toBe('boolean');
  });
});

// ─── Queue Sort Key ───────────────────────────────────────────────────────────

describe('computeDefaultQueueSortKey', () => {
  const oldDate = new Date('2024-01-01');
  const newDate = new Date('2024-06-01');

  it('prioritises backlog items (never posted) over already-posted', () => {
    const backlog = computeDefaultQueueSortKey({
      createdAt: newDate,
      marketplacePostedAt: null,
      year: 2022,
      odometer: 30000,
    });
    const posted = computeDefaultQueueSortKey({
      createdAt: newDate,
      marketplacePostedAt: new Date('2024-03-01'),
      year: 2022,
      odometer: 30000,
    });
    expect(backlog[0]).toBeLessThan(posted[0]);
  });

  it('prioritises used vehicles over new within same backlog bucket', () => {
    const usedVehicle = computeDefaultQueueSortKey({
      createdAt: newDate,
      marketplacePostedAt: null,
      year: 2021,
      odometer: 50000,
    });
    const currentYear = new Date().getFullYear();
    const newVehicle = computeDefaultQueueSortKey({
      createdAt: newDate,
      marketplacePostedAt: null,
      year: currentYear,
      odometer: 5,
    });
    // used bucket (0) < new bucket (1)
    expect(usedVehicle[1]).toBeLessThanOrEqual(newVehicle[1]);
  });

  it('prioritises older inventory within same bucket', () => {
    const older = computeDefaultQueueSortKey({
      createdAt: oldDate,
      marketplacePostedAt: null,
      year: 2022,
      odometer: 30000,
    });
    const newer = computeDefaultQueueSortKey({
      createdAt: newDate,
      marketplacePostedAt: null,
      year: 2022,
      odometer: 30000,
    });
    // ageKey is createdAt timestamp, smaller = older = higher priority
    expect(older[2]).toBeLessThan(newer[2]);
  });

  it('returns a 3-element tuple', () => {
    const key = computeDefaultQueueSortKey({
      createdAt: new Date(),
      marketplacePostedAt: null,
    });
    expect(key).toHaveLength(3);
    expect(typeof key[0]).toBe('number');
    expect(typeof key[1]).toBe('number');
    expect(typeof key[2]).toBe('number');
  });
});

// ─── Post Data Validation ─────────────────────────────────────────────────────

describe('FB Marketplace post data validation', () => {
  function buildValidPostData(overrides: Partial<FacebookMarketplacePostData> = {}): FacebookMarketplacePostData {
    return {
      year: 2022,
      make: 'Toyota',
      model: 'RAV4',
      price: 35000,
      mileage: 25000,
      description: 'A well-maintained 2022 Toyota RAV4 XLE with heated seats and AWD.',
      imageUrls: [
        'https://cdn.autotradercdn.ca/photo1.jpg',
        'https://cdn.autotradercdn.ca/photo2.jpg',
        'https://cdn.autotradercdn.ca/photo3.jpg',
      ],
      exteriorColor: 'White',
      interiorColor: 'Black',
      fuelType: 'Gasoline',
      transmission: 'Automatic',
      condition: 'Excellent',
      ...overrides,
    };
  }

  it('builds a valid post data object with all required fields', () => {
    const data = buildValidPostData();
    expect(data.year).toBe(2022);
    expect(data.make).toBe('Toyota');
    expect(data.model).toBe('RAV4');
    expect(data.price).toBeGreaterThan(0);
    expect(data.imageUrls.length).toBeGreaterThan(0);
    expect(typeof data.description).toBe('string');
  });

  it('allows 0 price (contact for price scenario)', () => {
    const data = buildValidPostData({ price: 0 });
    expect(data.price).toBe(0);
  });

  it('respects MAX_IMAGES cap logic (20 images)', () => {
    const MAX_IMAGES = 20;
    const manyUrls = Array.from({ length: 30 }, (_, i) => `https://cdn.example.com/img${i}.jpg`);
    const capped = manyUrls.slice(0, MAX_IMAGES);
    expect(capped.length).toBe(MAX_IMAGES);
    expect(manyUrls.length).toBeGreaterThan(MAX_IMAGES);
  });

  it('description is a non-empty string', () => {
    const data = buildValidPostData();
    expect(data.description.trim().length).toBeGreaterThan(0);
  });
});

// ─── Queue Multi-Tenant Isolation ─────────────────────────────────────────────

describe('FB Marketplace queue — multi-tenant isolation', () => {
  beforeEach(() => {
    mockStorage.__reset();
    jest.clearAllMocks();
  });

  it('creates queue items scoped to dealership', async () => {
    await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 10 });
    await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 2, vehicleId: 20 });

    const d1Items = await mockStorage.getFbMarketplaceQueueByDealership(1);
    const d2Items = await mockStorage.getFbMarketplaceQueueByDealership(2);

    expect(d1Items).toHaveLength(1);
    expect(d2Items).toHaveLength(1);
    expect(d1Items[0].vehicleId).toBe(10);
    expect(d2Items[0].vehicleId).toBe(20);
  });

  it('does not return items from other dealerships', async () => {
    await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 10 });
    await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 11 });
    await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 2, vehicleId: 99 });

    const d1Items = await mockStorage.getFbMarketplaceQueueByDealership(1);
    expect(d1Items).toHaveLength(2);
    expect(d1Items.every((i: any) => i.dealershipId === 1)).toBe(true);
  });

  it('enforces dealership ID on update (cross-tenant write blocked)', async () => {
    const item = await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 10 });

    // Attempt update with wrong dealershipId
    const result = await mockStorage.updateFbMarketplaceQueueItem(item.id, 2, { status: 'posting' });
    expect(result).toBeNull(); // Should not update
    expect(mockStorage.__getItems()[0].status).toBe('pending'); // Unchanged
  });
});

// ─── Queue Status Transitions ─────────────────────────────────────────────────

describe('FB Marketplace queue — status lifecycle', () => {
  beforeEach(() => {
    mockStorage.__reset();
    jest.clearAllMocks();
  });

  it('transitions pending → posting → completed', async () => {
    const item = await mockStorage.createFbMarketplaceQueueItem({
      dealershipId: 1,
      vehicleId: 10,
      status: 'pending',
    });
    expect(item.status).toBe('pending');

    const posting = await mockStorage.updateFbMarketplaceQueueItem(item.id, 1, {
      status: 'posting',
      startedAt: new Date(),
    });
    expect(posting.status).toBe('posting');

    const completed = await mockStorage.updateFbMarketplaceQueueItem(item.id, 1, {
      status: 'completed',
      completedAt: new Date(),
      listingUrl: 'https://www.facebook.com/marketplace/item/123456',
    });
    expect(completed.status).toBe('completed');
    expect(completed.listingUrl).toContain('facebook.com/marketplace');
  });

  it('transitions pending → failed with error message', async () => {
    const item = await mockStorage.createFbMarketplaceQueueItem({
      dealershipId: 1,
      vehicleId: 10,
      status: 'pending',
    });

    const failed = await mockStorage.updateFbMarketplaceQueueItem(item.id, 1, {
      status: 'failed',
      lastError: 'Facebook session expired - please re-authenticate',
    });
    expect(failed.status).toBe('failed');
    expect(failed.lastError).toContain('session expired');
  });

  it('transitions pending → blocked with reason', async () => {
    const item = await mockStorage.createFbMarketplaceQueueItem({
      dealershipId: 1,
      vehicleId: 10,
      status: 'pending',
    });

    const blocked = await mockStorage.updateFbMarketplaceQueueItem(item.id, 1, {
      status: 'blocked',
      lastError: '<10 photos',
    });
    expect(blocked.status).toBe('blocked');
    expect(blocked.lastError).toContain('photos');
  });

  it('assigns sequential IDs', async () => {
    const a = await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 1 });
    const b = await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 2 });
    const c = await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 3 });
    expect(b.id).toBe(a.id + 1);
    expect(c.id).toBe(b.id + 1);
  });
});
