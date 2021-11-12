/**
 * Generates an XLSX file with article categories to review.
 */

import 'dotenv/config';
import yargs from 'yargs';
import XLSX from 'xlsx';
import { SingleBar } from 'cli-progress';
import client from 'util/client';

const SCROLL_TIMEOUT = '30s';
const BATCH_SIZE = 100;
const OUTPUT = 'review.xlsx';

/**
 * A generator that fetches all docs in the specified index.
 *
 * @param {String} indexName The name of the index to fetch
 * @param {Object} query The elasticsearch query
 * @yields {Object} the document
 */
async function* getAllDocs(indexName, query = { match_all: {} }) {
  let resp = await client.search({
    index: indexName,
    scroll: SCROLL_TIMEOUT,
    size: BATCH_SIZE,
    body: {
      query,
    },
  });

  while (true) {
    const docs = resp.body.hits.hits;
    if (docs.length === 0) break;
    for (const doc of docs) {
      yield doc;
    }

    if (!resp.body._scroll_id) {
      break;
    }

    resp = await client.scroll({
      scroll: SCROLL_TIMEOUT,
      scrollId: resp.body._scroll_id,
    });
  }
}

/**
 * @param {ReadonlyArray<*>} array
 * @returns {ReadonlyArray<*>} new array without duplicated child.
 */
function dedup(array) {
  return Array.from(new Set(array));
}

// List of [Object key, XLSX sheet title]
//
const ARTICLE_CATEGORY_HEADER_ENTRIES = [
  ['articleId', 'Article ID'],
  ['articleText', 'Article Text'],
  ['existingCategories', 'Existing Categories'],
  ['action', 'Action'],
  ['category', 'Category to Review'],

  // articleCategory or articleCategoryFeedback fields
  ['categoryId', 'Category ID'],
  ['userId', 'User ID'],
  ['appId', 'App ID'],
  ['createdAt', 'Connected At'],

  // Other fields
  ['reasons', 'Reasons'],
  ['adopt', 'Adopt?'],
];

// Include only the fields defined inside ARTICLE_CATEGORY_HEADER_ENTRIES
//
function getArticleCategoryRow(obj) {
  return ARTICLE_CATEGORY_HEADER_ENTRIES.reduce((row, [key]) => {
    row[key] = obj[key];
    return row;
  }, {});
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

async function getArticleIdFeedbacksMap(startFrom) {
  const FEEDBACK_QUERY = {
    bool: {
      must: [
        { term: { status: 'NORMAL' } },
        { range: { score: { lt: 0 } } },
        { range: { createdAt: { gte: new Date(startFrom).toISOString() } } },
      ],
    },
  };

  const feedbackBar = new SingleBar({ stopOnComplete: true });
  const {
    body: { count: feedbackCount },
  } = await client.count({
    index: 'articlecategoryfeedbacks',
    body: { query: FEEDBACK_QUERY },
  });
  console.log('Scanning new article category feedbacks...');
  feedbackBar.start(feedbackCount, 0);

  const map = {};
  for await (const { _source } of getAllDocs(
    'articlecategoryfeedbacks',
    FEEDBACK_QUERY
  )) {
    feedbackBar.increment();

    map[_source.articleId] = map[_source.articleId] || [];
    map[_source.articleId].push(_source);
  }

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

  const articleFeedbacksMap = await getArticleIdFeedbacksMap(startFrom);

  const {
    body: { count: articleCount },
  } = await client.count({
    index: 'articles',
    body: { query: { match_all: {} } },
  });

  const articleBar = new SingleBar({ stopOnComplete: true });
  articleBar.start(articleCount, 0);

  for await (const { _id, _source } of getAllDocs('articles')) {
    articleBar.increment();

    // Collect all NORMAL article-categories that is not added by AI models.
    //
    const { existingArticleCategories, newArticleCategories } = (
      _source.articleCategories || []
    ).reduce(
      (agg, articleCategory) => {
        if (articleCategory.status === 'NORMAL' && !articleCategory.aiModel) {
          if (new Date(articleCategory.createdAt) >= new Date(startFrom))
            agg.newArticleCategories.push(articleCategory);
          else agg.existingArticleCategories.push(articleCategory);
        }
        return agg;
      },
      { existingArticleCategories: [], newArticleCategories: [] }
    );

    const articleDataInRow = {
      articleId: _id,
      articleText: _source.text,
      existingCategories: existingArticleCategories
        .map(({ categoryId }) => categoryMap[categoryId].title)
        .join(', '),
    };

    // Generate 'ADD' rows with exactly the columns in ARTICLE_CATEGORY_HEADER_ENTRIES from articleCategories
    //
    const articleCategoryRows = newArticleCategories.map(articleCategory =>
      getArticleCategoryRow({
        ...articleDataInRow,
        action: 'ADD',
        category: categoryMap[articleCategory.categoryId].title,
        'Adopt?': false,
        // Fill in article category fields
        ...articleCategory,
      })
    );

    const categoryIdToFeedbacksMap = (articleFeedbacksMap[_id] || []).reduce(
      (categoryMap, feedback) => {
        // Group feedbacks by categoryId
        categoryMap[feedback.categoryId] =
          categoryMap[feedback.categoryId] || [];
        categoryMap[feedback.categoryId].push(feedback);

        return categoryMap;
      },
      {}
    );

    // Generate 'DELETE' rows with exactly the columns in ARTICLE_CATEGORY_HEADER_ENTRIES from articleCategoryFeedbacks
    //
    const feedbackRows = Object.entries(categoryIdToFeedbacksMap).map(
      ([categoryId, feedbacks]) =>
        getArticleCategoryRow({
          ...articleDataInRow,
          action: 'DELETE',
          category: categoryMap[categoryId].title,
          categoryId,
          userId: dedup(feedbacks.map(({ userId }) => userId)).join('／'),
          appId: dedup(feedbacks.map(({ appId }) => appId)).join('／'),
          createdAt: dedup(feedbacks.map(({ createdAt }) => createdAt)).join(
            '／'
          ),
          reasons: dedup(feedbacks.map(({ comment }) => comment)).join('／'),
          'Adopt?': false,
        })
    );

    XLSX.utils.sheet_add_json(
      articleCategoryWorksheet,
      [...articleCategoryRows, ...feedbackRows],
      {
        header: ARTICLE_CATEGORY_HEADER_ENTRIES.map(([key]) => key),
        skipHeader: true,
        origin: -1,
      }
    );
  }

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
        coerce: Date.parse,
      },
    })
    .help('help').argv;

  main(argv)
    .then(workbook => {
      XLSX.writeFile(workbook, OUTPUT);
      console.log('Result written to:', OUTPUT);
    })
    .catch(console.error);
}
