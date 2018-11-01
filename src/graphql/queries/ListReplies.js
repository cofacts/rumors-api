import { GraphQLString, GraphQLInputObjectType, GraphQLBoolean } from 'graphql';
import client from 'util/client';

import {
  createFilterType,
  createSortType,
  createConnectionType,
  getSortArgs,
  pagingArgs,
} from 'graphql/util';
import scrapUrls from 'util/scrapUrls';

import Reply from 'graphql/models/Reply';
import ReplyTypeEnum from 'graphql/models/ReplyTypeEnum';

export default {
  args: {
    filter: {
      type: createFilterType('ListReplyFilter', {
        moreLikeThis: {
          type: new GraphQLInputObjectType({
            name: 'ListReplyMoreLikeThisInput',
            fields: {
              like: { type: GraphQLString },
              minimumShouldMatch: { type: GraphQLString },
            },
          }),
        },
        selfOnly: {
          type: GraphQLBoolean,
          description: 'List the replies created by the requester themselves',
        },
        type: {
          type: ReplyTypeEnum,
          description: 'List the replies of certain types',
        },
      }),
    },
    orderBy: {
      type: createSortType('ListReplyOrderBy', ['_score', 'createdAt']),
    },
    ...pagingArgs,
  },
  async resolve(
    rootValue,
    { filter = {}, orderBy = [], ...otherParams },
    { userId, appId, loaders }
  ) {
    const body = {
      sort: getSortArgs(orderBy),
      track_scores: true, // for _score sorting
    };

    // Collecting queries that will be used in bool queries later
    const shouldQueries = []; // Affects scores
    const filterQueries = []; // Not affects scores

    if (filter.moreLikeThis) {
      const scrapResults = await scrapUrls(filter.moreLikeThis.like, {
        client,
        cacheLoader: loaders.urlLoader,
      });

      const likeQuery = [
        filter.moreLikeThis.like,
        ...scrapResults.map(({ title, summary }) => `${title} ${summary}`),
      ];

      shouldQueries.push(
        {
          more_like_this: {
            fields: ['text', 'reference'],
            like: likeQuery,
            min_term_freq: 1,
            min_doc_freq: 1,
            minimum_should_match:
              filter.moreLikeThis.minimumShouldMatch || '10<70%',
          },
        },
        {
          nested: {
            path: 'hyperlinks',
            score_mode: 'sum',
            query: {
              more_like_this: {
                fields: ['hyperlinks.title', 'hyperlinks.summary'],
                like: likeQuery,
                min_term_freq: 1,
                min_doc_freq: 1,
                minimum_should_match:
                  filter.moreLikeThis.minimumShouldMatch || '10<70%',
              },
            },
          },
        }
      );
    }

    if (filter.type) {
      filterQueries.push({
        term: {
          type: filter.type,
        },
      });
    }

    if (filter.selfOnly) {
      if (!userId) throw new Error('selfOnly can be set only after log in');
      filterQueries.push({ term: { userId } }, { term: { appId } });
    }

    body.query = {
      bool: {
        should:
          shouldQueries.length === 0 ? [{ match_all: {} }] : shouldQueries,
        filter: filterQueries,
        minimum_should_match: 1, // At least 1 "should" query should present
      },
    };

    // should return search context for resolveEdges & resolvePageInfo
    return {
      index: 'replies',
      type: 'doc',
      body,
      ...otherParams,
    };
  },
  type: createConnectionType('ListReplyConnection', Reply),
};
