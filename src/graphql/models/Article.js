import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
  GraphQLBoolean,
} from 'graphql';

import {
  pagingArgs,
  getArithmeticExpressionType,
  getSortArgs,
  getOperatorAndOperand,
  createFilterType,
  createSortType,
  createConnectionType,
  assertUser,
} from 'graphql/util';

import ArticleReference from 'graphql/models/ArticleReference';
import User, { userFieldResolver } from 'graphql/models/User';

import ReplyConnection from './ReplyConnection';

const Article = new GraphQLObjectType({
  name: 'Article',
  fields: () => ({
    id: { type: GraphQLString },
    text: { type: GraphQLString },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
    references: { type: new GraphQLList(ArticleReference) },
    replyCount: {
      type: GraphQLInt,
      resolve: ({ id }, args, { loaders }) =>
        loaders.childrenCountLoader.load({
          parentId: id,
          childType: 'replyconnections',
        }),
    },
    replyConnections: {
      type: new GraphQLList(ReplyConnection),
      resolve: ({ id }, args, { loaders }) =>
        loaders.childrenLoader.load({
          parentId: id,
          childType: 'replyconnections',
        }),
    },
    replyRequestCount: {
      type: GraphQLInt,
      resolve: ({ id }, args, { loaders }) =>
        loaders.childrenCountLoader.load({
          parentId: id,
          childType: 'replyrequests',
        }),
    },
    requestedForReply: {
      type: GraphQLBoolean,
      description: 'If the current user has requested for reply for this article',
      resolve: async ({ id }, args, { loaders, userId, from }) => {
        assertUser({ userId, from });
        const result = await loaders.searchResultLoader.load({
          body: {
            query: {
              bool: {
                must: [
                  { parent_id: { type: 'replyrequests', id } },
                  { term: { userId } },
                ],
              },
            },
          },
          _index: 'data',
        });

        return result.length >= 1;
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
            replyCount: {
              type: getArithmeticExpressionType('ReplyCountExpr', GraphQLInt),
            },
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
      async resolve({ id }, { filter = {}, orderBy = [], ...otherParams }) {
        const body = {
          query: {
            bool: {
              must: {
                more_like_this: {
                  fields: ['text'],
                  like: [{ _index: 'data', _type: 'articles', _id: id }],
                  min_term_freq: 1,
                  min_doc_freq: 1,
                },
              },
              filter: [],
            },
          },
          sort: getSortArgs(orderBy),
          track_scores: true, // required to always populate score
        };

        if (filter.replyCount) {
          const { operator, operand } = getOperatorAndOperand(
            filter.replyCount
          );
          const hasChildFilter = {
            type: 'replyconnections',
            query: { match_all: {} },
          };
          switch (operator) {
            case '==':
              hasChildFilter.max_children = +operand;
              hasChildFilter.min_children = +operand;
              break;
            case '>':
              hasChildFilter.min_children = +operand + 1;
              break;
            case '<':
              hasChildFilter.max_children = +operand - 1;
              break;
          }

          // replyCount filter do not affect score
          //
          body.query.bool.filter.push({
            has_child: hasChildFilter,
          });
        }

        return {
          index: 'data',
          type: 'articles',
          body,
          ...otherParams,
        };
      },

      // eslint-disable-next-line no-use-before-define
      type: ArticleConnection,
    },
  }),
});

export const ArticleConnection = createConnectionType(
  'ArticleConnection',
  Article
);

export default Article;
