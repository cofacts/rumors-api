import {
  verifyJWT,
  signLongLivedJWT,
  TOKEN_USE_AUTH_CODE,
  getCookieMaxAgeSec,
} from './lib/jwt';

export default async function tokenRoute(ctx) {
  const { code } = ctx.request.body;

  if (!code) {
    ctx.status = 400;
    ctx.body = { error: 'code is required' };
    return;
  }

  let payload;
  try {
    payload = await verifyJWT(code, { expectedUse: TOKEN_USE_AUTH_CODE });
  } catch (err) {
    ctx.status = 401;
    ctx.body = { error: 'Invalid or expired code' };
    return;
  }

  const userId = payload.sub;
  const token = await signLongLivedJWT(userId);
  const maxAgeSec = getCookieMaxAgeSec();
  ctx.body = {
    // Legacy
    token,

    // OAuth2 compatible
    access_token: token,
    token_type: 'Bearer',
    expires_in: maxAgeSec,
  };
}
