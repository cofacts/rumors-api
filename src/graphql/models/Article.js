import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLInt,
} from 'graphql';

import getIn from 'util/getInFactory';
import ArticleReference from 'graphql/models/ArticleReference';
import {
  getFilterableType,
  pagingArgs,
  getArithmeticExpressionType,
  getSortableType,
  getSearchArgs,
  getBody,
} from 'graphql/util';

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
      async resolve({ id }, args) {
        return getIn(await client.search({
          index: 'articles',
          type: 'basic',
          body: getBody(
            args,
            {
              more_like_this: {
                fields: ['text'],
                like: [{ _index: 'articles', _type: 'basic', _id: id }],
                min_term_freq: 1,
                min_doc_freq: 1,
              },
            },
          ),
          ...getSearchArgs(args),
        }))(['hits', 'hits'], []).map(processMeta);
      },
    },
  }),
});

export default Article;
