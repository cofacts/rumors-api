import {
  GraphQLInterfaceType,
  GraphQLNonNull,
  GraphQLList,
  GraphQLInt,
} from 'graphql';
import Edge from './Edge';
import PageInfo from './PageInfo';

const Connection = new GraphQLInterfaceType({
  name: 'Connection',
  description:
    "Connection model for a list of nodes. Modeled after Relay's GraphQL Server Specification.",
  fields: {
    edges: {
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(Edge))),
    },
    totalCount: { type: new GraphQLNonNull(GraphQLInt) },
    pageInfo: { type: new GraphQLNonNull(PageInfo) },
  },
});

export default Connection;
