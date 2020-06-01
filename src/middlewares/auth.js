/**
 * Reads header & URL param to determine currently logged in user & app.
 * Reads user data from elasticsearch 'users' index.
 * If user not exist, insert one in `users` index using the specified userId and appId.
 *
 * Writes ctx.userId, ctx.appId and ctx.user.
 */

import cors from 'kcors';
import crypto from 'crypto';

/**
 * @param {string} appId - app ID
 * @param {string} rawUserId - raw user ID given by an backend app
 * @returns {string} the user ID in `users` index if rumors-db
 */
function getBackendAppUserIdInDb(appId, rawUserId) {
  const hash = crypto.createHash('sha256');
  hash.update(`${appId}|${rawUserId}`);
  return hash.digest('base64');
}

/**
 * Checks backend app secret and resolves backend-app user using ?userId in URL param.
 *
 * @param {object} ctx - The koa context
 * @param {function} next
 */
async function handleBackendAppAuth(ctx, next) {
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

  const rawUserId = ctx.query.userId;
  const userIdInDb = getBackendAppUserIdInDb(ctx.appId, rawUserId);

  // Update lastActiveAt or insert new
  // const userInDb = await ctx.loaders.docLoader.load()

  return next();
}

async function handleBrowserAppAuth(ctx, next) {
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
  } else if (appId === 'RUMORS_LINE_BOT') {
    // Shortcut for official rumors-line-bot LIFF -- no DB queries
    origin = process.env.RUMORS_LINE_BOT_CORS_ORIGIN;
    ctx.appId = 'RUMORS_LINE_BOT';
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
    origin: ctx => {
      const allowedOrigins = origin.split(',');
      if (allowedOrigins.includes(ctx.get('Origin'))) return ctx.get('Origin');

      // CORS check fails.
      // Since returning null is not recommended, we just return one valid origin here.
      // Ref: https://w3c.github.io/webappsec-cors-for-developers/#avoid-returning-access-control-allow-origin-null
      //
      return allowedOrigins[0];
    },
  })(ctx, next);
}

export default () => (ctx, next) => {
  if (ctx.get(process.env.HTTP_HEADER_APP_SECRET)) {
    return handleBackendAppAuth(ctx, next);
  }

  return handleBrowserAppAuth(ctx, next);
};
