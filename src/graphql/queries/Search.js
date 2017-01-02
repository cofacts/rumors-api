import {
  GraphQLString,
  GraphQLBoolean,
} from 'graphql';
import fetch from 'node-fetch';
import FormData from 'form-data';
import rollbar from 'rollbar';

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

    // Avoid hitting TooManyClauses exception. Default is 1024 clauses,
    // and we are using unigram so text length = clause number.
    // https://wiki.apache.org/lucene-java/LuceneFAQ#Why_am_I_getting_a_TooManyClauses_exception.3F
    //
    const truncatedText = text.slice(0, 1024);
    crawledFormData.append('content', truncatedText);

    const [elasticResult, crawledResult] = await Promise.all([
      client.msearch({
        body: [
          { index: 'rumors', type: 'basic' },
          { query: { match: { text: truncatedText } } },
          { index: 'answers', type: 'basic' },
          { query: { match: { 'versions.text': truncatedText } } },
        ],
      }),
      findInCrawled ?
        fetch('https://rumor-search.g0v.ronny.tw/query.php', {
          method: 'POST', body: crawledFormData, timeout: 5000,
        }).then(resp => resp.json()).catch((err) => {
          rollbar.handleError(err);
          return {};
        }) :
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
