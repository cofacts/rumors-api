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
import cors from 'kcors';
import schema from './graphql/schema';
import DataLoaders from './graphql/dataLoaders';

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

app.use(cors({ credentials: true }));

app.use(koaBody({
  formLimit: '1mb',
  jsonLimit: '10mb',
  textLimit: '10mb',
}));

router.post('/graphql', graphqlKoa(() => ({
  schema,
  context: {
    loaders: new DataLoaders(), // new loaders per request
  },
})));

router.get('/graphql', graphiqlKoa({ endpointURL: '/graphql' }));

const indexFn = pug.compileFile(path.join(__dirname, 'jade/index.jade'));
const schemaStr = printSchema(schema);
router.get('/', (ctx) => {
  ctx.body = indexFn({ schemaStr });
});

app.use(koaStatic(path.join(__dirname, '../static/')));
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(config.get('PORT'), () => {
  console.log('Listening port', config.get('PORT'));
});
