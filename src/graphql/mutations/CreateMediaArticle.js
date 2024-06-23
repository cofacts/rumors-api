import { GraphQLString, GraphQLNonNull } from 'graphql';
import sharp from 'sharp';
import { MediaType, variants } from '@cofacts/media-manager';
import mediaManager, {
  IMAGE_PREVIEW,
  IMAGE_THUMBNAIL,
} from 'util/mediaManager';
import { assertUser, getContentDefaultStatus } from 'util/user';
import client from 'util/client';
import { getAIResponse } from 'graphql/util';
import { schema } from 'prosemirror-schema-basic';
import Y from 'yjs';
import { EditorState } from 'prosemirror-state';
import { prosemirrorToYDoc } from 'y-prosemirror';

import { ArticleReferenceInput } from 'graphql/models/ArticleReference';
import MutationResult from 'graphql/models/MutationResult';
import { createOrUpdateReplyRequest } from './CreateOrUpdateReplyRequest';
import ArticleTypeEnum from 'graphql/models/ArticleTypeEnum';

const METADATA = {
  cacheControl: 'public, max-age=31536000, immutable',
};

const AI_TRANSCRIBER_DESCRIPTION = JSON.stringify({
  id: 'ai-transcript',
  appId: 'RUMORS_AI',
  name: 'AI Transcript',
});

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

      mediaEntry.variants.forEach((variant) =>
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
 * @param {object} user - The user submitting this article
 * @returns {Promise<string>} the new article's ID
 */
async function createNewMediaArticle({
  mediaEntry,
  articleType,
  reference: originalReference,
  user,
}) {
  const attachmentHash = mediaEntry.id;
  const text = '';
  const now = new Date().toISOString();
  const reference = {
    ...originalReference,
    createdAt: now,
    userId: user.id,
    appId: user.appId,
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
      userId: user.id,
      appId: user.appId,
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
      status: getContentDefaultStatus(user),
      contributors: [],
    },
  });

  return articleId;
}

/**
 * @param {string} articleId - For target article
 * @param {string} text
 * @returns result of article & ydoc operation
 */
export function writeAITranscript(articleId, text) {
  // Write aiResponse to articles
  const writeToArticleTextPromise = client.update({
    index: 'articles',
    type: 'doc',
    id: articleId,
    body: { doc: { text } },
  });

  // Prosemirror editor state with AI response text
  const tempState = EditorState.create({ schema });
  const proseMirrorState = tempState.apply(tempState.tr.insertText(text));

  // Encode ProseMirror doc node into binary in the same way as Hocuspocus
  // @ref https://tiptap.dev/hocuspocus/guides/persistence#faq-in-what-format-should-i-save-my-document
  const ydoc = prosemirrorToYDoc(proseMirrorState.doc);

  // Setup user mapping
  const permanentUserData = new Y.PermanentUserData(ydoc);
  permanentUserData.setUserMapping(
    ydoc,
    ydoc.clientID,
    AI_TRANSCRIBER_DESCRIPTION
  );

  // Create initial version snapshot
  const snapshot = Y.snapshot(ydoc);

  // Create Y.doc and write to ydoc collection
  const createYdocPromise = client.index({
    index: 'ydocs',
    type: 'doc',
    id: articleId,
    body: {
      ydoc: Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64'),
      versions: [
        {
          createdAt: new Date().toISOString(),
          snapshot: Buffer.from(Y.encodeSnapshot(snapshot)).toString('base64'),
        },
      ],
    },
  });

  return Promise.all([writeToArticleTextPromise, createYdocPromise]);
}

export default {
  type: MutationResult,
  description: 'Create a media article and/or a replyRequest',
  args: {
    mediaUrl: { type: new GraphQLNonNull(GraphQLString) },
    articleType: { type: new GraphQLNonNull(ArticleTypeEnum) },
    reference: { type: new GraphQLNonNull(ArticleReferenceInput) },
    reason: {
      type: GraphQLString,
      description: 'The reason why the user want to submit this article',
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

    const aritcleIdPromise = createNewMediaArticle({
      mediaEntry,
      articleType,
      reference,
      user,
    });

    const aiResponsePromise = getAIResponse({
      type: 'TRANSCRIPT',
      docId: mediaEntry.id,
    });

    await Promise.all([
      // Update reply request
      aritcleIdPromise.then((articleId) =>
        createOrUpdateReplyRequest({
          articleId,
          user,
          reason,
        })
      ),

      // Write AI transcript to article & ydoc
      Promise.all([aritcleIdPromise, aiResponsePromise])
        .then(([articleId, aiResponse]) => {
          if (!aiResponse) {
            throw new Error('AI transcript not found');
          }
          return writeAITranscript(articleId, aiResponse.text);
        })
        .then(() => {
          console.log(
            `[CreateMediaArticle] AI transcript for ${mediaEntry.id} applied`
          );
        })
        // It's OK to fail this promise, just log as warning
        .catch((e) =>
          console.warn(`[CreateMediaArticle] ${mediaEntry.id}:`, e)
        ),
    ]);

    return { id: await aritcleIdPromise };
  },
};
