import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateReply';

describe('CreateReply', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('creates replies and associates itself with specified article', async () => {
    MockDate.set(1485593157011);
    const { data, errors } = await gql`
      mutation(
        $articleId: String!
        $text: String!
        $type: ReplyTypeEnum!
        $reference: String!
      ) {
        CreateReply(
          articleId: $articleId
          text: $text
          type: $type
          reference: $reference
        ) {
          id
        }
      }
    `({
      articleId: 'setReplyTest1',
      text: 'FOO FOO',
      type: 'RUMOR',
      reference: 'http://google.com',
    }, { userId: 'test', from: 'test' });
    MockDate.reset();

    expect(errors).toBeUndefined();

    const replyId = data.CreateReply.id;
    const reply = await client.get({ index: 'replies', type: 'basic', id: replyId });
    expect(reply._source).toMatchSnapshot();

    const article = await client.get({ index: 'articles', type: 'basic', id: 'setReplyTest1' });
    const connId = `${article._id}__${replyId}`;
    expect(article._source.replyConnectionIds[0]).toBe(connId);

    // Cleanup
    await client.delete({ index: 'replies', type: 'basic', id: replyId });
    await client.delete({ index: 'replyconnections', type: 'basic', id: connId });
    await resetFrom(fixtures, '/articles/basic/setReplyTest1');
  });

  afterAll(() => unloadFixtures(fixtures));
});
