import { google } from 'googleapis';
import client from 'util/client';
import * as fetchStatsFromGA from '../fetchStatsFromGA';
import {
  __RewireAPI__ as FetchGAReWireAPI,
  allDocTypes,
  allSourceTypes,
} from '../fetchStatsFromGA';
import fixtures from '../__fixtures__/fetchStatsFromGA';
import MockDate from 'mockdate';

jest.mock('googleapis', () => {
  const batchGetMock = jest.fn(),
    authMock = jest.fn(),
    optionsMock = jest.fn();
  return {
    google: {
      analyticsreporting: () => ({
        reports: {
          batchGet: batchGetMock,
        },
      }),
      auth: {
        GoogleAuth: authMock,
      },
      options: optionsMock,
    },
  };
});

describe('fetchStatsFromGA', () => {
  beforeAll(() => {
    MockDate.set(1577836800000);
  });

  describe('helper functions', () => {
    it('parseIdFromRow should extract doc id from a row returned by GA', () => {
      const parseIdFromRow = fetchStatsFromGA.parseIdFromRow;
      expect(parseIdFromRow({ dimensions: ['/testId'] })).toBe('testId');
      expect(
        parseIdFromRow({ dimensions: ['/testId?param1=1&params2=2'] })
      ).toBe('testId');
      expect(parseIdFromRow({ dimensions: ['/_-1234567azAZ'] })).toBe(
        '_-1234567azAZ'
      );
      expect(parseIdFromRow({ dimensions: ['_-1234567azAZ'] })).toBe(
        '_-1234567azAZ'
      );
    });

    it('requestBodyBuilder should return right request body for different source and doc types', () => {
      fetchStatsFromGA.statsSources.WEB.viewId = '123456789';
      fetchStatsFromGA.statsSources.LINE.viewId = '987654321';

      allSourceTypes.forEach(sourceType =>
        allDocTypes.forEach(docType =>
          [true, false].forEach(isCron => {
            const params = {
              isCron,
              startDate: isCron ? undefined : '2020-07-10',
              endDate: isCron ? undefined : 'today',
            };
            expect(
              fetchStatsFromGA.requestBodyBuilder(
                sourceType,
                docType,
                '',
                params
              )
            ).toMatchSnapshot(`${sourceType}_${docType}_isCron=${isCron}`);
          })
        )
      );
    });
  });

  describe('updateStats', () => {
    var fetchReportsMock, processReportMock;
    beforeAll(() => {
      fetchReportsMock = jest.fn();
      processReportMock = jest.fn();
      FetchGAReWireAPI.__set__('fetchReports', fetchReportsMock);
      FetchGAReWireAPI.__set__('processReport', processReportMock);
    });
    afterEach(() => {
      fetchReportsMock.mockReset();
      processReportMock.mockReset();
    });

    it('should call right functions with right params', async () => {
      fetchReportsMock.mockResolvedValue(
        fixtures.updateStats.fetchReportsDefalutResolved
      );
      processReportMock.mockResolvedValue(null);

      await fetchStatsFromGA.updateStats();

      expect(fetchReportsMock.mock.calls).toMatchSnapshot('fetchReports calls');
      expect(fetchReportsMock).toHaveBeenCalledTimes(allSourceTypes.length);

      expect(processReportMock.mock.calls).toMatchSnapshot(
        'processReport calls'
      );
      expect(processReportMock).toHaveBeenCalledTimes(
        allSourceTypes.length * allDocTypes.length
      );

      fetchReportsMock.mockClear();
      await fetchStatsFromGA.updateStats({
        isCron: false,
        startDate: '2020-07-10',
        endDate: 'today',
      });
      expect(fetchReportsMock.mock.calls).toMatchSnapshot(
        'fetchReports calls with params'
      );
    });

    it('should keep fetching and processing paginated datas until the end', async () => {
      fixtures.updateStats.fetchReportsMulitpleResolved.forEach(params =>
        fetchReportsMock.mockResolvedValueOnce(params)
      );

      processReportMock.mockImplementation((sourceType, docType, rows) => ({
        sourceType,
        docType,
        path: rows[0],
      }));

      await fetchStatsFromGA.updateStats();

      expect(fetchReportsMock.mock.calls).toMatchSnapshot('fetchReports calls');
      expect(processReportMock.mock.calls).toMatchSnapshot(
        'processReport calls'
      );
    });

    it('should halt upon error', async () => {
      fetchReportsMock
        .mockResolvedValueOnce(fixtures.updateStats.fetchReportsDefalutResolved)
        .mockRejectedValueOnce(new Error('Async error'));

      await fetchStatsFromGA.updateStats();

      expect(fetchReportsMock).toHaveBeenCalledTimes(allSourceTypes.length);
      expect(processReportMock).toHaveBeenCalledTimes(allDocTypes.length);
    });
  });

  describe('fetchReports', () => {
    const batchGetMock = google.analyticsreporting().reports.batchGet;
    const requestBuilderSpy = jest.spyOn(
      fetchStatsFromGA,
      'requestBodyBuilder'
    );
    const batchGetResultsBuilder = (pageTokens, nextPageTokens) => {
      let reports = [];
      allDocTypes.forEach(docType => {
        if (pageTokens[docType] !== -1)
          reports.push({
            data: { rows: [`${docType}_row`] },
            nextPageToken: nextPageTokens[docType],
          });
      });
      return { data: { reports } };
    };

    beforeAll(() => {
      FetchGAReWireAPI.__set__('requestBodyBuilder', requestBuilderSpy);
    });
    afterEach(() => {
      batchGetMock.mockReset();
    });

    it('should send approate batchGet requests and return correct curated results', async () => {
      const sourceType = 'WEB',
        params = { isCron: true };
      let requestBuilderCalledTimes = 1;

      for (const pageTokens of fixtures.fetchReports.allPossiblePageTokens) {
        for (const nextPageTokens of fixtures.fetchReports
          .allPossibleNextPageTokens) {
          batchGetMock.mockResolvedValueOnce(
            batchGetResultsBuilder(pageTokens, nextPageTokens)
          );
          const fetchReportsResults = await fetchStatsFromGA.fetchReports(
            sourceType,
            pageTokens,
            params
          );

          let expectedResults = {};
          let expectedNextPageTokens = {};
          let expectedHasMore = false;

          allDocTypes.forEach(docType => {
            const pageToken = pageTokens[docType];
            if (pageToken !== -1) {
              expectedResults[docType] = [`${docType}_row`];
              expectedNextPageTokens[docType] = nextPageTokens[docType] || -1;
              expectedHasMore =
                expectedHasMore || expectedNextPageTokens[docType] !== -1;

              expect(requestBuilderSpy).toHaveBeenNthCalledWith(
                requestBuilderCalledTimes,
                sourceType,
                docType,
                pageToken || '',
                params
              );
              requestBuilderCalledTimes++;
            } else {
              expectedNextPageTokens[docType] = -1;
            }
          });

          expect(fetchReportsResults).toStrictEqual({
            results: expectedResults,
            pageTokens: expectedNextPageTokens,
            hasMore: expectedHasMore,
          });
        }
      }
    });
  });

  describe('processReport', () => {
    describe('with stubbed upsertDocStats', () => {
      const upsertDocStatsMock = jest.fn();
      const cleanUpRows = (row, i) =>
        i % 2 === 0 ? row.update._id : row.script.params;

      beforeAll(() => {
        FetchGAReWireAPI.__set__('upsertDocStats', upsertDocStatsMock);
      });

      afterEach(() => {
        upsertDocStatsMock.mockReset();
      });

      it('should call bulkUpdates with right params', async () => {
        await fetchStatsFromGA.processReport(
          'WEB',
          'article',
          [fixtures.processReport.sameDateRows[0]],
          new Date(),
          null
        );
        expect(upsertDocStatsMock.mock.calls[0][0]).toMatchSnapshot();
      });

      it('should aggregate rows of data', async () => {
        const lastRowParams = await fetchStatsFromGA.processReport(
          'WEB',
          'article',
          fixtures.processReport.sameDateRows,
          new Date(),
          null
        );

        expect(lastRowParams).toMatchSnapshot();
        expect(upsertDocStatsMock).toHaveBeenCalledTimes(1);

        const cleanedUpRows = upsertDocStatsMock.mock.calls[0][0].map(
          cleanUpRows
        );
        expect(cleanedUpRows).toMatchSnapshot();
      });

      it('should aggregate rows of data cross pages', async () => {
        const lastRowParams = await fetchStatsFromGA.processReport(
          'WEB',
          'article',
          fixtures.processReport.crossPageRows[0],
          new Date(),
          null
        );
        const cleanedUpRows = upsertDocStatsMock.mock.calls[0][0].map(
          cleanUpRows
        );
        expect(lastRowParams).toMatchSnapshot();
        expect(cleanedUpRows).toMatchSnapshot();

        const lastRowParams2 = await fetchStatsFromGA.processReport(
          'WEB',
          'article',
          fixtures.processReport.crossPageRows[1],
          new Date(),
          lastRowParams
        );
        const cleanedUpRows2 = upsertDocStatsMock.mock.calls[1][0].map(
          cleanUpRows
        );

        expect(lastRowParams2).toMatchSnapshot();
        expect(cleanedUpRows2).toMatchSnapshot();
      });
    });

    describe('without stubbing calls to client', () => {
      const upsertDocStatsSpy = jest.spyOn(fetchStatsFromGA, 'upsertDocStats');

      const unloadBody = async bulkBody => {
        let bulkDeleteBody = [];
        let prevRow;
        bulkBody.forEach((row, i) => {
          if (i % 2 == 0 && row.update._id != prevRow) {
            bulkDeleteBody.push({ delete: row.update });
            prevRow = row.update._id;
          }
        });
        console.log(JSON.stringify(bulkDeleteBody));
        const { body: result } = await client.bulk({
          body: bulkDeleteBody,
          refresh: 'true',
        });

        if (result.errors) {
          throw new Error(
            `unload failed : ${JSON.stringify(result, null, '  ')}`
          );
        }
      };

      beforeAll(() => {
        FetchGAReWireAPI.__set__('upsertDocStats', upsertDocStatsSpy);
      });

      afterEach(() => {
        upsertDocStatsSpy.mockClear();
      });

      it('should aggregate rows of data', async () => {
        await fetchStatsFromGA.processReport(
          'WEB',
          'article',
          fixtures.processReport.sameDateRows,
          new Date(),
          null
        );
        const bulkUpdateBody = upsertDocStatsSpy.mock.calls[0][0];

        const res = await client.search({
          index: 'analytics',
          body: { query: { match_all: {} } },
        });
        expect(res.body.hits.hits).toMatchSnapshot();

        await unloadBody(bulkUpdateBody);
      });

      it('should aggregate rows of data cross pages', async () => {
        const lastRowParams = await fetchStatsFromGA.processReport(
          'WEB',
          'article',
          fixtures.processReport.crossPageRows[0],
          new Date(),
          null
        );
        await fetchStatsFromGA.processReport(
          'WEB',
          'article',
          fixtures.processReport.crossPageRows[1],
          new Date(),
          lastRowParams
        );
        const bulkUpdateBody = upsertDocStatsSpy.mock.calls[0][0].concat(
          upsertDocStatsSpy.mock.calls[1][0]
        );

        const res = await client.search({
          index: 'analytics',
          body: { query: { match_all: {} } },
        });
        expect(res.body.hits.hits).toMatchSnapshot();

        await unloadBody(bulkUpdateBody);
      });

      it('should upserts stats from different sources', async () => {
        await fetchStatsFromGA.processReport(
          'WEB',
          'article',
          [fixtures.processReport.sameDateRows[0]],
          new Date(),
          null
        );
        await fetchStatsFromGA.processReport(
          'LINE',
          'article',
          [fixtures.processReport.crossPageRows[0][0]],
          new Date(),
          null
        );
        const bulkUpdateBody = upsertDocStatsSpy.mock.calls[0][0].concat(
          upsertDocStatsSpy.mock.calls[1][0]
        );

        const res = await client.search({
          index: 'analytics',
          body: { query: { match_all: {} } },
        });
        expect(res.body.hits.hits).toMatchSnapshot();

        await unloadBody(bulkUpdateBody);
      });
    });
  });
});
