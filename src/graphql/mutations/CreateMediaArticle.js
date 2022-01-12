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
  const attachmentHash = await getMediaFileHash(
    await file.clone().buffer(),
    articleType
  );
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
        term: {
          attachmentHash,
        },
      },
    },
  });

  if (matchedArticle.hits.total) {
    return matchedArticle.hits.hits[0]._id;
  }

  const attachmentUrl = await uploadFile(
    file.body,
    attachmentHash,
    articleType
  );

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
      attachmentUrl,
      attachmentHash,
    },
  });

  return articleId;
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
  async resolve(
    rootValue,
    { mediaUrl, articleType, reference, reason },
    { user }
  ) {
    assertUser(user);
    const articleId = await createNewMediaArticle({
      mediaUrl,
      articleType,
      reference,
      userId: user.id,
      appId: user.appId,
    });

    await createOrUpdateReplyRequest({
      articleId,
      user,
      reason,
    });

    return { id: articleId };
  },
};
