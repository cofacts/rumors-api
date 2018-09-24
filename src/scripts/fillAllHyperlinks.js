import 'util/catchUnhandledRejection';

import client from 'util/client';

import { updateReplyHyperlinks } from 'graphql/mutations/CreateReply';
import { updateArticleHyperlinks } from 'graphql/mutations/CreateArticle';
import scrapUrls from 'util/scrapUrls';
import DataLoaders from 'graphql/dataLoaders';

const loader = new DataLoaders();

/**
 * Fetches all docs in the specified index.
 *
 * @param {String} indexName The name of the index to fetch
 * @returns {Array<Docs>} Array of {_id, _source, ...}.
 */
async function fetchAllDocs(indexName) {
  let scrollId,
    docs = [],
    total = Infinity;

  const { hits, _scroll_id } = await client.search({
    index: indexName,
    scroll: '5s',
    size: 1000,
    body: {
      query: {
        match_all: {},
      },
    },
  });
  docs = hits.hits;
  total = hits.total;
  scrollId = _scroll_id;

  while (docs.length < total) {
    const { hits, _scroll_id } = await client.scroll({
      scroll: '5s',
      scrollId,
    });
    docs = docs.concat(hits.hits);
    scrollId = _scroll_id;
  }

  return docs;
}

/**
 * This script first updates hyperlinks field for all articles and replies.
 *
 * Then for each hyperlink, perform scrapping and update their
 * scraps the result from web, and fill in `hyerplinks` fields and the `urls` index.
 */

async function fillAllHyperlinks() {
  const articles = await fetchAllDocs('articles');
  let counter = 0;
  for (const { _id, _source } of articles) {
    // eslint-disable-next-line no-console
    console.log(`[${++counter}/${articles.length}] ${_id}`);

    let scrapResults = [];

    try {
      scrapResults = await scrapUrls(_source.text, {
        cacheLoader: loader.urlLoader,
        client,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(_id, e);
    }
    if (scrapResults.length) {
      await updateArticleHyperlinks(
        _id,
        scrapResults.filter(result => !!result) /* filter out errors */
      );
      // eslint-disable-next-line no-console
      console.log(`  ...${scrapResults.length} URL(s)`);
    }
  }
}

fillAllHyperlinks();
