process.env.JWT_SECRET = 'test-secret-at-least-32-chars-long-ok';
process.env.ALLOWED_CALLBACK_URLS =
  'https://cofacts.ai/callback,http://localhost:3000/callback';

jest.mock('util/client', () => ({
  __esModule: true,
  default: {},
  processMeta: jest.fn(),
  getTotalCount: jest.fn(),
}));

import { loginRouter, authRouter } from '../auth';
import { verifyJWT } from '../lib/jwt';

function makeCtx(overrides = {}) {
  return {
    query: {},
    session: {},
    state: { user: {} },
    redirect: jest.fn(),
    request: { headers: {} },
    get: jest.fn(() => ''),
    ...overrides,
  };
}

describe('loginRouter middleware', () => {
  let loginMiddleware;

  beforeAll(() => {
    loginMiddleware = loginRouter.stack[0].stack[0];
  });

  it('stores redirectTo + state in session when redirect_to is in ALLOWED_CALLBACK_URLS', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      query: {
        redirect_to: 'https://cofacts.ai/callback',
        state: 'my-state-123',
      },
    });

    await loginMiddleware(ctx, next);

    expect(ctx.session.redirectTo).toBe('https://cofacts.ai/callback');
    expect(ctx.session.state).toBe('my-state-123');
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

  it('proceeds (state optional) when redirect_to is valid but state is absent', async () => {
    const next = jest.fn().mockResolvedValue(undefined);
    const ctx = makeCtx({
      query: {
        redirect_to: 'http://localhost:3000/callback',
      },
    });

    await loginMiddleware(ctx, next);

    expect(ctx.session.redirectTo).toBe('http://localhost:3000/callback');
    expect(ctx.session.state).toBeUndefined();
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
    const state = 'oauth-state-xyz';

    const ctx = makeCtx({
      session: {
        redirectTo: 'https://cofacts.ai/callback',
        state,
      },
      state: { user: { userId } },
    });

    const next = jest.fn().mockResolvedValue(undefined);

    await authMiddleware(ctx, next);

    expect(ctx.redirect).toHaveBeenCalledTimes(1);
    const redirectedUrl = ctx.redirect.mock.calls[0][0];
    const url = new URL(redirectedUrl);
    expect(url.origin + url.pathname).toBe('https://cofacts.ai/callback');
    expect(url.searchParams.get('state')).toBe(state);
    expect(url.searchParams.get('code')).toBeTruthy();
  });

  it('the code param is a valid short-lived JWT containing the userId', async () => {
    const userId = 'user-jwt-test-456';

    const ctx = makeCtx({
      session: {
        redirectTo: 'https://cofacts.ai/callback',
        state: 'some-state',
      },
      state: { user: { userId } },
    });

    const next = jest.fn().mockResolvedValue(undefined);

    await authMiddleware(ctx, next);

    const redirectedUrl = ctx.redirect.mock.calls[0][0];
    const url = new URL(redirectedUrl);
    const code = url.searchParams.get('code');

    const payload = await verifyJWT(code);
    expect(payload.sub).toBe(userId);

    const ttl = payload.exp - payload.iat;
    expect(ttl).toBeGreaterThanOrEqual(28);
    expect(ttl).toBeLessThanOrEqual(32);
  });

  it('clears session.redirectTo and session.state after redirect', async () => {
    const ctx = makeCtx({
      session: {
        redirectTo: 'https://cofacts.ai/callback',
        state: 'state-to-clear',
        appId: 'SOME_APP',
      },
      state: { user: { userId: 'user-clear-test' } },
    });

    const next = jest.fn().mockResolvedValue(undefined);

    await authMiddleware(ctx, next);

    expect(ctx.session.redirectTo).toBeUndefined();
    expect(ctx.session.state).toBeUndefined();
    expect(ctx.session.appId).toBeUndefined();
  });

  it('throws 400 when neither session.redirect+appId nor session.redirectTo is set', async () => {
    const ctx = makeCtx({
      session: {},
      state: { user: { userId: 'user-no-session' } },
    });

    const next = jest.fn();

    await expect(authMiddleware(ctx, next)).rejects.toMatchObject({
      status: 400,
    });
    expect(next).not.toHaveBeenCalled();
  });
});
