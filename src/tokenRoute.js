import { verifyJWT, signLongLivedJWT, TOKEN_USE_AUTH_CODE } from './lib/jwt';

export default async function tokenRoute(ctx) {
  const { code } = ctx.request.body;

  if (!code) {
    ctx.status = 400;
    ctx.body = { error: 'code is required' };
    return;
  }

  try {
    const payload = await verifyJWT(code, { expectedUse: TOKEN_USE_AUTH_CODE });
    const userId = payload.sub;
    const token = await signLongLivedJWT(userId);
    ctx.body = { token };
  } catch (err) {
    ctx.status = 401;
    ctx.body = { error: 'Invalid or expired code' };
  }
}
