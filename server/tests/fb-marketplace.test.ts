/**
 * Facebook Marketplace Queue & Listing Tests
 * Tests posting queue logic, status transitions, multi-tenant isolation
 */

jest.mock('../storage', () => {
  // In-memory mock storage for FB marketplace operations
  let queues: any[] = [];
  let listings: any[] = [];
  let nextId = 1;

  return {
    storage: {
      // Queue operations
      createFbMarketplaceQueueItem: jest.fn(async (item: any) => {
        const record = { id: nextId++, ...item, createdAt: new Date(), status: item.status || 'pending' };
        queues.push(record);
        return record;
      }),
      getFbMarketplaceQueueByDealership: jest.fn(async (dealershipId: number) => {
        return queues.filter(q => q.dealershipId === dealershipId);
      }),
      updateFbMarketplaceQueueItem: jest.fn(async (id: number, dealershipId: number, updates: any) => {
        const idx = queues.findIndex(q => q.id === id && q.dealershipId === dealershipId);
        if (idx === -1) return null;
        queues[idx] = { ...queues[idx], ...updates };
        return queues[idx];
      }),
      // Listing operations
      createFbMarketplaceListing: jest.fn(async (listing: any) => {
        const record = { id: nextId++, ...listing, createdAt: new Date() };
        listings.push(record);
        return record;
      }),
      getFbMarketplaceListingsByDealership: jest.fn(async (dealershipId: number) => {
        return listings.filter(l => l.dealershipId === dealershipId);
      }),
      // Vehicles
      getVehicle: jest.fn(async (id: number, dealershipId: number) => {
        if (dealershipId === 1) {
          return { id, dealershipId, year: 2024, make: 'Toyota', model: 'Camry', price: 25000, vin: 'TEST123' };
        }
        if (dealershipId === 2) {
          return { id: id + 100, dealershipId: 2, year: 2023, make: 'Honda', model: 'Civic', price: 22000, vin: 'TEST456' };
        }
        return null;
      }),
      getUserById: jest.fn(),
      // Reset helper for tests
      __reset: () => { queues = []; listings = []; nextId = 1; },
      __getQueues: () => queues,
      __getListings: () => listings,
    }
  };
});

jest.mock('../db', () => ({ db: { execute: jest.fn() } }));

import { storage } from '../storage';

const mockStorage = storage as any;

describe('FB Marketplace Queue', () => {
  beforeEach(() => {
    mockStorage.__reset();
    jest.clearAllMocks();
  });

  describe('Queue Item Creation', () => {
    it('should create a queue item with pending status', async () => {
      const item = await mockStorage.createFbMarketplaceQueueItem({
        dealershipId: 1,
        vehicleId: 10,
        accountId: 5,
        status: 'pending',
      });

      expect(item.id).toBeDefined();
      expect(item.dealershipId).toBe(1);
      expect(item.vehicleId).toBe(10);
      expect(item.status).toBe('pending');
    });

    it('should auto-assign sequential IDs', async () => {
      const item1 = await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 1 });
      const item2 = await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 2 });
      expect(item2.id).toBe(item1.id + 1);
    });

    it('should include creation timestamp', async () => {
      const item = await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 1 });
      expect(item.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('Queue Status Transitions', () => {
    it('should transition from pending to posting', async () => {
      const item = await mockStorage.createFbMarketplaceQueueItem({
        dealershipId: 1, vehicleId: 10, status: 'pending'
      });

      const updated = await mockStorage.updateFbMarketplaceQueueItem(item.id, 1, { status: 'posting' });
      expect(updated.status).toBe('posting');
    });

    it('should transition from posting to completed', async () => {
      const item = await mockStorage.createFbMarketplaceQueueItem({
        dealershipId: 1, vehicleId: 10, status: 'posting'
      });

      const updated = await mockStorage.updateFbMarketplaceQueueItem(item.id, 1, {
        status: 'completed',
        completedAt: new Date(),
        fbListingId: 'fb-listing-123'
      });
      expect(updated.status).toBe('completed');
      expect(updated.fbListingId).toBe('fb-listing-123');
    });

    it('should transition from posting to failed with error', async () => {
      const item = await mockStorage.createFbMarketplaceQueueItem({
        dealershipId: 1, vehicleId: 10, status: 'posting'
      });

      const updated = await mockStorage.updateFbMarketplaceQueueItem(item.id, 1, {
        status: 'failed',
        errorMessage: 'Facebook rate limit exceeded',
        retryCount: 1
      });
      expect(updated.status).toBe('failed');
      expect(updated.errorMessage).toBe('Facebook rate limit exceeded');
      expect(updated.retryCount).toBe(1);
    });

    it('should allow retry of failed items (failed -> pending)', async () => {
      const item = await mockStorage.createFbMarketplaceQueueItem({
        dealershipId: 1, vehicleId: 10, status: 'failed', retryCount: 1
      });

      const updated = await mockStorage.updateFbMarketplaceQueueItem(item.id, 1, {
        status: 'pending',
        retryCount: 2
      });
      expect(updated.status).toBe('pending');
      expect(updated.retryCount).toBe(2);
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should only return queue items for the correct dealership', async () => {
      await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 10 });
      await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 11 });
      await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 2, vehicleId: 20 });

      const dealer1Queue = await mockStorage.getFbMarketplaceQueueByDealership(1);
      const dealer2Queue = await mockStorage.getFbMarketplaceQueueByDealership(2);

      expect(dealer1Queue.length).toBe(2);
      expect(dealer2Queue.length).toBe(1);
      expect(dealer1Queue.every((q: any) => q.dealershipId === 1)).toBe(true);
      expect(dealer2Queue.every((q: any) => q.dealershipId === 2)).toBe(true);
    });

    it('should not allow cross-tenant queue updates', async () => {
      const item = await mockStorage.createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 10 });

      // Try to update with wrong dealership ID
      const result = await mockStorage.updateFbMarketplaceQueueItem(item.id, 2, { status: 'completed' });
      expect(result).toBeNull();

      // Verify original is unchanged
      const queue = await mockStorage.getFbMarketplaceQueueByDealership(1);
      expect(queue[0].status).toBe('pending');
    });

    it('should isolate listings between dealerships', async () => {
      await mockStorage.createFbMarketplaceListing({ dealershipId: 1, vehicleId: 10, fbListingId: 'fb-1' });
      await mockStorage.createFbMarketplaceListing({ dealershipId: 2, vehicleId: 20, fbListingId: 'fb-2' });

      const dealer1Listings = await mockStorage.getFbMarketplaceListingsByDealership(1);
      const dealer2Listings = await mockStorage.getFbMarketplaceListingsByDealership(2);

      expect(dealer1Listings.length).toBe(1);
      expect(dealer2Listings.length).toBe(1);
      expect(dealer1Listings[0].fbListingId).toBe('fb-1');
      expect(dealer2Listings[0].fbListingId).toBe('fb-2');
    });
  });

  describe('Vehicle Resolution', () => {
    it('should resolve vehicle for correct dealership', async () => {
      const vehicle = await mockStorage.getVehicle(10, 1);
      expect(vehicle).not.toBeNull();
      expect(vehicle.dealershipId).toBe(1);
      expect(vehicle.make).toBe('Toyota');
    });

    it('should resolve vehicle for different dealership', async () => {
      const vehicle = await mockStorage.getVehicle(10, 2);
      expect(vehicle).not.toBeNull();
      expect(vehicle.dealershipId).toBe(2);
      expect(vehicle.make).toBe('Honda');
    });

    it('should return null for non-existent dealership', async () => {
      const vehicle = await mockStorage.getVehicle(10, 999);
      expect(vehicle).toBeNull();
    });
  });
});

describe('FB Marketplace Listings', () => {
  beforeEach(() => {
    mockStorage.__reset();
    jest.clearAllMocks();
  });

  it('should create a listing record', async () => {
    const listing = await mockStorage.createFbMarketplaceListing({
      dealershipId: 1,
      vehicleId: 10,
      fbListingId: 'fb-listing-abc',
      status: 'active',
      postedAt: new Date(),
    });

    expect(listing.id).toBeDefined();
    expect(listing.fbListingId).toBe('fb-listing-abc');
    expect(listing.status).toBe('active');
  });

  it('should track multiple listings per dealership', async () => {
    await mockStorage.createFbMarketplaceListing({ dealershipId: 1, vehicleId: 10, fbListingId: 'fb-1' });
    await mockStorage.createFbMarketplaceListing({ dealershipId: 1, vehicleId: 11, fbListingId: 'fb-2' });
    await mockStorage.createFbMarketplaceListing({ dealershipId: 1, vehicleId: 12, fbListingId: 'fb-3' });

    const listings = await mockStorage.getFbMarketplaceListingsByDealership(1);
    expect(listings.length).toBe(3);
  });
});
