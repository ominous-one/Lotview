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
  ALLOWED_IMAGE_HOSTS,
  ALLOWED_PROD_DOMAINS,
  AUTH_EXPIRY_MS,
  TOKEN_REFRESH_THRESHOLD_MS,
  MAX_IMAGE_COUNT,
  MAX_IMAGE_SIZE_BYTES,
  MAX_TOTAL_IMAGE_BYTES,
} from '../src/background-helpers';

describe('background-helpers', () => {
  describe('constants', () => {
    it('should define allowed actions', () => {
      expect(ALLOWED_ACTIONS.has('EXT_LOGIN')).toBe(true);
      expect(ALLOWED_ACTIONS.has('EXT_LOGOUT')).toBe(true);
      expect(ALLOWED_ACTIONS.has('GET_AUTH')).toBe(true);
      expect(ALLOWED_ACTIONS.has('FETCH_INVENTORY')).toBe(true);
      expect(ALLOWED_ACTIONS.has('FETCH_TEMPLATES')).toBe(true);
      expect(ALLOWED_ACTIONS.has('SAVE_TEMPLATE')).toBe(true);
      expect(ALLOWED_ACTIONS.has('LOG_POSTING')).toBe(true);
      expect(ALLOWED_ACTIONS.has('FETCH_LIMITS')).toBe(true);
      expect(ALLOWED_ACTIONS.has('FILL_CONTENT')).toBe(true);
      expect(ALLOWED_ACTIONS.has('REQUEST_POSTING_TOKEN')).toBe(true);
      expect(ALLOWED_ACTIONS.has('CHECK_CONSENT')).toBe(true);
      expect(ALLOWED_ACTIONS.has('INVALID_ACTION')).toBe(false);
    });

    it('should define consent exempt actions', () => {
      expect(CONSENT_EXEMPT_ACTIONS.has('CHECK_CONSENT')).toBe(true);
      expect(CONSENT_EXEMPT_ACTIONS.has('EXT_LOGIN')).toBe(false);
    });

    it('should define allowed image hosts', () => {
      expect(ALLOWED_IMAGE_HOSTS).toContain('lotview.ai');
      expect(ALLOWED_IMAGE_HOSTS).toContain('cdn.lotview.ai');
      expect(ALLOWED_IMAGE_HOSTS).toContain('res.cloudinary.com');
    });

    it('should define allowed prod domains', () => {
      expect(ALLOWED_PROD_DOMAINS).toContain('lotview.ai');
      expect(ALLOWED_PROD_DOMAINS).toContain('olympicautogroup.ca');
    });

    it('should define auth expiry as 8 hours', () => {
      expect(AUTH_EXPIRY_MS).toBe(8 * 60 * 60 * 1000);
    });

    it('should define refresh threshold as 7.5 hours', () => {
      expect(TOKEN_REFRESH_THRESHOLD_MS).toBe(7.5 * 60 * 60 * 1000);
    });

    it('should define image limits', () => {
      expect(MAX_IMAGE_COUNT).toBe(20);
      expect(MAX_IMAGE_SIZE_BYTES).toBe(10 * 1024 * 1024);
      expect(MAX_TOTAL_IMAGE_BYTES).toBe(50 * 1024 * 1024);
    });
  });

  describe('isValidServerUrl', () => {
    describe('production mode', () => {
      it('should accept valid lotview.ai HTTPS URL', () => {
        expect(isValidServerUrl('https://lotview.ai')).toBe(true);
      });

      it('should accept valid subdomain of lotview.ai', () => {
        expect(isValidServerUrl('https://app.lotview.ai')).toBe(true);
        expect(isValidServerUrl('https://api.lotview.ai')).toBe(true);
      });

      it('should accept valid olympicautogroup.ca HTTPS URL', () => {
        expect(isValidServerUrl('https://olympicautogroup.ca')).toBe(true);
      });

      it('should accept valid subdomain of olympicautogroup.ca', () => {
        expect(isValidServerUrl('https://www.olympicautogroup.ca')).toBe(true);
      });

      it('should reject HTTP URLs', () => {
        expect(isValidServerUrl('http://lotview.ai')).toBe(false);
        expect(isValidServerUrl('http://olympicautogroup.ca')).toBe(false);
      });

      it('should reject unauthorized domains', () => {
        expect(isValidServerUrl('https://evil.com')).toBe(false);
        expect(isValidServerUrl('https://lotview.ai.evil.com')).toBe(false);
        expect(isValidServerUrl('https://notlotview.ai')).toBe(false);
      });

      it('should reject invalid URLs', () => {
        expect(isValidServerUrl('not-a-url')).toBe(false);
        expect(isValidServerUrl('')).toBe(false);
        expect(isValidServerUrl('javascript:alert(1)')).toBe(false);
      });

      it('should reject FTP protocol', () => {
        expect(isValidServerUrl('ftp://lotview.ai')).toBe(false);
      });

      it('should reject localhost in prod mode', () => {
        expect(isValidServerUrl('http://localhost:3000')).toBe(false);
        expect(isValidServerUrl('http://127.0.0.1:3000')).toBe(false);
      });

      it('should reject replit URLs in prod mode', () => {
        expect(isValidServerUrl('https://myapp.replit.app')).toBe(false);
      });
    });

    describe('development mode', () => {
      it('should accept localhost in dev mode', () => {
        expect(isValidServerUrl('http://localhost:3000', true)).toBe(true);
        expect(isValidServerUrl('http://localhost', true)).toBe(true);
      });

      it('should accept 127.0.0.1 in dev mode', () => {
        expect(isValidServerUrl('http://127.0.0.1:3000', true)).toBe(true);
        expect(isValidServerUrl('http://127.0.0.1', true)).toBe(true);
      });

      it('should accept HTTPS replit.app in dev mode', () => {
        expect(isValidServerUrl('https://myapp.replit.app', true)).toBe(true);
        expect(isValidServerUrl('https://test-123.replit.app', true)).toBe(true);
      });

      it('should accept HTTPS replit.dev in dev mode', () => {
        expect(isValidServerUrl('https://myapp.replit.dev', true)).toBe(true);
      });

      it('should reject HTTP replit URLs in dev mode', () => {
        expect(isValidServerUrl('http://myapp.replit.app', true)).toBe(false);
      });

      it('should still accept prod domains in dev mode', () => {
        expect(isValidServerUrl('https://lotview.ai', true)).toBe(true);
        expect(isValidServerUrl('https://olympicautogroup.ca', true)).toBe(true);
      });
    });
  });

  describe('isAllowedImageHost', () => {
    it('should accept lotview.ai images', () => {
      expect(isAllowedImageHost('https://lotview.ai/image.jpg')).toBe(true);
    });

    it('should accept cdn.lotview.ai images', () => {
      expect(isAllowedImageHost('https://cdn.lotview.ai/images/car.jpg')).toBe(true);
    });

    it('should accept images.lotview.ai', () => {
      expect(isAllowedImageHost('https://images.lotview.ai/photo.png')).toBe(true);
    });

    it('should accept cloudinary images', () => {
      expect(isAllowedImageHost('https://res.cloudinary.com/demo/image.jpg')).toBe(true);
    });

    it('should accept dealercloud images', () => {
      expect(isAllowedImageHost('https://imageresizer.dealercloud.ca/photo.jpg')).toBe(true);
    });

    it('should accept vauto images', () => {
      expect(isAllowedImageHost('https://vehicle-photos-published.vauto.com/image.jpg')).toBe(true);
    });

    it('should reject HTTP image URLs', () => {
      expect(isAllowedImageHost('http://lotview.ai/image.jpg')).toBe(false);
      expect(isAllowedImageHost('http://cdn.lotview.ai/image.jpg')).toBe(false);
    });

    it('should reject unauthorized hosts', () => {
      expect(isAllowedImageHost('https://evil.com/image.jpg')).toBe(false);
      expect(isAllowedImageHost('https://random-cdn.com/photo.jpg')).toBe(false);
    });

    it('should reject invalid URLs', () => {
      expect(isAllowedImageHost('not-a-url')).toBe(false);
      expect(isAllowedImageHost('')).toBe(false);
    });

    it('should reject data URLs', () => {
      expect(isAllowedImageHost('data:image/png;base64,abc123')).toBe(false);
    });
  });

  describe('isAuthExpired', () => {
    it('should return true for past expiry time', () => {
      const pastExpiry = Date.now() - 1000;
      expect(isAuthExpired(pastExpiry)).toBe(true);
    });

    it('should return false for future expiry time', () => {
      const futureExpiry = Date.now() + 3600000;
      expect(isAuthExpired(futureExpiry)).toBe(false);
    });

    it('should return true for slightly past time', () => {
      const slightlyPast = Date.now() - 1;
      expect(isAuthExpired(slightlyPast)).toBe(true);
    });
  });

  describe('shouldRefreshToken', () => {
    it('should return true when token is older than 7.5 hours', () => {
      const oldCreatedAt = Date.now() - (8 * 60 * 60 * 1000);
      expect(shouldRefreshToken(oldCreatedAt)).toBe(true);
    });

    it('should return false for fresh token', () => {
      const freshCreatedAt = Date.now() - (1 * 60 * 60 * 1000);
      expect(shouldRefreshToken(freshCreatedAt)).toBe(false);
    });

    it('should return true at exactly 7.5 hours', () => {
      const atThreshold = Date.now() - TOKEN_REFRESH_THRESHOLD_MS - 1;
      expect(shouldRefreshToken(atThreshold)).toBe(true);
    });
  });

  describe('calculateAuthExpiry', () => {
    it('should add 8 hours to creation time', () => {
      const createdAt = Date.now();
      const expiry = calculateAuthExpiry(createdAt);
      expect(expiry).toBe(createdAt + AUTH_EXPIRY_MS);
    });
  });

  describe('isValidLoginPayload', () => {
    it('should accept valid login payload', () => {
      const payload = {
        email: 'test@example.com',
        password: 'password123',
        serverUrl: 'https://lotview.ai',
      };
      expect(isValidLoginPayload(payload)).toBe(true);
    });

    it('should reject null', () => {
      expect(isValidLoginPayload(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(isValidLoginPayload(undefined)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(isValidLoginPayload('string')).toBe(false);
      expect(isValidLoginPayload(123)).toBe(false);
    });

    it('should reject missing email', () => {
      expect(isValidLoginPayload({ password: 'pass', serverUrl: 'url' })).toBe(false);
    });

    it('should reject empty email', () => {
      expect(isValidLoginPayload({ email: '', password: 'pass', serverUrl: 'url' })).toBe(false);
    });

    it('should reject missing password', () => {
      expect(isValidLoginPayload({ email: 'test@example.com', serverUrl: 'url' })).toBe(false);
    });

    it('should reject empty password', () => {
      expect(isValidLoginPayload({ email: 'test@example.com', password: '', serverUrl: 'url' })).toBe(false);
    });

    it('should reject missing serverUrl', () => {
      expect(isValidLoginPayload({ email: 'test@example.com', password: 'pass' })).toBe(false);
    });

    it('should reject empty serverUrl', () => {
      expect(isValidLoginPayload({ email: 'test@example.com', password: 'pass', serverUrl: '' })).toBe(false);
    });

    it('should reject non-string email', () => {
      expect(isValidLoginPayload({ email: 123, password: 'pass', serverUrl: 'url' })).toBe(false);
    });
  });

  describe('isValidPostingLogPayload', () => {
    it('should accept valid success payload', () => {
      const payload = {
        vehicleId: 1,
        platform: 'facebook',
        status: 'success' as const,
        postingToken: 'token123',
      };
      expect(isValidPostingLogPayload(payload)).toBe(true);
    });

    it('should accept valid failed payload', () => {
      const payload = {
        vehicleId: 1,
        platform: 'facebook',
        status: 'failed' as const,
        error: 'Some error',
      };
      expect(isValidPostingLogPayload(payload)).toBe(true);
    });

    it('should reject null', () => {
      expect(isValidPostingLogPayload(null)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(isValidPostingLogPayload('string')).toBe(false);
    });

    it('should reject missing vehicleId', () => {
      expect(isValidPostingLogPayload({ platform: 'facebook', status: 'success' })).toBe(false);
    });

    it('should reject non-number vehicleId', () => {
      expect(isValidPostingLogPayload({ vehicleId: 'abc', platform: 'facebook', status: 'success' })).toBe(false);
    });

    it('should reject missing platform', () => {
      expect(isValidPostingLogPayload({ vehicleId: 1, status: 'success' })).toBe(false);
    });

    it('should reject invalid status', () => {
      expect(isValidPostingLogPayload({ vehicleId: 1, platform: 'facebook', status: 'pending' })).toBe(false);
    });
  });

  describe('isValidFillContentPayload', () => {
    it('should accept valid payload', () => {
      const payload = {
        platform: 'facebook',
        vehicleId: 1,
        formData: { title: 'Test Car' },
      };
      expect(isValidFillContentPayload(payload)).toBe(true);
    });

    it('should accept payload with optional fields', () => {
      const payload = {
        platform: 'facebook',
        vehicleId: 1,
        formData: { title: 'Test' },
        imageUrls: ['https://example.com/img.jpg'],
        templateId: 5,
      };
      expect(isValidFillContentPayload(payload)).toBe(true);
    });

    it('should reject null', () => {
      expect(isValidFillContentPayload(null)).toBe(false);
    });

    it('should reject missing platform', () => {
      expect(isValidFillContentPayload({ vehicleId: 1, formData: {} })).toBe(false);
    });

    it('should reject non-string platform', () => {
      expect(isValidFillContentPayload({ platform: 123, vehicleId: 1, formData: {} })).toBe(false);
    });

    it('should reject missing vehicleId', () => {
      expect(isValidFillContentPayload({ platform: 'facebook', formData: {} })).toBe(false);
    });

    it('should reject non-number vehicleId', () => {
      expect(isValidFillContentPayload({ platform: 'facebook', vehicleId: 'abc', formData: {} })).toBe(false);
    });

    it('should reject missing formData', () => {
      expect(isValidFillContentPayload({ platform: 'facebook', vehicleId: 1 })).toBe(false);
    });

    it('should reject null formData', () => {
      expect(isValidFillContentPayload({ platform: 'facebook', vehicleId: 1, formData: null })).toBe(false);
    });

    it('should reject non-object formData', () => {
      expect(isValidFillContentPayload({ platform: 'facebook', vehicleId: 1, formData: 'string' })).toBe(false);
    });
  });

  describe('isValidSaveTemplatePayload', () => {
    it('should accept valid payload', () => {
      const payload = {
        templateName: 'My Template',
        titleTemplate: '{year} {make} {model}',
        descriptionTemplate: 'Great car!',
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(true);
    });

    it('should accept payload with isShared', () => {
      const payload = {
        templateName: 'Shared Template',
        titleTemplate: 'Title',
        descriptionTemplate: 'Desc',
        isShared: true,
      };
      expect(isValidSaveTemplatePayload(payload)).toBe(true);
    });

    it('should reject null', () => {
      expect(isValidSaveTemplatePayload(null)).toBe(false);
    });

    it('should reject missing templateName', () => {
      expect(isValidSaveTemplatePayload({ titleTemplate: 'T', descriptionTemplate: 'D' })).toBe(false);
    });

    it('should reject empty templateName', () => {
      expect(isValidSaveTemplatePayload({ templateName: '   ', titleTemplate: 'T', descriptionTemplate: 'D' })).toBe(false);
    });

    it('should reject missing titleTemplate', () => {
      expect(isValidSaveTemplatePayload({ templateName: 'N', descriptionTemplate: 'D' })).toBe(false);
    });

    it('should reject empty titleTemplate', () => {
      expect(isValidSaveTemplatePayload({ templateName: 'N', titleTemplate: '   ', descriptionTemplate: 'D' })).toBe(false);
    });

    it('should reject missing descriptionTemplate', () => {
      expect(isValidSaveTemplatePayload({ templateName: 'N', titleTemplate: 'T' })).toBe(false);
    });

    it('should reject empty descriptionTemplate', () => {
      expect(isValidSaveTemplatePayload({ templateName: 'N', titleTemplate: 'T', descriptionTemplate: '   ' })).toBe(false);
    });
  });

  describe('isValidRequestPostingTokenPayload', () => {
    it('should accept valid payload', () => {
      const payload = { vehicleId: 1, platform: 'facebook' };
      expect(isValidRequestPostingTokenPayload(payload)).toBe(true);
    });

    it('should reject null', () => {
      expect(isValidRequestPostingTokenPayload(null)).toBe(false);
    });

    it('should reject missing vehicleId', () => {
      expect(isValidRequestPostingTokenPayload({ platform: 'facebook' })).toBe(false);
    });

    it('should reject non-number vehicleId', () => {
      expect(isValidRequestPostingTokenPayload({ vehicleId: 'abc', platform: 'facebook' })).toBe(false);
    });

    it('should reject missing platform', () => {
      expect(isValidRequestPostingTokenPayload({ vehicleId: 1 })).toBe(false);
    });

    it('should reject non-string platform', () => {
      expect(isValidRequestPostingTokenPayload({ vehicleId: 1, platform: 123 })).toBe(false);
    });
  });

  describe('sanitizeServerUrl', () => {
    it('should remove trailing slash', () => {
      expect(sanitizeServerUrl('https://lotview.ai/')).toBe('https://lotview.ai');
    });

    it('should not modify URL without trailing slash', () => {
      expect(sanitizeServerUrl('https://lotview.ai')).toBe('https://lotview.ai');
    });

    it('should only remove single trailing slash', () => {
      expect(sanitizeServerUrl('https://lotview.ai//')).toBe('https://lotview.ai/');
    });
  });

  describe('extractImageFilename', () => {
    it('should extract filename from URL', () => {
      expect(extractImageFilename('https://cdn.lotview.ai/images/car.jpg')).toBe('car.jpg');
    });

    it('should handle query parameters', () => {
      expect(extractImageFilename('https://cdn.lotview.ai/images/car.jpg?v=123')).toBe('car.jpg');
    });

    it('should return default for empty path', () => {
      expect(extractImageFilename('https://cdn.lotview.ai/')).toBe('photo.jpg');
    });

    it('should handle URLs without extension', () => {
      expect(extractImageFilename('https://cdn.lotview.ai/images/car')).toBe('car');
    });
  });
});
