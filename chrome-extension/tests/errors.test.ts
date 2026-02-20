import {
  ErrorCode,
  createError,
  parseHttpError,
  isOnline,
  isRetryable,
} from '../src/errors';

describe('errors', () => {
  describe('createError', () => {
    it('should create error with default message', () => {
      const error = createError(ErrorCode.NETWORK_OFFLINE);
      expect(error.code).toBe(ErrorCode.NETWORK_OFFLINE);
      expect(error.message).toContain('offline');
      expect(error.retryable).toBe(true);
    });

    it('should create error with custom message', () => {
      const error = createError(ErrorCode.AUTH_EXPIRED, 'Custom message');
      expect(error.message).toBe('Custom message');
      expect(error.retryable).toBe(false);
    });

    it('should include retry delay for retryable errors', () => {
      const error = createError(ErrorCode.NETWORK_TIMEOUT);
      expect(error.retryAfterMs).toBeDefined();
      expect(error.retryAfterMs).toBeGreaterThan(0);
    });
  });

  describe('parseHttpError', () => {
    it('should return AUTH_EXPIRED for 401', () => {
      const error = parseHttpError(401);
      expect(error.code).toBe(ErrorCode.AUTH_EXPIRED);
      expect(error.retryable).toBe(false);
    });

    it('should return PERMISSION_DENIED for 403', () => {
      const error = parseHttpError(403);
      expect(error.code).toBe(ErrorCode.PERMISSION_DENIED);
    });

    it('should return RATE_LIMITED for 429', () => {
      const error = parseHttpError(429);
      expect(error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(error.retryable).toBe(true);
    });

    it('should return SERVER_ERROR for 5xx', () => {
      expect(parseHttpError(500).code).toBe(ErrorCode.SERVER_ERROR);
      expect(parseHttpError(502).code).toBe(ErrorCode.SERVER_ERROR);
      expect(parseHttpError(503).code).toBe(ErrorCode.SERVER_ERROR);
    });

    it('should return UNKNOWN for other status codes', () => {
      const error = parseHttpError(418);
      expect(error.code).toBe(ErrorCode.UNKNOWN);
    });

    it('should include custom body message', () => {
      const error = parseHttpError(400, 'Bad Request');
      expect(error.message).toBe('Bad Request');
    });
  });

  describe('isOnline', () => {
    it('should return navigator.onLine value', () => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
      expect(isOnline()).toBe(true);

      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      expect(isOnline()).toBe(false);
    });
  });

  describe('isRetryable', () => {
    beforeEach(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    });

    it('should return true for retryable errors when online', () => {
      const error = createError(ErrorCode.NETWORK_TIMEOUT);
      expect(isRetryable(error)).toBe(true);
    });

    it('should return false for non-retryable errors', () => {
      const error = createError(ErrorCode.AUTH_EXPIRED);
      expect(isRetryable(error)).toBe(false);
    });

    it('should return false when offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
      const error = createError(ErrorCode.NETWORK_TIMEOUT);
      expect(isRetryable(error)).toBe(false);
    });
  });
});
