import DataLoader from 'dataloader';
import client from 'util/client';
import { getRangeFieldParamFromArithmeticExpression } from 'graphql/util';

const defaultDuration = 30 * 24 * 60 * 60 * 1000;

export default () =>
  new DataLoader(
    async statsQueries => {
      const body = [];
      const now = new Date();
      const defaultEndDate = now.toISOString().substr(0, 10);
      const defaultStartDate = new Date(now - defaultDuration)
        .toISOString()
        .substr(0, 10);
      const defaultDateRange = {
        gte: defaultStartDate,
        lte: defaultEndDate,
      };
      statsQueries.forEach(
        ({ docId, docType, dateRange = defaultDateRange }) => {
          if (!docId) throw new Error('docId is required');
          if (!docType) throw new Error('docType is required');
          body.push({ index: 'analytics', type: 'doc' });
          body.push({
            query: {
              bool: {
                must: [
                  { match: { type: docType } },
                  { match: { docId: docId } },
                  {
                    range: {
                      date: getRangeFieldParamFromArithmeticExpression(
                        dateRange
                      ),
                    },
                  },
                ],
              },
            },
            sort: [{ date: 'asc' }],
            size: 90,
          });
        }
      );

      return (await client.msearch({
        body,
      })).body.responses.map(({ hits: { hits: analytics } }) =>
        analytics.map(row => ({ date: row._source.date, ...row._source.stats }))
      );
    },
    {
      cacheKeyFn: ({ docId, docType, dateRange }) =>
        `${docType}/${docId}/${JSON.stringify(dateRange)}`,
    }
  );
