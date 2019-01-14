import 'dotenv/config';
import 'util/catchUnhandledRejection';

import client from 'util/client';

export const FLAG_FIELD = 'isReferenced';

/**
 * Scrolls through urls to process and invoke processFn on them.
 *
 * @param {function} processFn (urlDocs) => Promise that resolves after process
 */
async function processUrls(processFn) {
  let scrollId,
    processedCount = 0,
    total = Infinity;

  const { hits, _scroll_id } = await client.search({
    index: 'urls',
    scroll: '30s',
    size: 100,
    body: {
      query: {
        bool: {
          must_not: {
            exists: {
              field: FLAG_FIELD,
            },
          },
          must: {
            range: {
              fetchedAt: {
                lte: new Date(Date.now() - 86400 * 1000).toISOString(), // yesterday
              },
            },
          },
        },
      },
      _source: ['url', 'canonical'],
    },
  });
  await processFn(hits.hits);
  processedCount += hits.hits.length;
  total = hits.total;
  scrollId = _scroll_id;

  // eslint-disable-next-line no-console
  console.info(`${processedCount} / ${total} Processed`);

  while (processedCount < total) {
    const { hits, _scroll_id } = await client.scroll({
      scroll: '30s',
      scrollId,
    });
    await processFn(hits.hits);
    processedCount += hits.hits.length;
    scrollId = _scroll_id;

    // eslint-disable-next-line no-console
    console.info(`${processedCount} / ${total} Processed`);
  }
}

/**
 * @param {Doc[]} docs - [{ _id, _source: {canonical, url} }]
 */
async function processFn(docs) {
  //
  // First of all, figure out each "doc" if any of them are referred
  //
  const mSearchBody = [];
  docs.forEach(({ _source: { canonical, url } }) => {
    mSearchBody.push({ index: 'articles,replies' });
    mSearchBody.push({
      query: {
        nested: {
          path: 'hyperlinks',
          query: {
            terms: {
              'hyperlinks.url': [canonical, url],
            },
          },
        },
      },
      size: 0, // Only need total
    });
  });

  /**
   * mSearchResult: [{hits: {total: count}}, ...]
   */
  const mSearchResult = (await client.msearch({ body: mSearchBody })).responses;

  //
  // Then perform update / delete on each doc
  //
  const bulkBody = [];
  docs.forEach(async ({ _id }, idx) => {
    const isReferenced = mSearchResult[idx].hits.total > 0;
    if (!isReferenced) {
      bulkBody.push({ delete: { _index: 'urls', _type: 'doc', _id } });
    } else {
      bulkBody.push({ update: { _index: 'urls', _type: 'doc', _id } });
      bulkBody.push({ doc: { [FLAG_FIELD]: true } });
    }
  });

  const bulkResult = await client.bulk({ body: bulkBody, refresh: 'true' });
  const deleteCount = bulkResult.items.reduce(
    (sum, obj) => (obj.delete && obj.delete.status === 200 ? sum + 1 : sum),
    0
  );

  // eslint-disable-next-line no-console
  console.info(`... ${deleteCount} urls successfully deleted`);
}

async function main() {
  await processUrls(processFn);
}

export default main;

if (require.main === module) {
  main();
}
