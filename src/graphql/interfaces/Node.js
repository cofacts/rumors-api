import { GraphQLInterfaceType, GraphQLID, GraphQLNonNull } from 'graphql';

const Node = new GraphQLInterfaceType({
  name: 'Node',
  description:
    "Basic entity. Modeled after Relay's GraphQL Server Specification.",
  fields: {
    id: { type: new GraphQLNonNull(GraphQLID) },
  },
});

export default Node;
