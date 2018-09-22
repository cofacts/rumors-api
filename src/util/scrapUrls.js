import rollbar from 'rollbarInstance';
import urlRegex from 'url-regex';
import DataLoader from 'dataloader';

import gql from './gql';

/**
 * Extracts urls from a string.
 * Fetches the specified url data from cache or through scrapping.
 * Optionally writes the scrapped result to database.
 *
 * @param {string} text
 * @param {object} options
 * @param {object} options.cacheLoader - The dataloader that loads result from `urls`, given a URL.
 *                                       If not given, scrapUrls don't read `urls` cache.
 * @param {boolean} options.noFetch - If true, return null when cache does not hit. Default: false.
 * @param {object} options.client - ElasticSearch.js client instance used to write new results to
 *                                  `urls` index. If not given, scrapUrl don't write `urls` cache.
 * @return {Promise<ScrapResult[]>} - If cannot scrap, resolves to null
 */
async function scrapUrls(text, { cacheLoader, client, noFetch = false } = {}) {
  const urls = text.match(urlRegex()) || [];
  if (urls.length === 0) return [];

  const scrapLoader = new DataLoader(urls =>
    gql`
      query($urls: [String]!) {
        resolvedUrls(urls: $urls) {
          url
          canonical
          title
          summary
          topImageUrl
          html
          status
        }
      }
    `({ urls }).then(({ data }) => data.resolvedUrls)
  );

  const result = await Promise.all(
    // 1st pass: resolve cache
    urls.map(async url => {
      if (cacheLoader) {
        const result = await cacheLoader.load(url);

        if (result)
          return {
            ...result,
            url, // Overwrite the URL from cache with the actual url in text, because cacheLoader may match canonical URLs
            fromUrlsCache: true,
          };
      }

      return url;
    })
  ).then(results => {
    // 2nd pass: scrap when needed
    return Promise.all(
      results.map(async result => {
        if (typeof result !== 'string') {
          return result;
        }

        // result is an URL here

        if (noFetch) return null;

        return scrapLoader.load(result);
      })
    );
  });

  if (!client) {
    // client not specified, don't to write to urls
    return result;
  }

  const fetchedAt = new Date();

  // Filter out null, write to "urls" index
  const urlsBody = result.reduce((body, r) => {
    if (!r || r.fromUrlsCache) {
      return body;
    }

    const { url, canonical, title, summary, topImageUrl, html, status } = r;

    return body.concat([
      { index: { _index: 'urls', _type: 'doc' } },
      {
        canonical,
        title,
        summary,
        topImageUrl,
        html,
        url,
        fetchedAt,
        status,
      },
    ]);
  }, []);

  if (urlsBody.length === 0) {
    // Nothing to write to urls
    return result;
  }

  const insertResult = await client.bulk({
    body: urlsBody,
  });

  if (insertResult.errors) {
    rollbar.error('Urls insert error', insertResult);
  }

  return result;
}

export default scrapUrls;
