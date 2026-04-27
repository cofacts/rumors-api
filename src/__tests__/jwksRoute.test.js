import {
  TEST_PRIVATE_KEY_PEM,
  TEST_PUBLIC_KEY_PEM,
} from '../__fixtures__/test-keys.js';

process.env.JWT_PRIVATE_KEY = TEST_PRIVATE_KEY_PEM;
process.env.JWT_PUBLIC_KEY = TEST_PUBLIC_KEY_PEM;

import jwksRoute from '../jwksRoute';

function makeCtx() {
  const headers = {};
  return {
    set: jest.fn((name, value) => {
      headers[name.toLowerCase()] = value;
    }),
    type: undefined,
    body: undefined,
    _headers: headers,
  };
}

describe('jwksRoute', () => {
  it('responds with a JWKS object containing exactly one key', async () => {
    const ctx = makeCtx();
    await jwksRoute(ctx);
    expect(ctx.body).toBeDefined();
    expect(Array.isArray(ctx.body.keys)).toBe(true);
    expect(ctx.body.keys).toHaveLength(1);
  });

  it('the key has expected RSA public-key fields', async () => {
    const ctx = makeCtx();
    await jwksRoute(ctx);
    const [jwk] = ctx.body.keys;
    expect(jwk.kty).toBe('RSA');
    expect(jwk.alg).toBe('RS256');
    expect(jwk.use).toBe('sig');
    expect(jwk.e).toBe('AQAB');
    expect(typeof jwk.n).toBe('string');
    expect(jwk.n.length).toBeGreaterThan(0);
    expect(typeof jwk.kid).toBe('string');
    expect(jwk.kid.length).toBeGreaterThan(0);
  });

  it('the key does NOT contain any private-key fields', async () => {
    const ctx = makeCtx();
    await jwksRoute(ctx);
    const [jwk] = ctx.body.keys;
    expect(jwk.d).toBeUndefined();
    expect(jwk.p).toBeUndefined();
    expect(jwk.q).toBeUndefined();
    expect(jwk.dp).toBeUndefined();
    expect(jwk.dq).toBeUndefined();
    expect(jwk.qi).toBeUndefined();
  });

  it('sets Content-Type to application/json', async () => {
    const ctx = makeCtx();
    await jwksRoute(ctx);
    expect(ctx.type).toBe('application/json');
  });

  it('sets Cache-Control header to allow public caching for 1 hour', async () => {
    const ctx = makeCtx();
    await jwksRoute(ctx);
    expect(ctx._headers['cache-control']).toBe('public, max-age=3600');
  });

  it('the kid in the JWKS matches the kid signed into a freshly issued JWT', async () => {
    const { signShortLivedJWT } = await import('../lib/jwt');
    const ctx = makeCtx();
    await jwksRoute(ctx);
    const [jwk] = ctx.body.keys;

    const token = await signShortLivedJWT('jwks-kid-test-user');
    const headerB64 = token.split('.')[0];
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf8')
    );

    expect(header.kid).toBe(jwk.kid);
  });
});
