import { GraphQLString, GraphQLNonNull } from 'graphql';
import sharp from 'sharp';
import { MediaType, variants } from '@cofacts/media-manager';
import mediaManager, {
  IMAGE_PREVIEW,
  IMAGE_THUMBNAIL,
} from 'util/mediaManager';
import { assertUser } from 'util/user';
import client from 'util/client';

import { ArticleReferenceInput } from 'graphql/models/ArticleReference';
import MutationResult from 'graphql/models/MutationResult';
import { createOrUpdateReplyRequest } from './CreateOrUpdateReplyRequest';
import ArticleTypeEnum from 'graphql/models/ArticleTypeEnum';

const METADATA = {
  cacheControl: 'public, max-age=31536000, immutable',
};

const VALID_ARTICLE_TYPE_TO_MEDIA_TYPE = {
  IMAGE: MediaType.image,
  VIDEO: MediaType.video,
  AUDIO: MediaType.audio,
};

/**
 * Upload media of specified article type from the given mediaUrl
 *
 * @param {object} param
 * @param {string} param.mediaUrl
 * @param {ArticleTypeEnum} param.articleType
 * @returns {Promise<MediaEntry>}
 */
export async function uploadMedia({ mediaUrl, articleType }) {
  const mappedMediaType = VALID_ARTICLE_TYPE_TO_MEDIA_TYPE[articleType];
  const mediaEntry = await mediaManager.insert({
    url: mediaUrl,
    getVariantSettings(options) {
      const { type, contentType } = options;

      // Abort if articleType does not match mediaUrl's file type
      //
      if (!mappedMediaType || mappedMediaType !== type) {
        throw new Error(
          `Specified article type is "${articleType}", but the media file is a ${type}.`
        );
      }

      switch (type) {
        case MediaType.image:
          return [
            variants.original(contentType),
            {
              name: IMAGE_THUMBNAIL,
              contentType: 'image/jpeg',
              transform: sharp()
                .resize({ height: 240, withoutEnlargement: true })
                .jpeg({ quality: 60 }),
            },
            {
              name: IMAGE_PREVIEW,
              contentType: 'image/webp',
              transform: sharp()
                .resize({ width: 600, withoutEnlargement: true })
                .webp({ quality: 30 }),
            },
          ];

        default:
          return variants.defaultGetVariantSettings(options);
      }
    },
    onUploadStop(error) {
      /* istanbul ignore if */
      if (error) {
        console.error(`[createNewMediaArticle] onUploadStop error:`, error);
        return;
      }

      mediaEntry.variants.forEach(variant =>
        mediaEntry.getFile(variant).setMetadata(METADATA)
      );
    },
  });

  return mediaEntry;
}

/**
 * Creates a new article in ElasticSearch,
 * or return an article which attachment.hash is similar to mediaUrl
 *
 * @param {object} param
 * @param {MediaEntry} param.mediaEntry
 * @param {ArticleTypeEnum} param.articleType
 * @param {ArticleReferenceInput} param.reference
 * @param {string} param.userId
 * @param {string} param.appId
 * @returns {Promise<string>} the new article's ID
 */
async function createNewMediaArticle({
  mediaEntry,
  articleType,
  reference: originalReference,
  userId,
  appId,
}) {
  const attachmentHash = mediaEntry.id;
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
      attachmentHash,
      status: 'NORMAL',
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

    const mediaEntry = await uploadMedia({
      mediaUrl,
      articleType,
    });

    const articleId = await createNewMediaArticle({
      mediaEntry,
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
