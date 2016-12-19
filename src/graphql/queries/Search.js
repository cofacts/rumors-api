import {
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';
import fetch from 'node-fetch';
import FormData from 'form-data';

import getInFactory from 'util/getInFactory';
import client, { processMeta } from 'util/client';

import SearchResult from 'graphql/models/SearchResult';

function processScoredDoc(hit) {
  return {
    score: hit._score,
    doc: processMeta(hit),
  };
}

export default {
  type: SearchResult,
  args: {
    text: { type: GraphQLString },
    findInCrawled: {
      type: GraphQLBoolean,
      defaultValue: true,
      description: 'When false, does not query crawled doc server at all.',
    },
  },
  async resolve(rootValue, { text, findInCrawled }) {
    const crawledFormData = new FormData();
    crawledFormData.append('content', text);

    const [elasticResult, crawledResult] = await Promise.all([
      client.msearch({
        body: [
          { index: 'rumors', type: 'basic' },
          { query: { match: { text } } },
          { index: 'answers', type: 'basic' },
          { query: { match: { 'versions.text': text } } },
        ],
      }),
      findInCrawled ?
        fetch('https://rumor-search.g0v.ronny.tw/query.php', {
          method: 'POST', body: crawledFormData,
        }).then(resp => resp.json()) :
        Promise.resolve({}),
    ]);

    const [rumorResult, answerResult] = elasticResult.responses;

    return {
      rumors: getInFactory(rumorResult)(['hits', 'hits'], []).map(processScoredDoc),
      answers: getInFactory(answerResult)(['hits', 'hits'], []).map(processScoredDoc),
      crawledDocs: getInFactory(crawledResult)(['hits', 'hits'], [])
        .map(processScoredDoc)
        .map(({ doc, score }) => ({
          doc: { rumor: doc.title, answer: doc.content, url: doc.url },
          score,
        })),
    };
  },
};
