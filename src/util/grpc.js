import rollbar from '../rollbarInstance';
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = __dirname + '/protobuf/url_resolver.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const urlResolverProto =
  grpc.loadPackageDefinition(packageDefinition).url_resolver;

const URL_RESOLVER_URL = process.env.URL_RESOLVER_URL || 'localhost:4000';
const client = new urlResolverProto.UrlResolver(
  URL_RESOLVER_URL,
  grpc.credentials.createInsecure()
);

// Without a deadline, a slow or hanging url-resolver (e.g. resolving a URL that
// redirects through a lot of anti-bot / video-loading pages) can keep this call open
// until an upstream gateway kills the connection, which returns an HTML/empty body
// instead of JSON and breaks GraphQL clients trying to JSON.parse() the response.
const URL_RESOLVER_TIMEOUT_MS =
  Number(process.env.URL_RESOLVER_TIMEOUT_MS) || 10000;

// Receiving stream response from resolver using gRPC
export default (urls) =>
  new Promise((resolve, reject) => {
    const call = client.ResolveUrl(
      { urls },
      { deadline: Date.now() + URL_RESOLVER_TIMEOUT_MS }
    );
    const responses = [];
    call.on('data', (response) => {
      responses.push(response);
    });
    call.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('gRPC operation contains error:', err);
      rollbar.error(
        'gRPC error',
        {
          body: JSON.stringify({ urls }),
          url: URL_RESOLVER_URL,
        },
        { err }
      );
      reject(err);
    });
    call.on('end', () => resolve(responses));
  });
