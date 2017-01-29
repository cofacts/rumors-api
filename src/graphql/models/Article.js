import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
} from 'graphql';

import {
  getFilterableType,
  pagingArgs,
  getArithmeticExpressionType,
  getSortableType,
  getSortArgs,
  getOperatorAndOperand,
} from 'graphql/util';

import getIn from 'util/getInFactory';
import ArticleReference from 'graphql/models/ArticleReference';

import client, { processMeta } from 'util/client';
import Reply from './Reply';

const Article = new GraphQLObjectType({
  name: 'Article',
  fields: () => ({
    id: { type: GraphQLString },
    text: { type: GraphQLString },
    references: { type: new GraphQLList(ArticleReference) },
    replies: {
      type: new GraphQLList(Reply),
      resolve: ({ replyIds }, args, { loaders }) =>
        loaders.docLoader.loadMany(replyIds.map(id => `/replies/basic/${id}`)),
    },
    relatedArticles: {
      type: new GraphQLList(Article),
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
      async resolve({ id }, { filter = {}, orderBy = [], first, skip }) {
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

        if (orderBy.length) {
          body.sort = getSortArgs(orderBy);
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

        return getIn(await client.search({
          index: 'articles',
          type: 'basic',
          body,
          from: skip,
          size: first,
        }))(['hits', 'hits'], []).map(processMeta);
      },
    },
  }),
});

export default Article;
