// Set RSA keys before any imports that trigger jwt.js module evaluation
import {
  TEST_PRIVATE_KEY_PEM,
  TEST_PUBLIC_KEY_PEM,
} from '../__fixtures__/test-keys.js';

process.env.JWT_PRIVATE_KEY = TEST_PRIVATE_KEY_PEM;
process.env.JWT_PUBLIC_KEY = TEST_PUBLIC_KEY_PEM;

import contextFactory from '../contextFactory';
import { signLongLivedJWT, signShortLivedJWT } from '../lib/jwt';

jest.mock('../util/user', () => ({
  createOrUpdateUser: jest.fn(),
}));
jest.mock('../graphql/dataLoaders', () => {
  return jest.fn().mockImplementation(() => ({}));
});
import { createOrUpdateUser } from '../util/user';

describe('contextFactory Bearer auth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createOrUpdateUser.mockResolvedValue({
      user: { id: 'user123', name: 'Test User' },
      isCreated: false,
    });
  });

  it('valid Bearer token: calls createOrUpdateUser with bearerUserId', async () => {
    const token = await signLongLivedJWT('bearer-user');
    const ctx = {
      appId: 'RUMORS_SITE',
      query: {},
      state: { user: {} },
      request: { headers: { authorization: `Bearer ${token}` } },
      get: jest.fn().mockReturnValue(''),
    };
    await contextFactory({ ctx });
    expect(createOrUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'bearer-user' })
    );
  });

  it('expired Bearer token: throws error', async () => {
    // Sign an already-expired token using the RSA private key
    const { SignJWT, importPKCS8 } = await import('jose');
    const privateKey = await importPKCS8(TEST_PRIVATE_KEY_PEM, 'RS256');
    const expiredToken = await new SignJWT({ sub: 'expired-user' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120) // issued 2 min ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60) // expired 1 min ago
      .sign(privateKey);

    const ctx = {
      appId: 'RUMORS_SITE',
      query: {},
      state: { user: {} },
      request: { headers: { authorization: `Bearer ${expiredToken}` } },
      get: jest.fn().mockReturnValue(''),
    };
    await expect(contextFactory({ ctx })).rejects.toThrow(
      'Invalid or expired Bearer token'
    );
    expect(createOrUpdateUser).not.toHaveBeenCalled();
  });

  it('invalid Bearer token: throws error', async () => {
    const ctx = {
      appId: 'RUMORS_SITE',
      query: {},
      state: { user: {} },
      request: { headers: { authorization: 'Bearer this-is-not-a-valid-jwt' } },
      get: jest.fn().mockReturnValue(''),
    };
    await expect(contextFactory({ ctx })).rejects.toThrow(
      'Invalid or expired Bearer token'
    );
    expect(createOrUpdateUser).not.toHaveBeenCalled();
  });

  it('no Authorization header (session-based): calls createOrUpdateUser with sessionUserId', async () => {
    const ctx = {
      appId: 'RUMORS_SITE',
      query: {},
      state: { user: { userId: 'session-user' } },
      request: { headers: {} },
      get: jest.fn().mockReturnValue(''),
    };
    await contextFactory({ ctx });
    expect(createOrUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'session-user' })
    );
  });

  it('Bearer takes precedence over session: uses bearerUserId, not sessionUserId', async () => {
    const token = await signLongLivedJWT('bearer-user');
    const ctx = {
      appId: 'RUMORS_SITE',
      query: {},
      state: { user: { userId: 'session-user' } },
      request: { headers: { authorization: `Bearer ${token}` } },
      get: jest.fn().mockReturnValue(''),
    };
    await contextFactory({ ctx });
    expect(createOrUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'bearer-user' })
    );
    expect(createOrUpdateUser).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'session-user' })
    );
  });

  it('queryUserId has highest priority: uses queryUserId over Bearer and session', async () => {
    const token = await signLongLivedJWT('bearer-user');
    const ctx = {
      appId: 'RUMORS_SITE',
      query: { userId: 'query-user' },
      state: { user: { userId: 'session-user' } },
      request: { headers: { authorization: `Bearer ${token}` } },
      get: jest.fn().mockReturnValue(''),
    };
    await contextFactory({ ctx });
    expect(createOrUpdateUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'query-user' })
    );
    expect(createOrUpdateUser).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'bearer-user' })
    );
    expect(createOrUpdateUser).not.toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'session-user' })
    );
  });

  it('rejects short-lived auth code used as Bearer access token (token_use mismatch)', async () => {
    const code = await signShortLivedJWT('replay-user');
    const ctx = {
      appId: 'RUMORS_SITE',
      query: {},
      state: { user: {} },
      request: { headers: { authorization: `Bearer ${code}` } },
      get: jest.fn().mockReturnValue(''),
    };
    await expect(contextFactory({ ctx })).rejects.toThrow(
      'Invalid or expired Bearer token'
    );
    expect(createOrUpdateUser).not.toHaveBeenCalled();
  });
});
