/**
 * Auth Module Unit Tests
 * Tests: JWT generation/verification, password hashing, HMAC validation, posting tokens
 */
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Must set before importing auth module
const JWT_SECRET = 'olympic-auto-jwt-dev-secret-DO-NOT-USE-IN-PRODUCTION';
const HMAC_SECRET = 'extension-hmac-dev-secret';

// Mock storage to prevent DB connection
jest.mock('../storage', () => ({
  storage: {
    getUserById: jest.fn(),
    getUserByEmail: jest.fn(),
  }
}));

// Mock db module
jest.mock('../db', () => ({
  db: { execute: jest.fn() }
}));

import {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  generatePostingToken,
  validatePostingToken,
} from '../auth';

describe('Auth Module', () => {
  describe('Password Hashing', () => {
    it('should hash a password with bcrypt', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
    });

    it('should verify a correct password against its hash', async () => {
      const password = 'SecurePass456!';
      const hash = await hashPassword(password);
      const isValid = await comparePassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
      const password = 'CorrectPassword';
      const hash = await hashPassword(password);
      const isValid = await comparePassword('WrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should produce different hashes for the same password (salted)', async () => {
      const password = 'SamePassword';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      expect(hash1).not.toBe(hash2);
      // Both should still verify
      expect(await comparePassword(password, hash1)).toBe(true);
      expect(await comparePassword(password, hash2)).toBe(true);
    });
  });

  describe('JWT Token Generation', () => {
    const mockUser = {
      id: 42,
      email: 'test@dealership.com',
      role: 'manager',
      name: 'Test Manager',
      dealershipId: 7,
      passwordHash: 'hash',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should generate a valid JWT token', () => {
      const token = generateToken(mockUser as any);
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      // JWT has 3 parts separated by dots
      expect(token.split('.').length).toBe(3);
    });

    it('should include correct claims in the token', () => {
      const token = generateToken(mockUser as any);
      const decoded = jwt.decode(token) as any;
      expect(decoded.id).toBe(42);
      expect(decoded.email).toBe('test@dealership.com');
      expect(decoded.role).toBe('manager');
      expect(decoded.name).toBe('Test Manager');
      expect(decoded.dealershipId).toBe(7);
    });

    it('should set correct issuer and audience', () => {
      const token = generateToken(mockUser as any);
      const decoded = jwt.decode(token) as any;
      expect(decoded.iss).toBe('lotview.ai');
      expect(decoded.aud).toBe('lotview-api');
    });

    it('should set an expiration time', () => {
      const token = generateToken(mockUser as any);
      const decoded = jwt.decode(token) as any;
      expect(decoded.exp).toBeDefined();
      // Token should have an expiration in the future
      const now = Math.floor(Date.now() / 1000);
      expect(decoded.exp).toBeGreaterThan(now);
      // Expiry should be at least 1 hour from now and no more than 8 days
      expect(decoded.exp - now).toBeGreaterThan(3500);
      expect(decoded.exp - now).toBeLessThanOrEqual(8 * 24 * 60 * 60);
    });

    it('should not include password hash in token', () => {
      const token = generateToken(mockUser as any);
      const decoded = jwt.decode(token) as any;
      expect(decoded.passwordHash).toBeUndefined();
      expect(decoded.hash).toBeUndefined();
    });
  });

  describe('JWT Token Verification', () => {
    const mockUser = {
      id: 1,
      email: 'verify@test.com',
      role: 'admin',
      name: 'Verifier',
      dealershipId: 1,
      passwordHash: 'hash',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should verify a valid token', () => {
      const token = generateToken(mockUser as any);
      const decoded = verifyToken(token);
      expect(decoded).not.toBeNull();
      expect(decoded.id).toBe(1);
      expect(decoded.email).toBe('verify@test.com');
    });

    it('should reject a tampered token', () => {
      const token = generateToken(mockUser as any);
      // Tamper with the payload
      const parts = token.split('.');
      parts[1] = Buffer.from(JSON.stringify({ id: 999, email: 'hacker@evil.com', role: 'super_admin' })).toString('base64url');
      const tamperedToken = parts.join('.');
      const decoded = verifyToken(tamperedToken);
      expect(decoded).toBeNull();
    });

    it('should reject an expired token', () => {
      // Create a token that already expired
      const expiredToken = jwt.sign(
        { id: 1, email: 'expired@test.com', role: 'manager', name: 'Expired', dealershipId: 1 },
        JWT_SECRET,
        { expiresIn: '-1s', issuer: 'lotview.ai', audience: 'lotview-api' }
      );
      const decoded = verifyToken(expiredToken);
      expect(decoded).toBeNull();
    });

    it('should reject a token with wrong issuer', () => {
      const wrongIssuerToken = jwt.sign(
        { id: 1, email: 'wrong@test.com', role: 'manager' },
        JWT_SECRET,
        { issuer: 'wrong-issuer', audience: 'lotview-api' }
      );
      const decoded = verifyToken(wrongIssuerToken);
      expect(decoded).toBeNull();
    });

    it('should reject a token with wrong audience', () => {
      const wrongAudienceToken = jwt.sign(
        { id: 1, email: 'wrong@test.com', role: 'manager' },
        JWT_SECRET,
        { issuer: 'lotview.ai', audience: 'wrong-api' }
      );
      const decoded = verifyToken(wrongAudienceToken);
      expect(decoded).toBeNull();
    });

    it('should reject a completely invalid string', () => {
      expect(verifyToken('not-a-jwt')).toBeNull();
      expect(verifyToken('')).toBeNull();
      expect(verifyToken('a.b.c')).toBeNull();
    });

    it('should reject a token signed with wrong secret', () => {
      const wrongSecretToken = jwt.sign(
        { id: 1, email: 'wrong@test.com', role: 'manager' },
        'wrong-secret-key',
        { issuer: 'lotview.ai', audience: 'lotview-api' }
      );
      const decoded = verifyToken(wrongSecretToken);
      expect(decoded).toBeNull();
    });
  });

  describe('Posting Token', () => {
    it('should generate a posting token with two parts', async () => {
      const token = await generatePostingToken(1, 100, 'facebook');
      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(2);
    });

    it('should validate a correct posting token', async () => {
      const token = await generatePostingToken(1, 100, 'facebook');
      const result = await validatePostingToken(token, 1, 100, 'facebook');
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject a token with wrong user ID', async () => {
      const token = await generatePostingToken(1, 100, 'facebook');
      const result = await validatePostingToken(token, 999, 100, 'facebook');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('User mismatch');
    });

    it('should reject a token with wrong vehicle ID', async () => {
      const token = await generatePostingToken(1, 100, 'facebook');
      const result = await validatePostingToken(token, 1, 999, 'facebook');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Vehicle mismatch');
    });

    it('should reject a token with wrong platform', async () => {
      const token = await generatePostingToken(1, 100, 'facebook');
      const result = await validatePostingToken(token, 1, 100, 'craigslist');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Platform mismatch');
    });

    it('should reject a token used twice (one-time use)', async () => {
      const token = await generatePostingToken(2, 200, 'facebook');
      const result1 = await validatePostingToken(token, 2, 200, 'facebook');
      expect(result1.valid).toBe(true);

      const result2 = await validatePostingToken(token, 2, 200, 'facebook');
      expect(result2.valid).toBe(false);
      expect(result2.error).toBe('Token already used');
    });

    it('should reject an invalid token format', async () => {
      const result = await validatePostingToken('invalid-no-dot', 1, 1, 'facebook');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid token format');
    });

    it('should reject a token with tampered signature', async () => {
      const token = await generatePostingToken(1, 100, 'facebook');
      const parts = token.split('.');
      // Tamper with signature
      const tamperedSig = 'a'.repeat(64);
      const tamperedToken = `${parts[0]}.${tamperedSig}`;
      const result = await validatePostingToken(tamperedToken, 1, 100, 'facebook');
      expect(result.valid).toBe(false);
    });

    it('should reject a token with tampered payload', async () => {
      const token = await generatePostingToken(1, 100, 'facebook');
      const parts = token.split('.');
      // Create a different payload
      const newPayload = Buffer.from(JSON.stringify({
        userId: 1, vehicleId: 100, platform: 'facebook',
        timestamp: Date.now(), nonce: 'tampered-nonce'
      })).toString('base64url');
      const tamperedToken = `${newPayload}.${parts[1]}`;
      const result = await validatePostingToken(tamperedToken, 1, 100, 'facebook');
      expect(result.valid).toBe(false);
    });
  });
});
