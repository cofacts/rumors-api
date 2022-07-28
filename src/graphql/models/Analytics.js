import {
  GraphQLID,
  GraphQLInt,
  GraphQLObjectType,
  GraphQLString,
  GraphQLNonNull,
  GraphQLList,
} from 'graphql';
import Node from '../interfaces/Node';

import { createConnectionType } from 'graphql/util';
import AnalyticsDocTypeEnum from './AnalyticsDocTypeEnum';

const Analytics = new GraphQLObjectType({
  name: 'Analytics',
  interfaces: [Node],
  fields: () => ({
    id: { type: new GraphQLNonNull(GraphQLID) },
    docId: {
      type: new GraphQLNonNull(GraphQLID),
      description:
        'The id for the document that this analytic datapoint is for.',
    },
    type: {
      type: new GraphQLNonNull(AnalyticsDocTypeEnum),
      description: 'Type of document that this analytic datapoint is for.',
    },
    date: {
      type: new GraphQLNonNull(GraphQLString),
      description:
        'The day this analytic datapoint is represented, in YYYY-MM-DD format',
    },
    lineUser: {
      type: new GraphQLNonNull(GraphQLInt),
      resolve: ({ stats }) => stats.lineUser ?? 0,
    },
    lineVisit: {
      type: new GraphQLNonNull(GraphQLInt),
      resolve: ({ stats }) => stats.lineVisit ?? 0,
    },
    webUser: {
      type: new GraphQLNonNull(GraphQLInt),
      resolve: ({ stats }) => stats.webUser ?? 0,
    },
    webVisit: {
      type: new GraphQLNonNull(GraphQLInt),
      resolve: ({ stats }) => stats.webVisit ?? 0,
    },
    liffUser: {
      type: new GraphQLNonNull(GraphQLInt),
      description: 'Sum of LIFF visitor count from all sources',
      resolve({ stats }) {
        return (stats.liff ?? []).reduce(
          (sum, { user }) => sum + (user ?? 0),
          0
        );
      },
    },
    liffVisit: {
      type: new GraphQLNonNull(GraphQLInt),
      description: 'Sum of LIFF view count from all sources',
      resolve({ stats }) {
        return (stats.liff ?? []).reduce(
          (sum, { visit }) => sum + (visit ?? 0),
          0
        );
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
      resolve: ({ stats }) => stats.liff ?? [],
    },

    docUserId: {
      type: GraphQLID,
      description:
        'Author of the document that this analytic datapoint measures.',
    },
    docAppId: {
      type: GraphQLID,
      description:
        'Authoring app ID of the document that this analytic datapoint measures.',
    },
  }),
});

export default Analytics;

export const AnalyticsConnection = createConnectionType(
  'AnalyticsConnection',
  Analytics
);
