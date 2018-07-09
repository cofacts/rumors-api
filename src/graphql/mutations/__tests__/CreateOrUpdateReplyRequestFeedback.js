import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateOrUpdateReplyRequestFeedback';

describe('CreateOrUpdateReplyRequestFeedback', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('creates new feedback', async () => {
    MockDate.set(1485593157011);
    const userId = 'fb-user-2';
    const appId = 'app';
    const replyRequestId = 'foo';

    const { data, errors } = await gql`
      mutation($replyRequestId: String!) {
        CreateOrUpdateReplyRequestFeedback(
          replyRequestId: $replyRequestId
          vote: UPVOTE
        ) {
          feedbackCount
          positiveFeedbackCount
          negativeFeedbackCount
        }
      }
    `(
      {
        replyRequestId,
      },
      { userId, appId }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const replyrequest = await client.get({
      index: 'replyrequests',
      type: 'doc',
      id: replyRequestId,
    });
    expect(replyrequest._source).toMatchSnapshot();

    // Cleanup
    await resetFrom(fixtures, '/replyrequests/doc/foo');
  });

  it('updates existing feedback', async () => {
    MockDate.set(1485593157011);
    const userId = 'fb-user-1';
    const appId = 'app';
    const replyRequestId = 'foo';

    const { data, errors } = await gql`
      mutation($replyRequestId: String!) {
        CreateOrUpdateReplyRequestFeedback(
          replyRequestId: $replyRequestId
          vote: DOWNVOTE
        ) {
          feedbackCount
          positiveFeedbackCount
          negativeFeedbackCount
        }
      }
    `(
      {
        replyRequestId,
      },
      { userId, appId }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const replyrequest = await client.get({
      index: 'replyrequests',
      type: 'doc',
      id: replyRequestId,
    });
    expect(replyrequest._source).toMatchSnapshot();

    // Cleanup
    await resetFrom(fixtures, '/replyrequests/doc/foo');
  });

  afterAll(() => unloadFixtures(fixtures));
});
