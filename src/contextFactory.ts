import DataLoaders from './graphql/dataLoaders';
import { createOrUpdateUser } from './util/user';
import { verifyJWT, TOKEN_USE_ACCESS } from './lib/jwt';

type ContextFactoryArgs = {
  ctx: {
    appId: string;
    isAppSecretVerified?: boolean;
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
    isAppSecretVerified = false,
    query: { userId: queryUserId } = {},
    state: { user: { userId: sessionUserId } = {} } = {},
  } = ctx;

  // Bearer token auth (new BFF flow)
  let bearerUserId: string | undefined;
  const authHeader =
    ctx.request?.headers?.authorization ?? ctx.get?.('authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length);
    try {
      const payload = await verifyJWT(token, { expectedUse: TOKEN_USE_ACCESS });
      bearerUserId = payload.sub as string;
    } catch (_err) {
      // Bearer token present but invalid/expired → 401
      if (ctx.status !== undefined) ctx.status = 401;
      throw new Error('Invalid or expired Bearer token');
    }
  }

  // A verified Bearer token represents a cryptographically proven identity and
  // must override `?userId=` (which is only trusted under the legacy
  // App-Secret + appId flow). Otherwise a caller with any valid Bearer token
  // could impersonate other users by appending `?userId=…` to the request.
  //
  // `?userId=` is only honored when the request carries a valid app secret
  // (see checkHeaders), i.e. it comes from a backend app that authenticated
  // the user on its own. For any other request it is ignored; otherwise anyone
  // could act as any user (including website users, whose DB user IDs are
  // public) by simply appending `?userId=…`.
  const userId =
    bearerUserId ??
    (isAppSecretVerified ? queryUserId : undefined) ??
    sessionUserId;

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
