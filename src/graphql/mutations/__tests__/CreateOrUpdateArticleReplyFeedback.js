import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import { getArticleReplyFeedbackId } from '../CreateOrUpdateArticleReplyFeedback';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateOrUpdateArticleReplyFeedback';

describe('CreateOrUpdateArticleReplyFeedback', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('creates feedback on given article reply', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'test';
    const articleId = 'article1';
    const replyId = 'reply1';
    const comment = 'comment1';

    const { data, errors } = await gql`
      mutation($articleId: String!, $replyId: String!, $comment: String!) {
        CreateOrUpdateArticleReplyFeedback(
          articleId: $articleId
          replyId: $replyId
          vote: UPVOTE
          comment: $comment
        ) {
          articleId
          replyId
          feedbackCount
          positiveFeedbackCount
          negativeFeedbackCount
          ownVote
          feedbacks {
            vote
            comment
          }
        }
      }
    `(
      {
        articleId,
        replyId,
        comment,
      },
      {
        user: { id: userId, appId },
      }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = getArticleReplyFeedbackId({
      articleId,
      replyId,
      userId,
      appId,
    });

    const { body: conn } = await client.get({
      index: 'articlereplyfeedbacks',
      type: 'doc',
      id,
    });
    expect(conn._source).toMatchInlineSnapshot(`
      Object {
        "appId": "test",
        "articleId": "article1",
        "comment": "comment1",
        "createdAt": "2017-01-28T08:45:57.011Z",
        "replyId": "reply1",
        "score": 1,
        "status": "NORMAL",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "test",
      }
    `);

    const { body: article } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source.articleReplies).toMatchInlineSnapshot(`
      Array [
        Object {
          "negativeFeedbackCount": 0,
          "positiveFeedbackCount": 12,
          "replyId": "reply1",
        },
      ]
    `);

    // Cleanup
    await client.delete({
      index: 'articlereplyfeedbacks',
      type: 'doc',
      id,
    });
    await resetFrom(fixtures, '/articles/doc/article1');
  });

  it('updates existing feedback', async () => {
    MockDate.set(1485593157011);
    const userId = 'testUser';
    const appId = 'testClient';
    const articleId = 'article1';
    const replyId = 'reply1';

    const { data, errors } = await gql`
      mutation($articleId: String!, $replyId: String!) {
        CreateOrUpdateArticleReplyFeedback(
          articleId: $articleId
          replyId: $replyId
          vote: DOWNVOTE
        ) {
          articleId
          replyId
          feedbackCount
          positiveFeedbackCount
          negativeFeedbackCount
          ownVote
          feedbacks {
            vote
            comment
          }
        }
      }
    `(
      {
        articleId,
        replyId,
      },
      { user: { id: userId, appId } }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = getArticleReplyFeedbackId({
      articleId,
      replyId,
      userId,
      appId,
    });

    expect(
      (await client.get({ index: 'articlereplyfeedbacks', type: 'doc', id }))
        .body._source
    ).toMatchInlineSnapshot(`
      Object {
        "appId": "testClient",
        "articleId": "article1",
        "createdAt": "2017-01-01T00:00:00.000Z",
        "replyId": "reply1",
        "score": -1,
        "status": "NORMAL",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "testUser",
      }
    `);

    // Cleanup
    await resetFrom(fixtures, `/articlereplyfeedbacks/doc/${id}`);
  });

  it('creates blocked feedback without updating numbers', async () => {
    MockDate.set(1485593157011);
    const userId = 'blockedUser';
    const appId = 'test';
    const articleId = 'article1';
    const replyId = 'reply1';
    const comment = 'ads content';

    const { data, errors } = await gql`
      mutation($articleId: String!, $replyId: String!, $comment: String!) {
        CreateOrUpdateArticleReplyFeedback(
          articleId: $articleId
          replyId: $replyId
          vote: UPVOTE
          comment: $comment
        ) {
          articleId
          replyId
          feedbackCount
          positiveFeedbackCount
          negativeFeedbackCount
          ownVote
          feedbacks {
            vote
            comment
          }
        }
      }
    `(
      {
        articleId,
        replyId,
        comment,
      },
      {
        user: { id: userId, appId, blockedReason: 'announcement-url' },
      }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = getArticleReplyFeedbackId({
      articleId,
      replyId,
      userId,
      appId,
    });

    const { body: conn } = await client.get({
      index: 'articlereplyfeedbacks',
      type: 'doc',
      id,
    });
    expect(conn._source).toMatchInlineSnapshot(`
      Object {
        "appId": "test",
        "articleId": "article1",
        "comment": "ads content",
        "createdAt": "2017-01-28T08:45:57.011Z",
        "replyId": "reply1",
        "score": 1,
        "status": "BLOCKED",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "blockedUser",
      }
    `);

    const { body: article } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source.articleReplies).toMatchInlineSnapshot(`
      Array [
        Object {
          "negativeFeedbackCount": 0,
          "positiveFeedbackCount": 11,
          "replyId": "reply1",
        },
      ]
    `);

    // Cleanup
    await client.delete({
      index: 'articlereplyfeedbacks',
      type: 'doc',
      id,
    });
    await resetFrom(fixtures, '/articles/doc/article1');
  });

  afterAll(() => unloadFixtures(fixtures));
});
