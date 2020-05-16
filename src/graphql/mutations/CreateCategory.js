import { GraphQLString, GraphQLNonNull } from 'graphql';

import { assertUser } from 'graphql/util';

import client from 'util/client';

import MutationResult from 'graphql/models/MutationResult';

export default {
  type: MutationResult,
  description: 'Create a category',
  args: {
    title: { type: new GraphQLNonNull(GraphQLString) },
    description: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { title, description }, { userId, appId }) {
    assertUser({ userId, appId });

    const categoryBody = {
      userId,
      appId,
      title,
      description,
      updatedAt: new Date(),
      createdAt: new Date(),
    };

    const {
      body: { result, _id: id },
    } = await client.index({
      index: 'categories',
      type: 'doc',
      body: categoryBody,
    });

    if (result !== 'created') {
      throw new Error(`Cannot create reply: ${result}`);
    }

    return { id };
  },
};
