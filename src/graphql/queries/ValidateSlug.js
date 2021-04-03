import {
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';

import { assertUser } from 'util/user';
import client from 'util/client';
import SlugErrorEnum, { errors } from 'graphql/models/SlugErrorEnum';

/**
 * Throws error if slug is not valid
 *
 * @param {string} slug - The string to check as slug
 * @param {string} userId - The user that want to use this slug
 */
export async function assertSlugIsValid(slug, userId) {
  const trimmedSlug = slug.trim();

  if (!trimmedSlug) {
    throw errors.EMPTY;
  }

  if (slug !== trimmedSlug) {
    throw errors.NOT_TRIMMED;
  }

  if (encodeURI(slug) !== encodeURIComponent(slug)) {
    throw errors.HAS_URI_COMPONENT;
  }

  const {
    body: { count },
  } = await client.count({
    index: 'users',
    type: 'doc',
    body: {
      query: {
        bool: {
          must: [{ term: { slug } }],
          must_not: [{ ids: { values: [userId] } }],
        },
      },
    },
  });

  if (count > 0) throw errors.TAKEN;
}

export default {
  args: {
    slug: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
  type: new GraphQLObjectType({
    name: 'ValidationResult',
    fields: {
      success: { type: new GraphQLNonNull(GraphQLBoolean) },
      error: { type: SlugErrorEnum },
    },
  }),
  async resolve(rootValue, { slug }, { userId, appId }) {
    assertUser({ userId, appId });
    try {
      await assertSlugIsValid(slug, userId);
    } catch (e) {
      if (e in errors) {
        return {
          success: false,
          error: e,
        };
      }

      // Re-throw unexpected errors
      throw e;
    }

    return {
      success: true,
    };
  },
};
