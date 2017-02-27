import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';


const currentUserOnlyField = (key, type) => ({
  type,
  description: 'Returns only for current user. Returns `null` otherwise.',
  resolve(user, arg, context) {
    return user.id === context.user.id ? user[key] : null;
  },
});

export default new GraphQLObjectType({
  name: 'User',
  fields: () => ({
    email: currentUserOnlyField('email', GraphQLString),
    name: { type: GraphQLString },
    avatarUrl: { type: GraphQLString },

    facebookId: currentUserOnlyField('facebookId', GraphQLString),
    githubId: currentUserOnlyField('githubId', GraphQLString),
    twitterId: currentUserOnlyField('twitterId', GraphQLString),

    createdAt: { type: GraphQLString },
  }),
});
