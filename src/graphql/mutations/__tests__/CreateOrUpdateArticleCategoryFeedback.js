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
      mutation ($articleId: String!, $categoryId: String!, $comment: String!) {
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
      { user: { id: userId, appId } }
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
    expect(conn._source).toMatchInlineSnapshot(`
      Object {
        "appId": "test",
        "articleId": "article1",
        "categoryId": "category1",
        "comment": "comment1",
        "createdAt": "2017-01-28T08:45:57.011Z",
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
    expect(article._source.articleCategories).toMatchInlineSnapshot(`
      Array [
        Object {
          "categoryId": "category1",
          "negativeFeedbackCount": 0,
          "positiveFeedbackCount": 12,
        },
      ]
    `);

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
      mutation ($articleId: String!, $categoryId: String!) {
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
      { user: { id: userId, appId } }
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
    ).toMatchInlineSnapshot(`
      Object {
        "appId": "testClient",
        "articleId": "article1",
        "categoryId": "category1",
        "createdAt": "2017-01-01T00:00:00.000Z",
        "score": -1,
        "status": "NORMAL",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "testUser",
      }
    `);

    // Cleanup
    await resetFrom(fixtures, `/articlecategoryfeedbacks/doc/${id}`);
  });

  it('generates blocked feedback for blocked users', async () => {
    MockDate.set(1485593157011);
    const userId = 'iAmBlocked';
    const appId = 'test';
    const articleId = 'article1';
    const categoryId = 'category1';
    const comment = 'Some ads comment';

    const { data, errors } = await gql`
      mutation ($articleId: String!, $categoryId: String!, $comment: String!) {
        CreateOrUpdateArticleCategoryFeedback(
          articleId: $articleId
          categoryId: $categoryId
          vote: UPVOTE
          comment: $comment
        ) {
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
      { user: { id: userId, appId, blockedReason: 'announcement URL' } }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();

    // Notice "Some ads comment" does not count in feedbackCounts
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
    expect(conn._source).toMatchInlineSnapshot(`
      Object {
        "appId": "test",
        "articleId": "article1",
        "categoryId": "category1",
        "comment": "Some ads comment",
        "createdAt": "2017-01-28T08:45:57.011Z",
        "score": 1,
        "status": "BLOCKED",
        "updatedAt": "2017-01-28T08:45:57.011Z",
        "userId": "iAmBlocked",
      }
    `);

    const { body: article } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(article._source.articleCategories).toMatchInlineSnapshot(`
      Array [
        Object {
          "categoryId": "category1",
          "negativeFeedbackCount": 0,
          "positiveFeedbackCount": 11,
        },
      ]
    `);

    // Cleanup
    await client.delete({
      index: 'articlecategoryfeedbacks',
      type: 'doc',
      id,
    });
    await resetFrom(fixtures, '/articles/doc/article1');
  });

  afterAll(() => unloadFixtures(fixtures));
});
