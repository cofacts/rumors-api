import { GraphQLString, GraphQLNonNull } from 'graphql';
import { h64 } from 'xxhashjs';

import { assertUser } from 'graphql/util';
import client from 'util/client';
import scrapUrls from 'util/scrapUrls';

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
export function getArticleId(text) {
  return xxhash64
    .update(text)
    .digest()
    .toString(36);
}

/**
 * Creates a new article in ElasticSearch,
 * or updates its reference by adding a new reference
 *
 * @param {object} param
 * @param {string} param.text
 * @param {ArticleReferenceInput} param.reference
 * @param {string} param.userId
 * @param {string} param.appId
 * @returns {string} the new article's ID
 */
async function createNewArticle({
  text,
  reference: originalReference,
  userId,
  appId,
}) {
  const articleId = getArticleId(text);
  const now = new Date().toISOString();
  const reference = {
    ...originalReference,
    createdAt: now,
    userId: userId,
    appId: appId,
  };

  await client.update({
    index: 'articles',
    type: 'doc',
    id: articleId,
    body: {
      script: {
        source: `
          ctx._source.updatedAt = params.updatedAt;
          ctx._source.references.add(params.reference);
        `,
        lang: 'painless',
        params: {
          updatedAt: now,
          reference,
        },
      },
      upsert: {
        text,
        createdAt: now,
        updatedAt: now,
        userId,
        appId,
        references: [reference],
        articleReplies: [],
        normalArticleReplycount: 0,
        replyRequestCount: 0,
        tags: [],
        hyperlinks: [],
      },
    },
    refresh: true, // Make sure the data is indexed when we create ReplyRequest
  });

  return articleId;
}

/**
 * @param {string} articleId
 * @param {ScrapResult[]} hyperlinks
 * @return {Promise | null} update result
 */
function updateArticleHyperlinks(articleId, scrapResults) {
  if (!scrapResults || scrapResults.length === 0) return Promise.resolve(null);

  return client.update({
    index: 'articles',
    type: 'doc',
    id: articleId,
    body: {
      doc: {
        hyperlinks: scrapResults.map(({ url, title, summary }) => ({
          url,
          title,
          summary,
        })),
      },
    },
  });
}

export default {
  type: MutationResult,
  description: 'Create an article and/or a replyRequest',
  args: {
    text: { type: new GraphQLNonNull(GraphQLString) },
    reference: { type: new GraphQLNonNull(ArticleReferenceInput) },
    reason: {
      // FIXME: Change to required field after LINE bot is implemented
      // type: new GraphQLNonNull(GraphQLString),
      type: GraphQLString,
      description:
        'The reason why the user want to submit this article. Mandatory for 1st sender',
    },
  },
  resolve(rootValue, { text, reference, reason }, { appId, userId, loaders }) {
    assertUser({ appId, userId });

    const newArticlePromise = createNewArticle({
      text,
      reference,
      userId,
      appId,
    });

    const scrapPromise = scrapUrls(text, {
      cacheLoader: loaders.urlLoader,
      client,
    });

    // Dependencies
    //
    // newArticlePromise --> createReplyRequest -------.
    //                  \                               >-> done
    // scrapPromise -----`-> updateArticleHyperlinks  -'
    //

    const hyperlinkPromise = Promise.all([
      newArticlePromise,
      scrapPromise,
    ]).then(([articleId, scrapResults]) => {
      return updateArticleHyperlinks(articleId, scrapResults);
    });

    const replyRequestPromise = newArticlePromise.then(articleId =>
      createReplyRequest({ articleId, userId, appId, reason })
    );

    // Wait for all promises
    return Promise.all([
      newArticlePromise, // for fetching articleId
      hyperlinkPromise,
      replyRequestPromise,
    ]).then(([id]) => ({ id }));
  },
};
