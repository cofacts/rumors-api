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
    `({
      id: 'createReplyConnectionFeedback1',
    }, { userId: 'test', from: 'test' });
    MockDate.reset();

    const id = 'createReplyConnectionFeedback1__test__test';
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const conn = await client.get({ index: 'replyconnectionfeedbacks', type: 'basic', id });
    expect(conn._source).toMatchSnapshot();

    const article = await client.get({ index: 'replyconnections', type: 'basic', id: 'createReplyConnectionFeedback1' });
    expect(article._source.feedbackIds.slice(-1)[0]).toBe(id);

    // Cleanup
    await client.delete({ index: 'replyconnectionfeedbacks', type: 'basic', id });
    await resetFrom(fixtures, '/replyconnections/basic/createReplyConnectionFeedback1');
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
    `({
      id: 'createReplyConnectionFeedback1',
    }, { userId: 'testUser', from: 'testClient' });
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = 'createReplyConnectionFeedback1__testUser__testClient';
    expect(await client.get({ index: 'replyconnectionfeedbacks', type: 'basic', id })).toMatchSnapshot();

    // Cleanup
    await resetFrom(fixtures, `/replyconnectionfeedbacks/basic/${id}`);
  });

  afterAll(() => unloadFixtures(fixtures));
});
