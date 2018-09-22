import fetch from 'node-fetch';
import rollbar from '../rollbarInstance';
import url from 'url';
import config from 'config';

const API_URL = config.get('URL_RESOLVER_URL') || 'http://localhost:4000/';

// Usage:
//
// import gql from './util/GraphQL';
// gql`query($var: Type) { foo }`({var: 123}).then(...)
//
// gql`...`() returns a promise that resolves to immutable Map({data, errors}).
//
// We use template string here so that Atom's language-babel does syntax highlight
// for us.
//
// GraphQL Protocol: http://dev.apollodata.com/tools/graphql-server/requests.html
//
export default (query, ...substitutions) => (variables, search) => {
  const queryAndVariable = {
    query: String.raw(query, ...substitutions),
  };

  if (variables) queryAndVariable.variables = variables;

  let status;
  const URL = `${API_URL}${url.format({ query: search })}`;

  return fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(queryAndVariable),
  })
    .then(r => {
      status = r.status;
      return r.json();
    })
    .then(resp => {
      if (status === 400) {
        throw new Error(
          `GraphQL Error: ${resp.errors
            .map(({ message }) => message)
            .join('\n')}`
        );
      }
      if (resp.errors) {
        // When status is 200 but have error, just print them out.
        // eslint-disable-next-line no-console
        console.error('GraphQL operation contains error:', resp.errors);
        rollbar.error(
          'GraphQL error',
          {
            body: JSON.stringify(queryAndVariable),
            url: URL,
          },
          { resp }
        );
      }
      return resp;
    });
};
