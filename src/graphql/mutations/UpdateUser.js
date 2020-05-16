import { GraphQLString, GraphQLNonNull } from 'graphql';
import client from 'util/client';
import User from 'graphql/models/User';

export default {
  type: User,
  description: 'Change attribute of a user',
  args: {
    name: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { name }, { userId }) {
    const {
      body: {
        result,
        get: { _source },
      },
    } = await client.update({
      index: 'users',
      type: 'doc',
      id: userId,
      body: {
        doc: {
          name,
          updatedAt: new Date().toISOString(),
        },
        _source: true,
      },
    });

    if (result === 'noop') {
      throw new Error(`Cannot change name for user`);
    }

    return { id: userId, ..._source };
  },
};
