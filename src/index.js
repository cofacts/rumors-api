import Koa from 'koa';
import Router from 'koa-router';
import config from 'config';
import graphqlHTTP from 'koa-graphql-next';
import schema from './graphql/schema';
import DataLoaders from './graphql/dataLoaders';

const app = new Koa();

app.use((ctx, next) => graphqlHTTP({
  schema,
  graphiql: true,
  context: {
    loaders: new DataLoaders(), // new loaders per request
  },
})(ctx, next));

const router = Router();

router.get('/', (ctx) => {
  ctx.body = 'Hello Koa';
});

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(config.get('PORT'), () => {
  console.log('Listening port', config.get('PORT'));
});
