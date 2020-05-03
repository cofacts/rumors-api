import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import { getArticleCategoryFeedbackId } from '../CreateOrUpdateArticleCategoryFeedback';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateOrUpdateArticleCategoryFeedback';

describe('CreateOrUpdateArticleCategoryFeedback', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('creates feedback on given article category', async () => {
    MockDate.set(1485593157011);
    const userId = 'test';
    const appId = 'test';
    const articleId = 'article1';
    const categoryId = 'category1';
    const comment = 'comment1';

    const { data, errors } = await gql`
      mutation($articleId: String!, $categoryId: String!, $comment: String!) {
        CreateOrUpdateArticleCategoryFeedback(
          articleId: $articleId
          categoryId: $categoryId
          vote: UPVOTE
          comment: $comment
        ) {
          articleId
          categoryId
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
        categoryId,
        comment,
      },
      { userId, appId, comment }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = getArticleCategoryFeedbackId({
      articleId,
      categoryId,
      userId,
      appId,
    });

    const { body: conn } = await client.get({
      index: 'articlecategoryfeedbacks',
      type: 'doc',
      id,
    });
    expect(conn._source).toMatchSnapshot();

    const { body: article } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source.articleCategories).toMatchSnapshot();

    // Cleanup
    await client.delete({
      index: 'articlecategoryfeedbacks',
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
    const categoryId = 'category1';

    const { data, errors } = await gql`
      mutation($articleId: String!, $categoryId: String!) {
        CreateOrUpdateArticleCategoryFeedback(
          articleId: $articleId
          categoryId: $categoryId
          vote: DOWNVOTE
        ) {
          articleId
          categoryId
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
        categoryId,
      },
      { userId, appId }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = getArticleCategoryFeedbackId({
      articleId,
      categoryId,
      userId,
      appId,
    });

    expect(
      (await client.get({ index: 'articlecategoryfeedbacks', type: 'doc', id }))
        .body._source
    ).toMatchSnapshot();

    // Cleanup
    await resetFrom(fixtures, `/articlecategoryfeedbacks/doc/${id}`);
  });

  afterAll(() => unloadFixtures(fixtures));
});
