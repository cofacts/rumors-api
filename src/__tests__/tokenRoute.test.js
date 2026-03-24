process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-ok';

import tokenRoute from '../tokenRoute';
import { signShortLivedJWT, verifyJWT } from '../lib/jwt';
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
    const secret = new TextEncoder().encode('test-secret-at-least-32-chars-long-ok');
    const expiredCode = await new SignJWT({ sub: 'user-expired' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1s')
      .sign(secret);

    await new Promise(r => setTimeout(r, 1100));

    const ctx = { request: { body: { code: expiredCode } }, status: undefined, body: null };
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

  it('wrong secret: JWT signed with different secret returns 401', async () => {
    const wrongSecret = new TextEncoder().encode('totally-different-secret-for-testing-purposes');
    const codeWithWrongSecret = await new SignJWT({ sub: 'user-wrong-secret' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30s')
      .sign(wrongSecret);

    const ctx = {
      request: { body: { code: codeWithWrongSecret } },
      status: undefined,
      body: null,
    };
    await tokenRoute(ctx);
    expect(ctx.status).toBe(401);
  });
});
