#!/usr/bin/env node

/**
 * BFF Auth Integration Test Script
 *
 * Tests the full BFF authorization code flow:
 *   1. Opens browser → GET /login/github?redirect_to=<local>&state=<state>
 *   2. Local HTTP server catches the callback with ?code=<JWT>&state=<state>
 *   3. POST /auth/token { code } → { token }
 *   4. POST /graphql with Authorization: Bearer <token> → authenticated query
 *
 * Prerequisites:
 *   - rumors-api running locally (npm start / docker-compose up)
 *   - .env has GITHUB_CLIENT_ID, GITHUB_SECRET, GITHUB_CALLBACK_URL set
 *   - .env has JWT_SECRET set (≥32 chars)
 *   - .env has ALLOWED_CALLBACK_URLS containing http://localhost:<CALLBACK_PORT>/callback
 *
 * Usage:
 *   node test-bff-flow.mjs
 *   node test-bff-flow.mjs --api-port 5000 --callback-port 3987
 */

import http from 'node:http';
import { execSync } from 'node:child_process';
import { URL } from 'node:url';

// ─── Config ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name, defaultVal) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
}

const API_PORT = getArg('api-port', '5000');
const CALLBACK_PORT = getArg('callback-port', '3987');
const API_BASE = `http://localhost:${API_PORT}`;
const CALLBACK_URL = `http://localhost:${CALLBACK_PORT}/callback`;
const STATE = '/article/test-' + Date.now();
const PROVIDER = getArg('provider', 'github');

// ─── Helpers ───────────────────────────────────────────────────────────────
const log = (label, msg) => console.log(`\x1b[36m[${label}]\x1b[0m ${msg}`);
const ok = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const fail = (msg) => { console.error(`\x1b[31m✗\x1b[0m ${msg}`); process.exit(1); };

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') execSync(`open "${url}"`);
    else if (platform === 'win32') execSync(`start "" "${url}"`);
    else execSync(`xdg-open "${url}"`);
  } catch {
    log('BROWSER', `Auto-open failed. Please open manually:\n  ${url}`);
  }
}

// ─── Step 1: Start local callback server ───────────────────────────────────
log('SETUP', `Starting callback server on port ${CALLBACK_PORT}...`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${CALLBACK_PORT}`);

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  log('CALLBACK', `Received callback`);
  log('CALLBACK', `  code  = ${code ? code.slice(0, 30) + '...' : '(none)'}`);
  log('CALLBACK', `  state = ${state}`);

  if (!code) {
    fail('No code received in callback!');
  }

  // Respond to browser immediately
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <html><body style="font-family:monospace;padding:2em;">
      <h2>✓ Code received!</h2>
      <p><b>code:</b> ${code.slice(0, 40)}...</p>
      <p><b>state:</b> ${state}</p>
      <p>Check terminal for token exchange & GraphQL results.</p>
    </body></html>
  `);

  // ─── Step 2: Exchange code for token ───────────────────────────────────
  try {
    log('TOKEN', `POST ${API_BASE}/auth/token`);
    const tokenRes = await fetch(`${API_BASE}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const tokenBody = await tokenRes.json();
    log('TOKEN', `Status: ${tokenRes.status}`);
    log('TOKEN', `Response: ${JSON.stringify(tokenBody)}`);

    if (tokenRes.status !== 200 || !tokenBody.token) {
      fail(`Token exchange failed: ${JSON.stringify(tokenBody)}`);
    }
    ok('Token exchange successful');

    const longLivedToken = tokenBody.token;

    // ─── Step 3: GraphQL query with Bearer token ─────────────────────────
    log('GRAPHQL', `POST ${API_BASE}/graphql with Bearer token`);
    const gqlRes = await fetch(`${API_BASE}/graphql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${longLivedToken}`,
        'x-app-id': 'RUMORS_SITE',
      },
      body: JSON.stringify({
        query: `{
          GetUser {
            id
            name
            avatarUrl
          }
        }`,
      }),
    });

    const gqlBody = await gqlRes.json();
    log('GRAPHQL', `Status: ${gqlRes.status}`);
    log('GRAPHQL', `Response: ${JSON.stringify(gqlBody, null, 2)}`);

    if (gqlBody.data?.GetUser?.id) {
      ok(`Authenticated as user: ${gqlBody.data.GetUser.name || gqlBody.data.GetUser.id}`);
    } else {
      fail(`GraphQL returned no user: ${JSON.stringify(gqlBody)}`);
    }

    // ─── Step 4: Verify state round-trip ─────────────────────────────────
    if (state === STATE) {
      ok(`State round-trip: "${state}"`);
    } else {
      fail(`State mismatch: sent "${STATE}", got "${state}"`);
    }

    // ─── Step 5: Test expired code reuse ─────────────────────────────────
    log('EDGE', 'Waiting 31s for short-lived JWT to expire, then retrying token exchange...');
    await new Promise((r) => setTimeout(r, 31000));

    const expiredRes = await fetch(`${API_BASE}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const expiredBody = await expiredRes.json();
    log('EDGE', `Expired code status: ${expiredRes.status}`);

    if (expiredRes.status === 401) {
      ok('Expired code correctly rejected');
    } else {
      fail(`Expected 401 for expired code, got ${expiredRes.status}`);
    }

    // ─── Summary ─────────────────────────────────────────────────────────
    console.log('\n' + '═'.repeat(50));
    ok('ALL TESTS PASSED');
    console.log('═'.repeat(50));
    console.log(`\nTokens for manual testing:\n`);
    console.log(`Long-lived JWT:\n  ${longLivedToken}\n`);
    console.log(`curl example:`);
    console.log(`  curl -X POST ${API_BASE}/graphql \\`);
    console.log(`    -H 'Content-Type: application/json' \\`);
    console.log(`    -H 'Authorization: Bearer ${longLivedToken}' \\`);
    console.log(`    -H 'x-app-id: RUMORS_SITE' \\`);
    console.log(`    -d '{"query":"{ GetUser { id name } }"}'`);

  } catch (err) {
    fail(`Error: ${err.message}`);
  } finally {
    server.close();
  }
});

server.listen(CALLBACK_PORT, () => {
  ok(`Callback server listening on ${CALLBACK_URL}`);

  // ─── Open browser to start OAuth ──────────────────────────────────────
  const loginUrl = `${API_BASE}/login/${PROVIDER}?redirect_to=${encodeURIComponent(CALLBACK_URL)}&state=${encodeURIComponent(STATE)}`;

  console.log('\n' + '─'.repeat(50));
  log('LOGIN', `Opening browser for ${PROVIDER.toUpperCase()} OAuth...`);
  log('LOGIN', `URL: ${loginUrl}`);
  console.log('─'.repeat(50) + '\n');
  log('LOGIN', 'Complete the OAuth login in your browser.');
  log('LOGIN', 'The script will automatically continue after redirect.\n');

  openBrowser(loginUrl);
});

// Timeout after 2 minutes
setTimeout(() => {
  fail('Timeout: No callback received within 2 minutes');
}, 120000);
