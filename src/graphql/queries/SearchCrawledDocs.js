import { GraphQLString } from 'graphql';

import fetch from 'node-fetch';
import FormData from 'form-data';
import rollbar from 'rollbar';

import { processMeta } from 'util/client';
import getIn from 'util/getInFactory';
import CrawledDoc from 'graphql/models/CrawledDoc';

import { createConnectionType } from 'graphql/util';

export default {
  description: 'Search for crawled doc in rumor-search.g0v.ronny.tw',

  args: {
    text: { type: GraphQLString },
  },

  async resolve(rootValue, { text }) {
    const crawledFormData = new FormData();
    crawledFormData.append('content', text);

    const crawledResult = await fetch(
      'https://rumor-search.g0v.ronny.tw/query.php',
      {
        method: 'POST',
        body: crawledFormData,
        timeout: 5000,
      }
    )
      .then(resp => resp.json())
      .catch(err => {
        rollbar.handleError(err);
        return {};
      });

    return getIn(crawledResult)(['hits', 'hits'], []).map(processMeta);
  },

  type: createConnectionType('SearchCrawledDocConnection', CrawledDoc, {
    resolveEdges(docs) {
      return docs.map(({ title, content, url, _score: score }) => ({
        node: { rumor: title, answer: content, url },
        score,
      }));
    },
    // Do not support pageInfo & totalCount
    resolvePageInfo() {},
    resolveTotalCount() {},
  }),
};
