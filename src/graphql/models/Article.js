import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
  GraphQLBoolean,
  GraphQLNonNull,
} from 'graphql';

import {
  scoredDocFactory,
  getFilterableType,
  pagingArgs,
  getPagedType,
  getArithmeticExpressionType,
  getSortableType,
  getSortArgs,
  getSearchAfterFromCursor,
  getOperatorAndOperand,
} from 'graphql/util';

import ArticleReference from 'graphql/models/ArticleReference';

import Reply from './Reply';

const Article = new GraphQLObjectType({
  name: 'Article',
  fields: () => ({
    id: { type: GraphQLString },
    text: { type: GraphQLString },
    references: { type: new GraphQLList(ArticleReference) },
    replyCount: {
      type: GraphQLInt,
      resolve: ({ replyIds }) => (replyIds || []).length,
    },
    replies: {
      type: new GraphQLList(Reply),
      resolve: ({ replyIds }, args, { loaders }) =>
        loaders.docLoader.loadMany(replyIds.map(id => `/replies/basic/${id}`)),
    },
    replyRequestCount: {
      type: GraphQLInt,
      resolve: ({ replyRequestIds }) => replyRequestIds.length,
    },
    requestedForReply: {
      type: GraphQLBoolean,
      description: 'If the specified user has requested for reply for this article',
      args: {
        userId: {
          type: new GraphQLNonNull(GraphQLString),
          description: 'Whose reply request record to look for',
        },
        from: {
          type: new GraphQLNonNull(GraphQLString),
          deprecationReason: 'Will remove after API keys are implemented',
        },
      },
      resolve: async ({ replyRequestIds }, { userId, from }, { loaders }) => {
        const requests = await loaders.docLoader.loadMany(replyRequestIds.map(id => `/replyrequests/basic/${id}`));
        return !!requests.find(r => r.userId === userId && r.from === from);
      },
    },
    relatedArticles: {
      args: {
        filter: {
          type: getFilterableType('RelatedArticleFilter', {
            replyCount: { type: getArithmeticExpressionType('ReplyCountExpr', GraphQLInt) },
          }),
        },
        orderBy: {
          type: getSortableType('RelatedArticleOrderBy', ['_score', 'updatedAt']),
        },
        ...pagingArgs,
      },
      async resolve({ id }, { filter = {}, orderBy = [], first, after }) {
        const body = {
          query: {
            more_like_this: {
              fields: ['text'],
              like: [{ _index: 'articles', _type: 'basic', _id: id }],
              min_term_freq: 1,
              min_doc_freq: 1,
            },
          },
        };

        if (after) {
          body.search_after = getSearchAfterFromCursor(after);
        }

        if (filter.replyCount) {
          // Switch to bool query so that we can filter more_like_this results
          //
          const { operator, operand } = getOperatorAndOperand(filter.replyCount);
          body.query = {
            bool: {
              must: body.query,
              filter: { script: { script: {
                inline: `doc['replyIds'].length ${operator} params.operand`,
                params: {
                  operand,
                },
              } } },
            },
          };
        }

        body.sort = getSortArgs(orderBy);

        return {
          index: 'articles',
          type: 'basic',
          body,
          size: first,
          trackScores: true, // required to always populate score
        };
      },

      type: getPagedType('RelatedArticleResult', Article),
    },
  }),
});

export const ScoredArticle = scoredDocFactory('ScoredArticle', Article);

export default Article;
