import {
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLID,
  GraphQLInt,
} from 'graphql';

import { createConnectionType } from 'graphql/util';
import Node from '../interfaces/Node';
import AIResponseTypeEnum from './AIResponseTypeEnum';
import AIResponseStatusEnum from './AIResponseStatusEnum';
import User, { userFieldResolver } from './User';

const commonAiResponseFields = {
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

  createdAt: { type: new GraphQLNonNull(GraphQLString) },
  updatedAt: { type: GraphQLString },
};

const AIResponse = new GraphQLInterfaceType({
  name: 'AIResponse',
  description: 'Denotes an AI processed response and its processing status.',
  interfaces: [Node],
  fields: commonAiResponseFields,
  resolveType(doc) {
    switch (doc.type) {
      case 'AI_REPLY':
        return AIReply;

      case 'TRANSCRIPT':
        return AITranscript;
    }
  },
});

export const AIReply = new GraphQLObjectType({
  name: 'AIReply',
  description: 'A ChatGPT reply for an article with no human fact-checks yet',
  interfaces: [Node, AIResponse],
  fields: {
    ...commonAiResponseFields,
    usage: {
      description:
        'The usage returned from OpenAI. Populated after status becomes SUCCESS.',
      type: new GraphQLObjectType({
        name: 'OpenAICompletionUsage',
        fields: {
          promptTokens: { type: new GraphQLNonNull(GraphQLInt) },
          completionTokens: { type: new GraphQLNonNull(GraphQLInt) },
          totalTokens: { type: new GraphQLNonNull(GraphQLInt) },
        },
      }),
    },
  },
});

export const AITranscript = new GraphQLObjectType({
  name: 'AITranscript',
  description: 'Transcript from OCR or speech-to-text AI models.',
  interfaces: [Node, AIResponse],
  fields: {
    ...commonAiResponseFields,
  },
});

export const AIResponseConnection = createConnectionType(
  'AIResponseConnection',
  AIResponse
);

export default AIResponse;
