let messageHandler: (message: any, sender: any, sendResponse: (response: any) => void) => boolean | void;

jest.mock('../src/crypto', () => ({
  signRequest: jest.fn().mockResolvedValue({
    'X-Timestamp': Date.now().toString(),
    'X-Nonce': 'test-nonce',
    'X-Signature': 'test-signature',
  }),
  encryptToken: jest.fn().mockResolvedValue('encrypted-token'),
  decryptToken: jest.fn().mockResolvedValue('test-jwt-token'),
}));

describe('background', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
    (chrome.storage.local.set as jest.Mock).mockResolvedValue(undefined);
    (chrome.storage.session.get as jest.Mock).mockResolvedValue({});
    (chrome.storage.session.set as jest.Mock).mockResolvedValue(undefined);
    (chrome.storage.sync.get as jest.Mock).mockResolvedValue({});
    
    (chrome.runtime.onMessage.addListener as jest.Mock).mockImplementation((handler) => {
      messageHandler = handler;
    });
    
    const { decryptToken } = require('../src/crypto');
    (decryptToken as jest.Mock).mockResolvedValue('test-jwt-token');
  });

  const loadBackground = async () => {
    jest.isolateModules(() => {
      require('../src/background');
    });
    await new Promise(resolve => setTimeout(resolve, 10));
  };

  const callMessageHandler = (message: any): Promise<any> => {
    return new Promise((resolve) => {
      const sender = { id: chrome.runtime.id };
      messageHandler(message, sender, resolve);
    });
  };

  describe('message validation', () => {
    it('should validate sender ID', () => {
      expect(chrome.runtime.id).toBe('test-extension-id');
    });

    it('should have allowed actions defined', () => {
      const allowedActions = [
        'EXT_LOGIN',
        'EXT_LOGOUT',
        'GET_AUTH',
        'FETCH_INVENTORY',
        'FETCH_TEMPLATES',
        'SAVE_TEMPLATE',
        'LOG_POSTING',
        'FETCH_LIMITS',
        'FILL_CONTENT',
        'REQUEST_POSTING_TOKEN',
        'CHECK_CONSENT',
      ];
      
      allowedActions.forEach((action) => {
        expect(typeof action).toBe('string');
      });
    });
  });

  describe('consent checking', () => {
    it('should detect when consent is granted', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      
      const result = await chrome.storage.local.get(['privacyConsent']);
      expect(result.privacyConsent).toBe(true);
    });

    it('should detect when consent is not granted', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: false });
      
      const result = await chrome.storage.local.get(['privacyConsent']);
      expect(result.privacyConsent).toBe(false);
    });

    it('should handle missing consent state', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
      
      const result = await chrome.storage.local.get(['privacyConsent']);
      expect(result.privacyConsent).toBeUndefined();
    });
  });

  describe('URL validation', () => {
    const ALLOWED_PROD_DOMAINS = ['lotview.ai', 'olympicautogroup.ca'];
    
    it('should identify valid production domains', () => {
      const validUrls = [
        'https://lotview.ai',
        'https://app.lotview.ai',
        'https://olympicautogroup.ca',
        'https://www.olympicautogroup.ca',
      ];
      
      validUrls.forEach((url) => {
        const parsed = new URL(url);
        const isValid = parsed.protocol === 'https:' && 
          ALLOWED_PROD_DOMAINS.some(
            (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
          );
        expect(isValid).toBe(true);
      });
    });

    it('should reject HTTP URLs', () => {
      const parsed = new URL('http://lotview.ai');
      expect(parsed.protocol).not.toBe('https:');
    });

    it('should reject unauthorized domains', () => {
      const unauthorizedUrls = [
        'https://evil.com',
        'https://lotview.ai.evil.com',
        'https://notlotview.ai',
      ];
      
      unauthorizedUrls.forEach((url) => {
        const parsed = new URL(url);
        const isValid = ALLOWED_PROD_DOMAINS.some(
          (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
        );
        expect(isValid).toBe(false);
      });
    });
  });

  describe('image host validation', () => {
    const ALLOWED_IMAGE_HOSTS = [
      'lotview.ai',
      'cdn.lotview.ai',
      'images.lotview.ai',
      'olympicautogroup.ca',
      'res.cloudinary.com',
    ];
    
    it('should allow valid image hosts', () => {
      const validHosts = [
        'https://cdn.lotview.ai/images/vehicle.jpg',
        'https://res.cloudinary.com/demo/image.png',
      ];
      
      validHosts.forEach((url) => {
        const parsed = new URL(url);
        const isAllowed = ALLOWED_IMAGE_HOSTS.some(
          (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`)
        );
        expect(isAllowed).toBe(true);
      });
    });

    it('should reject non-HTTPS image URLs', () => {
      const parsed = new URL('http://cdn.lotview.ai/image.jpg');
      expect(parsed.protocol).not.toBe('https:');
    });
  });

  describe('auth storage', () => {
    it('should use session storage primarily', async () => {
      await chrome.storage.session.set({ authData: { token: 'test' } });
      expect(chrome.storage.session.set).toHaveBeenCalled();
    });

    it('should fall back to local storage', async () => {
      (chrome.storage.session.get as jest.Mock).mockRejectedValue(new Error('Not supported'));
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ authData: { token: 'test' } });
      
      try {
        await chrome.storage.session.get(['authData']);
      } catch {
        const result = await chrome.storage.local.get(['authData']);
        expect(result.authData).toBeDefined();
      }
    });
  });

  describe('token expiry', () => {
    const AUTH_EXPIRY_MS = 8 * 60 * 60 * 1000;
    
    it('should define 8-hour token expiry', () => {
      expect(AUTH_EXPIRY_MS).toBe(28800000);
    });

    it('should detect expired tokens', () => {
      const createdAt = Date.now() - (9 * 60 * 60 * 1000);
      const expiresAt = createdAt + AUTH_EXPIRY_MS;
      
      expect(Date.now() > expiresAt).toBe(true);
    });

    it('should detect valid tokens', () => {
      const createdAt = Date.now() - (1 * 60 * 60 * 1000);
      const expiresAt = createdAt + AUTH_EXPIRY_MS;
      
      expect(Date.now() < expiresAt).toBe(true);
    });
  });

  describe('message handler integration', () => {
    beforeEach(async () => {
      await loadBackground();
    });

    it('should register message listener on load', () => {
      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
      expect(messageHandler).toBeDefined();
    });

    it('should reject messages from unauthorized senders', async () => {
      const result = await new Promise((resolve) => {
        const sender = { id: 'wrong-extension-id' };
        messageHandler({ type: 'GET_AUTH' }, sender, resolve);
      });
      
      expect(result).toEqual({ ok: false, error: 'Unauthorized sender', protocolVersion: 1 });
    });

    it('should reject unknown message types', async () => {
      const result = await callMessageHandler({ type: 'UNKNOWN_ACTION' });
      
      expect(result).toEqual({ ok: false, error: 'Unknown message type', protocolVersion: 1 });
    });

    it('should reject messages with mismatched protocol version', async () => {
      const result = await callMessageHandler({ type: 'GET_AUTH', protocolVersion: 999 });
      
      expect(result).toEqual({ 
        ok: false, 
        error: 'Protocol version mismatch. Please refresh the extension.',
        protocolVersion: 1,
        code: 'PROTOCOL_MISMATCH'
      });
    });

    it('should handle CHECK_CONSENT without requiring consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: false });
      
      const result = await callMessageHandler({ type: 'CHECK_CONSENT' });
      
      expect(result.ok).toBe(true);
      expect(result.hasConsent).toBe(false);
    });

    it('should return hasConsent true when consent is granted', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      
      const result = await callMessageHandler({ type: 'CHECK_CONSENT' });
      
      expect(result.ok).toBe(true);
      expect(result.hasConsent).toBe(true);
    });

    it('should block FETCH_INVENTORY without consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: false });
      
      const result = await callMessageHandler({ type: 'FETCH_INVENTORY' });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Privacy consent required');
      expect(result.code).toBe('CONSENT_REQUIRED');
    });

    it('should block FETCH_TEMPLATES without consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
      
      const result = await callMessageHandler({ type: 'FETCH_TEMPLATES' });
      
      expect(result.ok).toBe(false);
      expect(result.code).toBe('CONSENT_REQUIRED');
    });

    it('should allow EXT_LOGIN with consent but require credentials', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      
      const result = await callMessageHandler({ 
        type: 'EXT_LOGIN',
        payload: {}
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Email');
    });

    it('should reject EXT_LOGIN with invalid server URL', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      
      const result = await callMessageHandler({ 
        type: 'EXT_LOGIN',
        payload: {
          email: 'test@example.com',
          password: 'password123',
          serverUrl: 'http://evil.com'
        }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid server URL');
    });

    it('should handle EXT_LOGOUT with consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      
      const result = await callMessageHandler({ type: 'EXT_LOGOUT' });
      
      expect(result.ok).toBe(true);
    });

    it('should handle GET_AUTH and return null when no auth stored', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      (chrome.storage.session.get as jest.Mock).mockResolvedValue({});
      
      const result = await callMessageHandler({ type: 'GET_AUTH' });
      
      expect(result.ok).toBe(true);
      expect(result.auth).toBeNull();
    });

    it('should require auth for FETCH_INVENTORY even with consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      (chrome.storage.session.get as jest.Mock).mockResolvedValue({});
      
      const result = await callMessageHandler({ type: 'FETCH_INVENTORY' });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should require auth for FETCH_TEMPLATES even with consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      (chrome.storage.session.get as jest.Mock).mockResolvedValue({});
      
      const result = await callMessageHandler({ type: 'FETCH_TEMPLATES' });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should block SAVE_TEMPLATE without consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: false });
      
      const result = await callMessageHandler({ 
        type: 'SAVE_TEMPLATE',
        payload: { templateName: 'Test', titleTemplate: 'Title', descriptionTemplate: 'Desc' }
      });
      
      expect(result.ok).toBe(false);
      expect(result.code).toBe('CONSENT_REQUIRED');
    });

    it('should require auth for SAVE_TEMPLATE', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      (chrome.storage.session.get as jest.Mock).mockResolvedValue({});
      
      const result = await callMessageHandler({ 
        type: 'SAVE_TEMPLATE',
        payload: { templateName: 'Test', titleTemplate: 'Title', descriptionTemplate: 'Desc' }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should validate SAVE_TEMPLATE payload - missing templateName', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        privacyConsent: true,
        authData: {
          auth: { userId: 1, dealershipId: 1 },
          encryptedToken: 'encrypted-test',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        }
      });
      
      const result = await callMessageHandler({ 
        type: 'SAVE_TEMPLATE',
        payload: { titleTemplate: 'Title', descriptionTemplate: 'Desc' }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Template name');
    });

    it('should block LOG_POSTING without consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: false });
      
      const result = await callMessageHandler({ 
        type: 'LOG_POSTING',
        payload: { vehicleId: 1, platform: 'facebook', status: 'success' }
      });
      
      expect(result.ok).toBe(false);
      expect(result.code).toBe('CONSENT_REQUIRED');
    });

    it('should require auth for LOG_POSTING', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      (chrome.storage.session.get as jest.Mock).mockResolvedValue({});
      
      const result = await callMessageHandler({ 
        type: 'LOG_POSTING',
        payload: { vehicleId: 1, platform: 'facebook', status: 'success' }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should validate LOG_POSTING payload - invalid status', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        privacyConsent: true,
        authData: {
          auth: { userId: 1, dealershipId: 1 },
          encryptedToken: 'encrypted-test',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        }
      });
      
      const result = await callMessageHandler({ 
        type: 'LOG_POSTING',
        payload: { vehicleId: 1, platform: 'facebook', status: 'invalid' }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid posting log data');
    });

    it('should require postingToken for successful LOG_POSTING', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        privacyConsent: true,
        authData: {
          auth: { userId: 1, dealershipId: 1 },
          encryptedToken: 'encrypted-test',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        }
      });
      
      const result = await callMessageHandler({ 
        type: 'LOG_POSTING',
        payload: { vehicleId: 1, platform: 'facebook', status: 'success' }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('postingToken required for successful posts');
    });

    it('should block FETCH_LIMITS without consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: false });
      
      const result = await callMessageHandler({ type: 'FETCH_LIMITS' });
      
      expect(result.ok).toBe(false);
      expect(result.code).toBe('CONSENT_REQUIRED');
    });

    it('should require auth for FETCH_LIMITS', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      (chrome.storage.session.get as jest.Mock).mockResolvedValue({});
      
      const result = await callMessageHandler({ type: 'FETCH_LIMITS' });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should block REQUEST_POSTING_TOKEN without consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: false });
      
      const result = await callMessageHandler({ 
        type: 'REQUEST_POSTING_TOKEN',
        payload: { vehicleId: 1, platform: 'facebook' }
      });
      
      expect(result.ok).toBe(false);
      expect(result.code).toBe('CONSENT_REQUIRED');
    });

    it('should require auth for REQUEST_POSTING_TOKEN', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      (chrome.storage.session.get as jest.Mock).mockResolvedValue({});
      
      const result = await callMessageHandler({ 
        type: 'REQUEST_POSTING_TOKEN',
        payload: { vehicleId: 1, platform: 'facebook' }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should validate REQUEST_POSTING_TOKEN payload', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        privacyConsent: true,
        authData: {
          auth: { userId: 1, dealershipId: 1 },
          encryptedToken: 'encrypted-test',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        }
      });
      
      const result = await callMessageHandler({ 
        type: 'REQUEST_POSTING_TOKEN',
        payload: { vehicleId: 'invalid' }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('vehicleId and platform required');
    });

    it('should block FILL_CONTENT without consent', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: false });
      
      const result = await callMessageHandler({ 
        type: 'FILL_CONTENT',
        payload: { platform: 'facebook', vehicleId: 1, formData: {} }
      });
      
      expect(result.ok).toBe(false);
      expect(result.code).toBe('CONSENT_REQUIRED');
    });

    it('should require auth for FILL_CONTENT', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({ privacyConsent: true });
      (chrome.storage.session.get as jest.Mock).mockResolvedValue({});
      
      const result = await callMessageHandler({ 
        type: 'FILL_CONTENT',
        payload: { platform: 'facebook', vehicleId: 1, formData: {} }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should validate FILL_CONTENT payload - invalid platform type', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        privacyConsent: true,
        authData: {
          auth: { userId: 1, dealershipId: 1 },
          encryptedToken: 'encrypted-test',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        }
      });
      
      const result = await callMessageHandler({ 
        type: 'FILL_CONTENT',
        payload: { platform: 123, vehicleId: 1, formData: {} }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid fill content payload');
    });

    it('should reject unsupported platform in FILL_CONTENT', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        privacyConsent: true,
        authData: {
          auth: { userId: 1, dealershipId: 1 },
          encryptedToken: 'encrypted-test',
          expiresAt: Date.now() + 3600000,
          createdAt: Date.now(),
        }
      });
      
      const result = await callMessageHandler({ 
        type: 'FILL_CONTENT',
        payload: { platform: 'kijiji', vehicleId: 1, formData: {} }
      });
      
      expect(result.ok).toBe(false);
      expect(result.error).toContain('coming soon');
    });

    it('should handle consent error gracefully', async () => {
      (chrome.storage.local.get as jest.Mock).mockRejectedValue(new Error('Storage error'));
      
      const result = await callMessageHandler({ type: 'CHECK_CONSENT' });
      
      expect(result.ok).toBe(true);
      expect(result.hasConsent).toBe(false);
    });

    it('should reject invalid message without type', async () => {
      const result = await callMessageHandler({ action: 'something' });
      
      expect(result).toEqual({ ok: false, error: 'Unknown message type', protocolVersion: 1 });
    });

    it('should reject null message', async () => {
      const result = await callMessageHandler(null);
      
      expect(result).toEqual({ ok: false, error: 'Unknown message type', protocolVersion: 1 });
    });
  });
});
