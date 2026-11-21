import checkHeaders from '../checkHeaders';

const SECRET = 'test-line-bot-secret';

/**
 * @param {Record<string, string>} headers - lower-cased header name -> value
 */
async function runCheckHeaders(headers) {
  const ctx = {
    method: 'POST',
    get: (name) => headers[name.toLowerCase()] ?? '',
    set: () => {},
    vary: () => {},
    response: { headers: {} },
  };
  const next = jest.fn();
  await checkHeaders()(ctx, next);
  expect(next).toHaveBeenCalled();
  return ctx;
}

describe('checkHeaders', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      HTTP_HEADER_APP_SECRET: 'x-app-secret',
      HTTP_HEADER_APP_ID: 'x-app-id',
      RUMORS_LINE_BOT_SECRET: SECRET,
      RUMORS_SITE_CORS_ORIGIN: 'http://site.test',
      RUMORS_LINE_BOT_CORS_ORIGIN: 'http://liff.test',
    };
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('marks app secret verified only when secret matches', async () => {
    const ctx = await runCheckHeaders({ 'x-app-secret': SECRET });
    expect(ctx.appId).toBe('RUMORS_LINE_BOT');
    expect(ctx.isAppSecretVerified).toBe(true);
  });

  it.each([
    ['wrong secret', { 'x-app-secret': 'wrong' }, 'DEVELOPMENT_BACKEND'],
    ['site app id', { 'x-app-id': 'RUMORS_SITE' }, 'WEBSITE'],
    ['LIFF app id', { 'x-app-id': 'RUMORS_LINE_BOT' }, 'RUMORS_LINE_BOT'],
    ['no headers', {}, 'DEVELOPMENT_FRONTEND'],
  ])('does not verify app secret for %s', async (_, headers, appId) => {
    const ctx = await runCheckHeaders(headers);
    expect(ctx.appId).toBe(appId);
    expect(ctx.isAppSecretVerified).toBeFalsy();
  });

  it('does not verify when server secret is not configured', async () => {
    process.env.RUMORS_LINE_BOT_SECRET = '';
    const ctx = await runCheckHeaders({ 'x-app-secret': 'anything' });
    expect(ctx.isAppSecretVerified).toBeFalsy();
  });
});
