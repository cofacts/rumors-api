import XLSX from 'xlsx';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/genArticleReviews';

import genArticleReview from '../genArticleReview';

beforeEach(() => loadFixtures(fixtures));

it('generates mapping sheet as expected', async () => {
  const workBook = await genArticleReview(
    /* Future date, should match no items */ new Date(
      '2031-10-01T00:00:00.000Z'
    )
  );
  // Expect this lists out all categories
  const categorySheet = workBook.Sheets['Mappings'];
  expect(XLSX.utils.sheet_to_csv(categorySheet)).toMatchInlineSnapshot(`
    "Category ID,Title,Description
    c1,Category 1,Description for category 1
    c2,Category 2,Description for category 2
    c3,Category 3,Description for category 3
    "
  `);

  // Expect this to be empty
  const articleCategorySheet = workBook.Sheets['Article categories'];
  expect(XLSX.utils.sheet_to_csv(articleCategorySheet)).toMatchInlineSnapshot(`
    "Article ID,Article Text,Existing Categories,Action,Category to Review,Category ID,User ID,App ID,Connected At,Reasons,Adopt?
    "
  `);
});

afterEach(() => unloadFixtures(fixtures));
