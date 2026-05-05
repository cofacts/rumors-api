import {
  TEST_PRIVATE_KEY_PEM,
  TEST_PUBLIC_KEY_PEM,
} from '../__fixtures__/test-keys.js';

process.env.JWT_PRIVATE_KEY = TEST_PRIVATE_KEY_PEM;
process.env.JWT_PUBLIC_KEY = TEST_PUBLIC_KEY_PEM;
process.env.ALLOWED_CALLBACK_URLS =
  'https://cofacts.ai/callback,http://localhost:3000/callback';

jest.mock('util/client', () => ({
  __esModule: true,
  default: {},
  processMeta: jest.fn(),
  getTotalCount: jest.fn(),
}));

// Mock passport so provider route tests can assert the options passed to
// passport.authenticate() without triggering a real OAuth round-trip.
jest.mock('koa-passport', () => {
  const passportMock = {
    authenticate: jest.fn(() => jest.fn()),
    serializeUser: jest.fn(),
    deserializeUser: jest.fn(),
    use: jest.fn(),
  };
  return { default: passportMock, ...passportMock };
});

import { loginRouter, authRouter } from '../auth';
import { verifyJWT } from '../lib/jwt';
import passport from 'koa-passport';

function makeCtx(overrides = {}) {
  return {
    query: {},
    session: {},
    state: { user: {} },
    redirect: jest.fn(),
    request: { headers: {} },
    get: jest.fn(() => ''),
    secure: false,
    ...overrides,
  };
}

function encodeBffState({ r, s = '' }) {
  return Buffer.from(JSON.stringify({ r, s })).toString('base64url');
}

describe('loginRouter middleware', () => {
  let loginMiddleware;

  beforeAll(() => {
    loginMiddleware = loginRouter.stack[0].stack[0];
  });

  it('stores bffInfo in ctx.state (not session) when redirect_to is in ALLOWED_CALLBACK_URLS', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      query: {
        redirect_to: 'https://cofacts.ai/callback',
        state: 'my-state-123',
      },
    });

    await loginMiddleware(ctx, next);

    expect(ctx.state.bffInfo).toEqual({
      r: 'https://cofacts.ai/callback',
      s: 'my-state-123',
    });
    // Must NOT touch legacy session
    expect(ctx.session.redirectTo).toBeUndefined();
    expect(ctx.session.state).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 400 when redirect_to is NOT in ALLOWED_CALLBACK_URLS', async () => {
    const next = jest.fn();
    const ctx = makeCtx({
      query: {
        redirect_to: 'https://evil.com/callback',
      },
    });

    await expect(
      Promise.resolve().then(() => loginMiddleware(ctx, next))
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts redirect_to matching ALLOWED_CALLBACK_PATTERN', async () => {
    const prev = process.env.ALLOWED_CALLBACK_PATTERN;
    process.env.ALLOWED_CALLBACK_PATTERN =
      'https://pr-\\d+---cofacts-ai-sgnrxas52q-de\\.a\\.run\\.app/api/auth/callback';

    const next = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      query: {
        redirect_to:
          'https://pr-99---cofacts-ai-sgnrxas52q-de.a.run.app/api/auth/callback',
        state: 'st',
      },
    });

    await loginMiddleware(ctx, next);

    expect(ctx.state.bffInfo.r).toBe(
      'https://pr-99---cofacts-ai-sgnrxas52q-de.a.run.app/api/auth/callback'
    );
    expect(ctx.session.redirectTo).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    process.env.ALLOWED_CALLBACK_PATTERN = prev;
  });

  it('throws 400 when redirect_to does not match ALLOWED_CALLBACK_PATTERN', async () => {
    const prev = process.env.ALLOWED_CALLBACK_PATTERN;
    process.env.ALLOWED_CALLBACK_PATTERN =
      'https://pr-\\d+---cofacts-ai-sgnrxas52q-de\\.a\\.run\\.app/api/auth/callback';

    const next = jest.fn();
    const ctx = makeCtx({
      query: {
        redirect_to: 'https://evil.com/api/auth/callback',
      },
    });

    await expect(
      Promise.resolve().then(() => loginMiddleware(ctx, next))
    ).rejects.toMatchObject({ status: 400 });
    expect(next).not.toHaveBeenCalled();
    process.env.ALLOWED_CALLBACK_PATTERN = prev;
  });

  it('sets bffInfo.s to empty string when state is absent', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      query: {
        redirect_to: 'http://localhost:3000/callback',
      },
    });

    await loginMiddleware(ctx, next);

    expect(ctx.state.bffInfo.r).toBe('http://localhost:3000/callback');
    expect(ctx.state.bffInfo.s).toBe('');
    expect(ctx.session.redirectTo).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('stores redirect in session (legacy) when redirect starts with /', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      query: {
        redirect: '/some-path',
        appId: 'TEST_APP',
      },
      get: jest.fn(() => 'https://example.com/page'),
    });

    await loginMiddleware(ctx, next);

    expect(ctx.session.redirect).toBe('/some-path');
    expect(ctx.session.appId).toBe('TEST_APP');
    expect(ctx.state.bffInfo).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('throws 400 when neither redirect nor redirect_to is present', async () => {
    const next = jest.fn();
    const ctx = makeCtx({ query: {} });

    await expect(
      Promise.resolve().then(() => loginMiddleware(ctx, next))
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('authRouter middleware', () => {
  let authMiddleware;

  beforeAll(() => {
    authMiddleware = authRouter.stack[0].stack[0];
  });

  it('redirects to redirectTo with code and state after passport callback', async () => {
    const userId = 'user-abc-123';
    const clientState = 'oauth-state-xyz';

    const ctx = makeCtx({
      query: {
        state: encodeBffState({
          r: 'https://cofacts.ai/callback',
          s: clientState,
        }),
      },
      state: { user: { id: userId } },
    });

    const next = jest.fn().mockResolvedValue(undefined);

    await authMiddleware(ctx, next);

    expect(ctx.redirect).toHaveBeenCalledTimes(1);
    const redirectedUrl = ctx.redirect.mock.calls[0][0];
    const url = new URL(redirectedUrl);
    expect(url.origin + url.pathname).toBe('https://cofacts.ai/callback');
    expect(url.searchParams.get('state')).toBe(clientState);
    expect(url.searchParams.get('code')).toBeTruthy();
  });

  it('the code param is a valid short-lived JWT containing the userId', async () => {
    const userId = 'user-jwt-test-456';

    const ctx = makeCtx({
      query: {
        state: encodeBffState({
          r: 'https://cofacts.ai/callback',
          s: 'some-state',
        }),
      },
      state: { user: { id: userId } },
    });

    const next = jest.fn().mockResolvedValue(undefined);

    await authMiddleware(ctx, next);

    const redirectedUrl = ctx.redirect.mock.calls[0][0];
    const url = new URL(redirectedUrl);
    const code = url.searchParams.get('code');

    const payload = await verifyJWT(code);
    expect(payload.sub).toBe(userId);

    const ttl = payload.exp - payload.iat;
    expect(ttl).toBeGreaterThanOrEqual(58);
    expect(ttl).toBeLessThanOrEqual(62);
  });

  it('does not mutate legacy session fields during BFF redirect', async () => {
    const ctx = makeCtx({
      query: {
        state: encodeBffState({ r: 'https://cofacts.ai/callback', s: 'st' }),
      },
      session: {
        appId: 'RUMORS_SITE',
        redirect: '/existing-legacy-redirect',
      },
      state: { user: { id: 'user-isolation-test' } },
    });

    const next = jest.fn().mockResolvedValue(undefined);

    await authMiddleware(ctx, next);

    // Legacy session must be left completely intact
    expect(ctx.session.appId).toBe('RUMORS_SITE');
    expect(ctx.session.redirect).toBe('/existing-legacy-redirect');
  });

  it('throws 400 when neither BFF state nor legacy session fields are set', async () => {
    const ctx = makeCtx({
      session: {},
      state: { user: { id: 'user-no-session' } },
    });

    const next = jest.fn();

    await expect(authMiddleware(ctx, next)).rejects.toMatchObject({
      status: 400,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('throws 401 when authenticated user object has no id (does not mint JWT with undefined sub)', async () => {
    const ctx = makeCtx({
      query: {
        state: encodeBffState({ r: 'https://cofacts.ai/callback' }),
      },
      state: { user: {} },
    });

    const next = jest.fn().mockResolvedValue(undefined);

    await expect(authMiddleware(ctx, next)).rejects.toMatchObject({
      status: 401,
    });
    expect(ctx.redirect).not.toHaveBeenCalled();
  });
});

describe('loginRouter provider routes — BFF composite state forwarding', () => {
  // loginRouter stack: [0] use-middleware, [1] facebook, [2] twitter,
  //                    [3] github, [4] google, [5] instagram
  const PROVIDERS = [
    { name: 'facebook', stackIndex: 1 },
    { name: 'github', stackIndex: 3 },
    { name: 'google', stackIndex: 4 },
  ];

  beforeEach(() => {
    passport.authenticate.mockClear();
    // Return a no-op middleware so the route handler doesn't throw
    passport.authenticate.mockReturnValue(jest.fn());
  });

  for (const { name, stackIndex } of PROVIDERS) {
    it(`${name}: passes encoded BFF state to passport.authenticate when ctx.state.bffInfo is set`, async () => {
      const bffInfo = {
        r: 'https://cofacts.ai/callback',
        s: 'client-state',
      };
      const ctx = makeCtx({ state: { bffInfo } });
      const next = jest.fn();

      const routeHandler = loginRouter.stack[stackIndex].stack[0];
      await routeHandler(ctx, next);

      expect(passport.authenticate).toHaveBeenCalledTimes(1);
      const [, options] = passport.authenticate.mock.calls[0];
      expect(options.state).toBe(
        Buffer.from(JSON.stringify(bffInfo)).toString('base64url')
      );
    });

    it(`${name}: omits state option when ctx.state.bffInfo is absent (legacy flow)`, async () => {
      const ctx = makeCtx({ state: {} });
      const next = jest.fn();

      const routeHandler = loginRouter.stack[stackIndex].stack[0];
      await routeHandler(ctx, next);

      expect(passport.authenticate).toHaveBeenCalledTimes(1);
      const [, options] = passport.authenticate.mock.calls[0];
      expect(options.state).toBeUndefined();
    });
  }
});
