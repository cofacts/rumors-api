import { GraphQLInterfaceType, GraphQLNonNull, GraphQLString } from 'graphql';
import Node from './Node';

const Edge = new GraphQLInterfaceType({
  name: 'Edge',
  description: 'Edge in Connection. Modeled after GraphQL connection model.',
  fields: {
    node: { type: new GraphQLNonNull(Node) },
    cursor: { type: new GraphQLNonNull(GraphQLString) },
  },
});

export default Edge;
