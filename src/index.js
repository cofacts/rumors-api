import 'dotenv/config';
import Koa from 'koa';
import Router from 'koa-router';
import path from 'path';
import pug from 'pug';
import { printSchema } from 'graphql/utilities';
import { ApolloServer } from 'apollo-server-koa';
import koaStatic from 'koa-static';
import koaBody from 'koa-bodyparser';
import session from 'koa-session2';
import passport from 'koa-passport';
import { formatError } from 'graphql';
import checkHeaders from './checkHeaders';
import schema from './graphql/schema';
import DataLoaders from './graphql/dataLoaders';
import { AUTH_ERROR_MSG } from './graphql/util';
import CookieStore from './CookieStore';
import { isBackendApp } from 'graphql/models/User';
import { loginRouter, authRouter } from './auth';
import rollbar from './rollbarInstance';
import { createOrUpdateBackendUser } from './graphql/mutations/CreateOrUpdateUser';

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
router.post('/logout', checkHeaders(), ctx => {
  ctx.logout();
  ctx.body = { success: true };
});

router.options('/graphql', checkHeaders());
router.post('/graphql', checkHeaders());

const indexFn = pug.compileFile(path.join(__dirname, 'jade/index.jade'));
const schemaStr = printSchema(schema);
router.get('/', ctx => {
  ctx.body = indexFn({ schemaStr });
});

app.use(koaStatic(path.join(__dirname, '../static/')));
app.use(router.routes(), router.allowedMethods());

export const apolloServer = new ApolloServer({
  schema,
  introspection: true, // Allow introspection in production as well
  playground: true,
  context: async ({ ctx }) => {
    let user = ctx.state.user || {};
    if (ctx.appId && isBackendApp(ctx.appId)) {
      const { user: backendUser } = await createOrUpdateBackendUser({
        appUserId: ctx.query.userId,
        appId: ctx.appId,
      });
      user = { ...user, ...backendUser };
    }

    return {
      loaders: new DataLoaders(), // new loaders per request
      user: user,

      // userId-appId pair
      //
      userId: user.id,
      appId: ctx.appId,
    };
  },
  formatError(err) {
    // make web clients know they should login
    //
    const formattedError = formatError(err);
    formattedError.authError = err.message === AUTH_ERROR_MSG;
    return formattedError;
  },
});

apolloServer.applyMiddleware({
  app,
  cors: false, // checkHeaders already managed CORS, don't mess up with that
});

const port = process.env.PORT || 5000;

app.listen(port, () => {
  console.log('Listening port', port); // eslint-disable-line no-console
});
