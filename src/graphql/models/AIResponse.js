import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLID,
  GraphQLInt,
  GraphQLUnionType,
} from 'graphql';

import { createConnectionType } from 'graphql/util';
import Node from '../interfaces/Node';
import AIResponseTypeEnum from './AIResponseTypeEnum';
import AIResponseStatusEnum from './AIResponseStatusEnum';
import User, { userFieldResolver } from './User';

const OpenAICompletionUsage = new GraphQLObjectType({
  name: 'OpenAICompletionUsage',
  fields: {
    promptTokens: { type: new GraphQLNonNull(GraphQLInt) },
    completionTokens: { type: new GraphQLNonNull(GraphQLInt) },
    totalTokens: { type: new GraphQLNonNull(GraphQLInt) },
  },
});

const AIResponse = new GraphQLObjectType({
  name: 'AIResponse',
  description: 'Denotes an AI processed response and its processing status.',
  interfaces: [Node],
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },

    docId: {
      description: 'The id for the document that this AI response is for.',
      type: GraphQLID,
    },

    type: {
      description: 'AI response type',
      type: new GraphQLNonNull(AIResponseTypeEnum),
    },

    user: {
      description: 'The user triggered this AI response',
      type: User,
      resolve: userFieldResolver,
    },

    status: {
      description: 'Processing status of AI',
      type: new GraphQLNonNull(AIResponseStatusEnum),
    },

    text: {
      description: 'AI response text. Populated after status becomes SUCCESS.',
      type: GraphQLString,
    },

    usage: {
      description:
        'The usage returned from AI API, if the API has such info. Populated after status becomes SUCCESS.',
      type: new GraphQLUnionType({
        name: 'AIResponseUsage',
        types: [OpenAICompletionUsage],
        resolveType(doc) {
          switch (doc.type) {
            case 'AI_REPLY':
              return OpenAICompletionUsage;
          }
        },
      }),
    },

    createdAt: { type: new GraphQLNonNull(GraphQLString) },
    updatedAt: { type: GraphQLString },
  }),
});

export const AIResponseConnection = createConnectionType(
  'AIResponseConnection',
  AIResponse
);

export default AIResponse;
