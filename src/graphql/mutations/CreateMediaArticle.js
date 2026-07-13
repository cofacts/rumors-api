import { GraphQLString, GraphQLNonNull } from 'graphql';
import { assertUser, getContentDefaultStatus } from 'util/user';
import {
  getOrUploadMedia,
  getAIResponse,
  createTranscript,
  VALID_ARTICLE_TYPE_TO_MEDIA_TYPE,
} from 'graphql/util';
import client, { getTotalCount } from 'util/client';
import mediaManager from 'util/mediaManager';
import { errors } from '@elastic/elasticsearch';
import { schema } from 'prosemirror-schema-basic';
import Y from 'yjs';
import { EditorState } from 'prosemirror-state';
import { prosemirrorToYDoc } from 'y-prosemirror';

import { ArticleReferenceInput } from 'graphql/models/ArticleReference';
import MutationResult from 'graphql/models/MutationResult';
import { createOrUpdateReplyRequest } from './CreateOrUpdateReplyRequest';
import ArticleTypeEnum from 'graphql/models/ArticleTypeEnum';
import archiveUrlsFromText from 'util/archiveUrlsFromText';
import { createMediaEmbedding } from 'util/embedding';

const AI_TRANSCRIBER_DESCRIPTION = JSON.stringify({
  id: 'ai-transcript',
  appId: 'RUMORS_AI',
  name: 'AI Transcript',
});

/**
 * Creates a new article in ElasticSearch,
 * or return an article which attachment.hash is similar to mediaUrl
 *
 * @param {object} param
 * @param {MediaEntry} param.mediaEntry
 * @param {ArticleTypeEnum} param.articleType
 * @param {ArticleReferenceInput} param.reference
 * @param {object} user - The user submitting this article
 * @returns {Promise<{articleId: string, isNew: boolean}>} the article's ID, and
 *   whether it is created by this call
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
  const matchedArticle = await client.search({
    index: 'articles',
    query: {
      term: {
        attachmentHash,
      },
    },
  });

  if (getTotalCount(matchedArticle.hits.total)) {
    return { articleId: matchedArticle.hits.hits[0]._id, isNew: false };
  }

  // use elasticsearch created id
  const { _id: articleId } = await client.index({
    index: 'articles',
    document: {
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
      hyperlinks: [],
      articleType,
      attachmentHash,
      status: getContentDefaultStatus(user),
      contributors: [],
    },
    refresh: 'true', // Many use cases would search after media creation, thus refresh here
  });

  return { articleId, isNew: true };
}

/**
 * @param {string} articleId - For target article
 * @param {string} text
 * @returns result of article & ydoc operation
 */
export function writeAITranscript(articleId, text) {
  // Write aiResponse to articles. Races against createOrUpdateReplyRequest's
  // script-update on the same article, which the caller runs concurrently with
  // this, and against the embedding write. Writing `text` is idempotent, so
  // retrying on conflict is safe.
  const writeToArticleTextPromise = client.update({
    index: 'articles',
    id: articleId,
    doc: { text },
    retry_on_conflict: 3,
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
    id: articleId,
    document: {
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

    const mediaType = VALID_ARTICLE_TYPE_TO_MEDIA_TYPE[articleType];

    const queryResult = await mediaManager.query({ url: mediaUrl });
    if (!mediaType || mediaType !== queryResult.queryInfo.type) {
      throw new Error(
        `Specified article type is "${articleType}", but the media file is a ${queryResult.queryInfo.type}.`
      );
    }

    // Media manager is the one that knows whether the file is there: get the
    // stored media entry (e.g. the media has been searched before), or upload
    // the media and wait until its file is readable. Transcript and embedding
    // below then share that file, and deal with nothing but their own text /
    // vectors (including whether they are made before).
    const mediaEntry = await getOrUploadMedia({
      mediaUrl,
      queryResult,
      user,
    });
    const queryInfo = { id: mediaEntry.id, type: mediaType };

    const articlePromise = createNewMediaArticle({
      mediaEntry,
      articleType,
      reference,
      user,
    });
    const aritcleIdPromise = articlePromise.then(({ articleId }) => articleId);

    // An existing article is not transcribed again, as its text may have been
    // edited already; only the transcript made before is applied.
    const aiResponsePromise = articlePromise
      .then(({ isNew }) =>
        isNew
          ? createTranscript(queryInfo, mediaEntry, user)
          : getAIResponse({ type: 'TRANSCRIPT', docId: mediaEntry.id })
      )
      .then((aiResponse) =>
        aiResponse?.status === 'SUCCESS' ? aiResponse : null
      );

    // Embeddings for hybrid search; audio/video as a single vector capped at
    // EMBEDDING_MEDIA_MAX_SEC (see createEmbedding). Only a new article is
    // embedded; existing ones without embeddings are left to the backfill.
    const embeddingApplied = articlePromise
      .then(async ({ articleId, isNew }) => {
        if (!isNew) return;

        const embeddings = await createMediaEmbedding(
          queryInfo,
          mediaEntry,
          user
        );

        // writeAITranscript runs in parallel and also partial-updates
        // this article (text field). Without retry, concurrent updates
        // race on _seq_no and one side gets HTTP 409.
        return client.update({
          index: 'articles',
          id: articleId,
          doc: { embeddings },
          retry_on_conflict: 3,
        });
      })
      // Embedding failure must not fail the mutation — backfill will retry
      .catch((e) =>
        console.warn(
          `[CreateMediaArticle] embedding for ${mediaEntry.id}:`,
          e instanceof errors.ResponseError ? e.meta : e
        )
      );

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

          // Archive URLs in transcript; don't wait for it
          archiveUrlsFromText(aiResponse.text);

          return writeAITranscript(articleId, aiResponse.text);
        })
        .then(() => {
          console.log(
            `[CreateMediaArticle] AI transcript for ${mediaEntry.id} applied`
          );
        })
        // It's OK to fail this promise, just log as warning
        .catch((e) =>
          console.warn(
            `[CreateMediaArticle] ${mediaEntry.id}:`,

            // `meta` is provided by elasticsearch error response
            e instanceof errors.ResponseError ? e.meta : e
          )
        ),

      embeddingApplied,
    ]);

    return { id: await aritcleIdPromise };
  },
};
