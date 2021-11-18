import client from 'util/client';

/**
 * A generator that fetches all docs in the specified index and yield 1 doc at a time.
 *
 * @param {String} index The name of the index to fetch
 * @param {Object} query The elasticsearch query. Fetches all doc in the specified index if not given.
 * @param {Object} settings Query param settings in ES.
 * @param {number} settings.size Number of docs per batch. Default to 1000.
 * @param {string} settings.scroll The scroll timeout setting. Default to 30s.
 * @yields {Object} the document
 */
async function* getAllDocs(
  index,
  query = { match_all: {} },
  { scroll = '30s', size = 1000 } = {}
) {
  let resp = await client.search({
    index,
    scroll,
    size,
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
      scroll,
      scrollId: resp.body._scroll_id,
    });
  }
}

export default getAllDocs;
