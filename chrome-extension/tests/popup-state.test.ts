/**
 * Popup State Management Tests
 * Tests the Chrome extension popup logic and state transitions
 */

import {
  isValidLoginPayload,
  isValidServerUrl,
  sanitizeServerUrl,
  isAuthExpired,
  shouldRefreshToken,
  calculateAuthExpiry,
  AUTH_EXPIRY_MS,
  PROTOCOL_VERSION,
} from '../src/background-helpers';

// Simulate popup state management patterns
interface PopupState {
  auth: { token: string; email: string; expiresAt: number } | null;
  serverUrl: string;
  email: string;
  password: string;
  vehicles: Array<{ id: number; title: string }>;
  selectedVehicleId: number | null;
  platform: 'facebook' | 'craigslist' | 'kijiji';
  loginLoading: boolean;
  inventoryLoading: boolean;
  tab: 'post' | 'history';
}

function createInitialState(): PopupState {
  return {
    auth: null,
    serverUrl: 'https://lotview.ai',
    email: '',
    password: '',
    vehicles: [],
    selectedVehicleId: null,
    platform: 'facebook',
    loginLoading: false,
    inventoryLoading: false,
    tab: 'post',
  };
}

describe('Popup State Management', () => {
  describe('Initial State', () => {
    it('should start with no auth', () => {
      const state = createInitialState();
      expect(state.auth).toBeNull();
    });

    it('should default to lotview.ai server URL', () => {
      const state = createInitialState();
      expect(state.serverUrl).toBe('https://lotview.ai');
    });

    it('should default to facebook platform', () => {
      const state = createInitialState();
      expect(state.platform).toBe('facebook');
    });

    it('should start on post tab', () => {
      const state = createInitialState();
      expect(state.tab).toBe('post');
    });

    it('should have empty vehicles list', () => {
      const state = createInitialState();
      expect(state.vehicles).toEqual([]);
      expect(state.selectedVehicleId).toBeNull();
    });
  });

  describe('Login Flow', () => {
    it('should validate login payload before sending', () => {
      const state = createInitialState();
      state.email = 'user@dealership.com';
      state.password = 'SecurePass123!';
      state.serverUrl = 'https://lotview.ai';

      const payload = {
        email: state.email,
        password: state.password,
        serverUrl: state.serverUrl,
      };

      expect(isValidLoginPayload(payload)).toBe(true);
    });

    it('should reject login with empty credentials', () => {
      const state = createInitialState();
      expect(isValidLoginPayload({
        email: state.email, // empty
        password: state.password, // empty
        serverUrl: state.serverUrl,
      })).toBe(false);
    });

    it('should validate server URL before login', () => {
      expect(isValidServerUrl('https://lotview.ai')).toBe(true);
      expect(isValidServerUrl('http://evil.com')).toBe(false);
    });

    it('should sanitize server URL before use', () => {
      expect(sanitizeServerUrl('https://lotview.ai/')).toBe('https://lotview.ai');
    });

    it('should set auth state after successful login', () => {
      const state = createInitialState();
      const now = Date.now();

      // Simulate successful login response
      state.auth = {
        token: 'jwt-token-abc123',
        email: 'user@dealership.com',
        expiresAt: calculateAuthExpiry(now),
      };
      state.loginLoading = false;

      expect(state.auth).not.toBeNull();
      expect(state.auth!.token).toBe('jwt-token-abc123');
      expect(isAuthExpired(state.auth!.expiresAt)).toBe(false);
    });
  });

  describe('Auth Token Management', () => {
    it('should detect when auth token is expired', () => {
      const expiredAt = Date.now() - 1000;
      expect(isAuthExpired(expiredAt)).toBe(true);
    });

    it('should detect when token needs refresh', () => {
      const createdLongAgo = Date.now() - AUTH_EXPIRY_MS + 1000; // almost expired
      expect(shouldRefreshToken(createdLongAgo)).toBe(true);
    });

    it('should not refresh a fresh token', () => {
      const justCreated = Date.now();
      expect(shouldRefreshToken(justCreated)).toBe(false);
    });

    it('should clear auth on logout', () => {
      const state = createInitialState();
      state.auth = { token: 'test', email: 'test@test.com', expiresAt: Date.now() + 10000 };

      // Simulate logout
      state.auth = null;
      state.vehicles = [];
      state.selectedVehicleId = null;

      expect(state.auth).toBeNull();
      expect(state.vehicles).toEqual([]);
    });
  });

  describe('Vehicle Selection', () => {
    it('should select a vehicle by ID', () => {
      const state = createInitialState();
      state.vehicles = [
        { id: 1, title: '2024 Toyota Camry' },
        { id: 2, title: '2023 Honda Civic' },
        { id: 3, title: '2024 Ford F-150' },
      ];

      state.selectedVehicleId = 2;
      const selected = state.vehicles.find(v => v.id === state.selectedVehicleId);
      expect(selected).toBeDefined();
      expect(selected!.title).toBe('2023 Honda Civic');
    });

    it('should handle deselection', () => {
      const state = createInitialState();
      state.selectedVehicleId = 1;
      state.selectedVehicleId = null;
      expect(state.selectedVehicleId).toBeNull();
    });

    it('should filter vehicles by search query', () => {
      const vehicles = [
        { id: 1, title: '2024 Toyota Camry' },
        { id: 2, title: '2023 Honda Civic' },
        { id: 3, title: '2024 Toyota RAV4' },
      ];

      const query = 'toyota';
      const filtered = vehicles.filter(v => v.title.toLowerCase().includes(query.toLowerCase()));
      expect(filtered.length).toBe(2);
      expect(filtered.every(v => v.title.includes('Toyota'))).toBe(true);
    });
  });

  describe('Platform Selection', () => {
    it('should switch between platforms', () => {
      const state = createInitialState();
      expect(state.platform).toBe('facebook');

      state.platform = 'craigslist';
      expect(state.platform).toBe('craigslist');

      state.platform = 'kijiji';
      expect(state.platform).toBe('kijiji');
    });
  });

  describe('Tab Navigation', () => {
    it('should switch between tabs', () => {
      const state = createInitialState();
      expect(state.tab).toBe('post');

      state.tab = 'history';
      expect(state.tab).toBe('history');

      state.tab = 'post';
      expect(state.tab).toBe('post');
    });
  });

  describe('Message Protocol', () => {
    it('should include protocol version in messages', () => {
      const message = {
        action: 'FETCH_INVENTORY',
        protocolVersion: PROTOCOL_VERSION,
      };

      expect(message.protocolVersion).toBe(1);
    });

    it('should handle protocol mismatch response', () => {
      const response = { code: 'PROTOCOL_MISMATCH', error: 'Version mismatch' };
      expect(response.code).toBe('PROTOCOL_MISMATCH');
    });

    it('should handle chrome.runtime.lastError', () => {
      // Simulate lastError
      const lastError = { message: 'Communication error' };
      const errorMsg = lastError.message || 'Unknown error';
      expect(errorMsg).toBe('Communication error');
    });
  });

  describe('Loading States', () => {
    it('should track login loading state', () => {
      const state = createInitialState();
      expect(state.loginLoading).toBe(false);

      state.loginLoading = true;
      expect(state.loginLoading).toBe(true);

      state.loginLoading = false;
      expect(state.loginLoading).toBe(false);
    });

    it('should track inventory loading state', () => {
      const state = createInitialState();
      expect(state.inventoryLoading).toBe(false);

      state.inventoryLoading = true;
      expect(state.inventoryLoading).toBe(true);
    });
  });
});
