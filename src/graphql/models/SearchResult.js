import {
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLString,
  GraphQLList,
} from 'graphql';

import Answer from 'graphql/models/Answer';
import Rumor from 'graphql/models/Rumor';

function scoredDocFactory(name, type) {
  return new GraphQLObjectType({
    name,
    fields: {
      score: { type: GraphQLFloat },
      doc: { type },
    },
  });
}

export default new GraphQLObjectType({
  name: 'SearchResult',
  fields: () => ({
    rumors: { type: new GraphQLList(scoredDocFactory('ScoredRumor', Rumor)) },
    answers: { type: new GraphQLList(scoredDocFactory('ScoredAnswer', Answer)) },
  }),
});
