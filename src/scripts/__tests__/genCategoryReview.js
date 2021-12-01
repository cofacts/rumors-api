import XLSX from 'xlsx';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/genCategoryReview';

import genArticleReview from '../genCategoryReview';

beforeEach(() => loadFixtures(fixtures));

it('generates mapping sheet as expected', async () => {
  const workBook = await genArticleReview({
    startFrom: /* Future date, should match no items */ new Date(
      '2031-10-01T00:00:00.000Z'
    ),
  });
  // Expect this lists out all categories
  const categorySheet = workBook.Sheets['Mappings'];
  expect(XLSX.utils.sheet_to_csv(categorySheet)).toMatchInlineSnapshot(`
    "Category ID,Title,Description
    c1,Category 1,Description for category 1
    c2,Category 2,Description for category 2
    c3,Category 3,Description for category 3
    c4,Category 4,Description for category 4
    "
  `);

  // Expect this to be empty
  const articleCategorySheet = workBook.Sheets['Article categories'];
  expect(XLSX.utils.sheet_to_csv(articleCategorySheet)).toMatchInlineSnapshot(`
    "Article ID,Article Text,Category to Review,Category ID,User ID,App ID,Connected At,Other's deny reasons,Adopt?,Deny reason
    "
  `);
});

it('collects categories of interest after a timestamp', async () => {
  const workBook = await genArticleReview({
    startFrom: new Date('2020-12-31T00:00:00.000Z'),
  });

  const categorySheet = workBook.Sheets['Article categories'];

  /**  Expect in list:
   *
   * - Nothing from Article a1
   * - Article a2
   *    - c1 (new AI with 1 positive)
   *    - c4 (new user category with no feedbacks)
   * - Article a3
   *    - c1 (old AI with 1 new positive & reviewer downvote)
   *    - c2 (old user category with new 1 negative feedback & reviewer upvote)
   */
  expect(XLSX.utils.sheet_to_csv(categorySheet)).toMatchInlineSnapshot(`
    "Article ID,Article Text,Category to Review,Category ID,User ID,App ID,Connected At,Other's deny reasons,Adopt?,Deny reason
    a2,Content of rumor article a2,Category 1,c1,bert,RUMORS_AI,2021-01-01T00:00:00.000Z,,FALSE,
    a2,Content of rumor article a2,Category 4,c4,some-user,WEBSITE,2021-01-01T00:00:00.000Z,,FALSE,
    a3,Content of rumor article a3,Category 1,c1,bert,RUMORS_AI,2019-01-01T00:00:00.000Z,,FALSE,Reviewer comment: a3 is not c1
    a3,Content of rumor article a3,Category 2,c2,an-user,WEBSITE,2021-01-01T00:00:00.000Z,,TRUE,
    "
  `);
});

afterEach(() => unloadFixtures(fixtures));
