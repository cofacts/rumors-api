import {
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLEnumType,
  GraphQLString,
  GraphQLNonNull,
} from 'graphql';

const ArticleReferenceTypeEnum = new GraphQLEnumType({
  name: 'ArticleReferenceTypeEnum',
  description: 'Where this article is collected from.',
  values: {
    URL: {
      value: 'URL',
      description:
        'The article is collected from the Internet, with a link to the article available.',
    },
    LINE: {
      value: 'LINE',
      description:
        'The article is collected from conversations in LINE messengers.',
    },
  },
});

export default new GraphQLObjectType({
  name: 'ArticleReference',
  fields: () => ({
    createdAt: { type: new GraphQLNonNull(GraphQLString) },
    type: { type: new GraphQLNonNull(ArticleReferenceTypeEnum) },
    permalink: { type: GraphQLString },
  }),
});

export const ArticleReferenceInput = new GraphQLInputObjectType({
  name: 'ArticleReferenceInput',
  fields: () => ({
    type: { type: new GraphQLNonNull(ArticleReferenceTypeEnum) },
    permalink: { type: GraphQLString },
  }),
});
