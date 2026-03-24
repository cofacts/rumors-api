// Set JWT_SECRET before any imports that trigger jwt.js module evaluation
process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-ok';

import contextFactory from '../contextFactory';
import { signLongLivedJWT } from '../lib/jwt';

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
    // Sign a JWT that expired in the past by using a very short-lived token and manually crafting
    // We use jose directly to create an already-expired token
    const { SignJWT } = await import('jose');
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const expiredToken = await new SignJWT({ sub: 'expired-user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 120) // issued 2 min ago
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60) // expired 1 min ago
      .sign(secret);

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
});
