import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  exportJWK,
  calculateJwkThumbprint,
} from 'jose';

const ALG = 'RS256';

// Normalize literal "\n" to LF for PEM strings stored in single-line .env values.
function normalizePem(value) {
  return value.replace(/\\n/g, '\n');
}

let cachedPrivateKey = null;
let cachedPublicKey = null;
let cachedPublicJWK = null;

async function getPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;
  if (!process.env.JWT_PRIVATE_KEY) {
    throw new Error('JWT_PRIVATE_KEY env var is required');
  }
  cachedPrivateKey = await importPKCS8(
    normalizePem(process.env.JWT_PRIVATE_KEY),
    ALG
  );
  return cachedPrivateKey;
}

async function getPublicKey() {
  if (cachedPublicKey) return cachedPublicKey;
  if (!process.env.JWT_PUBLIC_KEY) {
    throw new Error('JWT_PUBLIC_KEY env var is required');
  }
  cachedPublicKey = await importSPKI(
    normalizePem(process.env.JWT_PUBLIC_KEY),
    ALG
  );
  return cachedPublicKey;
}

/**
 * Returns the public key as a JWK with `kid` (RFC 7638 thumbprint),
 * `alg`, and `use` fields populated. Suitable for JWKS endpoint response.
 */
export async function getPublicJWK() {
  if (cachedPublicJWK) return cachedPublicJWK;
  const publicKey = await getPublicKey();
  const jwk = await exportJWK(publicKey);
  jwk.alg = ALG;
  jwk.use = 'sig';
  jwk.kid = await calculateJwkThumbprint(jwk);
  cachedPublicJWK = jwk;
  return cachedPublicJWK;
}

async function getKid() {
  const jwk = await getPublicJWK();
  return jwk.kid;
}

// `token_use` claim values — distinguishes the two token types so that a
// long-lived access token cannot be replayed as an authorization code, and a
// short-lived authorization code cannot be replayed as an access token.
export const TOKEN_USE_AUTH_CODE = 'auth_code';
export const TOKEN_USE_ACCESS = 'access';

export async function signShortLivedJWT(userId) {
  const privateKey = await getPrivateKey();
  const kid = await getKid();
  return new SignJWT({ sub: userId, token_use: TOKEN_USE_AUTH_CODE })
    .setProtectedHeader({ alg: ALG, kid })
    .setIssuedAt()
    .setExpirationTime('60s')
    .sign(privateKey);
}

export async function signLongLivedJWT(userId) {
  const cookieMaxAgeMs = process.env.COOKIE_MAXAGE
    ? Number(process.env.COOKIE_MAXAGE)
    : 1209600000;
  const cookieMaxAgeSec = Math.floor(cookieMaxAgeMs / 1000);

  const privateKey = await getPrivateKey();
  const kid = await getKid();
  return new SignJWT({ sub: userId, token_use: TOKEN_USE_ACCESS })
    .setProtectedHeader({ alg: ALG, kid })
    .setIssuedAt()
    .setExpirationTime(`${cookieMaxAgeSec}s`)
    .sign(privateKey);
}

/**
 * Verify a JWT against the local public key.
 *
 * @param {string} token  The JWT to verify.
 * @param {object} [options]
 * @param {string} [options.expectedUse]  Required `token_use` claim. If
 *   provided, the token must have a matching `token_use` claim or
 *   verification fails. Pass `TOKEN_USE_AUTH_CODE` at the /auth/token
 *   endpoint and `TOKEN_USE_ACCESS` for Bearer-authenticated GraphQL/API
 *   requests so the two token types cannot be substituted for each other.
 *   Omit only at boundaries that legitimately accept either kind.
 */
export async function verifyJWT(token, { expectedUse } = {}) {
  const publicKey = await getPublicKey();
  // Lock down algorithm to prevent algorithm-confusion attacks
  const { payload } = await jwtVerify(token, publicKey, { algorithms: [ALG] });
  if (expectedUse !== undefined && payload.token_use !== expectedUse) {
    throw new Error(
      `Unexpected token_use: expected "${expectedUse}", got "${payload.token_use}"`
    );
  }
  return payload;
}
