import {
  GraphQLObjectType,
  GraphQLSchema,
} from 'graphql';

// Full-text search
import Search from './queries/Search';

// Get individual objects
import GetArticle from './queries/GetArticle';
import GetReply from './queries/GetReply';

// Set individual objects
import SetArticle from './mutations/SetArticle';
import SetReply from './mutations/SetReply';

export default new GraphQLSchema({
  query: new GraphQLObjectType({
    name: 'Query',
    fields: {
      Search,
      GetArticle,
      GetReply,
    },
  }),
  mutation: new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      SetArticle,
      SetReply,
    },
  }),
});
