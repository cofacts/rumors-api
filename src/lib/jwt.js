import { SignJWT, jwtVerify } from 'jose';

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env var is required');
}

const getSecret = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function signShortLivedJWT(userId) {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30s')
    .sign(getSecret());
}

export async function signLongLivedJWT(userId) {
  const cookieMaxAgeMs = process.env.COOKIE_MAXAGE
    ? Number(process.env.COOKIE_MAXAGE)
    : 1209600000;
  const cookieMaxAgeSec = Math.floor(cookieMaxAgeMs / 1000);
  
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${cookieMaxAgeSec}s`)
    .sign(getSecret());
}

export async function verifyJWT(token) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload;
}
