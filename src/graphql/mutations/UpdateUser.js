import { GraphQLString, GraphQLNonNull } from 'graphql';
import client from 'util/client';
import User from 'graphql/models/User';

export default {
  type: User,
  description: 'Change attribute of a user',
  args: {
    userId: { type: new GraphQLNonNull(GraphQLString) },
    name: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { name }, { userId, appId }) {
    const { result, get: { _source } } = await client.update({
      index: 'users',
      type: 'doc',
      id: userId,
      body: {
        doc: {
          name,
        },
        _source: true,
      },
    });

    if (result === 'noop') {
      throw new Error(
        `Cannot change name for user`
      );
    }

    return _source;
  },
};
