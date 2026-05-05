import { SignJWT, importPKCS8 } from 'jose';
import {
  TEST_PRIVATE_KEY_PEM,
  TEST_PUBLIC_KEY_PEM,
} from '../__fixtures__/test-keys.js';

// Set RSA keys before any module imports
process.env.JWT_PRIVATE_KEY = TEST_PRIVATE_KEY_PEM;
process.env.JWT_PUBLIC_KEY = TEST_PUBLIC_KEY_PEM;

let signShortLivedJWT;
let signLongLivedJWT;
let verifyJWT;
let getPublicJWK;

beforeAll(async () => {
  // Use dynamic import after env vars are set
  const jwtModule = await import('../lib/jwt.js');
  signShortLivedJWT = jwtModule.signShortLivedJWT;
  signLongLivedJWT = jwtModule.signLongLivedJWT;
  verifyJWT = jwtModule.verifyJWT;
  getPublicJWK = jwtModule.getPublicJWK;
});

describe('signShortLivedJWT', () => {
  it('uses RS256 algorithm in the header', async () => {
    const token = await signShortLivedJWT('test-user-rs256');
    const headerB64 = token.split('.')[0];
    const header = JSON.parse(
      Buffer.from(headerB64, 'base64url').toString('utf8')
    );
    expect(header.alg).toBe('RS256');
  });

  it('has correct sub claim', async () => {
    const userId = 'test-user-456';
    const token = await signShortLivedJWT(userId);
    const payload = await verifyJWT(token);
    expect(payload.sub).toBe(userId);
  });

  it('has 60 second expiry (exp - iat === 60)', async () => {
    const token = await signShortLivedJWT('test-user-789');
    const payload = await verifyJWT(token);
    expect(payload.exp - payload.iat).toBe(60);
  });

  it('has token_use === "auth_code" claim', async () => {
    const token = await signShortLivedJWT('test-user-token-use');
    const payload = await verifyJWT(token);
    expect(payload.token_use).toBe('auth_code');
  });
});

describe('signLongLivedJWT', () => {
  it('has correct sub claim', async () => {
    const userId = 'test-user-999';
    const token = await signLongLivedJWT(userId);
    const payload = await verifyJWT(token);
    expect(payload.sub).toBe(userId);
  });

  it('has COOKIE_MAXAGE expiry (default 14 days = 1209600s)', async () => {
    const token = await signLongLivedJWT('test-user-long');
    const payload = await verifyJWT(token);
    expect(payload.exp - payload.iat).toBe(1209600);
  });

  it('has token_use === "access" claim', async () => {
    const token = await signLongLivedJWT('test-user-token-use');
    const payload = await verifyJWT(token);
    expect(payload.token_use).toBe('access');
  });

  it('falls back to default 14d expiry when COOKIE_MAXAGE is not a number', async () => {
    const original = process.env.COOKIE_MAXAGE;
    process.env.COOKIE_MAXAGE = 'not-a-number';
    try {
      jest.resetModules();
      const jwtModule = await import('../lib/jwt.js');
      const token = await jwtModule.signLongLivedJWT('user-bad-maxage');
      const payload = await jwtModule.verifyJWT(token);
      expect(payload.exp - payload.iat).toBe(1209600);
    } finally {
      if (original === undefined) delete process.env.COOKIE_MAXAGE;
      else process.env.COOKIE_MAXAGE = original;
      jest.resetModules();
    }
  });

  it('honors COOKIE_MAXAGE when it parses to a positive integer', async () => {
    const original = process.env.COOKIE_MAXAGE;
    process.env.COOKIE_MAXAGE = '60000';
    try {
      jest.resetModules();
      const jwtModule = await import('../lib/jwt.js');
      const token = await jwtModule.signLongLivedJWT('user-custom-maxage');
      const payload = await jwtModule.verifyJWT(token);
      expect(payload.exp - payload.iat).toBe(60);
    } finally {
      if (original === undefined) delete process.env.COOKIE_MAXAGE;
      else process.env.COOKIE_MAXAGE = original;
      jest.resetModules();
    }
  });
});

describe('verifyJWT', () => {
  it('returns payload with correct sub for valid token', async () => {
    const userId = 'test-user-verify';
    const token = await signShortLivedJWT(userId);
    const payload = await verifyJWT(token);
    expect(payload.sub).toBe(userId);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
  });

  it('throws for HS256-signed tokens (algorithm confusion guard)', async () => {
    // Tokens signed with HS256 must not be accepted, even if a malicious party
    // tries to use the public key as an HMAC secret.
    const hsToken = await new SignJWT({ sub: 'test-user-hs-attack' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30s')
      .sign(new TextEncoder().encode('any-secret-32-chars-long-1234567'));

    await expect(verifyJWT(hsToken)).rejects.toThrow();
  });

  it('accepts a token when expectedUse matches token_use claim', async () => {
    const code = await signShortLivedJWT('test-user-use-match');
    const accessToken = await signLongLivedJWT('test-user-use-match');
    await expect(
      verifyJWT(code, { expectedUse: 'auth_code' })
    ).resolves.toMatchObject({ token_use: 'auth_code' });
    await expect(
      verifyJWT(accessToken, { expectedUse: 'access' })
    ).resolves.toMatchObject({ token_use: 'access' });
  });

  it('rejects long-lived access token when expectedUse is "auth_code"', async () => {
    const accessToken = await signLongLivedJWT('test-user-cross-use-1');
    await expect(
      verifyJWT(accessToken, { expectedUse: 'auth_code' })
    ).rejects.toThrow(/token_use/);
  });

  it('rejects short-lived auth code when expectedUse is "access"', async () => {
    const code = await signShortLivedJWT('test-user-cross-use-2');
    await expect(verifyJWT(code, { expectedUse: 'access' })).rejects.toThrow(
      /token_use/
    );
  });

  it('rejects token without token_use claim when expectedUse is set', async () => {
    const privateKey = await importPKCS8(TEST_PRIVATE_KEY_PEM, 'RS256');
    const legacyToken = await new SignJWT({ sub: 'test-user-legacy' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuedAt()
      .setExpirationTime('30s')
      .sign(privateKey);
    await expect(
      verifyJWT(legacyToken, { expectedUse: 'access' })
    ).rejects.toThrow(/token_use/);
  });
});

describe('getPublicJWK', () => {
  it('returns a JWK with the expected RSA fields', async () => {
    const jwk = await getPublicJWK();
    expect(jwk.kty).toBe('RSA');
    expect(typeof jwk.n).toBe('string');
    expect(jwk.e).toBe('AQAB');
    expect(jwk.alg).toBe('RS256');
    expect(jwk.use).toBe('sig');
    expect(typeof jwk.kid).toBe('string');
    expect(jwk.kid.length).toBeGreaterThan(0);
  });

  it('does NOT contain private key fields', async () => {
    const jwk = await getPublicJWK();
    expect(jwk.d).toBeUndefined();
    expect(jwk.p).toBeUndefined();
    expect(jwk.q).toBeUndefined();
  });
});

describe('PEM env var normalization', () => {
  it('accepts PEM keys with literal "\\n" sequences (single-line .env style)', async () => {
    const escapedPrivate = TEST_PRIVATE_KEY_PEM.replace(/\n/g, '\\n');
    const escapedPublic = TEST_PUBLIC_KEY_PEM.replace(/\n/g, '\\n');

    expect(escapedPrivate).not.toContain('\n');
    expect(escapedPublic).not.toContain('\n');

    const originalPrivate = process.env.JWT_PRIVATE_KEY;
    const originalPublic = process.env.JWT_PUBLIC_KEY;
    process.env.JWT_PRIVATE_KEY = escapedPrivate;
    process.env.JWT_PUBLIC_KEY = escapedPublic;

    try {
      jest.resetModules();
      const jwtModule = await import('../lib/jwt.js');
      const token = await jwtModule.signShortLivedJWT('escaped-pem-user');
      const payload = await jwtModule.verifyJWT(token, {
        expectedUse: 'auth_code',
      });
      expect(payload.sub).toBe('escaped-pem-user');
    } finally {
      process.env.JWT_PRIVATE_KEY = originalPrivate;
      process.env.JWT_PUBLIC_KEY = originalPublic;
      jest.resetModules();
    }
  });
});
