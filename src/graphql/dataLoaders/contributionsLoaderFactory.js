import { subDays, startOfWeek } from 'date-fns';
import DataLoader from 'dataloader';
import client from 'util/client';
import { getRangeFieldParamFromArithmeticExpression } from 'graphql/util';

const defaultDuration = 365;

export default () =>
  new DataLoader(
    async statsQueries => {
      const body = [];
      const defaultEndDate = new Date();
      const defaultStartDate = startOfWeek(
        subDays(defaultEndDate, defaultDuration)
      );
      const defaultDateRange = {
        gt: defaultStartDate,
        lte: defaultEndDate,
      };
      statsQueries.forEach(({ userId, dateRange = defaultDateRange }) => {
        if (!userId) throw new Error('userId is required');
        body.push({
          index: ['replyrequests', 'replies', 'articlereplyfeedbacks'],
          type: 'doc',
        });
        body.push({
          query: {
            bool: {
              must: [
                { term: { userId } },
                {
                  range: {
                    createdAt: getRangeFieldParamFromArithmeticExpression(
                      dateRange
                    ),
                  },
                },
              ],
            },
          },
          size: 0,
          aggs: {
            contributions: {
              date_histogram: {
                field: 'createdAt',
                interval: 'day',
                min_doc_count: 1,
                format: 'yyyy-MM-dd',
                time_zone: '+08:00',
              },
            },
          },
        });
      });

      return (await client.msearch({
        body,
      })).body.responses.map(
        ({
          aggregations: {
            contributions: { buckets },
          },
        }) =>
          buckets
            ? buckets.map(bucket => ({
                date: bucket.key_as_string,
                count: bucket.doc_count,
              }))
            : []
      );
    },
    {
      cacheKeyFn: ({ userId, dateRange }) =>
        `${userId}/${JSON.stringify(dateRange)}`,
    }
  );
