import 'dotenv/config';
jest.mock(__dirname + '../../src/util/grpc');

expect.extend({
  toBeNaN(received) {
    const pass = isNaN(received);
    return {
      pass,
      message: `expected ${received} ${pass ? 'not ' : ''}to be NaN`,
    };
  },
});
