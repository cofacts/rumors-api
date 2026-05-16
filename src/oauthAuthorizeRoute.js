import { isAllowedCallbackUrl } from './auth';

const PROVIDERS = [
  ['google', 'Google', 'GOOGLE_CLIENT_ID'],
  ['facebook', 'Facebook', 'FACEBOOK_APP_ID'],
  ['github', 'GitHub', 'GITHUB_CLIENT_ID'],
  ['instagram', 'Instagram', 'INSTAGRAM_CLIENT_ID'],
];

export default function oauthAuthorizeRoute(ctx) {
  const { response_type, redirect_uri, state } = ctx.query;

  if (response_type !== 'code' || !redirect_uri) {
    ctx.status = 400;
    ctx.body = { error: 'invalid_request' };
    return;
  }

  if (!isAllowedCallbackUrl(redirect_uri)) {
    ctx.status = 400;
    ctx.body = {
      error: 'invalid_request',
      error_description: 'redirect_uri not allowed',
    };
    return;
  }

  const stateParam = state ? `&state=${encodeURIComponent(state)}` : '';
  const buttons = PROVIDERS.filter(([, , envKey]) => process.env[envKey])
    .map(
      ([id, label]) =>
        `<a href="/login/${id}?redirect_to=${encodeURIComponent(
          redirect_uri
        )}${stateParam}" style="display:block;margin:8px 0;padding:12px 20px;background:#4285f4;color:#fff;text-decoration:none;border-radius:4px;text-align:center;font-family:sans-serif">${label}</a>`
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
}
