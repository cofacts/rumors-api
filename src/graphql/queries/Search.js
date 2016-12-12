import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

import SearchResult from 'graphql/models/SearchResult';

export default {
  type: SearchResult,
  args: {
    text: { type: GraphQLString },
  },
  resolve(rootValue, { text, image }) {

  },
};
