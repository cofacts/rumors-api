import DataLoaders from './graphql/dataLoaders';
import { createOrUpdateUser } from './util/user';
import { verifyJWT } from './lib/jwt';

type ContextFactoryArgs = {
  ctx: {
    appId: string;
    query: { userId?: string };
    state: { user?: { userId?: string } };
    request?: { headers?: { authorization?: string } };
    status?: number;
    get?: (name: string) => string;
  };
};

export default async function contextFactory({ ctx }: ContextFactoryArgs) {
  const {
    appId,
    query: { userId: queryUserId } = {},
    state: { user: { userId: sessionUserId } = {} } = {},
  } = ctx;

  // Bearer token auth (new BFF flow)
  let bearerUserId: string | undefined;
  const authHeader = ctx.request?.headers?.authorization ?? ctx.get?.('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    try {
      const payload = await verifyJWT(token);
      bearerUserId = payload.sub as string;
    } catch (_err) {
      // Bearer token present but invalid/expired → 401
      if (ctx.status !== undefined) ctx.status = 401;
      throw new Error('Invalid or expired Bearer token');
    }
  }

  const userId = queryUserId ?? bearerUserId ?? sessionUserId;

  let currentUser = null;
  if (appId && userId) {
    ({ user: currentUser } = await createOrUpdateUser({
      userId,
      appId,
    }));
  }

  return {
    loaders: new DataLoaders(), // new loaders per request
    user: currentUser,

    // userId-appId pair
    //
    userId: currentUser?.id,
    appUserId: userId,
    appId,
  };
}

/** GraphQL resolver context */
export type ResolverContext = Awaited<ReturnType<typeof contextFactory>>;
