import 'dotenv/config';
import Koa from 'koa';
import Router from 'koa-router';
import path from 'path';
import pug from 'pug';
import { printSchema } from 'graphql/utilities';
import { ApolloServer } from 'apollo-server-koa';
import koaStatic from 'koa-static';
import koaSend from 'koa-send';
import koaBody from 'koa-bodyparser';
import session from 'koa-session2';
import passport from 'koa-passport';
import { formatError } from 'graphql';
import checkHeaders from './checkHeaders';
import schema from './graphql/schema';
import contextFactory from './contextFactory';

import CookieStore from './CookieStore';
import { loginRouter, authRouter } from './auth';
import rollbar from './rollbarInstance';
import { AUTH_ERROR_MSG } from './util/user';

const app = new Koa();
const router = Router();

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    rollbar.handleError(err, ctx.request);
    throw err;
  }
});

// Log all requests
/* istanbul ignore if */
if (process.env.LOG_REQUESTS) {
  const logger = require('koa-pino-logger');
  app.use(logger());
}

app.use(
  koaBody({
    formLimit: '1mb',
    jsonLimit: '10mb',
    textLimit: '10mb',
  })
);

app.keys = (process.env.COOKIE_SECRETS || '').split(',');
app.proxy = !!process.env.TRUST_PROXY_HEADERS;

const samesiteConfig = process.env.COOKIE_SAMESITE_NONE
  ? { sameSite: 'none', secure: true }
  : {};

app.use(
  session({
    store: new CookieStore({ password: app.keys[0] }),
    signed: true,
    maxAge: process.env.COOKIE_MAXAGE,
    ...samesiteConfig,
  })
);
app.use(passport.initialize());
app.use(passport.session());

router.use('/login', loginRouter.routes(), loginRouter.allowedMethods());
router.use('/callback', authRouter.routes(), authRouter.allowedMethods());

router.options('/logout', checkHeaders());
router.post('/logout', checkHeaders(), (ctx) => {
  ctx.logout();
  ctx.body = { success: true };
});

router.options('/graphql', checkHeaders());
router.post('/graphql', checkHeaders());

router.get('/graphql', (ctx) => {
  return koaSend(ctx, '/static/graphiql.html');
});

const schemaStr = printSchema(schema);
const indexFn = pug.compileFile(path.join(__dirname, 'jade/index.jade'));
router.get('/', (ctx) => {
  ctx.body = indexFn({ schemaStr, hostName: ctx.request.origin });
});

app.use(koaStatic(path.join(__dirname, '../static/')));
app.use(router.routes(), router.allowedMethods());

const LOG_STR_LENGTH = 100;
/**
 * For JSON.stringify in GraphQL logger
 */
/* istanbul ignore next */
function truncatingLogReplacer(key, value) {
  if (typeof value !== 'string' || value.length < LOG_STR_LENGTH) return value;

  return value.slice(0, LOG_STR_LENGTH) + '...';
}

const LOGGER_HEADER_KEY_REGEX = /ip|forwarded|address/i;

export const apolloServer = new ApolloServer({
  schema,
  introspection: true, // Allow introspection in production as well
  playground: false,
  context: contextFactory,
  formatError(err) {
    // make web clients know they should login
    //
    const formattedError = formatError(err);
    formattedError.authError = err.message === AUTH_ERROR_MSG;
    return formattedError;
  },
  plugins: !process.env.LOG_REQUESTS
    ? []
    : [
        {
          /* istanbul ignore next */
          requestDidStart(...args) {
            const [
              {
                context: { userId, appUserId, appId },
                request: { operationName, query, http },
              },
            ] = args;

            console.log(
              JSON.stringify(
                {
                  msg: 'Apollo#requestDidStart',
                  operationName,
                  // Remove extra spaces and line breaks to further compress the query
                  query: (query ?? '')
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean)
                    .join(' '),
                  userId,
                  appUserId,
                  appId,
                  // Only include IP & forwarded related headers.
                  // Other headers are logged by pino-logger.
                  headers: Object.fromEntries(
                    Object.entries(http?.headers ?? {}).filter(([key]) =>
                      LOGGER_HEADER_KEY_REGEX.test(key)
                    )
                  ),
                },
                truncatingLogReplacer
              )
            );
          },
        },
      ],
});

apolloServer.applyMiddleware({
  app,
  cors: false, // checkHeaders already managed CORS, don't mess up with that
});

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log('Listening port', port); // eslint-disable-line no-console
});
