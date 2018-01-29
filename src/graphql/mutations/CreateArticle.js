import { GraphQLString, GraphQLNonNull } from 'graphql';
import { h64 } from 'xxhashjs';

import { assertUser } from 'graphql/util';
import client from 'util/client';

import { ArticleReferenceInput } from 'graphql/models/ArticleReference';
import MutationResult from 'graphql/models/MutationResult';
import { createReplyRequest } from './CreateReplyRequest';

/* Instantiate hash function */
const xxhash64 = h64();

/**
 * Generates ID from article text. Outputs identical ID when the given the same article text.
 *
 * Used for preventing identical articles sending in within a short amount of time,
 * i.e. while other articles are sending in.
 *
 * @param {string} text The article text
 * @returns {string} generated article ID
 */
function generateArticleId(text) {
  return xxhash64
    .update(text)
    .digest()
    .toString(36);
}

/**
 * Creates a new article in ElasticSearch,
 * or updates its reference by adding a new reference
 *
 * @param {String} param.text
 * @param {ArticleReferenceInput} param.reference
 * @param {String} param.userId
 * @param {String} param.from
 * @returns {String} the new article's ID
 */
async function createNewArticle({ text, reference, userId, from }) {
  const articleId = generateArticleId(text);
  const now = new Date().toISOString();
  reference.createdAt = now;

  const { created, result } = await client.update({
    index: 'articles',
    type: 'doc',
    id: articleId,
    body: {
      script: `
        ctx._source.updatedAt = params.updatedAt;
        ctx._source.references.add(reference);
      `,
      params: {
        updatedAt: now,
        reference,
      },
      upsert: {
        articleReplies: [],
        text,
        createdAt: now,
        updatedAt: now,
        userId,
        from,
        references: [reference],
      },
    },
    refresh: true, // Make sure the data is indexed when we create ReplyRequest
  });

  if (!created) {
    throw new Error(`Cannot create article: ${result}`);
  }

  return articleId;
}

export default {
  type: MutationResult,
  description: 'Create an article and/or a replyRequest',
  args: {
    text: { type: new GraphQLNonNull(GraphQLString) },
    reference: { type: new GraphQLNonNull(ArticleReferenceInput) },
  },
  async resolve(rootValue, { text, reference }, { from, userId }) {
    assertUser({ from, userId });

    const articleId = await createNewArticle({ text, reference, userId, from });
    await createReplyRequest({ articleId, userId, from });

    return { id: articleId };
  },
};
