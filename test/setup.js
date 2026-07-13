import 'dotenv/config';

jest.mock(__dirname + '../../src/util/grpc');

jest.mock(__dirname + '../../src/rollbarInstance', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

// Silence Langfuse SDK in tests. Without LANGFUSE_SECRET_KEY, the SDK prints
// a "secret key not passed" warning every time a suite imports graphql/util.
// We don't exercise observability in tests, so a no-op stub is enough.
// `observeOpenAI` returns the client unchanged so SUTs that wrap openai still
// work; `Langfuse.trace()` returns a chainable stub matching the call shape
// used by transcribeAV (trace -> generation -> end + update).
jest.mock('langfuse', () => {
  const stubGeneration = () => ({ end: jest.fn() });
  const stubTrace = () => ({
    generation: jest.fn(stubGeneration),
    update: jest.fn(),
  });
  return {
    Langfuse: jest.fn().mockImplementation(() => ({
      trace: jest.fn(stubTrace),
      shutdownAsync: jest.fn().mockResolvedValue(undefined),
    })),
    observeOpenAI: jest.fn((client) => client),
  };
});

jest.setTimeout(process.env.JEST_TIMEOUT || 5000);


expect.extend({
  toBeNaN(received) {
    const pass = isNaN(received);
    return {
      pass,
      message: `expected ${received} ${pass ? 'not ' : ''}to be NaN`,
    };
  },
});
