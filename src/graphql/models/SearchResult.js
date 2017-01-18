import {
  GraphQLObjectType,
  GraphQLFloat,
  GraphQLList,
  GraphQLUnionType,
} from 'graphql';

import Answer from 'graphql/models/Answer';
import Rumor from 'graphql/models/Rumor';
import CrawledDoc from 'graphql/models/CrawledDoc';

function scoredDocFactory(name, type) {
  return new GraphQLObjectType({
    name,
    fields: {
      score: { type: GraphQLFloat },
      doc: { type },
    },
  });
}

const ResultDocument = new GraphQLUnionType({
  name: 'ResultDocument',
  types: [Rumor, Answer, CrawledDoc],
  resolveType(result) {
    if (!result) return CrawledDoc;

    switch (result._type) {
      case 'RUMOR': return Rumor;
      case 'ANSWER': return Answer;
      default: return CrawledDoc;
    }
  },
});

function theBestDoc(scoredDocs, singleDocThreshold) {
  // If there is only one doc and has score over threshold,
  // or the first match is 2x larger than the second match,
  // return the first match.
  if (
    (scoredDocs.length === 1 && scoredDocs[0].score > singleDocThreshold) ||
    (
      scoredDocs.length > 1 &&
      scoredDocs[0].score > 2 * scoredDocs[Math.floor(scoredDocs.length / 2)].score
    )
  ) {
    return scoredDocs[0];
  }

  return null;
}

export default new GraphQLObjectType({
  name: 'SearchResult',
  fields: () => ({
    rumors: { type: new GraphQLList(scoredDocFactory('ScoredRumor', Rumor)) },
    answers: { type: new GraphQLList(scoredDocFactory('ScoredAnswer', Answer)) },
    crawledDoc: { type: new GraphQLList(scoredDocFactory('ScoredCrawledDoc', CrawledDoc)) },
    suggestedResult: {
      description: 'The document that is the best match in this search.',
      type: ResultDocument,
      resolve({ rumors: scoredRumors, answers: scoredAnswers, crawledDocs: scoredCrawledDocs }) {
        const bestScoredRumor = theBestDoc(scoredRumors, 15);
        if (bestScoredRumor && bestScoredRumor.doc.answerIds.length) {
          return {
            ...bestScoredRumor.doc, _type: 'RUMOR',
          };
        }

        const bestScoredAnswer = theBestDoc(scoredAnswers, 10);
        if (bestScoredAnswer) {
          return {
            ...bestScoredAnswer.doc, _type: 'ANSWER',
          };
        }

        const bestScoredCrawledDoc = theBestDoc(scoredCrawledDocs, 0.8);
        if (bestScoredCrawledDoc) {
          return {
            ...bestScoredCrawledDoc.doc, _type: 'CRAWLED_DOC',
          };
        }

        return null;
      },
    },
  }),
});
