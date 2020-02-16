/**
 * Usage:
 *
 * jest.mock('path-to-grpc/grpc');
 * import resolveUrl from 'path-to-grpc/grpc';
 *
 * it('some test', async () => {
 *   resolveUrl.__addMockResponse([{url, ...}, ...])
 *
 *   const result = await functionUnderTestThatInvokesresolveUrl();
 *
 *   expect(resolveUrl.__getRequests).toMatchSnapshot(); // assert request sent
 *   expect(result).toMatchSnapshot();
 *
 *   resolveUrl.__reset() // Must reset to reset mock responses & call sequence number!
 * })
 */

import delayForMs from 'util/delayForMs';

let seq = 0;
let mockResponses = [];
let requests = [];
let delayMs = 0; // milliseconds

function resolveUrl(urls) {
  if (!mockResponses[seq]) {
    throw Error(
      `resolveUrl Mock error: No response found for request #${seq}. Please add mock response first.`
    );
  }
  requests.push(urls);
  return delayForMs(delayMs).then(() => mockResponses[seq++]);
}

resolveUrl.__addMockResponse = resp => mockResponses.push(resp);
resolveUrl.__setDelay = delay => (delayMs = delay);
resolveUrl.__getRequests = () => requests;
resolveUrl.__reset = () => {
  seq = 0;
  mockResponses = [];
  requests = [];
  delayMs = 0;
};

export default resolveUrl;
