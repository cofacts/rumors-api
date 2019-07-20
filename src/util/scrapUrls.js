import rollbar from 'rollbarInstance';
import urlRegex from 'url-regex';
import DataLoader from 'dataloader';
import url from 'url';

import gql from './gql';
/**
 * ScrapResult:
 * Refer to https://github.com/cofacts/url-resolver/blob/master/src/typeDefs/UrlResolveResult.graphql
 * with new fields:
 * @param {string} normalizedUrl - URL normalized in scrapUrl process
 * @param {boolean} fromUrlsCache - If the entry is from cacheLoader
 */

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
 * @param {number} options.scrapLimit - Limit the number of the new URLs scrapped from the text.
 *                                 Cached entries are not counted in limit.
 * @return {Promise<ScrapResult[]>} - If cannot scrap, resolves to null
 */
async function scrapUrls(
  text,
  { cacheLoader, client, noFetch = false, scrapLimit = 5 } = {}
) {
  const originalUrls = text.match(urlRegex()) || [];
  if (originalUrls.length === 0) return [];

  // Normalize URLs before sending to cache or scrapper to increase cache hit
  //
  const normalizedUrls = removeFBCLIDIfExist(originalUrls);

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
          error
        }
      }
    `({ urls }).then(({ data }) => data.resolvedUrls)
  );

  // result: list of ScrapResult, with its `url` being the url in text,
  // but canonical url may be normalized
  //
  const result = await Promise.all(
    // 1st pass: resolve cache
    normalizedUrls.map(async (normalizedUrl, i) => {
      if (cacheLoader) {
        const result = await cacheLoader.load(normalizedUrl);

        if (result)
          return {
            ...result,
            url: originalUrls[i],
            normalizedUrl,
            fromUrlsCache: true,
          };
      }

      return normalizedUrl;
    })
  ).then(results => {
    // 2nd pass: scrap when needed
    let scrappingCount = 0;

    return Promise.all(
      results.map(async (result, i) => {
        if (typeof result !== 'string') {
          return result;
        }

        // result is an URL here

        if (noFetch || scrappingCount >= scrapLimit) return null;
        scrappingCount += 1;
        return scrapLoader.load(result).then(scrapped => ({
          ...scrapped,
          url: originalUrls[i],
          normalizedUrl: scrapped.url,
        }));
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

    const {
      normalizedUrl: url, // Store normalized url in urls index to maximize caching capability
      canonical,
      title,
      summary,
      topImageUrl,
      html,
      status,
      error,
    } = r;

    return body.concat([
      { index: { _index: 'urls', _type: 'doc' } },
      {
        canonical,
        title,
        summary,
        topImageUrl,
        html,
        url,
        status,
        error,
        fetchedAt,
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

/**
 * Remove fbclid if it exist, handling the url comes from FB
 *
 * @param {string[]} inputTexts - raw urls
 * @return {string[]} - urls without fbclid query parameter
 */
export function removeFBCLIDIfExist(inputTexts) {
  return inputTexts.map(text => {
    try {
      const myURL = new URL(text);
      myURL.searchParams.delete('fbclid');
      return url.format(myURL, { unicode: true }); // keep unicode URLs as-is
    } catch (e) {
      console.error('[scrapUrls][removeFBCLIDIfExist]', e); // eslint-disable-line no-console

      // URL patterns not recognized by URL constructor, just skip
      return text;
    }
  });
}

export default scrapUrls;
