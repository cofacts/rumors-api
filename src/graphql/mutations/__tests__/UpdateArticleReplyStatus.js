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
    `({}, { user: { id: userId, appId } });

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
    `({}, { user: { id: userId, appId } });

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const {
      body: { _source: normal },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: 'normal',
    });
    expect(normal.articleReplies).toMatchInlineSnapshot(`
      Array [
        Object {
          "appId": "test",
          "replyId": "reply",
          "status": "DELETED",
          "updatedAt": "2017-01-28T08:45:57.011Z",
          "userId": "foo",
        },
      ]
    `);
    expect(normal.normalArticleReplyCount).toBe(0);

    const {
      body: { _source: deleted },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: 'deleted',
    });
    expect(deleted.articleReplies).toMatchInlineSnapshot(`
      Array [
        Object {
          "appId": "test",
          "replyId": "reply",
          "status": "NORMAL",
          "updatedAt": "2017-01-28T08:45:57.011Z",
          "userId": "foo",
        },
      ]
    `);
    expect(deleted.normalArticleReplyCount).toBe(1);

    // Cleanup
    await resetFrom(fixtures, '/articles/doc/normal');
    await resetFrom(fixtures, '/articles/doc/deleted');
  });

  it('restore delete state to blocked state for blocked users', async () => {
    const userId = 'iAmBlocked';
    const appId = 'test';

    const { data, errors } = await gql`
      mutation {
        UpdateArticleReplyStatus(
          articleId: "blocked"
          replyId: "reply"
          status: NORMAL
        ) {
          articleId
          replyId
          status
          updatedAt
        }
      }
    `({}, { user: { id: userId, appId, blockedReason: 'Announcement URL' } });

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const {
      body: { _source },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: 'blocked',
    });
    expect(_source).toMatchInlineSnapshot(`
      Object {
        "articleReplies": Array [
          Object {
            "appId": "test",
            "replyId": "reply",
            "status": "BLOCKED",
            "updatedAt": "2017-01-28T08:45:57.011Z",
            "userId": "iAmBlocked",
          },
        ],
        "normalArticleReplyCount": 0,
      }
    `);

    // Cleanup
    await resetFrom(fixtures, '/articles/doc/blocked');
  });

  afterEach(() => {
    MockDate.reset();
    return unloadFixtures(fixtures);
  });
});
