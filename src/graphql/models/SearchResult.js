import {
  GraphQLObjectType,
  GraphQLList,
  GraphQLUnionType,
} from 'graphql';

import Reply, { ScoredReply } from 'graphql/models/Reply';
import Article, { ScoredArticle } from 'graphql/models/Article';
import CrawledDoc, { ScoredCrawledDoc } from 'graphql/models/CrawledDoc';


const ResultDocument = new GraphQLUnionType({
  name: 'ResultDocument',
  types: [Article, Reply, CrawledDoc],
  deprecationReason: 'Use SearchArticle, SearchReply and SearchCrawledDoc instead.',
  resolveType(result) {
    if (!result) return CrawledDoc;

    switch (result._type) {
      case 'ARTICLE': return Article;
      case 'REPLY': return Reply;
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
    articles: { type: new GraphQLList(ScoredArticle) },
    replies: { type: new GraphQLList(ScoredReply) },
    crawledDoc: { type: new GraphQLList(ScoredCrawledDoc) },
    suggestedResult: {
      description: 'The document that is the best match in this search.',
      type: ResultDocument,
      resolve({
        articles: scoredArticles, replies: scoredReplies, crawledDocs: scoredCrawledDocs,
      }) {
        const bestScoredArticle = theBestDoc(scoredArticles.filter(
          article => article.doc.replyConnectionIds && article.doc.replyConnectionIds.length,
        ), 13);
        if (bestScoredArticle && bestScoredArticle.doc.replyConnectionIds.length) {
          return {
            ...bestScoredArticle.doc, _type: 'ARTICLE',
          };
        }

        const bestScoredReply = theBestDoc(scoredReplies, 10);
        if (bestScoredReply) {
          return {
            ...bestScoredReply.doc, _type: 'REPLY',
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
