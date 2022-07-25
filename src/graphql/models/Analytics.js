import {
  GraphQLInt,
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
} from 'graphql';

export default new GraphQLObjectType({
  name: 'Analytics',
  fields: () => ({
    date: { type: GraphQLString },
    lineUser: { type: GraphQLInt },
    lineVisit: { type: GraphQLInt },
    webUser: { type: GraphQLInt },
    webVisit: { type: GraphQLInt },
    liffUser: {
      type: new GraphQLNonNull(GraphQLInt),
      description: 'Sum of LIFF visitor count from all sources',
      resolve({ liff }) {
        return (liff ?? []).reduce((sum, { user }) => sum + (user ?? 0), 0);
      },
    },
    liffVisit: {
      type: new GraphQLNonNull(GraphQLInt),
      description: 'Sum of LIFF view count from all sources',
      resolve({ liff }) {
        return (liff ?? []).reduce((sum, { visit }) => sum + (visit ?? 0), 0);
      },
    },
    liff: {
      type: new GraphQLNonNull(
        new GraphQLList(
          new GraphQLNonNull(
            new GraphQLObjectType({
              name: 'AnalyticsLiffEntry',
              fields: {
                source: {
                  description:
                    'utm_source for this LIFF stat entry. Empty string if not set.',
                  type: new GraphQLNonNull(GraphQLString),
                  resolve: ({ source }) => source ?? '',
                },
                user: {
                  type: new GraphQLNonNull(GraphQLInt),
                  resolve: ({ user }) => user ?? 0,
                },
                visit: {
                  type: new GraphQLNonNull(GraphQLInt),
                  resolve: ({ visit }) => visit ?? 0,
                },
              },
            })
          )
        )
      ),
    },
  }),
});
