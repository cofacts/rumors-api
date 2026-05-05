import { getPublicJWK } from './lib/jwt';

export default async function jwksRoute(ctx) {
  const jwk = await getPublicJWK();
  ctx.set('Cache-Control', 'public, max-age=3600');
  ctx.type = 'application/json';
  ctx.body = { keys: [jwk] };
}
