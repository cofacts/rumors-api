import MockDate from 'mockdate';
import { processEntry } from '../importFlowAnnotation';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import fixtures from '../__fixtures__/importFlowAnnotation';

beforeEach(() => loadFixtures(fixtures));
afterEach(() => unloadFixtures(fixtures));

const FIXED_DATE = 612921600000;

it('adds article category and feedbacks as expected', async () => {
  MockDate.set(FIXED_DATE);
  // Add 4 categories to a1
  await processEntry({
    id: 'a1',
    tags: [0, 1, 2, 3],
  });
  MockDate.reset();

  const {
    body: { _source: articleDoc },
  } = await client.get({
    index: 'articles',
    type: 'doc',
    id: 'a1',
  });

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
        "userId": "flow-annotator",
      },
      Object {
        "appId": "RUMORS_AI",
        "categoryId": "lT3h7XEBrIRcahlYugqq",
        "createdAt": "1989-06-04T00:00:00.000Z",
        "negativeFeedbackCount": 0,
        "positiveFeedbackCount": 1,
        "status": "NORMAL",
        "updatedAt": "1989-06-04T00:00:00.000Z",
        "userId": "flow-annotator",
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

  const articleCategoryFeedback = articleCategoryFeedbacks.find(
    ({ _source }) => _source.categoryId === 'kz3c7XEBrIRcahlYxAp6'
  );
  expect(articleCategoryFeedback._source).toMatchInlineSnapshot(`
    Object {
      "appId": "RUMORS_AI",
      "articleId": "a1",
      "categoryId": "kz3c7XEBrIRcahlYxAp6",
      "comment": "若水標記之分類",
      "score": 1,
      "status": "NORMAL",
      "updatedAt": "1989-06-04T00:00:00.000Z",
      "userId": "category-reviewer",
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
});
