import DataLoader from 'dataloader';
import client from 'util/client';
import { validateDateRange } from 'util/date';

const defaultDuration = 30 * 24 * 60 * 60 * 1000;

export default () =>
  new DataLoader(async statsQueries => {
    const body = [];
    const now = new Date();
    const defaultEndDate = now.toISOString().substr(0, 10);
    const defaultStartDate = new Date(now - defaultDuration)
      .toISOString()
      .substr(0, 10);

    statsQueries.forEach(({ docId, docType, startDate, endDate }) => {
      if (!docId) throw new Error('docId is required');
      if (!docType) throw new Error('docType is required');

      if (!startDate && !endDate) {
        startDate = defaultStartDate;
        endDate = defaultEndDate;
      } else {
        const { isValid, error } = validateDateRange(startDate, endDate);
        if (!isValid) {
          console.log(error);
          throw new Error(error);
        }
      }

      body.push({ index: 'analytics', type: 'doc' });
      body.push({
        query: {
          bool: {
            must: [
              { match: { type: docType } },
              { match: { docId: docId } },
              {
                range: {
                  date: {
                    gte: startDate,
                    lte: endDate,
                  },
                },
              },
            ],
          },
        },
        sort: [{ date: 'asc' }],
      });
    });

    return (await client.msearch({
      body,
    })).body.responses.map(({ hits: { hits: analytics } }) =>
      analytics.map(row => ({ date: row._source.date, ...row._source.stats }))
    );
  });
