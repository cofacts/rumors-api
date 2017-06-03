import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateReplyConnectionFeedback';

describe('CreateOrUpdateReplyConnectionFeedback', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('creates feedback on given reply connection', async () => {
    MockDate.set(1485593157011);
    const { data, errors } = await gql`
      mutation( $id: String! ) {
        CreateOrUpdateReplyConnectionFeedback(
          replyConnectionId: $id
          vote: UPVOTE
        ) { feedbackCount }
      }
    `(
      {
        id: 'createReplyConnectionFeedback1',
      },
      { userId: 'test', from: 'test' }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = 'createReplyConnectionFeedback1__test__test';
    const connFb = await client.get({
      index: 'data',
      type: 'replyconnectionfeedbacks',
      id,
    });
    expect(connFb._source).toMatchSnapshot();

    const conn = await client.get({
      index: 'data',
      type: 'replyconnections',
      id: 'createReplyConnectionFeedback1',
    });
    expect(conn._source.feedbackIds.slice(-1)[0]).toBe(id);

    // Cleanup
    await client.delete({
      index: 'data',
      type: 'replyconnectionfeedbacks',
      id,
    });
    await resetFrom(
      fixtures,
      '/data/replyconnections/createReplyConnectionFeedback1'
    );
  });

  it('updates existing feedback', async () => {
    MockDate.set(1485593157011);
    const { data, errors } = await gql`
      mutation( $id: String! ) {
        CreateOrUpdateReplyConnectionFeedback(
          replyConnectionId: $id
          vote: DOWNVOTE
        ) { feedbackCount }
      }
    `(
      {
        id: 'createReplyConnectionFeedback1',
      },
      { userId: 'testUser', from: 'testClient' }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = 'createReplyConnectionFeedback1__testUser__testClient';
    expect(
      await client.get({ index: 'data', type: 'replyconnectionfeedbacks', id })
    ).toMatchSnapshot();

    // Cleanup
    await resetFrom(fixtures, `/data/replyconnectionfeedbacks/${id}`);
  });

  afterAll(() => unloadFixtures(fixtures));
});
