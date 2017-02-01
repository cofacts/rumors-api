import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/SetReply';

describe('SetReply', () => {
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
        SetReply(
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
    });
    MockDate.reset();

    expect(errors).toBeUndefined();

    const reply = await client.get({ index: 'replies', type: 'basic', id: data.SetReply.id });
    expect(reply._source).toMatchSnapshot();

    const article = await client.get({ index: 'articles', type: 'basic', id: 'setReplyTest1' });
    expect(article._source.replyIds[0]).toBe(data.SetReply.id);

    // Cleanup
    await client.delete({ index: 'replies', type: 'basic', id: data.SetReply.id });
    await client.update({
      index: 'articles',
      type: 'basic',
      id: 'setReplyTest1',
      body: {
        doc: fixtures['/articles/basic/setReplyTest1'],
      },
    });
  });

  afterAll(() => unloadFixtures(fixtures));
});
