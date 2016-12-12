import {
  GraphQLObjectType,
  GraphQLSchema,
} from 'graphql';

// Full-text search
import Search from './queries/Search';

// Get individual objects
import GetRumor from './queries/GetRumor';
import GetAnswer from './queries/GetAnswer';

export default new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      Search,
      GetRumor,
      GetAnswer,
    },
  }),
  // mutation: new GraphQLSchema({
  //   name: 'Mutation'
  // })
});
