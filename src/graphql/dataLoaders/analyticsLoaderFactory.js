import { subDays } from 'date-fns';
import DataLoader from 'dataloader';
import client from 'util/client';
import { getRangeFieldParamFromArithmeticExpression } from 'graphql/util';

const defaultDuration = 31;

export default () =>
  new DataLoader(
    async (statsQueries) => {
      const searches = [];
      const defaultEndDate = new Date();
      const defaultStartDate = subDays(defaultEndDate, defaultDuration);
      const defaultDateRange = {
        gt: defaultStartDate,
        lte: defaultEndDate,
      };
      statsQueries.forEach(
        ({ docId, docType, dateRange = defaultDateRange }) => {
          if (!docId) throw new Error('docId is required');
          if (!docType) throw new Error('docType is required');
          searches.push({ index: 'analytics' });
          searches.push({
            size: 90,
            sort: [{ date: 'asc' }],
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
          });
        }
      );

      return (
        await client.msearch({
          searches,
        })
      ).responses.map(({ hits: { hits: analytics } }) =>
        analytics.map((row) => row._source)
      );
    },
    {
      cacheKeyFn: ({ docId, docType, dateRange }) =>
        `${docType}/${docId}/${JSON.stringify(dateRange)}`,
    }
  );
