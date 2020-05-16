import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/UpdateArticleReplyStatus';

describe('UpdateArticleReplyStatus', () => {
  beforeEach(() => {
    MockDate.set(1485593157011);
    return loadFixtures(fixtures);
  });

  it("should not allow users to delete other's article replies", async () => {
    const userId = 'foo';
    const appId = 'test';

    const { errors } = await gql`
      mutation {
        UpdateArticleReplyStatus(
          articleId: "others"
          replyId: "others"
          status: DELETED
        ) {
          status
          updatedAt
        }
      }
    `({}, { userId, appId });

    expect(errors).toMatchSnapshot();
  });

  it('should set article reply fields correctly', async () => {
    const userId = 'foo';
    const appId = 'test';

    const { data, errors } = await gql`
      mutation {
        normal: UpdateArticleReplyStatus(
          articleId: "normal"
          replyId: "reply"
          status: DELETED
        ) {
          articleId
          replyId
          status
          updatedAt
        }
        deleted: UpdateArticleReplyStatus(
          articleId: "deleted"
          replyId: "reply"
          status: NORMAL
        ) {
          articleId
          replyId
          status
          updatedAt
        }
      }
    `({}, { userId, appId });

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const {
      body: { _source: normal },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: 'normal',
    });
    expect(normal.articleReplies).toMatchSnapshot();
    expect(normal.normalArticleReplyCount).toBe(0);

    const {
      body: { _source: deleted },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: 'deleted',
    });
    expect(deleted.articleReplies).toMatchSnapshot();
    expect(deleted.normalArticleReplyCount).toBe(1);

    // Cleanup
    await resetFrom(fixtures, '/articles/doc/normal');
    await resetFrom(fixtures, '/articles/doc/deleted');
  });

  afterEach(() => {
    MockDate.reset();
    return unloadFixtures(fixtures);
  });
});
