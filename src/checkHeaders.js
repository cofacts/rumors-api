import cors from 'kcors';

async function checkSecret(ctx, next) {
  const secret = ctx.get(process.env.HTTP_HEADER_APP_SECRET);
  if (secret === process.env.RUMORS_LINE_BOT_SECRET) {
    // Shortcut for official rumors-line-bot -- no DB queries
    ctx.appId = 'RUMORS_LINE_BOT';

    // else if(secret) { ...
    // TODO: Fill up ctx.appId with app id after looking up DB with secret
  } else {
    // secret do not match anything
    ctx.appId = 'DEVELOPMENT_BACKEND'; // FIXME: Remove this after developer key function rolls out.
  }

  return next();
}

async function checkAppId(ctx, next) {
  const appId = ctx.get(process.env.HTTP_HEADER_APP_ID);
  let origin;

  if (ctx.method === 'OPTIONS') {
    // Pre-flight, no header available, just allow all
    origin = ctx.get('Origin');
  } else if (appId === 'RUMORS_SITE') {
    // Shortcut for official rumors-site -- no DB queries
    origin = process.env.RUMORS_SITE_CORS_ORIGIN;
    ctx.appId = 'WEBSITE';

    // else if(appId) { ...
    // ctx.appId = 'WEBSITE'; // other apps share the same "from"
    // // because ctx.user set by passport as well
    //
    // TODO: Fill up origin from DB according to appId
  } else {
    // No header is given. Allow localhost access only.
    // FIXME: After developer key function rolls out, these kind of request
    // (have no secret nor appid) should be blocked, instead of given ctx.appId.
    //
    origin = 'http://localhost:3000';
    ctx.appId = 'DEVELOPMENT_FRONTEND';
  }

  return cors({
    credentials: true,
    // cors can skip processing only when origin is function @@
    // if we don't pass function here, cors() will stop nothing.
    origin: () => origin,
  })(ctx, next);
}

export default () => (ctx, next) => {
  if (ctx.get(process.env.HTTP_HEADER_APP_SECRET)) {
    return checkSecret(ctx, next);
  }

  return checkAppId(ctx, next);
};
