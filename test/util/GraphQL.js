import { graphql } from 'graphql';
import schema from 'graphql/schema';
import DataLoaders from 'graphql/dataLoaders';

// Usage:
//
// import gql from './util/GraphQL';
// gql`query($var: Type) { foo }`({var: 123}).then(...)
//
// We use template string here so that Atom's language-babel does syntax highlight
// for us.
//
export default (query, ...substitutes) => (variables = {}, context = {}) =>
  graphql(
    schema,
    String.raw(query, ...substitutes),
    null,
    {
      loaders: new DataLoaders(), // new loaders per request
      ...context,
    },
    variables
  );
