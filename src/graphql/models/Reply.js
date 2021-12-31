import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
  GraphQLID,
} from 'graphql';

import {
  filterByStatuses,
  pagingArgs,
  getSortArgs,
  createSortType,
  createConnectionType,
  DEFAULT_ARTICLE_REPLY_STATUSES,
} from 'graphql/util';
import Node from '../interfaces/Node';
import ReplyTypeEnum from './ReplyTypeEnum';
import ArticleReplyStatusEnum from './ArticleReplyStatusEnum';
import ArticleReply from './ArticleReply';
import User, { userFieldResolver } from './User';
import Hyperlink from './Hyperlink';

const Reply = new GraphQLObjectType({
  name: 'Reply',
  interfaces: [Node],
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    user: {
      type: User,
      description: 'The user submitted this reply version',
      resolve: userFieldResolver,
    },
    createdAt: { type: GraphQLString },
    text: { type: GraphQLString },
    type: { type: ReplyTypeEnum },
    reference: { type: GraphQLString },
    articleReplies: {
      type: new GraphQLList(ArticleReply),
      args: {
        status: {
          type: ArticleReplyStatusEnum,
          description: 'Deprecated. Please use statuses instead.',
        },
        statuses: {
          type: new GraphQLList(new GraphQLNonNull(ArticleReplyStatusEnum)),
          defaultValue: DEFAULT_ARTICLE_REPLY_STATUSES,
          description:
            'Returns only article replies with the specified statuses',
        },
      },
      resolve: async (
        { id },
        { status, statuses = DEFAULT_ARTICLE_REPLY_STATUSES },
        { loaders }
      ) => {
        const articleReplies = await loaders.articleRepliesByReplyIdLoader.load(
          id
        );
        return filterByStatuses(articleReplies, status ? [status] : statuses);
      },
    },
    hyperlinks: {
      type: new GraphQLList(Hyperlink),
      description:
        'Hyperlinks in reply text or reference. May be empty array if no URLs are included. `null` when hyperlinks are still fetching.',
    },
    similarReplies: {
      description:
        'Replies that has similar text or references of this current reply',
      args: {
        orderBy: {
          type: createSortType('SimilarReplyOrderBy', ['_score', 'createdAt']),
        },
        ...pagingArgs,
      },

      async resolve(
        { id },
        { orderBy = [{ _score: 'DESC' }], ...otherParams }
      ) {
        const likeQuery = [{ _index: 'replies', _type: 'doc', _id: id }];

        const body = {
          query: {
            bool: {
              should: [
                {
                  more_like_this: {
                    fields: ['text', 'reference'],
                    like: likeQuery,
                    min_term_freq: 1,
                    min_doc_freq: 1,
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
                      },
                    },
                    inner_hits: {
                      highlight: {
                        order: 'score',
                        fields: {
                          'hyperlinks.title': {
                            number_of_fragments: 1, // Return only 1 piece highlight text
                            fragment_size: 200, // word count of highlighted fragment
                            type: 'plain',
                          },
                          'hyperlinks.summary': {
                            number_of_fragments: 1, // Return only 1 piece highlight text
                            fragment_size: 200, // word count of highlighted fragment
                            type: 'plain',
                          },
                        },
                        require_field_match: false,
                        pre_tags: ['<HIGHLIGHT>'],
                        post_tags: ['</HIGHLIGHT>'],
                      },
                    },
                  },
                },
              ],
              minimum_should_match: 1,
            },
          },
          sort: getSortArgs(orderBy),
          track_scores: true, // required to always populate score
        };

        return {
          index: 'replies',
          type: 'doc',
          body,
          ...otherParams,
        };
      },
      // eslint-disable-next-line no-use-before-define
      type: ReplyConnection,
    },
  }),
});

export const ReplyConnection = createConnectionType('ReplyConnection', Reply);

export default Reply;
