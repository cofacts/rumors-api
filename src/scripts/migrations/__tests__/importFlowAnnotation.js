import MockDate from 'mockdate';
import { prepareUsers, processEntry } from '../importFlowAnnotation';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import fixtures from '../__fixtures__/importFlowAnnotation';

beforeEach(() => loadFixtures(fixtures));
afterEach(() => unloadFixtures(fixtures));

const FIXED_DATE = 612921600000;

it('adds article category and feedbacks as expected', async () => {
  MockDate.set(FIXED_DATE);
  const { reviewer, annotator } = await prepareUsers();

  // Add 4 categories to a1
  await processEntry(
    {
      id: 'a1',
      tags: [0, 1, 2, 3],
    },
    annotator,
    reviewer
  );
  MockDate.reset();

  const {
    body: { _source: articleDoc },
  } = await client.get({
    index: 'articles',
    type: 'doc',
    id: 'a1',
  });

  // Record reviewer ID & annotator ID in database
  // so that it is easier to review the inline snapshots below
  expect(reviewer.id).toMatchInlineSnapshot(
    `"itezv_k4nL0AzYmLjGPIlwW2PDmpsp9LkDqRaQlIUjHlKNJfo"`
  );
  expect(annotator.id).toMatchInlineSnapshot(
    `"itezv_tbxIguOcSE0sUsEMELG-9az6Ey2CNY2a962lOXtvi8Y"`
  );

  expect(articleDoc.normalArticleCategoryCount).toBe(4);

  // Expect all 4 articleCategories and feedback has been updated
  //
  expect(articleDoc.articleCategories).toMatchInlineSnapshot(`
    Array [
      Object {
        "categoryId": "kj287XEBrIRcahlYvQoS",
        "negativeFeedbackCount": 0,
        "positiveFeedbackCount": 1,
        "status": "NORMAL",
      },
      Object {
        "categoryId": "kz3c7XEBrIRcahlYxAp6",
        "negativeFeedbackCount": 0,
        "positiveFeedbackCount": 2,
        "status": "NORMAL",
      },
      Object {
        "appId": "RUMORS_AI",
        "categoryId": "lD3h7XEBrIRcahlYeQqS",
        "negativeFeedbackCount": 0,
        "positiveFeedbackCount": 1,
        "status": "NORMAL",
        "updatedAt": "1989-06-04T00:00:00.000Z",
        "userId": "itezv_tbxIguOcSE0sUsEMELG-9az6Ey2CNY2a962lOXtvi8Y",
      },
      Object {
        "appId": "RUMORS_AI",
        "categoryId": "lT3h7XEBrIRcahlYugqq",
        "createdAt": "1989-06-04T00:00:00.000Z",
        "negativeFeedbackCount": 0,
        "positiveFeedbackCount": 1,
        "status": "NORMAL",
        "updatedAt": "1989-06-04T00:00:00.000Z",
        "userId": "itezv_tbxIguOcSE0sUsEMELG-9az6Ey2CNY2a962lOXtvi8Y",
      },
    ]
  `);

  const {
    body: {
      hits: { total, hits: articleCategoryFeedbacks },
    },
  } = await client.search({
    index: 'articlecategoryfeedbacks',
    body: {
      query: {
        term: {
          appId: 'RUMORS_AI',
        },
      },
    },
  });

  expect(total).toBe(4);

  // Test if existing feedback is modified
  //
  const existingFeedback = articleCategoryFeedbacks.find(
    ({ _source }) => _source.categoryId === 'kz3c7XEBrIRcahlYxAp6'
  );
  expect(existingFeedback._source).toMatchInlineSnapshot(`
    Object {
      "appId": "RUMORS_AI",
      "articleId": "a1",
      "categoryId": "kz3c7XEBrIRcahlYxAp6",
      "comment": "若水標記之分類",
      "score": 1,
      "status": "NORMAL",
      "updatedAt": "1989-06-04T00:00:00.000Z",
      "userId": "itezv_k4nL0AzYmLjGPIlwW2PDmpsp9LkDqRaQlIUjHlKNJfo",
    }
  `);

  // Test if new feedback is inserted
  //
  const newFeedback = articleCategoryFeedbacks.find(
    ({ _source }) => _source.categoryId === 'kj287XEBrIRcahlYvQoS'
  );
  expect(newFeedback._source).toMatchInlineSnapshot(`
    Object {
      "appId": "RUMORS_AI",
      "articleId": "a1",
      "categoryId": "kj287XEBrIRcahlYvQoS",
      "comment": "若水標記之分類",
      "createdAt": "1989-06-04T00:00:00.000Z",
      "score": 1,
      "status": "NORMAL",
      "updatedAt": "1989-06-04T00:00:00.000Z",
      "userId": "itezv_k4nL0AzYmLjGPIlwW2PDmpsp9LkDqRaQlIUjHlKNJfo",
    }
  `);

  // Cleanup
  await client.deleteByQuery({
    index: 'articlecategoryfeedbacks',
    body: {
      query: {
        term: {
          appId: 'RUMORS_AI',
        },
      },
    },
  });
  await client.delete({ index: 'users', type: 'doc', id: reviewer.id });
  await client.delete({ index: 'users', type: 'doc', id: annotator.id });
});
