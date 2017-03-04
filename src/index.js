import Koa from 'koa';
import Router from 'koa-router';
import config from 'config';
import path from 'path';
import pug from 'pug';
import { printSchema } from 'graphql/utilities';
import { graphqlKoa, graphiqlKoa } from 'graphql-server-koa';
import rollbar from 'rollbar';
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

import { loginRouter, authRouter } from './auth';

const app = new Koa();
const router = Router();

rollbar.init(config.get('ROLLBAR_TOKEN'), {
  environment: config.get('ROLLBAR_ENV'),
});

rollbar.handleUncaughtExceptionsAndRejections();


app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    rollbar.handleError(err, ctx.request);
    throw err;
  }
});

app.use(koaBody({
  formLimit: '1mb',
  jsonLimit: '10mb',
  textLimit: '10mb',
}));

app.keys = config.get('COOKIE_SECRETS');

app.use(session({
  store: new CookieStore({ password: app.keys[0] }),
  signed: true,
  maxAge: config.get('COOKIE_MAXAGE'),
}));
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
router.post('/graphql', checkHeaders(), graphqlKoa(ctx => ({
  schema,
  context: {
    loaders: new DataLoaders(), // new loaders per request
    user: ctx.state.user,

    // userId-from pair that is used in replyRequests and replyConnectionFeedbacks.
    //
    userId: ctx.from === 'WEBSITE' || ctx.from === 'DEVELOPMENT_FRONTEND' ? (ctx.state.user || {}).id : ctx.query.userId,
    from: ctx.from,
  },
  formatError(err) {
    // make web clients know they should login
    //
    const formattedError = formatError(err);
    formattedError.authError = err.message === AUTH_ERROR_MSG;
    return formattedError;
  },
})));

router.get('/graphql', graphiqlKoa({ endpointURL: '/graphql' }));

const indexFn = pug.compileFile(path.join(__dirname, 'jade/index.jade'));
const schemaStr = printSchema(schema);
router.get('/', (ctx) => {
  ctx.body = indexFn({ schemaStr });
});

app.use(koaStatic(path.join(__dirname, '../static/')));
app.use(router.routes(), router.allowedMethods());

app.listen(config.get('PORT'), () => {
  console.log('Listening port', config.get('PORT')); // eslint-disable-line no-console
});
