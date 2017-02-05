import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

import {
  scoredDocFactory,
} from 'graphql/util';

const CrawledDoc = new GraphQLObjectType({
  name: 'CrawledDoc',
  description: 'A document that is crawled from selected myth-busting websites',
  fields: {
    rumor: { type: GraphQLString },
    answer: { type: GraphQLString },
    url: { type: GraphQLString },
  },
});

export const ScoredCrawledDoc = scoredDocFactory('ScoredCrawledDoc', CrawledDoc);

export default CrawledDoc;
