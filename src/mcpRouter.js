import Router from 'koa-router';
import { isAllowedCallbackUrl } from './auth';
import { handleMcpRequest } from './mcpServer';
import { verifyJWT, signShortLivedJWT, TOKEN_USE_AUTH_CODE } from './lib/jwt';

const PROVIDERS = [
  ['google', 'Google', 'GOOGLE_CLIENT_ID'],
  ['facebook', 'Facebook', 'FACEBOOK_APP_ID'],
  ['github', 'GitHub', 'GITHUB_CLIENT_ID'],
  ['instagram', 'Instagram', 'INSTAGRAM_CLIENT_ID'],
];

const mcpRouter = new Router();

// MCP protocol endpoint
mcpRouter.all('/', handleMcpRequest);

// OAuth authorization: provider selection page
mcpRouter.get('/login', (ctx) => {
  const {
    response_type,
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
  } = ctx.query;

  if (response_type !== 'code' || !redirect_uri) {
    ctx.status = 400;
    ctx.body = { error: 'invalid_request' };
    return;
  }

  let redirectTo, stateParam;

  if (code_challenge) {
    // PKCE flow — any valid HTTP/HTTPS redirect_uri allowed
    if (code_challenge_method !== 'S256') {
      ctx.status = 400;
      ctx.body = {
        error: 'invalid_request',
        error_description: 'Only S256 code_challenge_method is supported',
      };
      return;
    }
    try {
      const u = new URL(redirect_uri);
      const isLoopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLoopback))
        throw new Error();
    } catch {
      ctx.status = 400;
      ctx.body = { error: 'invalid_request', error_description: 'invalid redirect_uri' };
      return;
    }

    const mcpState = Buffer.from(
      JSON.stringify({ r: redirect_uri, cc: code_challenge, os: state || '' })
    ).toString('base64url');

    const origin = process.env.API_ORIGIN || ctx.request.origin;
    redirectTo = `${origin}/mcp/callback`;
    stateParam = `&state=${encodeURIComponent(mcpState)}`;
  } else {
    // 1st party flow — redirect_uri must be whitelisted
    if (!isAllowedCallbackUrl(redirect_uri)) {
      ctx.status = 400;
      ctx.body = {
        error: 'invalid_request',
        error_description: 'redirect_uri not allowed',
      };
      return;
    }
    redirectTo = redirect_uri;
    stateParam = state ? `&state=${encodeURIComponent(state)}` : '';
  }

  const buttons = PROVIDERS.filter(([, , envKey]) => process.env[envKey])
    .map(
      ([id, label]) =>
        `<a href="/login/${id}?redirect_to=${encodeURIComponent(redirectTo)}${stateParam}" style="display:block;margin:8px 0;padding:12px 20px;background:#4285f4;color:#fff;text-decoration:none;border-radius:4px;text-align:center;font-family:sans-serif">${label}</a>`
    )
    .join('\n');

  ctx.type = 'text/html';
  ctx.body = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Log in to Cofacts</title></head>
<body style="font-family:sans-serif;max-width:360px;margin:80px auto;padding:20px">
  <h2 style="margin-bottom:24px">Log in to Cofacts</h2>
  ${buttons}
</body>
</html>`;
});

// Dynamic client registration (RFC 7591)
mcpRouter.post('/register', (ctx) => {
  const { redirect_uris = [], client_name } = ctx.request.body || {};
  ctx.status = 201;
  ctx.body = {
    client_id: 'mcp-public-client',
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris,
    client_name: client_name || 'MCP Client',
    grant_types: ['authorization_code'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
  };
});

// PKCE bounce: verifies incoming auth code, re-signs with code_challenge claim,
// then redirects to the actual MCP client callback URL.
mcpRouter.get('/callback', async (ctx) => {
  const { code, state } = ctx.query;

  let mcpState;
  try {
    mcpState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
  } catch {
    ctx.status = 400;
    ctx.body = { error: 'invalid_state' };
    return;
  }

  const { r: actualCb, cc: codeChallenge, os: originalState } = mcpState;

  try {
    const u = new URL(actualCb);
    const isLoopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLoopback))
      throw new Error();
  } catch {
    ctx.status = 400;
    ctx.body = { error: 'invalid_callback' };
    return;
  }

  let payload;
  try {
    payload = await verifyJWT(code, { expectedUse: TOKEN_USE_AUTH_CODE });
  } catch {
    ctx.status = 401;
    ctx.body = { error: 'invalid_code' };
    return;
  }

  const newCode = await signShortLivedJWT(payload.sub, { codeChallenge });
  const redirectUrl = new URL(actualCb);
  redirectUrl.searchParams.set('code', newCode);
  if (originalState) redirectUrl.searchParams.set('state', originalState);
  ctx.redirect(redirectUrl.href);
});

export default mcpRouter;
