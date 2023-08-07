import { GraphQLString, GraphQLNonNull, GraphQLList } from 'graphql';
import { assertUser } from 'util/user';

import Cooccurrence from '../models/Cooccurrence';

import client from 'util/client';

export function getCooccurrenceId({ articleIds, userId, appId }) {
  const joinedArticleIds = articleIds.sort().join('_');
  return `${userId}_${appId}_${joinedArticleIds}`;
}

/**
 * Updates the cooccurrence with specified `articleIds`.
 *
 * @param {string[]} articleIds
 * @returns {object} The updated coocurrence
 */
export async function createOrUpdateCooccurrence({ articleIds, user }) {
  assertUser(user);

  const now = new Date().toISOString();
  const id = getCooccurrenceId({
    articleIds,
    userId: user.id,
    appId: user.appId,
  });

  const updatedDoc = {
    updatedAt: now,
  };

  const {
    body: {
      result,
      get: { _source },
    },
  } = await client.update({
    index: 'cooccurrences',
    type: 'doc',
    id,
    body: {
      doc: updatedDoc,
      upsert: {
        articleIds,
        userId: user.id,
        appId: user.appId,
        createdAt: now,
        updatedAt: now,
      },
      _source: true,
    },
    refresh: 'true',
  });

  const isCreated = result === 'created';

  return {
    cooccurrence: { ..._source },
    isCreated,
  };
}

export default {
  description: 'Create or update a cooccurrence for the given articles',
  type: Cooccurrence,
  args: {
    articleIds: { type: new GraphQLList(new GraphQLNonNull(GraphQLString)) },
  },
  async resolve(rootValue, { articleIds }, { user }) {
    const result = await createOrUpdateCooccurrence({
      articleIds,
      user,
    });
    return result.cooccurrence;
  },
};
