/**
 * Usage:
 *
 * jest.mock('path-to-resolveUrl/resolveUrl');
 *
 * it('some test', async () => {
 *   resolveUrl.__addMockResponse({data: {queryName: result})
 *
 *   const result = await functionUnderTestThatInvokesresolveUrl();
 *
 *   expect(resolveUrl.__getRequests).toMatchSnapshot(); // assert request sent
 *   expect(result).toMatchSnapshot();
 *
 *   resolveUrl.__reset() // Must reset to reset mock responses & call sequence number!
 * })
 */

let seq = 0;
let mockResponses = [];
let requests = [];

function resolveUrl(url) {
  if (!mockResponses[seq]) {
    throw Error(
      `resolveUrl Mock error: No response found for request #${seq}. Please add mock response first.`
    );
  }
  requests.push(url);
  return Promise.resolve(mockResponses[seq++]);
}

resolveUrl.__addMockResponse = resp => mockResponses.push(resp);
resolveUrl.__getRequests = () => requests;
resolveUrl.__reset = () => {
  seq = 0;
  mockResponses = [];
  requests = [];
};

export default resolveUrl;
