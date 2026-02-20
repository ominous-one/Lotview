import {
  generateNonce,
  getTimestamp,
  isNonceValid,
  signRequest,
  getOrCreateSigningKey,
  encryptToken,
  decryptToken,
} from '../src/crypto';

describe('crypto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
    (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);
  });

  describe('generateNonce', () => {
    it('should generate a 32-character hex string', () => {
      const nonce = generateNonce();
      expect(nonce).toHaveLength(32);
      expect(/^[0-9a-f]+$/.test(nonce)).toBe(true);
    });

    it('should generate unique nonces', () => {
      const nonces = new Set<string>();
      for (let i = 0; i < 100; i++) {
        nonces.add(generateNonce());
      }
      expect(nonces.size).toBe(100);
    });
  });

  describe('getTimestamp', () => {
    it('should return current time in seconds', () => {
      const before = Math.floor(Date.now() / 1000);
      const timestamp = getTimestamp();
      const after = Math.floor(Date.now() / 1000);
      
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should return a number', () => {
      expect(typeof getTimestamp()).toBe('number');
    });
  });

  describe('isNonceValid', () => {
    it('should return true for fresh nonce with valid timestamp', () => {
      const nonce = generateNonce();
      const timestamp = getTimestamp();
      expect(isNonceValid(nonce, timestamp)).toBe(true);
    });

    it('should return false for reused nonce', () => {
      const nonce = generateNonce();
      const timestamp = getTimestamp();
      
      expect(isNonceValid(nonce, timestamp)).toBe(true);
      expect(isNonceValid(nonce, timestamp)).toBe(false);
    });

    it('should return false for expired timestamp (too old)', () => {
      const nonce = generateNonce();
      const oldTimestamp = getTimestamp() - 600;
      expect(isNonceValid(nonce, oldTimestamp)).toBe(false);
    });

    it('should return false for future timestamp (too far ahead)', () => {
      const nonce = generateNonce();
      const futureTimestamp = getTimestamp() + 600;
      expect(isNonceValid(nonce, futureTimestamp)).toBe(false);
    });
  });

  describe('getOrCreateSigningKey', () => {
    it('should return existing key if stored', async () => {
      const existingKey = 'a'.repeat(64);
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ signingKey: existingKey });
      
      const key = await getOrCreateSigningKey();
      expect(key).toBe(existingKey);
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });

    it('should generate and store new key if none exists', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
      
      const key = await getOrCreateSigningKey();
      expect(key).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(key)).toBe(true);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ signingKey: key });
    });

    it('should generate new key if stored key is invalid', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ signingKey: 'short' });
      
      const key = await getOrCreateSigningKey();
      expect(key).toHaveLength(64);
      expect(chrome.storage.local.set).toHaveBeenCalled();
    });
  });

  describe('signRequest', () => {
    it('should return signed headers with all required fields', async () => {
      const headers = await signRequest('GET', '/api/test', null, 'test-token');
      
      expect(headers).toHaveProperty('X-Timestamp');
      expect(headers).toHaveProperty('X-Nonce');
      expect(headers).toHaveProperty('X-Signature');
    });

    it('should include valid timestamp in headers', async () => {
      const before = getTimestamp();
      const headers = await signRequest('GET', '/api/test', null, 'test-token');
      const after = getTimestamp();
      
      const headerTimestamp = parseInt(headers['X-Timestamp'], 10);
      expect(headerTimestamp).toBeGreaterThanOrEqual(before);
      expect(headerTimestamp).toBeLessThanOrEqual(after);
    });

    it('should include valid nonce in headers', async () => {
      const headers = await signRequest('GET', '/api/test', null, 'test-token');
      
      expect(headers['X-Nonce']).toHaveLength(32);
      expect(/^[0-9a-f]+$/.test(headers['X-Nonce'])).toBe(true);
    });

    it('should call HMAC sign for each request', async () => {
      await signRequest('GET', '/api/test1', null, 'token1');
      await signRequest('POST', '/api/test2', '{"data":"test"}', 'token2');
      
      expect(crypto.subtle.sign).toHaveBeenCalledTimes(2);
    });

    it('should produce signature as hex string', async () => {
      const headers = await signRequest('GET', '/api/test', null, 'test-token');
      
      expect(headers['X-Signature']).toHaveLength(64);
      expect(/^[0-9a-f]+$/.test(headers['X-Signature'])).toBe(true);
    });
  });

  describe('encryptToken and decryptToken', () => {
    it('should encrypt token and return base64 string', async () => {
      (crypto.subtle.encrypt as jest.Mock).mockImplementation(async (algo, key, data) => {
        return new Uint8Array([...new Uint8Array(data), 0, 0, 0, 0]).buffer;
      });

      const original = 'test-token';
      const encrypted = await encryptToken(original);
      
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(0);
      expect(() => atob(encrypted)).not.toThrow();
    });

    it('should call crypto.subtle.encrypt with AES-GCM', async () => {
      (crypto.subtle.encrypt as jest.Mock).mockResolvedValue(new ArrayBuffer(16));
      
      await encryptToken('test-token');
      
      expect(crypto.subtle.encrypt).toHaveBeenCalled();
      const callArgs = (crypto.subtle.encrypt as jest.Mock).mock.calls[0][0];
      expect(callArgs.name).toBe('AES-GCM');
    });

    it('should decrypt token and return original string', async () => {
      const originalToken = 'my-secret-token';
      
      (crypto.subtle.decrypt as jest.Mock).mockResolvedValue(
        new TextEncoder().encode(originalToken).buffer
      );

      const fakeEncrypted = btoa(String.fromCharCode(...new Uint8Array(28)));
      const decrypted = await decryptToken(fakeEncrypted);
      
      expect(crypto.subtle.decrypt).toHaveBeenCalled();
      expect(decrypted).toBe(originalToken);
    });

    it('should call crypto.subtle.decrypt with AES-GCM', async () => {
      (crypto.subtle.decrypt as jest.Mock).mockResolvedValue(
        new TextEncoder().encode('token').buffer
      );

      const fakeEncrypted = btoa(String.fromCharCode(...new Uint8Array(28)));
      await decryptToken(fakeEncrypted);
      
      const callArgs = (crypto.subtle.decrypt as jest.Mock).mock.calls[0][0];
      expect(callArgs.name).toBe('AES-GCM');
    });

    it('should extract IV from first 12 bytes of encrypted data', async () => {
      (crypto.subtle.decrypt as jest.Mock).mockResolvedValue(
        new TextEncoder().encode('result').buffer
      );

      const testData = new Uint8Array(28);
      for (let i = 0; i < 12; i++) testData[i] = i + 1;
      const fakeEncrypted = btoa(String.fromCharCode(...testData));
      
      await decryptToken(fakeEncrypted);
      
      const callArgs = (crypto.subtle.decrypt as jest.Mock).mock.calls[0][0];
      expect(callArgs.iv).toBeDefined();
      expect(callArgs.iv.length).toBe(12);
    });
  });
});
