export default {
  repliesFixtures: {
    '/replies/doc/testID1': {
      text: 'text',
      reference: 'ref',
      type: 'NOT_ARTICLE',
      userId: 'user1',
      appId: 'test',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    '/replies/doc/testID2': {
      text: 'text',
      reference: 'ref',
      type: 'NOT_ARTICLE',
      userId: 'user2',
      appId: 'test',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    '/replies/doc/testID4': {
      text: 'text',
      reference: 'ref',
      type: 'NOT_ARTICLE',
      userId: 'user1',
      appId: 'test',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
    '/replies/doc/testID5': {
      text: 'text',
      reference: 'ref',
      type: 'NOT_ARTICLE',
      userId: 'user3',
      appId: 'test',
      createdAt: '2020-01-01T00:00:00.000Z',
    },
  },
  updateStats: {
    fetchReportsDefaultResolved: {
      results: { article: ['test'], reply: ['test'] },
      pageTokens: {},
      hasMore: false,
    },
    fetchReportsMulitpleResolved: [
      {
        results: { article: ['test0'], reply: ['test0'] },
        pageTokens: { article: 100, reply: 100 },
        hasMore: true,
      },
      {
        results: { article: ['test1'], reply: ['test1'] },
        pageTokens: { article: 200, reply: -1 },
        hasMore: true,
      },
      {
        results: { article: ['test2'], reply: null },
        pageTokens: { article: -1, reply: -1 },
        hasMore: false,
      },
      {
        results: { article: ['test0'], reply: ['test0'] },
        pageTokens: { article: 100, reply: 100 },
        hasMore: true,
      },
      {
        results: { article: ['test1'], reply: ['test1'] },
        pageTokens: { article: -1, reply: 200 },
        hasMore: true,
      },
      {
        results: { article: null, reply: ['test2'] },
        pageTokens: { article: -1, reply: -1 },
        hasMore: false,
      },
    ],
  },
  processReport: {
    sameDateRows: [
      {
        dimensions: ['/testID1?total=2_1', '20200715'],
        metrics: [{ values: ['2', '1'] }],
      },
      {
        dimensions: ['/testID2?total=40_2', '20200715'],
        metrics: [{ values: ['40', '2'] }],
      },
      {
        dimensions: ['/testID3?total=5_2', '20200715'],
        metrics: [{ values: ['5', '2'] }],
      },
      {
        dimensions: ['/testID4', '20200715'],
        metrics: [{ values: ['62', '22'] }],
      },
      {
        dimensions: ['/testID4?fbclid=randomParam', '20200715'],
        metrics: [{ values: ['5', '2'] }],
      },
      {
        dimensions: ['/testID4?total=69_25&bclid=randomParam2', '20200715'],
        metrics: [{ values: ['2', '1'] }],
      },
      {
        dimensions: ['/testID5', '20200715'],
        metrics: [{ values: ['107', '45'] }],
      },
      {
        dimensions: ['/testID5?total=109_46&fbclid=randomParam3', '20200715'],
        metrics: [{ values: ['2', '1'] }],
      },
    ],
    crossPageRows: [
      [
        {
          dimensions: ['/testID1?total=20_5', '20200715'],
          metrics: [{ values: ['20', '5'] }],
        },
        {
          dimensions: ['/testID2?total=40_2', '20200715'],
          metrics: [{ values: ['40', '2'] }],
        },
        {
          dimensions: ['/testID3?total=5_2', '20200715'],
          metrics: [{ values: ['5', '2'] }],
        },
        {
          dimensions: ['/testID4', '20200715'],
          metrics: [{ values: ['62', '22'] }],
        },
        {
          dimensions: ['/testID4?fbclid=randomParam', '20200715'],
          metrics: [{ values: ['5', '2'] }],
        },
        {
          dimensions: ['/testID4?total=69_25&fbclid=randomParam2', '20200715'],
          metrics: [{ values: ['2', '1'] }],
        },
        {
          dimensions: ['/testID5', '20200715'],
          metrics: [{ values: ['107', '45'] }],
        },
        {
          dimensions: ['/testID5?total=109_46&fbclid=randomParam3', '20200715'],
          metrics: [{ values: ['2', '1'] }],
        },
      ],
      [
        {
          dimensions: ['/testID5?fbclid=randomParam4', '20200715'],
          metrics: [{ values: ['4', '2'] }],
        },
        {
          dimensions: ['/testID5?total=115_49&fbclid=randomParam5', '20200715'],
          metrics: [{ values: ['2', '1'] }],
        },
        {
          dimensions: ['/testID1?total=2_1', '20200716'],
          metrics: [{ values: ['2', '1'] }],
        },
        {
          dimensions: ['/testID2?total=2_1', '20200716'],
          metrics: [{ values: ['2', '1'] }],
        },
        {
          dimensions: ['/testID5?total=10_4', '20200716'],
          metrics: [{ values: ['10', '4'] }],
        },
      ],
    ],
  },
  fetchReports: {
    allPossiblePageTokens: [
      { article: undefined, reply: undefined },
      { article: -1, reply: '100' },
      { article: '100', reply: -1 },
      { article: '100', reply: '100' },
    ],
    allPossibleNextPageTokens: [
      { article: undefined, reply: undefined },
      { article: undefined, reply: 100 },
      { article: 100, reply: undefined },
      { article: 100, reply: 100 },
    ],
  },
  updateLiffStats: {
    batchGetResponses: [
      // Responses for articles
      //
      {
        data: {
          reports: [
            {
              data: {
                rowCount: 4,
                rows: [
                  {
                    dimensions: ['20220101', 'articleId1', 'utm_source_1'],
                    metrics: [{ values: [2, 1] }],
                  },
                  // New entry triggering entries pushed to batch
                  {
                    dimensions: ['20220101', 'articleId2', 'utm_source_1'],
                    metrics: [{ values: [3, 2] }],
                  },
                ],
              },
              nextPageToken: 'page_token_here',
            },
          ],
        },
      },
      {
        data: {
          reports: [
            {
              data: {
                rowCount: 4,
                rows: [
                  {
                    dimensions: ['20220101', 'articleId2', 'utm_source_2'],
                    metrics: [{ values: [4, 3] }],
                  },
                ],
              },
              nextPageToken: 'page_token_2_here',
            },
          ],
        },
      },
      {
        data: {
          reports: [
            {
              data: {
                rowCount: 4,
                rows: [
                  // New entry triggered by date at first page.
                  // But this last entry will be in the same batch in 20220101/articleId2 because it's the last
                  // entry in batch.
                  {
                    dimensions: ['20220102', 'articleId2', 'utm_source_1'],
                    metrics: [{ values: [5, 4] }],
                  },
                ],
              },
              // No nextPageToken, thus the end of article responses
            },
          ],
        },
      },

      // Responses for replies
      {
        data: {
          reports: [
            {
              data: {
                rowCount: 1,
                rows: [
                  // test if single page entry is counted
                  {
                    dimensions: ['20220101', 'replyId1', 'utm_source_1'],
                    metrics: [{ values: [2, 1] }],
                  },
                ],
              },
            },
          ],
        },
      },
    ],
    fixtures: {
      '/analytics/doc/article_articleId1_2022-01-01': {
        // Existing stats
        stats: {
          lineVisit: 10,
          lineUser: 5,
        },
        // Others are populated during update. Just to ensure update works & for smaller fixture.
        // In reality, most fields will be filled-in by first insertion.
      },
      '/articles/doc/articleId1': {
        userId: 'user for articleId1',
        appId: 'app for articleId1',
      },
    },
  },
};
