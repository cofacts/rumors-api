/**
 * Usage:
 *
 * jest.mock('path-to-gql/gql');
 *
 * it('some test', async () => {
 *   gql.__addMockResponse({data: {queryName: result})
 *
 *   const result = await functionUnderTestThatInvokesGql();
 *
 *   expect(gql.__getRequests).toMatchSnapshot(); // assert request sent
 *   expect(result).toMatchSnapshot();
 *
 *   gql.__reset() // Must reset to reset mock responses & call sequence number!
 * })
 */

let seq = 0;
let mockResponses = [];
let requests = [];

function gql(query, ...substitutions) {
  if (!mockResponses[seq]) {
    throw Error(
      `gql Mock error: No response found for request #${seq}. Please add mock response first.`
    );
  }

  return variables => {
    const queryAndVariable = {
      query: String.raw(query, ...substitutions),
    };

    if (variables) queryAndVariable.variables = variables;

    requests.push(queryAndVariable);

    return Promise.resolve(mockResponses[seq++]);
  };
}

gql.__addMockResponse = resp => mockResponses.push(resp);
gql.__getRequests = () => requests;
gql.__reset = () => {
  seq = 0;
  mockResponses = [];
  requests = [];
};

export default gql;
