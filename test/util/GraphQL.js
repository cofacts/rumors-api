import { graphql } from 'graphql';
import schema from 'graphql/schema';
import DataLoaders from 'graphql/dataLoaders';

export default function GraphQL(query) {
  if (typeof query === 'string') {
    query = {
      query,
      variables: undefined,
    };
  }

  return graphql(schema, query.query, null, {
    loaders: new DataLoaders(), // new loaders per request
  }, query.variables);
}
