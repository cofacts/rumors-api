// Unlike scrapUrls.js's tests, this file exercises the *real* gRPC client
// (src/util/__mocks__/grpc.js is intentionally not used here) against a throwaway
// gRPC server, so it needs URL_RESOLVER_URL to point at that server *before*
// `../grpc` is imported (the client is created at module load time).
//
// test/setup.js globally mocks this module for every test file; undo that here.
jest.unmock('../grpc');

const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const PROTO_PATH = __dirname + '/../protobuf/url_resolver.proto';
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
const urlResolverProto =
  grpc.loadPackageDefinition(packageDefinition).url_resolver;

/**
 * Starts a throwaway UrlResolver gRPC server on a random free port.
 * @param {(call) => void} onResolveUrl - handler for the ResolveUrl RPC
 * @return {Promise<{server, port}>}
 */
function startFakeUrlResolverServer(onResolveUrl) {
  const server = new grpc.Server();
  server.addService(urlResolverProto.UrlResolver.service, {
    ResolveUrl: onResolveUrl,
  });
  return new Promise((resolve, reject) => {
    server.bindAsync(
      '127.0.0.1:0',
      grpc.ServerCredentials.createInsecure(),
      (err, port) => {
        if (err) return reject(err);
        resolve({ server, port });
      }
    );
  });
}

describe('grpc resolveUrl deadline', () => {
  let server;

  afterEach(() => {
    if (server) {
      server.forceShutdown();
      server = null;
    }
    jest.resetModules();
    delete process.env.URL_RESOLVER_URL;
    delete process.env.URL_RESOLVER_TIMEOUT_MS;
  });

  it('rejects quickly instead of hanging when url-resolver never responds', async () => {
    // Never call any of call.write()/call.end() -- simulates url-resolver hanging
    // forever on a slow/misbehaving URL instead of erroring out or timing out itself.
    const started = await startFakeUrlResolverServer(() => {});
    server = started.server;

    process.env.URL_RESOLVER_URL = `127.0.0.1:${started.port}`;
    process.env.URL_RESOLVER_TIMEOUT_MS = '300';

    let resolveUrl;
    jest.isolateModules(() => {
      resolveUrl = require('../grpc').default;
    });

    const startTime = Date.now();
    await expect(resolveUrl(['http://example.com'])).rejects.toThrow(
      /DEADLINE_EXCEEDED/
    );
    const elapsedMs = Date.now() - startTime;

    // Well under both the old "hangs forever" behavior and Jest's own test timeout.
    expect(elapsedMs).toBeLessThan(5000);
  });

  it('still resolves normally when url-resolver responds well within the deadline', async () => {
    const started = await startFakeUrlResolverServer((call) => {
      call.write({
        url: 'http://example.com',
        canonical: 'http://example.com',
        title: 'Example',
        summary: '',
        top_image_url: '',
        html: '',
        status: 200,
        successfully_resolved: true,
      });
      call.end();
    });
    server = started.server;

    process.env.URL_RESOLVER_URL = `127.0.0.1:${started.port}`;
    process.env.URL_RESOLVER_TIMEOUT_MS = '5000';

    let resolveUrl;
    jest.isolateModules(() => {
      resolveUrl = require('../grpc').default;
    });

    const result = await resolveUrl(['http://example.com']);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Example');
  });
});
