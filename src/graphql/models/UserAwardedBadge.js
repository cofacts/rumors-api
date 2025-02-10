import { GraphQLBoolean, GraphQLObjectType, GraphQLString, GraphQLNonNull } from 'graphql';

export default new GraphQLObjectType({
  name: 'UserAwardedBadge',
  fields: () => ({
    badgeId: { type: new GraphQLNonNull(GraphQLString) },
    badgeMetaData: { type: new GraphQLNonNull(GraphQLString) },
    isDisplayed: { type: new GraphQLNonNull(GraphQLBoolean) },
    createdAt: { type: new GraphQLNonNull(GraphQLString) },
    updatedAt: { type: new GraphQLNonNull(GraphQLString) },
  }),
});
