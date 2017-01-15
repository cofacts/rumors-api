import {
  GraphQLObjectType,
  GraphQLSchema,
} from 'graphql';

// Full-text search
import Search from './queries/Search';

// Get individual objects
import GetRumor from './queries/GetRumor';
import GetAnswer from './queries/GetAnswer';

// Set individual objects
import SetRumor from './mutations/SetRumor';
import SetAnswer from './mutations/SetAnswer';

export default new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      Search,
      GetRumor,
      GetAnswer,
    },
  }),
  mutation: new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      SetRumor,
      SetAnswer,
    },
  }),
});
