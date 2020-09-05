import { GraphQLObjectType, GraphQLString, GraphQLList } from 'graphql';
import Hyperlink from './Hyperlink';

const Highlights = new GraphQLObjectType({
  name: 'Highlights',
  fields: {
    text: {
      type: GraphQLString,
      description: 'Article or Reply text',
    },
    reference: {
      type: GraphQLString,
      description: 'Reply reference',
    },
    hyperlinks: {
      type: new GraphQLList(Hyperlink),
      description: 'Article or Reply hyperlinks',
    },
  },
});

export default Highlights;
