import { GraphQLObjectType, GraphQLString } from 'graphql';

/**
 *
 * @param {string} field
 * @returns {resolveFn} Resolves URL entry using url or normalizedUrl
 */
function resolveUrl(field) {
  return async function({ url, normalizedUrl }, args, { loaders }) {
    const urls = [url];
    if (normalizedUrl) {
      // Only consider normalizedUrl when there is one
      urls.push(normalizedUrl);
    }
    const urlEnties = await loaders.urlLoader.loadMany(urls);
    const firstEntry = urlEnties.find(urlEntry => urlEntry) || {};
    return firstEntry[field];
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
