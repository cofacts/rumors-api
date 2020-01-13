import rollbar from '../rollbarInstance';
import grpc from 'grpc';
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = __dirname + '/protobuf/url_resolver.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const urlResolverProto = grpc.loadPackageDefinition(packageDefinition)
  .url_resolver;

const URL_RESOLVER_URL = process.env.URL_RESOLVER_URL || 'localhost:4000';
const client = new urlResolverProto.UrlResolver(
  URL_RESOLVER_URL,
  grpc.credentials.createInsecure()
);

// Receiving stream response from resolver using gRPC
export default urls =>
  new Promise((resolve, reject) => {
    const call = client.ResolveUrl({ urls });
    const responses = [];
    call.on('data', response => {
      responses.push(response);
    });
    call.on('error', err => {
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
