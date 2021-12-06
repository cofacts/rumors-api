import 'dotenv/config';
import { SingleBar } from 'cli-progress';
import { createOrUpdateArticleCategoryFeedback } from 'graphql/mutations/CreateOrUpdateArticleCategoryFeedback';
import { createOrUpdateUser } from 'util/user';
import client from 'util/client';
import fetch from 'node-fetch';
import getAllDocs from 'util/getAllDocs';

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
/* istanbul ignore next */
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
  let positiveCount = 0;
  let negativeCount = 0;

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
      positiveCount += 1;
    } else if (denyReason) {
      await createOrUpdateArticleCategoryFeedback({
        articleId,
        categoryId,
        vote: -1,
        comment: denyReason,
        user: reviewer,
      });
      negativeCount += 1;
    } else {
      // Do nothing if both "Adopt?" and "Deny reason" are empty
    }

    bar.increment();
  }
  bar.stop;
  console.log(
    `${positiveCount} positive feedbacks & ${negativeCount} negative feedbacks have been written.`
  );
}

const ARTICLE_QUERY = {
  nested: {
    path: 'articleCategories',
    query: {
      bool: {
        must: [
          { term: { 'articleCategories.status': 'NORMAL' } },
          {
            script: {
              script: {
                source:
                  "doc['articleCategories.positiveFeedbackCount'].value > doc['articleCategories.negativeFeedbackCount'].value",
                lang: 'painless',
              },
            },
          },
        ],
      },
    },
  },
};

export async function* getDocToExport() {
  const {
    body: { count },
  } = await client.count({
    index: 'articles',
    body: { query: ARTICLE_QUERY },
  });
  console.log(`Scanning through ${count} articles`);
  const articleBar = new SingleBar({ stopOnComplete: true });
  articleBar.start(count, 0);

  for await (const {
    _id: id,
    _source: { createdAt, text, articleCategories },
  } of getAllDocs('articles', ARTICLE_QUERY)) {
    const tags = articleCategories
      .filter(
        ({ status, positiveFeedbackCount, negativeFeedbackCount }) =>
          status === 'NORMAL' && positiveFeedbackCount > negativeFeedbackCount
      )
      .map(({ categoryId }) => categoryId);

    yield {
      id,
      createdAt,
      tags,
      text,
      url: `https://cofacts.tw/article/${id}`,
    };

    articleBar.increment();
  }

  articleBar.stop();
}

/* istanbul ignore next */
async function main() {
  console.log(
    await readFromGoogleSheet('1Y9FrI01in2hz5eiveGknH0HE081sr7gVuk0a7hqqKuc')
  );
}

/* istanbul ignore if */
if (require.main === module) {
  main().catch(console.error);
}
