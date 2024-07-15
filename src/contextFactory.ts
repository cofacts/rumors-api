import DataLoaders from './graphql/dataLoaders';
import { createOrUpdateUser } from './util/user';

type ContextFactoryArgs = {
  ctx: {
    appId: string;
    query: { userId?: string };
    state: { user?: { userId?: string } };
  };
};

export default async function contextFactory({ ctx }: ContextFactoryArgs) {
  const {
    appId,
    query: { userId: queryUserId } = {},
    state: { user: { userId: sessionUserId } = {} } = {},
  } = ctx;

  const userId = queryUserId ?? sessionUserId;

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
