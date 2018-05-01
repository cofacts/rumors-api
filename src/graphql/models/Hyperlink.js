import { GraphQLObjectType, GraphQLString } from 'graphql';

const Hyperlink = new GraphQLObjectType({
  name: 'Hyperlink',
  description: 'Data behind a hyperlink',
  fields: {
    url: { type: GraphQLString },
    title: { type: GraphQLString },
    summary: { type: GraphQLString },
  },
});

export default Hyperlink;
