import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateArticleCategory';

describe('CreateArticleCategory', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('connects article and category together', async () => {
    MockDate.set(1485593157011);
    const articleId = 'createArticleCategory1';
    const categoryId = 'createArticleCategory2';

    const { data, errors } = await gql`
      mutation($articleId: String!, $categoryId: String!) {
        CreateArticleCategory(articleId: $articleId, categoryId: $categoryId) {
          positiveFeedbackCount
          negativeFeedbackCount
          user {
            id
          }
          status
          article {
            id
          }
          category {
            id
          }
        }
      }
    `(
      {
        articleId,
        categoryId,
      },
      { userId: 'test', appId: 'test' }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data.CreateArticleCategory).toMatchSnapshot();

    const {
      body: { _source },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(_source).toMatchSnapshot();

    await resetFrom(fixtures, '/articles/doc/createArticleCategory1');
  });

  it('connects article and category together by AI model', async () => {
    MockDate.set(1485593157011);
    const articleId = 'createArticleCategory1';
    const categoryId = 'createArticleCategory2';
    const aiModel = 'aiModel1';
    const aiConfidence = 0.99;

    const { data, errors } = await gql`
      mutation(
        $articleId: String!
        $categoryId: String!
        $aiModel: String!
        $aiConfidence: Float!
      ) {
        CreateArticleCategory(
          articleId: $articleId
          categoryId: $categoryId
          aiModel: $aiModel
          aiConfidence: $aiConfidence
        ) {
          positiveFeedbackCount
          negativeFeedbackCount
          user {
            id
          }
          status
          article {
            id
          }
          category {
            id
          }
        }
      }
    `(
      {
        articleId,
        categoryId,
        aiModel,
        aiConfidence,
      },
      { userId: 'test', appId: 'test' }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data.CreateArticleCategory).toMatchSnapshot();

    const {
      body: { _source },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(_source).toMatchSnapshot();

    await resetFrom(fixtures, '/articles/doc/createArticleCategory1');
  });

  it('cannot connect the same article and category twice', async () => {
    const articleId = 'createArticleCategory1';
    const categoryId = 'createArticleCategory2';

    await gql`
      mutation($articleId: String!, $categoryId: String!) {
        CreateArticleCategory(articleId: $articleId, categoryId: $categoryId) {
          categoryId
        }
      }
    `({ articleId, categoryId }, { userId: 'test', appId: 'test' });

    const { errors } = await gql`
      mutation($articleId: String!, $categoryId: String!) {
        CreateArticleCategory(articleId: $articleId, categoryId: $categoryId) {
          categoryId
        }
      }
    `({ articleId, categoryId }, { userId: 'anotherUser', appId: 'test' });

    expect('' + errors[0]).toMatch(/Cannot add articleCategory/);

    // Cleanup
    await resetFrom(fixtures, '/articles/doc/createArticleCategory1');
  });

  it('update userId and appId when connecting with DELETED ArticleCategory', async () => {
    MockDate.set(1485593157011);
    const articleId = 'articleHasDeletedArticleCategory';
    const categoryId = 'createArticleCategory2';

    const { data, errors } = await gql`
      mutation($articleId: String!, $categoryId: String!) {
        CreateArticleCategory(articleId: $articleId, categoryId: $categoryId) {
          positiveFeedbackCount
          negativeFeedbackCount
          user {
            id
          }
          status
          article {
            id
          }
          category {
            id
          }
        }
      }
    `(
      {
        articleId,
        categoryId,
      },
      { userId: 'test2', appId: 'test2' }
    );
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(data.CreateArticleCategory).toMatchSnapshot();

    const {
      body: { _source },
    } = await client.get({
      index: 'articles',
      type: 'doc',
      id: articleId,
    });
    expect(_source).toMatchSnapshot();

    await resetFrom(fixtures, '/articles/doc/articleHasDeletedArticleCategory');
  });

  afterAll(() => unloadFixtures(fixtures));
});
