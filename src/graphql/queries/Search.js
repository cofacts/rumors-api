import {
  GraphQLString,
} from 'graphql';

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
  },
  async resolve(rootValue, { text }) {
    const { responses } = await client.msearch({
      body: [
        { index: 'rumors', type: 'basic' },
        { query: { match: { text } } },
        { index: 'answers', type: 'basic' },
        { query: { match: { 'versions.text': text } } },
      ],
    });

    const [rumorResult, answerResult] = responses;
    const getInRumorResult = getInFactory(rumorResult);
    const getInAnswerResult = getInFactory(answerResult);

    return {
      rumors: getInRumorResult(['hits', 'hits'], []).map(processScoredDoc),
      answers: getInAnswerResult(['hits', 'hits'], []).map(processScoredDoc),
      crawledDocs: [],
    };
  },
};
