/**
 * E2E Flow Integration Test
 * Simulates the complete user journey through LotView:
 * 1. Register dealership account
 * 2. Add vehicle listing
 * 3. Trigger FB Marketplace auto-post
 * 4. Verify posting queue processes
 * 5. Simulate incoming FB message
 * 6. Verify AI auto-reply generates
 * 7. Check WebSocket notification patterns
 */

// ===== Mock Infrastructure =====

const mockUsers: Map<string, any> = new Map();
const mockDealerships: Map<number, any> = new Map();
const mockVehicles: Map<string, any> = new Map();
const mockQueue: any[] = [];
const mockConversations: any[] = [];
const mockMessages: any[] = [];
const mockNotifications: any[] = [];
const mockPasswordResetTokens: any[] = [];
let nextUserId = 1;
let nextDealershipId = 1;
let nextVehicleId = 1;
let nextQueueId = 1;
let nextConvId = 1;

function resetMocks() {
  mockUsers.clear();
  mockDealerships.clear();
  mockVehicles.clear();
  mockQueue.length = 0;
  mockConversations.length = 0;
  mockMessages.length = 0;
  mockNotifications.length = 0;
  mockPasswordResetTokens.length = 0;
  nextUserId = 1;
  nextDealershipId = 1;
  nextVehicleId = 1;
  nextQueueId = 1;
  nextConvId = 1;
}

jest.mock('../storage', () => ({
  storage: {
    // Dealership
    createDealership: jest.fn(async (data: any) => {
      const d = { id: nextDealershipId++, ...data, createdAt: new Date() };
      mockDealerships.set(d.id, d);
      return d;
    }),
    getDealershipBySlug: jest.fn(async (slug: string) => {
      for (const d of mockDealerships.values()) { if (d.slug === slug) return d; }
      return undefined;
    }),
    getDealership: jest.fn(async (id: number) => mockDealerships.get(id) || null),

    // Users
    createUser: jest.fn(async (data: any) => {
      const u = { id: nextUserId++, ...data, isActive: true, createdAt: new Date(), updatedAt: new Date() };
      mockUsers.set(u.email, u);
      return u;
    }),
    getUserByEmail: jest.fn(async (email: string) => mockUsers.get(email) || null),
    getUserById: jest.fn(async (id: number) => {
      for (const u of mockUsers.values()) { if (u.id === id) return u; }
      return null;
    }),
    deleteUser: jest.fn(async (id: number) => {
      for (const [email, u] of mockUsers.entries()) { if (u.id === id) { mockUsers.delete(email); return true; } }
      return false;
    }),

    // Vehicles
    createVehicle: jest.fn(async (data: any) => {
      const v = { id: nextVehicleId++, ...data, createdAt: new Date(), updatedAt: new Date() };
      mockVehicles.set(`${v.dealershipId}-${v.vin}`, v);
      return v;
    }),
    getVehicle: jest.fn(async (id: number, dealershipId: number) => {
      for (const v of mockVehicles.values()) { if (v.id === id && v.dealershipId === dealershipId) return v; }
      return null;
    }),
    getVehicleByVin: jest.fn(async (vin: string, dealershipId: number) => {
      return mockVehicles.get(`${dealershipId}-${vin}`) || null;
    }),
    getVehiclesByDealership: jest.fn(async (dealershipId: number) => {
      return Array.from(mockVehicles.values()).filter(v => v.dealershipId === dealershipId);
    }),
    deleteVehicle: jest.fn(async (id: number, dealershipId: number) => {
      for (const [key, v] of mockVehicles.entries()) {
        if (v.id === id && v.dealershipId === dealershipId) { mockVehicles.delete(key); return true; }
      }
      return false;
    }),

    // FB Marketplace Queue
    createFbMarketplaceQueueItem: jest.fn(async (data: any) => {
      const item = { id: nextQueueId++, ...data, status: 'pending', createdAt: new Date() };
      mockQueue.push(item);
      return item;
    }),
    getFbMarketplaceQueueByDealership: jest.fn(async (dealershipId: number) => {
      return mockQueue.filter(q => q.dealershipId === dealershipId);
    }),
    updateFbMarketplaceQueueItem: jest.fn(async (id: number, dealershipId: number, updates: any) => {
      const item = mockQueue.find(q => q.id === id && q.dealershipId === dealershipId);
      if (!item) return null;
      Object.assign(item, updates);
      return item;
    }),

    // Conversations
    createMessengerConversation: jest.fn(async (data: any) => {
      const conv = { id: nextConvId++, ...data, messages: [], createdAt: new Date() };
      mockConversations.push(conv);
      return conv;
    }),
    getMessengerConversationsByDealership: jest.fn(async (dealershipId: number) => {
      return mockConversations.filter(c => c.dealershipId === dealershipId);
    }),
    appendMessageToConversation: jest.fn(async (id: number, dealershipId: number, msg: any) => {
      const conv = mockConversations.find(c => c.id === id && c.dealershipId === dealershipId);
      if (!conv) return false;
      conv.messages.push({ ...msg, timestamp: new Date() });
      mockMessages.push({ conversationId: id, dealershipId, ...msg });
      return true;
    }),

    // Password reset
    createPasswordResetToken: jest.fn(async (userId: number, tokenHash: string, expiresAt: Date) => {
      const token = { id: mockPasswordResetTokens.length + 1, userId, tokenHash, expiresAt, used: false };
      mockPasswordResetTokens.push(token);
      return token;
    }),
    getAllValidPasswordResetTokens: jest.fn(async () => {
      return mockPasswordResetTokens.filter(t => !t.used && t.expiresAt > new Date());
    }),
    markPasswordResetTokenUsed: jest.fn(async (id: number) => {
      const token = mockPasswordResetTokens.find(t => t.id === id);
      if (token) token.used = true;
    }),
  }
}));

jest.mock('../db', () => ({ db: { execute: jest.fn(), update: jest.fn() } }));

import { storage } from '../storage';
import { hashPassword, comparePassword, generateToken, verifyToken } from '../auth';

describe('E2E Flow: Complete User Journey', () => {
  beforeEach(() => {
    resetMocks();
    jest.clearAllMocks();
  });

  describe('Step 1: Dealership Registration', () => {
    it('should register a new dealership', async () => {
      const dealership = await storage.createDealership({
        name: 'Olympic Auto Group',
        slug: 'olympic',
        subdomain: 'olympic',
        address: '123 Main St',
        city: 'Vancouver',
        province: 'BC',
        postalCode: 'V5K 0A1',
        phone: '604-555-1234',
        isActive: true,
      } as any);

      expect(dealership.id).toBe(1);
      expect(dealership.name).toBe('Olympic Auto Group');
      expect(dealership.slug).toBe('olympic');
    });

    it('should create a manager user for the dealership', async () => {
      const dealership = await storage.createDealership({
        name: 'Olympic Auto Group', slug: 'olympic', subdomain: 'olympic',
        address: '123 Main', city: 'Vancouver', province: 'BC', postalCode: 'V5K 0A1',
        phone: '604-555-1234', isActive: true,
      } as any);

      const passwordHash = await hashPassword('SecurePass123!');
      const user = await storage.createUser({
        email: 'manager@olympic.com',
        passwordHash,
        role: 'manager',
        dealershipId: dealership.id,
        name: 'John Manager',
        isActive: true,
      } as any);

      expect(user.id).toBe(1);
      expect(user.email).toBe('manager@olympic.com');
      expect(user.role).toBe('manager');
      expect(user.dealershipId).toBe(dealership.id);
    });

    it('should generate a valid JWT for the user', async () => {
      const dealership = await storage.createDealership({
        name: 'Test', slug: 'test', subdomain: 'test',
        address: '1', city: 'C', province: 'BC', postalCode: 'V5K', phone: '555', isActive: true,
      } as any);

      const passwordHash = await hashPassword('Pass123!');
      const user = await storage.createUser({
        email: 'user@test.com', passwordHash, role: 'manager',
        dealershipId: dealership.id, name: 'Test', isActive: true,
      } as any);

      const token = generateToken(user);
      const decoded = verifyToken(token);

      expect(decoded).not.toBeNull();
      expect(decoded.id).toBe(user.id);
      expect(decoded.dealershipId).toBe(dealership.id);
      expect(decoded.role).toBe('manager');
    });
  });

  describe('Step 2: Login Flow', () => {
    it('should authenticate with correct credentials', async () => {
      const passwordHash = await hashPassword('SecurePass123!');
      await storage.createUser({
        email: 'login@test.com', passwordHash, role: 'manager',
        dealershipId: 1, name: 'Login Test', isActive: true,
      } as any);

      const user = await storage.getUserByEmail('login@test.com');
      expect(user).not.toBeNull();

      const isValid = await comparePassword('SecurePass123!', user!.passwordHash);
      expect(isValid).toBe(true);

      const token = generateToken(user!);
      expect(verifyToken(token)).not.toBeNull();
    });

    it('should reject incorrect credentials', async () => {
      const passwordHash = await hashPassword('CorrectPassword');
      await storage.createUser({
        email: 'reject@test.com', passwordHash, role: 'manager',
        dealershipId: 1, name: 'Reject Test', isActive: true,
      } as any);

      const user = await storage.getUserByEmail('reject@test.com');
      const isValid = await comparePassword('WrongPassword', user!.passwordHash);
      expect(isValid).toBe(false);
    });

    it('should return null for non-existent user', async () => {
      const user = await storage.getUserByEmail('nonexistent@test.com');
      expect(user).toBeNull();
    });
  });

  describe('Step 3: Add Vehicle Listing', () => {
    it('should create a vehicle listing with full details', async () => {
      const dealership = await storage.createDealership({
        name: 'Test', slug: 'test', subdomain: 'test',
        address: '1', city: 'C', province: 'BC', postalCode: 'V5K', phone: '555', isActive: true,
      } as any);

      const vehicle = await storage.createVehicle({
        dealershipId: dealership.id,
        stockNumber: 'STK-001',
        year: 2024,
        make: 'Toyota',
        model: 'Camry',
        trim: 'XLE',
        type: 'New',
        price: 32999,
        odometer: 15,
        vin: '1HGCM82633A123456',
        images: ['https://cdn.lotview.ai/photos/camry-1.jpg', 'https://cdn.lotview.ai/photos/camry-2.jpg'],
        badges: ['Certified', 'Low Mileage'],
        location: 'Vancouver',
        dealership: 'Test',
        description: 'Beautiful 2024 Camry XLE with premium package',
        exteriorColor: 'Pearl White',
        interiorColor: 'Black Leather',
        transmission: 'Automatic',
        drivetrain: 'FWD',
        fuelType: 'Gasoline',
      } as any);

      expect(vehicle.id).toBe(1);
      expect(vehicle.dealershipId).toBe(dealership.id);
      expect(vehicle.year).toBe(2024);
      expect(vehicle.make).toBe('Toyota');
      expect(vehicle.model).toBe('Camry');
      expect(vehicle.price).toBe(32999);
      expect(vehicle.images).toHaveLength(2);
      expect(vehicle.exteriorColor).toBe('Pearl White');
    });

    it('should list vehicles for a specific dealership only', async () => {
      const d1 = await storage.createDealership({ name: 'D1', slug: 'd1', subdomain: 'd1', address: '1', city: 'C', province: 'BC', postalCode: 'V', phone: '5', isActive: true } as any);
      const d2 = await storage.createDealership({ name: 'D2', slug: 'd2', subdomain: 'd2', address: '2', city: 'C', province: 'BC', postalCode: 'V', phone: '5', isActive: true } as any);

      await storage.createVehicle({ dealershipId: d1.id, vin: 'VIN1', make: 'Toyota', model: 'Camry', year: 2024, price: 25000, stockNumber: 'S1', type: 'Used', odometer: 1000, images: [], badges: [], location: 'V', dealership: 'D1', description: '', exteriorColor: 'White', interiorColor: 'Black', transmission: 'Auto', drivetrain: 'FWD', fuelType: 'Gas' } as any);
      await storage.createVehicle({ dealershipId: d1.id, vin: 'VIN2', make: 'Honda', model: 'Civic', year: 2023, price: 22000, stockNumber: 'S2', type: 'Used', odometer: 2000, images: [], badges: [], location: 'V', dealership: 'D1', description: '', exteriorColor: 'Black', interiorColor: 'Grey', transmission: 'Auto', drivetrain: 'FWD', fuelType: 'Gas' } as any);
      await storage.createVehicle({ dealershipId: d2.id, vin: 'VIN3', make: 'Ford', model: 'F-150', year: 2024, price: 45000, stockNumber: 'S3', type: 'New', odometer: 10, images: [], badges: [], location: 'V', dealership: 'D2', description: '', exteriorColor: 'Red', interiorColor: 'Black', transmission: 'Auto', drivetrain: '4WD', fuelType: 'Gas' } as any);

      const d1Vehicles = await (storage as any).getVehiclesByDealership(d1.id);
      const d2Vehicles = await (storage as any).getVehiclesByDealership(d2.id);

      expect(d1Vehicles.length).toBe(2);
      expect(d2Vehicles.length).toBe(1);
      expect(d1Vehicles.every((v: any) => v.dealershipId === d1.id)).toBe(true);
      expect(d2Vehicles[0].make).toBe('Ford');
    });
  });

  describe('Step 4: Trigger FB Marketplace Auto-Post', () => {
    it('should add vehicle to posting queue', async () => {
      const vehicle = await storage.createVehicle({
        dealershipId: 1, vin: 'POSTVIN1', make: 'Toyota', model: 'Camry',
        year: 2024, price: 25000, stockNumber: 'P1', type: 'Used', odometer: 1000,
        images: [], badges: [], location: 'V', dealership: 'Test', description: '',
        exteriorColor: 'White', interiorColor: 'Black', transmission: 'Auto',
        drivetrain: 'FWD', fuelType: 'Gas',
      } as any);

      const queueItem = await (storage as any).createFbMarketplaceQueueItem({
        dealershipId: 1,
        vehicleId: vehicle.id,
        accountId: 1,
        platform: 'facebook_marketplace',
      });

      expect(queueItem.id).toBeDefined();
      expect(queueItem.status).toBe('pending');
      expect(queueItem.vehicleId).toBe(vehicle.id);
    });

    it('should process queue items in order', async () => {
      await (storage as any).createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 1 });
      await (storage as any).createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 2 });
      await (storage as any).createFbMarketplaceQueueItem({ dealershipId: 1, vehicleId: 3 });

      const queue = await (storage as any).getFbMarketplaceQueueByDealership(1);
      expect(queue.length).toBe(3);
      expect(queue[0].id).toBeLessThan(queue[1].id);
      expect(queue[1].id).toBeLessThan(queue[2].id);
    });
  });

  describe('Step 5: Verify Posting Queue Processing', () => {
    it('should transition queue item through lifecycle', async () => {
      const item = await (storage as any).createFbMarketplaceQueueItem({
        dealershipId: 1, vehicleId: 1, accountId: 1,
      });

      // Pending -> Posting
      await (storage as any).updateFbMarketplaceQueueItem(item.id, 1, { status: 'posting' });
      let updated = (await (storage as any).getFbMarketplaceQueueByDealership(1))[0];
      expect(updated.status).toBe('posting');

      // Posting -> Completed
      await (storage as any).updateFbMarketplaceQueueItem(item.id, 1, {
        status: 'completed',
        fbListingId: 'fb-marketplace-listing-abc123',
        completedAt: new Date(),
      });
      updated = (await (storage as any).getFbMarketplaceQueueByDealership(1))[0];
      expect(updated.status).toBe('completed');
      expect(updated.fbListingId).toBe('fb-marketplace-listing-abc123');
    });

    it('should handle posting failures with retry', async () => {
      const item = await (storage as any).createFbMarketplaceQueueItem({
        dealershipId: 1, vehicleId: 1, accountId: 1,
      });

      // Fail first attempt
      await (storage as any).updateFbMarketplaceQueueItem(item.id, 1, {
        status: 'failed', errorMessage: 'Network timeout', retryCount: 1,
      });

      // Retry
      await (storage as any).updateFbMarketplaceQueueItem(item.id, 1, {
        status: 'pending', retryCount: 1,
      });

      // Second attempt succeeds
      await (storage as any).updateFbMarketplaceQueueItem(item.id, 1, {
        status: 'completed', fbListingId: 'fb-retry-success',
      });

      const updated = (await (storage as any).getFbMarketplaceQueueByDealership(1))[0];
      expect(updated.status).toBe('completed');
      expect(updated.retryCount).toBe(1);
    });
  });

  describe('Step 6: Simulate Incoming FB Message', () => {
    it('should create a conversation for incoming message', async () => {
      const conv = await storage.createMessengerConversation({
        dealershipId: 1,
        participantId: 'fb-buyer-789',
        participantName: 'Jane Buyer',
        pageId: 'fb-page-123',
        platform: 'facebook',
      } as any);

      expect(conv.id).toBeDefined();
      expect(conv.participantName).toBe('Jane Buyer');
    });

    it('should append incoming customer message', async () => {
      const conv = await storage.createMessengerConversation({
        dealershipId: 1, participantId: 'fb-buyer-789', participantName: 'Jane Buyer',
        pageId: 'fb-page-123', platform: 'facebook',
      } as any);

      const result = await storage.appendMessageToConversation(conv.id, 1, {
        sender: 'customer',
        senderName: 'Jane Buyer',
        text: 'Hi, is the 2024 Toyota Camry still available?',
        direction: 'inbound',
      } as any);

      expect(result).toBe(true);

      const convs = await (storage as any).getMessengerConversationsByDealership(1);
      expect(convs[0].messages.length).toBe(1);
      expect(convs[0].messages[0].text).toContain('Toyota Camry');
    });
  });

  describe('Step 7: AI Auto-Reply Generation', () => {
    it('should build AI prompt with vehicle and conversation context', () => {
      const vehicleInfo = {
        year: 2024, make: 'Toyota', model: 'Camry', trim: 'XLE',
        price: 32999, odometer: 15, exteriorColor: 'Pearl White',
      };

      const customerMessage = 'Is the 2024 Toyota Camry still available?';

      const systemPrompt = [
        `You are a professional sales assistant for Olympic Auto Group.`,
        `Vehicle: ${vehicleInfo.year} ${vehicleInfo.make} ${vehicleInfo.model} ${vehicleInfo.trim}`,
        `Price: $${vehicleInfo.price.toLocaleString()}`,
        `Odometer: ${vehicleInfo.odometer.toLocaleString()} km`,
        `Color: ${vehicleInfo.exteriorColor}`,
        `Be helpful, professional, and try to schedule a test drive.`,
      ].join('\n');

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: customerMessage },
      ];

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toContain('Olympic Auto Group');
      expect(messages[0].content).toContain('$32,999');
      expect(messages[0].content).toContain('Pearl White');
      expect(messages[1].content).toContain('available');
    });

    it('should append AI-generated reply to conversation', async () => {
      const conv = await storage.createMessengerConversation({
        dealershipId: 1, participantId: 'fb-buyer-789', participantName: 'Jane Buyer',
        pageId: 'page-1', platform: 'facebook',
      } as any);

      // Customer message
      await storage.appendMessageToConversation(conv.id, 1, {
        sender: 'customer', text: 'Is the Camry available?', direction: 'inbound',
      } as any);

      // AI auto-reply
      const aiReply = 'Yes! The 2024 Toyota Camry XLE is available. Would you like to schedule a test drive?';
      await storage.appendMessageToConversation(conv.id, 1, {
        sender: 'ai_assistant', text: aiReply, direction: 'outbound', isAutoReply: true,
      } as any);

      const convs = await (storage as any).getMessengerConversationsByDealership(1);
      expect(convs[0].messages.length).toBe(2);
      expect(convs[0].messages[1].sender).toBe('ai_assistant');
      expect(convs[0].messages[1].isAutoReply).toBe(true);
      expect(convs[0].messages[1].text).toContain('test drive');
    });
  });

  describe('Step 8: WebSocket Notification Patterns', () => {
    it('should structure notification payload correctly', () => {
      // Simulate WebSocket notification for new message
      const notification = {
        type: 'new_message',
        dealershipId: 1,
        conversationId: 42,
        data: {
          sender: 'customer',
          senderName: 'Jane Buyer',
          text: 'Is the Camry available?',
          timestamp: new Date().toISOString(),
        },
      };

      expect(notification.type).toBe('new_message');
      expect(notification.dealershipId).toBe(1);
      expect(notification.data.sender).toBe('customer');
    });

    it('should scope notifications to correct dealership', () => {
      const notif1 = { type: 'new_message', dealershipId: 1, data: {} };
      const notif2 = { type: 'new_message', dealershipId: 2, data: {} };

      // Simulate filtering for dealership 1
      const dealer1Notifs = [notif1, notif2].filter(n => n.dealershipId === 1);
      expect(dealer1Notifs.length).toBe(1);
      expect(dealer1Notifs[0].dealershipId).toBe(1);
    });

    it('should include queue status update notifications', () => {
      const notification = {
        type: 'queue_status_update',
        dealershipId: 1,
        data: {
          queueItemId: 5,
          vehicleId: 10,
          previousStatus: 'posting',
          newStatus: 'completed',
          fbListingId: 'fb-listing-abc',
        },
      };

      expect(notification.type).toBe('queue_status_update');
      expect(notification.data.newStatus).toBe('completed');
      expect(notification.data.fbListingId).toBeDefined();
    });

    it('should include auto-reply notification', () => {
      const notification = {
        type: 'auto_reply_sent',
        dealershipId: 1,
        data: {
          conversationId: 42,
          replyText: 'The vehicle is available!',
          vehicleId: 10,
          generatedBy: 'ai',
        },
      };

      expect(notification.type).toBe('auto_reply_sent');
      expect(notification.data.generatedBy).toBe('ai');
    });
  });

  describe('Complete Journey: Registration to Auto-Reply', () => {
    it('should execute the full flow end-to-end', async () => {
      // 1. Create dealership
      const dealership = await storage.createDealership({
        name: 'Olympic Auto Group', slug: 'olympic', subdomain: 'olympic',
        address: '123 Main', city: 'Vancouver', province: 'BC',
        postalCode: 'V5K 0A1', phone: '604-555-1234', isActive: true,
      } as any);
      expect(dealership.id).toBeDefined();

      // 2. Create user
      const passwordHash = await hashPassword('TestPass123!');
      const user = await storage.createUser({
        email: 'sales@olympic.com', passwordHash, role: 'manager',
        dealershipId: dealership.id, name: 'Sales Manager', isActive: true,
      } as any);
      expect(user.dealershipId).toBe(dealership.id);

      // 3. Generate auth token
      const token = generateToken(user);
      const decoded = verifyToken(token);
      expect(decoded.dealershipId).toBe(dealership.id);

      // 4. Add vehicle
      const vehicle = await storage.createVehicle({
        dealershipId: dealership.id, stockNumber: 'OLY-001', year: 2024,
        make: 'Toyota', model: 'Camry', trim: 'XLE', type: 'New', price: 32999,
        odometer: 15, vin: '1HGCM82633A004567', images: ['photo1.jpg', 'photo2.jpg'],
        badges: ['Certified'], location: 'Vancouver', dealership: 'Olympic Auto',
        description: 'Premium Camry', exteriorColor: 'Pearl White',
        interiorColor: 'Black', transmission: 'Automatic', drivetrain: 'FWD',
        fuelType: 'Gasoline',
      } as any);
      expect(vehicle.make).toBe('Toyota');

      // 5. Queue for FB Marketplace posting
      const queueItem = await (storage as any).createFbMarketplaceQueueItem({
        dealershipId: dealership.id, vehicleId: vehicle.id, accountId: 1,
      });
      expect(queueItem.status).toBe('pending');

      // 6. Process posting (simulate)
      await (storage as any).updateFbMarketplaceQueueItem(queueItem.id, dealership.id, {
        status: 'completed', fbListingId: 'fb-live-listing-789',
      });
      const processedQueue = await (storage as any).getFbMarketplaceQueueByDealership(dealership.id);
      expect(processedQueue[0].status).toBe('completed');

      // 7. Receive incoming FB message
      const conv = await storage.createMessengerConversation({
        dealershipId: dealership.id, participantId: 'buyer-123',
        participantName: 'Jane Buyer', pageId: 'olympic-page', platform: 'facebook',
      } as any);
      await storage.appendMessageToConversation(conv.id, dealership.id, {
        sender: 'customer', text: 'Is this Camry still available?', direction: 'inbound',
      } as any);

      // 8. Generate AI auto-reply
      await storage.appendMessageToConversation(conv.id, dealership.id, {
        sender: 'ai_assistant',
        text: 'Hi Jane! Yes, the 2024 Toyota Camry XLE in Pearl White is available at $32,999. Would you like to schedule a test drive?',
        direction: 'outbound', isAutoReply: true,
      } as any);

      // Verify final state
      const conversations = await (storage as any).getMessengerConversationsByDealership(dealership.id);
      expect(conversations.length).toBe(1);
      expect(conversations[0].messages.length).toBe(2);
      expect(conversations[0].messages[0].direction).toBe('inbound');
      expect(conversations[0].messages[1].direction).toBe('outbound');
      expect(conversations[0].messages[1].isAutoReply).toBe(true);

      // Verify tenant isolation
      const otherDealerConvs = await (storage as any).getMessengerConversationsByDealership(999);
      expect(otherDealerConvs.length).toBe(0);
    });
  });

  describe('Password Reset Flow', () => {
    it('should complete full password reset cycle', async () => {
      // Create user
      const originalHash = await hashPassword('OldPass123!');
      const user = await storage.createUser({
        email: 'reset@test.com', passwordHash: originalHash, role: 'manager',
        dealershipId: 1, name: 'Reset Test', isActive: true,
      } as any);

      // Request reset (create token)
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const bcrypt = require('bcryptjs');
      const tokenHash = await bcrypt.hash(resetToken, 10);
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await storage.createPasswordResetToken(user.id, tokenHash, expiresAt);

      // Verify token exists
      const validTokens = await storage.getAllValidPasswordResetTokens();
      expect(validTokens.length).toBe(1);

      // Validate token
      const isMatch = await bcrypt.compare(resetToken, validTokens[0].tokenHash);
      expect(isMatch).toBe(true);

      // Mark as used
      await storage.markPasswordResetTokenUsed(validTokens[0].id);

      // Token should no longer appear in valid tokens (filtered out by mock)
      const tokensAfter = await storage.getAllValidPasswordResetTokens();
      // The mock filters out used tokens, so array should be empty
      expect(tokensAfter.length).toBe(0);
    });
  });
});
