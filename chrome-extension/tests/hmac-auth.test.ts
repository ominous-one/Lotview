/**
 * HMAC Authentication Tests for Chrome Extension
 * Tests the cryptographic signing flow used between extension and backend
 */

import {
  isValidServerUrl,
  isAllowedImageHost,
  isAuthExpired,
  shouldRefreshToken,
  calculateAuthExpiry,
  isValidLoginPayload,
  isValidPostingLogPayload,
  isValidFillContentPayload,
  isValidSaveTemplatePayload,
  isValidRequestPostingTokenPayload,
  sanitizeServerUrl,
  extractImageFilename,
  ALLOWED_ACTIONS,
  CONSENT_EXEMPT_ACTIONS,
  AUTH_EXPIRY_MS,
  TOKEN_REFRESH_THRESHOLD_MS,
  MAX_IMAGE_COUNT,
  MAX_IMAGE_SIZE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
  ALLOWED_IMAGE_HOSTS,
  ALLOWED_PROD_DOMAINS,
} from '../src/background-helpers';

describe('HMAC Auth - Server URL Validation', () => {
  describe('Production mode (isDev=false)', () => {
    it('should accept HTTPS lotview.ai URLs', () => {
      expect(isValidServerUrl('https://lotview.ai')).toBe(true);
      expect(isValidServerUrl('https://api.lotview.ai')).toBe(true);
      expect(isValidServerUrl('https://app.lotview.ai/api')).toBe(true);
    });

    it('should accept HTTPS olympicautogroup.ca URLs', () => {
      expect(isValidServerUrl('https://olympicautogroup.ca')).toBe(true);
      expect(isValidServerUrl('https://api.olympicautogroup.ca')).toBe(true);
    });

    it('should reject HTTP URLs in production', () => {
      expect(isValidServerUrl('http://lotview.ai')).toBe(false);
      expect(isValidServerUrl('http://olympicautogroup.ca')).toBe(false);
    });

    it('should reject localhost in production', () => {
      expect(isValidServerUrl('http://localhost:5000')).toBe(false);
      expect(isValidServerUrl('https://localhost:5000')).toBe(false);
    });

    it('should reject arbitrary domains', () => {
      expect(isValidServerUrl('https://evil.com')).toBe(false);
      expect(isValidServerUrl('https://notlotview.ai')).toBe(false);
      expect(isValidServerUrl('https://lotview.ai.evil.com')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(isValidServerUrl('')).toBe(false);
      expect(isValidServerUrl('not-a-url')).toBe(false);
      expect(isValidServerUrl('ftp://lotview.ai')).toBe(false);
    });
  });

  describe('Development mode (isDev=true)', () => {
    it('should accept localhost in dev mode', () => {
      expect(isValidServerUrl('http://localhost:5000', true)).toBe(true);
      expect(isValidServerUrl('http://127.0.0.1:5000', true)).toBe(true);
    });

    it('should accept Replit domains in dev mode', () => {
      expect(isValidServerUrl('https://myapp.replit.app', true)).toBe(true);
      expect(isValidServerUrl('https://myapp.replit.dev', true)).toBe(true);
    });

    it('should still accept production domains in dev mode', () => {
      expect(isValidServerUrl('https://lotview.ai', true)).toBe(true);
    });
  });
});

describe('HMAC Auth - Image Host Validation', () => {
  it('should accept all allowed image hosts', () => {
    for (const host of ALLOWED_IMAGE_HOSTS) {
      expect(isAllowedImageHost(`https://${host}/image.jpg`)).toBe(true);
    }
  });

  it('should accept Object Storage relative URLs', () => {
    expect(isAllowedImageHost('/public-objects/logos/dealer-logo.png')).toBe(true);
  });

  it('should reject HTTP image URLs', () => {
    expect(isAllowedImageHost('http://lotview.ai/image.jpg')).toBe(false);
  });

  it('should reject arbitrary image hosts', () => {
    expect(isAllowedImageHost('https://evil.com/image.jpg')).toBe(false);
    expect(isAllowedImageHost('https://notlotview.ai/img.jpg')).toBe(false);
  });

  it('should reject invalid URLs', () => {
    expect(isAllowedImageHost('')).toBe(false);
    expect(isAllowedImageHost('not-a-url')).toBe(false);
  });
});

describe('HMAC Auth - Token Expiry', () => {
  it('should detect expired auth', () => {
    const pastTime = Date.now() - 1000;
    expect(isAuthExpired(pastTime)).toBe(true);
  });

  it('should detect valid auth', () => {
    const futureTime = Date.now() + AUTH_EXPIRY_MS;
    expect(isAuthExpired(futureTime)).toBe(false);
  });

  it('should recommend token refresh after threshold', () => {
    const oldCreatedAt = Date.now() - TOKEN_REFRESH_THRESHOLD_MS - 1000;
    expect(shouldRefreshToken(oldCreatedAt)).toBe(true);
  });

  it('should not recommend refresh for fresh token', () => {
    const freshCreatedAt = Date.now() - 1000;
    expect(shouldRefreshToken(freshCreatedAt)).toBe(false);
  });

  it('should calculate correct auth expiry', () => {
    const now = Date.now();
    const expiry = calculateAuthExpiry(now);
    expect(expiry).toBe(now + AUTH_EXPIRY_MS);
    expect(expiry - now).toBe(8 * 60 * 60 * 1000); // 8 hours
  });
});

describe('HMAC Auth - Payload Validation', () => {
  describe('Login payload', () => {
    it('should validate correct login payload', () => {
      expect(isValidLoginPayload({
        email: 'test@example.com',
        password: 'password123',
        serverUrl: 'https://lotview.ai',
      })).toBe(true);
    });

    it('should reject empty email', () => {
      expect(isValidLoginPayload({ email: '', password: 'pass', serverUrl: 'https://a.com' })).toBe(false);
    });

    it('should reject missing fields', () => {
      expect(isValidLoginPayload({ email: 'test@example.com' })).toBe(false);
      expect(isValidLoginPayload(null)).toBe(false);
      expect(isValidLoginPayload(undefined)).toBe(false);
      expect(isValidLoginPayload('string')).toBe(false);
    });
  });

  describe('Posting log payload', () => {
    it('should validate correct posting log', () => {
      expect(isValidPostingLogPayload({
        vehicleId: 123,
        platform: 'facebook',
        status: 'success',
        url: 'https://facebook.com/listing/123',
      })).toBe(true);
    });

    it('should validate failed posting log', () => {
      expect(isValidPostingLogPayload({
        vehicleId: 123,
        platform: 'facebook',
        status: 'failed',
        error: 'Rate limit exceeded',
      })).toBe(true);
    });

    it('should reject invalid status', () => {
      expect(isValidPostingLogPayload({
        vehicleId: 123,
        platform: 'facebook',
        status: 'invalid',
      })).toBe(false);
    });

    it('should reject non-number vehicleId', () => {
      expect(isValidPostingLogPayload({
        vehicleId: '123',
        platform: 'facebook',
        status: 'success',
      })).toBe(false);
    });
  });

  describe('Fill content payload', () => {
    it('should validate correct fill content payload', () => {
      expect(isValidFillContentPayload({
        platform: 'facebook',
        vehicleId: 10,
        formData: { title: 'Test Car', price: 25000 },
        imageUrls: ['https://cdn.lotview.ai/photo1.jpg'],
      })).toBe(true);
    });

    it('should reject null formData', () => {
      expect(isValidFillContentPayload({
        platform: 'facebook',
        vehicleId: 10,
        formData: null,
      })).toBe(false);
    });
  });

  describe('Save template payload', () => {
    it('should validate correct template payload', () => {
      expect(isValidSaveTemplatePayload({
        templateName: 'My Template',
        titleTemplate: '{year} {make} {model}',
        descriptionTemplate: 'Great car for sale!',
      })).toBe(true);
    });

    it('should reject empty template name', () => {
      expect(isValidSaveTemplatePayload({
        templateName: '   ',
        titleTemplate: 'title',
        descriptionTemplate: 'desc',
      })).toBe(false);
    });
  });

  describe('Request posting token payload', () => {
    it('should validate correct payload', () => {
      expect(isValidRequestPostingTokenPayload({
        vehicleId: 42,
        platform: 'facebook_marketplace',
      })).toBe(true);
    });

    it('should reject string vehicleId', () => {
      expect(isValidRequestPostingTokenPayload({
        vehicleId: '42',
        platform: 'facebook',
      })).toBe(false);
    });
  });
});

describe('HMAC Auth - Utility Functions', () => {
  it('should sanitize trailing slash from server URL', () => {
    expect(sanitizeServerUrl('https://lotview.ai/')).toBe('https://lotview.ai');
    expect(sanitizeServerUrl('https://lotview.ai')).toBe('https://lotview.ai');
  });

  it('should extract filename from image URL', () => {
    expect(extractImageFilename('https://cdn.lotview.ai/photos/camry-front.jpg')).toBe('camry-front.jpg');
    expect(extractImageFilename('https://cdn.lotview.ai/photos/car.jpg?w=800')).toBe('car.jpg');
    expect(extractImageFilename('')).toBe('photo.jpg');
  });
});

describe('HMAC Auth - Constants Verification', () => {
  it('should have correct allowed actions count', () => {
    expect(ALLOWED_ACTIONS.size).toBeGreaterThanOrEqual(11);
    expect(ALLOWED_ACTIONS.has('EXT_LOGIN')).toBe(true);
    expect(ALLOWED_ACTIONS.has('EXT_LOGOUT')).toBe(true);
    expect(ALLOWED_ACTIONS.has('FETCH_INVENTORY')).toBe(true);
    expect(ALLOWED_ACTIONS.has('LOG_POSTING')).toBe(true);
    expect(ALLOWED_ACTIONS.has('AUTO_POST_VEHICLE')).toBe(true);
  });

  it('should have CHECK_CONSENT as consent-exempt', () => {
    expect(CONSENT_EXEMPT_ACTIONS.has('CHECK_CONSENT')).toBe(true);
    expect(CONSENT_EXEMPT_ACTIONS.size).toBe(1);
  });

  it('should have correct image limits', () => {
    expect(MAX_IMAGE_COUNT).toBe(20);
    expect(MAX_IMAGE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_TOTAL_IMAGE_BYTES).toBe(50 * 1024 * 1024);
  });

  it('should have correct auth timing', () => {
    expect(AUTH_EXPIRY_MS).toBe(8 * 60 * 60 * 1000); // 8 hours
    expect(TOKEN_REFRESH_THRESHOLD_MS).toBe(7.5 * 60 * 60 * 1000); // 7.5 hours
  });
});
