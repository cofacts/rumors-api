import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLID,
  GraphQLInt,
} from 'graphql';

import { createConnectionType } from 'graphql/util';
import Node from '../interfaces/Node';
import AIResponseDocTypeEnum from './AIResponseDocTypeEnum';
import AIResponseStatusEnum from './AIResponseStatusEnum';
import User, { userFieldResolver } from './User';

const AIResponse = new GraphQLObjectType({
  name: 'AIResponse',
  interfaces: [Node],
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },

    docId: {
      description: 'The id for the document that this AI response is for.',
      type: GraphQLID,
    },

    type: {
      description: 'Type of document that this AI response is for.',
      type: new GraphQLNonNull(AIResponseDocTypeEnum),
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
        'The usage returned from OpenAI API. Populated after status becomes SUCCESS.',
      type: new GraphQLObjectType({
        name: 'OpenAIUsage',
        fields: {
          promptTokens: { type: new GraphQLNonNull(GraphQLInt) },
          completionTokens: { type: new GraphQLNonNull(GraphQLInt) },
          totalTokens: { type: new GraphQLNonNull(GraphQLInt) },
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
