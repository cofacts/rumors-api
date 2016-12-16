import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

export default new GraphQLObjectType({
  name: 'CrawledDoc',
  description: 'A document that is crawled from selected myth-busting websites',
  fields: {
    rumor: { type: GraphQLString },
    answer: { type: GraphQLString },
    url: { type: GraphQLString },
  },
});
