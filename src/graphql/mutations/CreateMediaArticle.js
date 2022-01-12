import { GraphQLString, GraphQLNonNull } from 'graphql';

import { assertUser } from 'util/user';
import client from 'util/client';
import { uploadToGCS } from 'util/gcs';
import { getMediaFileHash } from 'graphql/util';

import { ArticleReferenceInput } from 'graphql/models/ArticleReference';
import MutationResult from 'graphql/models/MutationResult';
import { createOrUpdateReplyRequest } from './CreateOrUpdateReplyRequest';
import ArticleTypeEnum from 'graphql/models/ArticleTypeEnum';
import fetch from 'node-fetch';

/**
 * @param {NodeJS.ReadableStream} fileStream
 * @param {sring} name File name
 * @param {ArticleTypeEnum} type The article type
 * @returns {string} url
 */
export async function uploadFile(fileStream, name, type) {
  // final file name that combined with folder name.
  let fileName;
  let mimeType = '*/*';

  if (type === 'IMAGE') {
    if (process.env.GCS_IMAGE_FOLDER) {
      fileName = `${process.env.GCS_IMAGE_FOLDER}/${name}.jpeg`;
    } else {
      fileName = `${name}.jpeg`;
    }

    mimeType = 'image/jpeg';
  }
  return await uploadToGCS(fileStream, fileName, mimeType);
}

/**
 * Creates a new article in ElasticSearch,
 * or return an article which attachment.hash is similar to mediaUrl
 *
 * @param {object} param
 * @param {string} param.mediaUrl
 * @param {ArticleTypeEnum} param.articleType
 * @param {ArticleReferenceInput} param.reference
 * @param {string} param.userId
 * @param {string} param.appId
 * @returns {Promise<string>} the new article's ID
 */
async function createNewMediaArticle({
  mediaUrl,
  articleType,
  reference: originalReference,
  userId,
  appId,
}) {
  if (articleType !== 'IMAGE') {
    throw new Error(`Type ${articleType} is not yet supported.`);
  }

  const file = await fetch(mediaUrl);
  const hash = await getMediaFileHash(await file.clone().buffer(), articleType);
  const text = '';
  const now = new Date().toISOString();
  const reference = {
    ...originalReference,
    createdAt: now,
    userId: userId,
    appId: appId,
  };

  const { body: matchedArticle } = await client.search({
    index: 'articles',
    type: 'doc',
    body: {
      query: {
        nested: {
          path: 'attachment',
          query: {
            term: {
              'attachment.hash': hash,
            },
          },
        },
      },
    },
  });

  if (!matchedArticle.hits.total) {
    const url = await uploadFile(file.body, hash, articleType);

    // use elasticsearch created id
    const {
      body: { _id: articleId },
    } = await client.index({
      index: 'articles',
      type: 'doc',
      body: {
        text,
        createdAt: now,
        updatedAt: now,
        userId,
        appId,
        references: [reference],
        articleReplies: [],
        articleCategories: [],
        normalArticleReplyCount: 0,
        normalArticleCategoryCount: 0,
        replyRequestCount: 0,
        tags: [],
        hyperlinks: [],
        articleType,
        attachment: {
          hash,
          mediaUrl: url,
        },
      },
    });

    return articleId;
  }
  return matchedArticle.hits.hits[0]._id;
}

export default {
  type: MutationResult,
  description: 'Create a media article and/or a replyRequest',
  args: {
    mediaUrl: { type: new GraphQLNonNull(GraphQLString) },
    articleType: { type: new GraphQLNonNull(ArticleTypeEnum) },
    reference: { type: new GraphQLNonNull(ArticleReferenceInput) },
    reason: {
      // FIXME: Change to required field after LINE bot is implemented
      // type: new GraphQLNonNull(GraphQLString),
      type: GraphQLString,
      description:
        'The reason why the user want to submit this article. Mandatory for 1st sender',
    },
  },
  resolve(rootValue, { mediaUrl, articleType, reference, reason }, { user }) {
    assertUser(user);
    const newArticlePromise = createNewMediaArticle({
      mediaUrl,
      articleType,
      reference,
      userId: user.id,
      appId: user.appId,
    });

    // Dependencies
    //
    // newArticlePromise* --> replyRequestPromise* --> done
    //
    // *: Updates article. Will trigger version_conflict_engine_exception if run in parallel.
    //

    const replyRequestPromise = newArticlePromise.then(articleId =>
      createOrUpdateReplyRequest({ articleId, user, reason })
    );

    // Wait for all promises
    return Promise.all([
      newArticlePromise, // for fetching articleId
      replyRequestPromise,
    ]).then(([id]) => ({ id }));
  },
};
