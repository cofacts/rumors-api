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

const ARTICLE_CATEGORY_HEADER = [
  'Article ID',
  'Article Text',
  'Existing Categories',
  'Action',
  'Category to Review',
  'Reasons',
  'Adopt?',
];

async function getCategoryIdMap() {
  const map = {};

  for await (const { _id, _source } of getAllDocs('categories')) {
    map[_id] = _source.title;
  }

  return map;
}

async function main({ startFrom } = {}) {
  const bar = new SingleBar({ stopOnComplete: true });
  const articleCategoryWorksheet = XLSX.utils.aoa_to_sheet([
    ARTICLE_CATEGORY_HEADER,
  ]);
  const categoryId2Title = await getCategoryIdMap();

  const {
    body: { count: articleCount },
  } = await client.count({
    index: 'articles',
    body: { query: { match_all: {} } },
  });

  bar.start(articleCount, 0);

  for await (const { _id, _source } of getAllDocs('articles')) {
    bar.increment();
    const { existingArticleCategories, newArticleCategories } = (
      _source.articleCategories || []
    ).reduce(
      (agg, { createdAt, status, aiModel, categoryId }) => {
        if (status === 'NORMAL' && !aiModel) {
          const category = categoryId2Title[categoryId];
          if (createdAt < startFrom)
            agg.existingArticleCategories.push(category);
          else agg.newArticleCategories.push(category);
        }
        return agg;
      },
      { existingArticleCategories: [], newArticleCategories: [] }
    );

    if (newArticleCategories.length === 0) {
      continue;
    }

    XLSX.utils.sheet_add_json(
      articleCategoryWorksheet,
      newArticleCategories.map(categoryId => ({
        'Article ID': _id,
        'Article Text': _source.text,
        'Existing Categories': existingArticleCategories.join(', '),
        Action: 'ADD',
        'Category to Review': categoryId,
        Reasons: '',
        'Adopt?': false,
      })),
      {
        header: ARTICLE_CATEGORY_HEADER,
        skipHeader: true,
        origin: -1,
      }
    );
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    articleCategoryWorksheet,
    'Article categories'
  );
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ['Category ID', 'Category Title'],
      ...Object.entries(categoryId2Title),
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
