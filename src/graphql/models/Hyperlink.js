import { GraphQLObjectType, GraphQLString } from 'graphql';

function resolveUrl(field) {
  return async function({ url }, args, { loaders }) {
    const urlEntry = await loaders.urlLoader.load(url);
    return urlEntry[field];
  };
}

const Hyperlink = new GraphQLObjectType({
  name: 'Hyperlink',
  description: 'Data behind a hyperlink',
  fields: {
    url: { type: GraphQLString },
    title: { type: GraphQLString },
    summary: { type: GraphQLString },
    topImageUrl: { type: GraphQLString, resolve: resolveUrl('topImageUrl') },
    fetchedAt: { type: GraphQLString, resolve: resolveUrl('fetchedAt') },
    status: { type: GraphQLString, resolve: resolveUrl('status') },
    error: { type: GraphQLString, resolve: resolveUrl('error') },
  },
});

export default Hyperlink;
