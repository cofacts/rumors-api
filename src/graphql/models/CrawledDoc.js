import { GraphQLObjectType, GraphQLString } from 'graphql';

const CrawledDoc = new GraphQLObjectType({
  name: 'CrawledDoc',
  description: 'A document that is crawled from selected myth-busting websites',
  fields: {
    rumor: { type: GraphQLString },
    answer: { type: GraphQLString },
    url: { type: GraphQLString },
  },
});

export default CrawledDoc;
