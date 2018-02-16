import { GraphQLString, GraphQLInputObjectType, GraphQLBoolean } from 'graphql';

import {
  createFilterType,
  createSortType,
  createConnectionType,
  getSortArgs,
  pagingArgs,
} from 'graphql/util';

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
    { userId, appId }
  ) {
    const body = {
      sort: getSortArgs(orderBy),
      track_scores: true, // for _score sorting
      query: {
        bool: {
          filter: [],
        },
      },
    };

    if (filter.moreLikeThis) {
      body.query.bool.must = {
        // Ref: http://stackoverflow.com/a/8831494/1582110
        //
        more_like_this: {
          fields: ['text', 'reference'],
          like: filter.moreLikeThis.like,
          min_term_freq: 1,
          min_doc_freq: 1,
          minimum_should_match:
            filter.moreLikeThis.minimumShouldMatch || '10<70%',
        },
      };
    } else {
      body.query.bool.must = {
        // Ref: http://stackoverflow.com/a/8831494/1582110
        //
        match_all: {},
      };
    }

    if (filter.type) {
      body.query.bool.filter.push({
        term: {
          type: filter.type,
        },
      });
    }

    if (filter.selfOnly) {
      if (!userId) throw new Error('selfOnly can be set only after log in');
      body.query.bool.filter.push({ term: { userId } }, { term: { appId } });
    }

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
