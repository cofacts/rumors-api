import config from 'config';
import cors from 'kcors';

export default () => async (ctx, next) => {
  let origin;
  if (ctx.method === 'OPTIONS') { // Pre-flight, no header available, just allow all
    origin = ctx.get('Origin');
  } else if (ctx.get('x-app-id') === 'RUMORS_SITE') {
    // Shortcut for rumors-site -- no DB queries
    origin = config.get('RUMORS_SITE_CORS_ORIGIN');
  }

  // TODO: Fill up origin from DB according to x-app-id

  return cors({
    credentials: true,
    // cors can skip processing only when origin is function @@
    // if we don't pass function here, cors() will stop nothing.
    origin: () => origin,
  })(ctx, next);
};
