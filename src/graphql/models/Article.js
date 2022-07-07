import {
  GraphQLNonNull,
  GraphQLID,
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLEnumType,
} from 'graphql';

import {
  pagingArgs,
  intRangeInput,
  getSortArgs,
  getRangeFieldParamFromArithmeticExpression,
  createFilterType,
  createSortType,
  createConnectionType,
  createCommonListFilter,
  filterByStatuses,
  timeRangeInput,
  DEFAULT_ARTICLE_REPLY_STATUSES,
  DEFAULT_ARTICLE_CATEGORY_STATUSES,
  DEFAULT_REPLY_REQUEST_STATUSES,
} from 'graphql/util';

import Node from '../interfaces/Node';
import Analytics from 'graphql/models/Analytics';
import ArticleReference from 'graphql/models/ArticleReference';
import User, { userFieldResolver } from 'graphql/models/User';
import mediaManager, {
  IMAGE_PREVIEW,
  IMAGE_THUMBNAIL,
} from 'util/mediaManager';
import ArticleReplyStatusEnum from './ArticleReplyStatusEnum';
import ArticleReply from './ArticleReply';
import ArticleCategoryStatusEnum from './ArticleCategoryStatusEnum';
import ReplyRequestStatusEnum from './ReplyRequestStatusEnum';
import ArticleCategory from './ArticleCategory';
import Hyperlink from './Hyperlink';
import ReplyRequest from './ReplyRequest';
import ArticleTypeEnum from './ArticleTypeEnum';

const ATTACHMENT_URL_DURATION_DAY = 1;

const {
  // article replies do not have ids
  ids: dontcare, // eslint-disable-line no-unused-vars
  // it is hard to parse timeRangeInput in JS, so don't support this yet.
  createdAt: dontcare2, // eslint-disable-line no-unused-vars
  ...articleReplyCommonFilterArgs
} = createCommonListFilter('articleReplies');

const Article = new GraphQLObjectType({
  name: 'Article',
  interfaces: [Node],
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    text: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
    references: { type: new GraphQLList(ArticleReference) },
    replyCount: {
      type: GraphQLInt,
      description: 'Number of normal article replies',
      resolve: ({ normalArticleReplyCount }) => normalArticleReplyCount,
    },
    articleReplies: {
      type: new GraphQLList(ArticleReply),
      description:
        'Connections between this article and replies. Sorted by the logic described in https://github.com/cofacts/rumors-line-bot/issues/78.',
      args: {
        status: {
          type: ArticleReplyStatusEnum,
          description:
            'Deprecated. Please use statuses instead. When specified, returns only article replies with the specified status',
        },
        statuses: {
          type: new GraphQLList(new GraphQLNonNull(ArticleReplyStatusEnum)),
          defaultValue: DEFAULT_ARTICLE_REPLY_STATUSES,
          description:
            'Returns only article replies with the specified statuses',
        },
        ...articleReplyCommonFilterArgs,
      },
      resolve: async (
        { id, articleReplies = [] },
        { status, statuses = DEFAULT_ARTICLE_REPLY_STATUSES, ...commonFilters },
        { userId, appId }
      ) => {
        const filteredArticleReplies = filterByStatuses(
          articleReplies,
          status ? [status] : statuses
        )
          .filter(
            articleReply =>
              // Reject if current articleReply does not comply with any of the given `commonFilters`.
              // If no `commonFilters` is specified, articleReply is not filtered out.
              !(
                (commonFilters.appId &&
                  articleReply.appId !== commonFilters.appId) ||
                (commonFilters.userId &&
                  articleReply.userId !== commonFilters.userId) ||
                (commonFilters.selfOnly &&
                  (articleReply.userId !== userId ||
                    articleReply.appId !== appId))
              )
          )
          .map(articleReply => {
            // Inject articleId to each articleReply
            articleReply.articleId = id;
            return articleReply;
          });

        if (filteredArticleReplies.length === 0) return [];

        // Sort by usefulness (= positive - negative feedbacks)
        // then use latest first
        const sortedArticleReplies = filteredArticleReplies.sort((a, b) => {
          const usefulnessDiff =
            b.positiveFeedbackCount -
            b.negativeFeedbackCount -
            (a.positiveFeedbackCount - a.negativeFeedbackCount);

          if (usefulnessDiff !== 0) return usefulnessDiff;

          return +new Date(b.createdAt) - +new Date(a.createdAt);
        });

        let latestIdx;
        let latestCreatedAt = ''; // Any iso timestring should be larger than ''
        sortedArticleReplies.forEach(({ createdAt }, idx) => {
          if (createdAt > latestCreatedAt) {
            latestIdx = idx;
            latestCreatedAt = createdAt;
          }
        });

        const [latestArticleReply] = sortedArticleReplies.splice(latestIdx, 1);

        return [latestArticleReply, ...sortedArticleReplies];
      },
    },

    articleCategories: {
      type: new GraphQLList(ArticleCategory),
      args: {
        status: {
          type: ArticleCategoryStatusEnum,
          description:
            'Deprecated. Please use statuses instead. When specified, returns only article categories with the specified status',
        },
        statuses: {
          type: new GraphQLList(new GraphQLNonNull(ArticleCategoryStatusEnum)),
          defaultValue: DEFAULT_ARTICLE_CATEGORY_STATUSES,
          description:
            'Returns only article categories with the specified statuses',
        },
      },

      resolve: async (
        { id, articleCategories = [] },
        { status, statuses = DEFAULT_ARTICLE_CATEGORY_STATUSES }
      ) => {
        // sort by created
        const sortedArticleCategories = filterByStatuses(
          // Inject articleId to each articleCategory
          articleCategories.map(articleCategory => {
            articleCategory.articleId = id;
            return articleCategory;
          }),
          status ? [status] : statuses
        ).sort((a, b) => {
          return +new Date(b.createdAt) - +new Date(a.createdAt);
        });

        return sortedArticleCategories;
      },
    },

    categoryCount: {
      type: GraphQLInt,
      description: 'Number of normal article categories',
      resolve: ({ normalArticleCategoryCount }) => normalArticleCategoryCount,
    },

    replyRequests: {
      type: new GraphQLList(ReplyRequest),
      args: {
        statuses: {
          type: new GraphQLList(new GraphQLNonNull(ReplyRequestStatusEnum)),
          defaultValue: DEFAULT_ARTICLE_REPLY_STATUSES,
          description:
            'Returns only article replies with the specified statuses',
        },
      },
      resolve: async (
        { id },
        { statuses = DEFAULT_REPLY_REQUEST_STATUSES },
        { loaders }
      ) =>
        loaders.searchResultLoader.load({
          index: 'replyrequests',
          body: {
            query: {
              bool: {
                must: [
                  { term: { articleId: id } },
                  { terms: { status: statuses } },
                ],
              },
            },
            size: 1000,
          },
        }),
    },
    replyRequestCount: { type: GraphQLInt },
    lastRequestedAt: { type: GraphQLString },
    requestedForReply: {
      type: GraphQLBoolean,
      description:
        'If the current user has requested for reply for this article. Null if not logged in.',
      resolve: async ({ id }, args, { user, loaders }) => {
        if (!user) return null;

        const userReplyRequests = await loaders.searchResultLoader.load({
          index: 'replyrequests',
          body: {
            query: {
              bool: {
                must: [
                  { term: { userId: user.id } },
                  { term: { articleId: id } },
                ],
              },
            },
          },
        });

        return userReplyRequests && userReplyRequests.length > 0;
      },
    },
    user: {
      type: User,
      description: 'The user submitted this article',
      resolve: userFieldResolver,
    },
    relatedArticles: {
      args: {
        filter: {
          type: createFilterType('RelatedArticleFilter', {
            replyCount: { type: intRangeInput },
          }),
        },
        orderBy: {
          type: createSortType('RelatedArticleOrderBy', [
            '_score',
            'updatedAt',
          ]),
        },
        ...pagingArgs,
      },
      async resolve(
        { id },
        { filter = {}, orderBy = [{ _score: 'DESC' }], ...otherParams }
      ) {
        const body = {
          query: {
            bool: {
              should: [
                {
                  more_like_this: {
                    fields: ['text'],
                    like: [{ _index: 'articles', _type: 'doc', _id: id }],
                    min_term_freq: 1,
                    min_doc_freq: 1,
                  },
                },
                {
                  nested: {
                    path: 'hyperlinks',
                    score_mode: 'sum',
                    query: {
                      more_like_this: {
                        fields: ['hyperlinks.title', 'hyperlinks.summary'],
                        like: [{ _index: 'articles', _type: 'doc', _id: id }],
                        min_term_freq: 1,
                        min_doc_freq: 1,
                      },
                    },
                    inner_hits: {
                      highlight: {
                        order: 'score',
                        fields: {
                          'hyperlinks.title': {
                            number_of_fragments: 1, // Return only 1 piece highlight text
                            fragment_size: 200, // word count of highlighted fragment
                            type: 'plain',
                          },
                          'hyperlinks.summary': {
                            number_of_fragments: 1, // Return only 1 piece highlight text
                            fragment_size: 200, // word count of highlighted fragment
                            type: 'plain',
                          },
                        },
                        require_field_match: false,
                        pre_tags: ['<HIGHLIGHT>'],
                        post_tags: ['</HIGHLIGHT>'],
                      },
                    },
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
          sort: getSortArgs(orderBy),
          track_scores: true, // required to always populate score
        };

        if (filter.replyCount) {
          body.query.bool.filter = [
            {
              range: {
                normalArticleReplyCount: getRangeFieldParamFromArithmeticExpression(
                  filter.replyCount
                ),
              },
            },
          ];
        }

        return {
          index: 'articles',
          type: 'doc',
          body,
          ...otherParams,
        };
      },
      // eslint-disable-next-line no-use-before-define
      type: ArticleConnection,
    },
    hyperlinks: {
      type: new GraphQLList(Hyperlink),
      description: 'Hyperlinks in article text',
    },
    stats: {
      type: new GraphQLList(Analytics),
      description: 'Activities analytics for the given article',
      args: {
        dateRange: {
          type: timeRangeInput,
          description:
            'List only the activities between the specific time range.',
        },
      },
      resolve: async ({ id }, { dateRange }, { loaders }) => {
        return await loaders.analyticsLoader.load({
          docId: id,
          docType: 'article',
          dateRange,
        });
      },
    },
    articleType: {
      type: new GraphQLNonNull(ArticleTypeEnum),
      description: 'Message event type',
      resolve: async ({ articleType }) => {
        return articleType || 'TEXT';
      },
    },
    attachmentUrl: {
      type: GraphQLString,
      description:
        'Attachment URL for this article. Possibly null when uploading, or if variant does not exist.',
      args: {
        variant: {
          type: new GraphQLEnumType({
            name: 'AttachmentEnum',
            values: {
              ORIGINAL: {
                value: 'ORIGINAL',
                description:
                  'The original file. Only available to logged-in users.',
              },
              PREVIEW: {
                value: 'PREVIEW',
                description:
                  'Downsized file. Fixed-width webp for images; other type TBD.',
              },
              THUMBNAIL: {
                value: 'THUMBNAIL',
                description:
                  'Tiny, static image representing the attachment. Fixed-height jpeg for images; other types TBD.',
              },
            },
          }),
        },
      },
      async resolve(
        { attachmentHash, articleType },
        { variant: variantArg },
        { user }
      ) {
        if (!attachmentHash) return null;

        const mediaEntry = await mediaManager.get(attachmentHash);
        if (!mediaEntry) return null;

        let variant = 'original';
        switch (variantArg) {
          case 'PREVIEW':
            if (articleType === 'IMAGE') {
              variant = IMAGE_PREVIEW;
            }
            break;

          case 'THUMBNAIL':
            if (articleType === 'IMAGE') {
              variant = IMAGE_THUMBNAIL;
            }
            break;
        }

        // Don't return URL to original variant for non-website URLs
        if (variant === 'original' && !(user && user.appId === 'WEBSITE'))
          return null;

        const file = mediaEntry.getFile(variant);
        // Returns signed URL for the file
        const [url] = await file.getSignedUrl({
          action: 'read',
          expires:
            (Math.ceil(Date.now() / 86400000) + ATTACHMENT_URL_DURATION_DAY) *
            86400000,
        });

        return url;
      },
    },
    attachmentHash: {
      type: GraphQLString,
      description: 'Attachment hash to search or identify files',
    },
  }),
});

export const ArticleConnection = createConnectionType(
  'ArticleConnection',
  Article
);

export default Article;
