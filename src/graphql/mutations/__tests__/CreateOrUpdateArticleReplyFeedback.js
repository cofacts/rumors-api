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
          feedbackCount
          positiveFeedbackCount
          negativeFeedbackCount
          ownVote
        }
      }
    `(
      {
        articleId,
        replyId,
        comment,
      },
      { userId, appId, comment }
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

    const conn = await client.get({
      index: 'articlereplyfeedbacks',
      type: 'doc',
      id,
    });
    expect(conn._source).toMatchSnapshot();

    const article = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source.articleReplies).toMatchSnapshot();

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
          feedbackCount
          positiveFeedbackCount
          negativeFeedbackCount
          ownVote
        }
      }
    `(
      {
        articleId,
        replyId,
      },
      { userId, appId }
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
        ._source
    ).toMatchSnapshot();

    // Cleanup
    await resetFrom(fixtures, `/articlereplyfeedbacks/doc/${id}`);
  });

  afterAll(() => unloadFixtures(fixtures));
});
