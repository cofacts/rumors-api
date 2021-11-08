import 'dotenv/config';
import yargs from 'yargs';
import client from 'util/client';

const SCROLL_TIMEOUT = '30s';
const BATCH_SIZE = 100;

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

async function main({ startFrom } = {}) {
  for await (const { _id, _source } of getAllDocs('articles')) {
    if (
      // All article categories are after the given `startFrom`
      _source.articleCategories.every(({ createdAt }) => createdAt < startFrom)
    ) {
      continue;
    }
    console.log('article', _id);
  }
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

  main(argv).catch(console.error);
}
