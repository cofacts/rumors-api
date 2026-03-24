import { SignJWT } from 'jose';

// Set JWT_SECRET before any module imports
process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-ok';

let signShortLivedJWT;
let signLongLivedJWT;
let verifyJWT;

beforeAll(async () => {
  // Use dynamic import after JWT_SECRET is set
  const jwtModule = await import('../lib/jwt.js');
  signShortLivedJWT = jwtModule.signShortLivedJWT;
  signLongLivedJWT = jwtModule.signLongLivedJWT;
  verifyJWT = jwtModule.verifyJWT;
});

describe('signShortLivedJWT', () => {
  it('returns a JWT string with 3 dot-separated parts', async () => {
    const token = await signShortLivedJWT('test-user-123');
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    expect(typeof token).toBe('string');
  });

  it('has correct sub claim', async () => {
    const userId = 'test-user-456';
    const token = await signShortLivedJWT(userId);
    const payload = await verifyJWT(token);
    expect(payload.sub).toBe(userId);
  });

  it('has 30 second expiry (exp - iat === 30)', async () => {
    const token = await signShortLivedJWT('test-user-789');
    const payload = await verifyJWT(token);
    expect(payload.exp - payload.iat).toBe(30);
  });
});

describe('signLongLivedJWT', () => {
  it('returns a JWT string with 3 dot-separated parts', async () => {
    const token = await signLongLivedJWT('test-user-123');
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    expect(typeof token).toBe('string');
  });

  it('has correct sub claim', async () => {
    const userId = 'test-user-999';
    const token = await signLongLivedJWT(userId);
    const payload = await verifyJWT(token);
    expect(payload.sub).toBe(userId);
  });

  it('has COOKIE_MAXAGE expiry (default 14 days = 1209600s)', async () => {
    // Default COOKIE_MAXAGE is 1209600000ms = 1209600s
    const token = await signLongLivedJWT('test-user-long');
    const payload = await verifyJWT(token);
    expect(payload.exp - payload.iat).toBe(1209600);
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

  it('throws for expired token', async () => {
    const secret = new TextEncoder().encode('test-secret-at-least-32-chars-long-ok');
    const expiredToken = await new SignJWT({ sub: 'test-user-expired' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1s')
      .sign(secret);

    // Wait for token to expire
    await new Promise(resolve => setTimeout(resolve, 1100));

    await expect(verifyJWT(expiredToken)).rejects.toThrow();
  });

  it('throws for token signed with wrong secret', async () => {
    const wrongSecret = new TextEncoder().encode('wrong-secret-at-least-32-chars-long');
    const wrongToken = await new SignJWT({ sub: 'test-user-wrong' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30s')
      .sign(wrongSecret);

    await expect(verifyJWT(wrongToken)).rejects.toThrow();
  });

  it('throws for malformed string', async () => {
    await expect(verifyJWT('not.a.jwt')).rejects.toThrow();
  });
});
