import 'dotenv/config';
import { SingleBar } from 'cli-progress';
import { createOrUpdateArticleCategoryFeedback } from 'graphql/mutations/CreateOrUpdateArticleCategoryFeedback';
import { createOrUpdateUser } from 'util/user';
import fetch from 'node-fetch';

const RUMORS_AI_APPID = 'RUMORS_AI';
const REVIEWER_USER_ID = 'category-reviewer';

/**
 * @param {string[][]} range - Spreadsheet range data with 1st row being the column names
 * @param {object[]}
 */
export function range2Objects(range) {
  const [columnNames, ...dataRows] = range;
  return dataRows.map(row =>
    row.reduce((obj, cell, colIdx) => {
      obj[columnNames[colIdx]] = cell;
      return obj;
    }, {})
  );
}

/**
 *
 * @param {string} googleSheetId
 * @param {{ mappings: object[], articleCategories: object[] }}
 */
async function readFromGoogleSheet(googleSheetId) {
  const {
    valueRanges: [
      { values: articleCategoriesRange },
      { values: mappingsRange },
    ],
  } = await (await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetId}/values:batchGet?key=${
      process.env.GOOGLE_SHEETS_API_KEY
    }&ranges=Article categories!A1:L&ranges=Mappings!A1:C`
  )).json();

  return {
    mappings: range2Objects(mappingsRange),
    articleCategories: range2Objects(articleCategoriesRange),
  };
}

export async function writeFeedbacks(articleCategories) {
  const { user: reviewer } = await createOrUpdateUser({
    userId: REVIEWER_USER_ID,
    appId: RUMORS_AI_APPID,
  });

  console.log('Writing feedbacks to database');
  const bar = new SingleBar({ stopOnComplete: true });
  bar.start(articleCategories.length, 0);
  for (const {
    'Category ID': categoryId,
    'Article ID': articleId,
    'Adopt?': shouldAdopt,
    'Deny reason': denyReason,
  } of articleCategories) {
    if (shouldAdopt) {
      await createOrUpdateArticleCategoryFeedback({
        articleId,
        categoryId,
        vote: 1,
        user: reviewer,
      });
    } else if (denyReason) {
      await createOrUpdateArticleCategoryFeedback({
        articleId,
        categoryId,
        vote: -1,
        comment: denyReason,
        user: reviewer,
      });
    } else {
      // Do nothing if both "Adopt?" and "Deny reason" are empty
    }

    bar.increment();
  }
  bar.stop;
}

async function main() {
  console.log(
    await readFromGoogleSheet('1Y9FrI01in2hz5eiveGknH0HE081sr7gVuk0a7hqqKuc')
  );
}

/* istanbul ignore if */
if (require.main === module) {
  main().catch(console.error);
}
