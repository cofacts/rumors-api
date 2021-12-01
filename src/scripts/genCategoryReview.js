/**
 * Generates an XLSX file with article categories to review.
 */

import 'dotenv/config';
import yargs from 'yargs';
import XLSX from 'xlsx';
import { SingleBar } from 'cli-progress';
import client from 'util/client';
import getAllDocs from 'util/getAllDocs';

const OUTPUT = 'review.xlsx';

// List of [Object key, XLSX sheet title]
//
const ARTICLE_CATEGORY_HEADER_ENTRIES = [
  ['articleId', 'Article ID'],
  ['articleText', 'Article Text'],
  ['category', 'Category to Review'],

  // articleCategory or articleCategoryFeedback fields
  ['categoryId', 'Category ID'],
  ['userId', 'User ID'],
  ['appId', 'App ID'],
  ['createdAt', 'Connected At'],

  // Other fields
  ['reasons', "Other's deny reasons"],
  ['adopt', 'Adopt?'],
  ['denyReason', 'Deny reason'],
];

const REVIEWER_APP_ID = 'RUMORS_AI';
const REVIEWER_USER_ID = 'category-reviewer';

/**
 * @param {ReadonlyArray<*>} array
 * @returns {ReadonlyArray<*>} new array without duplicated child.
 */
function dedup(array) {
  return Array.from(new Set(array));
}

// Include only the fields defined inside ARTICLE_CATEGORY_HEADER_ENTRIES
//
function getArticleCategoryRow(obj) {
  return ARTICLE_CATEGORY_HEADER_ENTRIES.reduce((row, [key]) => {
    row[key] = obj[key];
    return row;
  }, {});
}

function isReviewerFeedback(feedback) {
  return (
    feedback.userId === REVIEWER_USER_ID && feedback.appId === REVIEWER_APP_ID
  );
}

/**
 * @returns {{[categoryId: string]: object}} A map of category ID to the doc
 */
async function getCategoryMap() {
  const map = {};

  for await (const { _id, _source } of getAllDocs('categories')) {
    map[_id] = _source;
  }

  return map;
}

/**
 * @returns {[articleId: string]: {[categoryId: string]: Object[]}}
 */
async function getArticleCategoryFeedbacksMap() {
  const FEEDBACK_QUERY = {
    term: { status: 'NORMAL' },
  };
  const {
    body: { count: feedbackCount },
  } = await client.count({
    index: 'articlecategoryfeedbacks',
    body: { query: FEEDBACK_QUERY },
  });

  console.log(`Scanning ${feedbackCount} valid article category feedbacks...`);
  const feedbackBar = new SingleBar({ stopOnComplete: true });
  feedbackBar.start(feedbackCount, 0);

  const map = {};
  for await (const { _source } of getAllDocs(
    'articlecategoryfeedbacks',
    FEEDBACK_QUERY
  )) {
    feedbackBar.increment();

    map[_source.articleId] = map[_source.articleId] || {};
    map[_source.articleId][_source.categoryId] =
      map[_source.articleId][_source.categoryId] || [];
    map[_source.articleId][_source.categoryId].push(_source);
  }

  feedbackBar.stop();

  return map;
}

/**
 * Generates a workbook from given args
 *
 * @param {object} args
 * @returns {XLSX.WorkBook}
 */
async function main({ startFrom } = {}) {
  const articleCategoryWorksheet = XLSX.utils.aoa_to_sheet([
    ARTICLE_CATEGORY_HEADER_ENTRIES.map(([, title]) => title),
  ]);
  const categoryMap = await getCategoryMap();
  const articleCategoryFeedbacksMap = await getArticleCategoryFeedbacksMap();
  const ARTICLE_QUERY = {
    range: { normalArticleCategoryCount: { gt: 0 } },
  };

  const {
    body: { count: articleCount },
  } = await client.count({
    index: 'articles',
    body: { query: ARTICLE_QUERY },
  });

  console.log(`Scanning ${articleCount} categorized articles...`);
  const articleBar = new SingleBar({ stopOnComplete: true });
  articleBar.start(articleCount, 0);

  for await (const { _id: articleId, _source } of getAllDocs(
    'articles',
    ARTICLE_QUERY
  )) {
    articleBar.increment();

    /**
     * Collect article-categories of interest, which is defined as:
     * - date criteria
     *      - creation date >= input date, or
     *      - latest feedback date by others (not we the reviewers) >= input date
     *  - created by website user, or created by AI (has `aiModel`) with positive total score
     */
    const articleCategoriesOfInterest = (
      _source.articleCategories || []
    ).filter(articleCategory => {
      // Skip deleted & blocked article categories
      if (articleCategory.status !== 'NORMAL') return false;

      const feedbacks =
        articleCategoryFeedbacksMap[articleId]?.[articleCategory.categoryId] ||
        [];
      const latestFeedbackDate = feedbacks
        .filter(
          feedback =>
            !isReviewerFeedback(feedback) && feedback.status === 'NORMAL'
        )
        .reduce(
          (maxCreatedAt, { createdAt }) =>
            Math.max(maxCreatedAt, new Date(createdAt)),
          0
        );

      // Reject those does not match date criteria
      if (
        new Date(articleCategory.createdAt) < startFrom &&
        latestFeedbackDate < startFrom
      )
        return false;

      const createdByAI = !!articleCategory.aiModel;
      const score =
        articleCategory.positiveFeedbackCount -
        articleCategory.negativeFeedbackCount;
      return !createdByAI || score > 0;
    });

    if (articleCategoriesOfInterest.length === 0) continue;

    const articleCategoryRows = articleCategoriesOfInterest.map(
      articleCategory => {
        const feedbacks =
          articleCategoryFeedbacksMap[articleId]?.[
            articleCategory.categoryId
          ] || [];

        const reasons = dedup(
          feedbacks
            .filter(
              feedback =>
                !isReviewerFeedback(feedback) &&
                feedback.status === 'NORMAL' &&
                feedback.score === -1 &&
                !!feedback.comment
            )
            .map(({ comment }) => comment)
        ).join(', ');
        const reviewerFeedback = feedbacks.find(isReviewerFeedback);

        return getArticleCategoryRow({
          articleId,
          articleText: _source.text,
          category: categoryMap[articleCategory.categoryId].title,
          reasons,

          // Fill in article category fields
          ...articleCategory,

          // Pre-fill previous reviewer feedback if already reviewed
          adopt: (reviewerFeedback && reviewerFeedback.score === 1) || false,
          denyReason: (reviewerFeedback && reviewerFeedback.comment) || '',
        });
      }
    );

    XLSX.utils.sheet_add_json(articleCategoryWorksheet, articleCategoryRows, {
      header: ARTICLE_CATEGORY_HEADER_ENTRIES.map(([key]) => key),
      skipHeader: true,
      origin: -1,
    });
  }

  articleBar.stop();

  const workbook = XLSX.utils.book_new();

  // Article categories sheet
  XLSX.utils.book_append_sheet(
    workbook,
    articleCategoryWorksheet,
    'Article categories'
  );

  // Mappings sheet
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Category ID', 'Title', 'Description'],
      ...Object.entries(categoryMap).map(([id, { title, description }]) => [
        id,
        title,
        description,
      ]),
    ]),
    'Mappings'
  );

  return workbook;
}

export default main;

if (require.main === module) {
  const argv = yargs
    .options({
      startFrom: {
        alias: 'f',
        description:
          'Include article categories & article category feedbacks from this time. Should be an ISO time string.',
        type: 'string',
        demandOption: true,
      },
    })
    .help('help').argv;

  const startFrom = new Date(argv.startFrom);

  if (isNaN(startFrom)) {
    throw new Error(
      'Please provide valid timestamp via --startFrom (see --help)'
    );
  }

  main({ startFrom })
    .then(workbook => {
      XLSX.writeFile(workbook, OUTPUT);
      console.log('Result written to:', OUTPUT);
    })
    .catch(console.error);
}
