import { GraphQLBoolean, GraphQLObjectType, GraphQLString } from 'graphql';

export default new GraphQLObjectType({
  name: 'UserAwardedBadge',
  fields: () => ({
    badgeId: { type: GraphQLString },
    badgeMetaData: { type: GraphQLString },
    isDisplayed: { type: GraphQLBoolean },
    createdAt: { type: GraphQLString },
    updatedAt: { type: GraphQLString },
  }),
});
