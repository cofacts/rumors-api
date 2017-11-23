import { GraphQLString, GraphQLNonNull } from 'graphql';
import { assertUser } from 'graphql/util';
import client from 'util/client';

import { ArticleReferenceInput } from 'graphql/models/ArticleReference';
import MutationResult from 'graphql/models/MutationResult';
import { createReplyRequest } from './CreateReplyRequest';

/**
 * Creates a new article in ElasticSearch
 *
 * @param {String} param.text
 * @param {String} param.reference
 * @param {String} param.userId
 * @param {String} param.from
 * @returns {String} the new article's ID
 */
async function createNewArticle({ text, reference, userId, from }) {
  const now = new Date().toISOString();
  reference.createdAt = now;

  const { created, _id: newId, result } = await client.index({
    index: 'articles',
    type: 'basic',
    body: {
      replyConnectionIds: [],
      replyRequestIds: [],
      text,
      createdAt: now,
      updatedAt: now,
      userId,
      from,
      references: [reference],
    },
    refresh: true, // Make sure the data is indexed when we create ReplyRequest
  });

  if (!created) {
    throw new Error(`Cannot create article: ${result}`);
  }

  return newId;
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

    // Check article existence
    const searchResult = await client.search({
      index: 'articles',
      type: 'basic',
      body: {
        query: {
          // match_phrase should match both positions and words.
          // ref:
          // https://www.elastic.co/guide/en/elasticsearch/guide/current/phrase-matching.html
          match_phrase: { text },
        },
      },
    });

    // Don't create new articles if a hit is found;
    // return the existing article's ID instead
    const articleId = searchResult.hits.total > 0
      ? searchResult.hits.hits[0]._id
      : await createNewArticle({ text, reference, userId, from });

    // No matter we created an article or not, we should always add replyRequest.
    await createReplyRequest({ articleId, userId, from });

    return { id: articleId };
  },
};
