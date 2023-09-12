import { GraphQLObjectType, GraphQLString, GraphQLList } from 'graphql';

import YdocVersion from './YdocVersion';

const Ydoc = new GraphQLObjectType({
  name: 'Ydoc',
  fields: () => ({
    data: {
      type: GraphQLString,
      // https://www.elastic.co/guide/en/elasticsearch/reference/current/binary.html
      description: 'Binary that stores as base64 encoded string',
    },
    versions: {
      type: new GraphQLList(YdocVersion),
      description:
        'Ydoc snapshots which are used to restore to specific version',
      resolve: async ({ versions }) => {
        return versions || [];
      },
    },
  }),
});

export default Ydoc;
