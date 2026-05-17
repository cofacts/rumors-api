import path from 'path';
import type { Context } from 'koa';
import Router from 'koa-router';
import pug from 'pug';
import { handleMcpRequest } from './mcpServer';
import { verifyJWT, signShortLivedJWT, TOKEN_USE_AUTH_CODE } from './lib/jwt';

const renderMcpLogin = pug.compileFile(
  path.join(__dirname, 'jade/mcpLogin.jade')
);

/**
 * Payload embedded as base64url-encoded JSON in the OAuth `state` parameter
 * during the PKCE bounce flow. Carries the context needed to complete the
 * redirect after the social login provider returns to /mcp/callback.
 */
interface McpState {
  /** Actual redirect URI registered by the MCP client (final destination after auth). */
  r: string;
  /** PKCE code_challenge sent by the MCP client at the start of the flow. */
  cc: string;
  /** Original `state` value sent by the MCP client; forwarded unchanged to the redirect URI. */
  os: string;
}

const PROVIDERS: [string, string, string][] = [
  ['google', 'Google', 'GOOGLE_CLIENT_ID'],
  ['facebook', 'Facebook', 'FACEBOOK_APP_ID'],
  ['github', 'GitHub', 'GITHUB_CLIENT_ID'],
  ['instagram', 'Instagram', 'INSTAGRAM_CLIENT_ID'],
];

const mcpRouter = new Router();

// MCP protocol endpoint
mcpRouter.all('/', handleMcpRequest);

// OAuth authorization: provider selection page
mcpRouter.get('/login', (ctx: Context) => {
  const response_type = ctx.query.response_type as string | undefined;
  const redirect_uri = ctx.query.redirect_uri as string | undefined;
  const state = ctx.query.state as string | undefined;
  const code_challenge = ctx.query.code_challenge as string | undefined;
  const code_challenge_method = ctx.query.code_challenge_method as
    | string
    | undefined;

  const renderError = (description: string) => {
    ctx.status = 400;
    ctx.type = 'text/html';
    ctx.body = renderMcpLogin({ error: description });
  };

  if (response_type !== 'code' || !redirect_uri || !code_challenge) {
    return renderError('Invalid request: missing required parameters.');
  }

  if (code_challenge_method !== 'S256') {
    return renderError(
      'Invalid request: only S256 code_challenge_method is supported.'
    );
  }

  try {
    const u = new URL(redirect_uri);
    const isLoopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLoopback))
      throw new Error();
  } catch {
    return renderError(
      'Invalid request: redirect_uri must be a loopback address or HTTPS URL.'
    );
  }

  const mcpState = Buffer.from(
    JSON.stringify({ r: redirect_uri, cc: code_challenge, os: state || '' })
  ).toString('base64url');

  const origin = process.env.API_ORIGIN || ctx.request.origin;
  const redirectTo = `${origin}/mcp/callback`;
  const stateParam = `&state=${encodeURIComponent(mcpState)}`;

  const providers = PROVIDERS.filter(([, , envKey]) => process.env[envKey]).map(
    ([id, label]) => ({
      id,
      label,
      href: `/login/${id}?redirect_to=${encodeURIComponent(
        redirectTo
      )}${stateParam}`,
    })
  );

  ctx.type = 'text/html';
  ctx.body = renderMcpLogin({ providers });
});

// Dynamic client registration (RFC 7591).
// MCP clients (Claude Code, Cursor, etc.) call this before starting the OAuth
// flow to obtain a client_id. We don't persist registrations — all clients
// share the same fixed client_id — because PKCE already binds the token
// exchange to the original requester, making per-client registration
// unnecessary for security. The endpoint exists solely so clients don't stall
// when they expect a registration_endpoint in the OAuth metadata.
mcpRouter.post('/register', (ctx: Context) => {
  const { redirect_uris = [], client_name } =
    (ctx.request.body as {
      /** Redirect URIs the client intends to use (RFC 7591 §2). */
      redirect_uris?: string[];
      /** Human-readable name for the client application. */
      client_name?: string;
    }) || {};

  console.log(
    JSON.stringify({
      msg: 'MCP client registration',
      client_name: client_name || null,
      redirect_uris,
    })
  );

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
mcpRouter.get('/callback', async (ctx: Context) => {
  const code = ctx.query.code as string | undefined;
  const state = ctx.query.state as string | undefined;

  let mcpState: McpState;
  try {
    mcpState = JSON.parse(
      Buffer.from(state as string, 'base64url').toString('utf-8')
    ) as McpState;
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
    payload = await verifyJWT(code as string, {
      expectedUse: TOKEN_USE_AUTH_CODE,
    });
  } catch {
    ctx.status = 401;
    ctx.body = { error: 'invalid_code' };
    return;
  }

  const newCode = await signShortLivedJWT(payload.sub as string, {
    codeChallenge,
  });
  const redirectUrl = new URL(actualCb);
  redirectUrl.searchParams.set('code', newCode);
  if (originalState) redirectUrl.searchParams.set('state', originalState);
  ctx.redirect(redirectUrl.href);
});

export default mcpRouter;
