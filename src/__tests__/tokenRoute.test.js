import {
  TEST_PRIVATE_KEY_PEM,
  TEST_PUBLIC_KEY_PEM,
} from '../__fixtures__/test-keys.js';

process.env.JWT_PRIVATE_KEY = TEST_PRIVATE_KEY_PEM;
process.env.JWT_PUBLIC_KEY = TEST_PUBLIC_KEY_PEM;

import tokenRoute from '../tokenRoute';
import { signShortLivedJWT, signLongLivedJWT, verifyJWT } from '../lib/jwt';
import { SignJWT } from 'jose';

describe('tokenRoute', () => {
  it('happy path: valid short-lived JWT returns a long-lived token', async () => {
    const code = await signShortLivedJWT('user123');
    const ctx = { request: { body: { code } }, status: undefined, body: null };
    await tokenRoute(ctx);
    expect(ctx.body).toHaveProperty('token');
    expect(typeof ctx.body.token).toBe('string');
    expect(ctx.status).toBeUndefined();
  });

  it('token content: returned token sub matches the short-lived code sub', async () => {
    const userId = 'user-abc-456';
    const code = await signShortLivedJWT(userId);
    const ctx = { request: { body: { code } }, status: undefined, body: null };
    await tokenRoute(ctx);
    expect(ctx.body).toHaveProperty('token');
    const payload = await verifyJWT(ctx.body.token);
    expect(payload.sub).toBe(userId);
  });

  it('missing code: returns 400 with error "code is required"', async () => {
    const ctx = { request: { body: {} }, status: undefined, body: null };
    await tokenRoute(ctx);
    expect(ctx.status).toBe(400);
    expect(ctx.body).toHaveProperty('error', 'code is required');
  });

  it('expired code: returns 401 with error field', async () => {
    const { importPKCS8 } = await import('jose');
    const privateKey = await importPKCS8(TEST_PRIVATE_KEY_PEM, 'RS256');
    const expiredCode = await new SignJWT({ sub: 'user-expired' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('1s')
      .sign(privateKey);

    await new Promise((r) => setTimeout(r, 1100));

    const ctx = {
      request: { body: { code: expiredCode } },
      status: undefined,
      body: null,
    };
    await tokenRoute(ctx);
    expect(ctx.status).toBe(401);
    expect(ctx.body).toHaveProperty('error');
  }, 10000);

  it('invalid/malformed code: garbage string returns 401 with error field', async () => {
    const ctx = {
      request: { body: { code: 'this-is-not-a-valid-jwt-at-all' } },
      status: undefined,
      body: null,
    };
    await tokenRoute(ctx);
    expect(ctx.status).toBe(401);
    expect(ctx.body).toHaveProperty('error');
  });

  it('wrong key: JWT signed with a different RSA key returns 401', async () => {
    const { generateKeyPair } = await import('jose');
    const { privateKey: wrongPrivateKey } = await generateKeyPair('RS256');
    const codeWithWrongKey = await new SignJWT({ sub: 'user-wrong-key' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('30s')
      .sign(wrongPrivateKey);

    const ctx = {
      request: { body: { code: codeWithWrongKey } },
      status: undefined,
      body: null,
    };
    await tokenRoute(ctx);
    expect(ctx.status).toBe(401);
  });

  it('rejects long-lived access token used as a code (token_use mismatch)', async () => {
    const accessToken = await signLongLivedJWT('user-replay');
    const ctx = {
      request: { body: { code: accessToken } },
      status: undefined,
      body: null,
    };
    await tokenRoute(ctx);
    expect(ctx.status).toBe(401);
    expect(ctx.body).toHaveProperty('error');
  });

  it('does not swallow signLongLivedJWT errors as 401 (sign failure surfaces, not masked)', async () => {
    const code = await signShortLivedJWT('user-sign-fail');

    let tokenRouteWithFailingSign;
    jest.isolateModules(() => {
      jest.doMock('../lib/jwt', () => {
        const actual = jest.requireActual('../lib/jwt');
        return {
          ...actual,
          signLongLivedJWT: jest
            .fn()
            .mockRejectedValue(new Error('KMS unavailable')),
        };
      });
      const mod = require('../tokenRoute');
      tokenRouteWithFailingSign = mod.default ?? mod;
    });

    const ctx = { request: { body: { code } }, status: undefined, body: null };
    await expect(tokenRouteWithFailingSign(ctx)).rejects.toThrow(
      'KMS unavailable'
    );
    expect(ctx.status).not.toBe(401);
  });
});
