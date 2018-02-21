import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateReply';

describe('CreateReply', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('creates replies and associates itself with specified article', async () => {
    MockDate.set(1485593157011);
    const articleId = 'setReplyTest1';

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
    `(
      {
        articleId,
        text: 'FOO FOO',
        type: 'RUMOR',
        reference: 'http://google.com',
      },
      { userId: 'test', appId: 'test' }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();

    const replyId = data.CreateReply.id;
    const reply = await client.get({
      index: 'replies',
      type: 'doc',
      id: replyId,
    });
    expect(reply._source).toMatchSnapshot();

    const article = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source.articleReplies[0].replyId).toBe(replyId);

    // Cleanup
    await client.delete({ index: 'replies', type: 'doc', id: replyId });
    await resetFrom(fixtures, `/articles/doc/${articleId}`);
  });

  afterAll(() => unloadFixtures(fixtures));
});
