// eslint-disable no-console
// TODO: consider the edge case when the cron job runs at midnight
//       the first cron job of the day should also update the value for yesterday

import 'dotenv/config';
import client from 'util/client';
import rollbar from '../rollbarInstance';
import { google } from 'googleapis';
import { assertDateRange } from 'util/date';
import yargs from 'yargs';

const analyticsreporting = google.analyticsreporting('v4');

const maxDuration = 30 * 24 * 60 * 60 * 1000;

const pageSize = process.env.GA_PAGE_SIZE || '10000';
const webViewId = process.env.GA_WEB_VIEW_ID;
const lineViewId = process.env.GA_LINE_VIEW_ID;

const idExtractor = /\/([^?/]+).*/;
const toTitleCase = str =>
  str.charAt(0).toUpperCase() + str.substr(1).toLowerCase();
const formatDate = date =>
  `${date.substr(0, 4)}-${date.substr(4, 2)}-${date.substr(6, 2)}`;

const docTypes = {
  ARTICLE: 'article',
  REPLY: 'reply',
};

const allDocTypes = [docTypes.ARTICLE, docTypes.REPLY];

const statsSources = {
  WEB: {
    filtersExpression: docType => `ga:pagePathLevel1==/${docType}/`,
    name: 'WEB',
    primaryDimension: (isCronjob = true) =>
      isCronjob ? 'ga:contentGroup1' : 'ga:pagePathLevel2',
    primaryMetric: 'ga:pageviews',
    viewId: webViewId,
  },
  LINE: {
    filtersExpression: docType =>
      `ga:eventCategory==${toTitleCase(docType)};ga:eventAction==Selected`,
    name: 'LINE',
    primaryDimension: () => 'ga:eventLabel',
    primaryMetric: 'ga:hits',
    viewId: lineViewId,
  },
};

const allSourceTypes = [statsSources.WEB.name, statsSources.LINE.name];
const upsertScriptID = 'analyticsUpsertScript';

// since web stats and line stats are fetched seperately, need to do a merge
// update on `stats` so existing values won't be overwritten.
const upsertScript = `
  if (ctx._source.size() == 0 || ctx._source.stats.size() == 0) {
    ctx._source.stats = params.stats;
  } else {
    ctx._source.stats.putAll(params.stats)
  }
  if (params.docUserId != null) {
    ctx._source.docUserId = params.docUserId;
  }
  ctx._source.fetchedAt = params.fetchedAt;
  ctx._source.date = params.date;
  ctx._source.docId = params.docId;
  ctx._source.type = params.type;
`;

const storeScriptInDB = async () => {
  await client.put_script({
    id: upsertScriptID,
    body: {
      script: {
        lang: 'painless',
        source: upsertScript,
      },
    },
  });
};

const parseIdFromRow = function(row) {
  const id = row.dimensions[0];
  const match = idExtractor.exec(id);
  return match ? match[1] : id;
};

// Contructs request body for google reporting API.
const requestBodyBuilder = function(sourceType, docType, pageToken, params) {
  const { isCron, startDate = 'today', endDate = 'today' } = params;
  let {
    filtersExpression,
    primaryDimension,
    primaryMetric,
    viewId,
  } = statsSources[sourceType];
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: primaryDimension(isCron) }, { name: 'ga:date' }],
    filtersExpression: filtersExpression(docType),
    includeEmptyRows: false,
    metrics: [{ expression: primaryMetric }, { expression: 'ga:users' }],
    orderBys: [
      { fieldName: 'ga:date' },
      { fieldName: primaryDimension(isCron) },
    ],
    pageSize,
    pageToken,
    viewId,
  };
};

const processCommandLineArgs = args => {
  const { startDate, endDate } = args;
  if (!startDate && !endDate) {
    return { isCron: true };
  }

  assertDateRange(startDate, endDate, maxDuration);

  return { isCron: false, startDate, endDate };
};

/**
 * Given a sourceType, fetch stats for all doc types from startDate to endDate (inclusive).

 * @param {string} sourceType
 * @param {object} [pageTokens={}]   Mapping of each doc type to its page token
 * @param {object} params            Object of the from:
    {isCron: [bool=true], [startDate: string], [endDate: string]}

 * @return {
    results: {object} a mapping of doc type to its result,
    pageTokens: {object} a mapping of doc type to its pageToken,
    hasMore: {bool} whether there's more data to fetch
 }
 */
const fetchReports = async function(sourceType, pageTokens = {}, params) {
  let reportRequests = [];
  let nextPageTokens = {};
  // when pageToken is -1, it means there's no more rows to fetch
  let requestDocTypes = allDocTypes.filter(docType => {
    let pageToken = pageTokens[docType] || '';
    if (pageToken !== -1) {
      reportRequests.push(
        requestBodyBuilder(sourceType, docType, pageToken, params)
      );
      return true;
    } else {
      nextPageTokens[docType] = -1;
      console.log(`no more rows to fetch for ${sourceType} ${docType}`);
      return false;
    }
  });

  if (requestDocTypes.length == 0) return;

  // fetching article and reply stats from GA
  const res = await analyticsreporting.reports.batchGet({
    requestBody: {
      reportRequests,
    },
  });
  const reports = res.data.reports;
  let results = {};
  let hasMore = false;
  requestDocTypes.forEach((docType, i) => {
    let report = reports[i];
    console.log(
      `fetched ${report.data.rows.length} starting at ${pageTokens[docType] ||
        0} ` +
        `out of total ${
          report.data.rowCount
        } rows for ${sourceType} ${docType}` +
        ` with next pageToken ${report.nextPageToken}`
    );
    results[docType] = report.data.rows;
    nextPageTokens[docType] = report.nextPageToken || -1;
    hasMore = hasMore || report.nextPageToken != null;
  });

  return { results, pageTokens: nextPageTokens, hasMore };
};

const upsertDocStats = async function(body) {
  const res = await client.bulk({
    body,
    refresh: 'true',
  });
  if (res.body.errors) {
    console.error(
      `bulk upsert failed : ${JSON.stringify(res.body, null, '  ')}`
    );
  }
};

async function fetchReplyUsers(rows) {
  const replyIds = rows.map(row => parseIdFromRow(row));
  const {
    body: {
      hits: { hits: replies },
    },
  } = await client.search({
    index: 'replies',
    size: pageSize,
    body: {
      query: {
        ids: { values: replyIds },
      },
      _source: {
        includes: ['userId'],
      },
    },
  });
  let replyUsers = {};
  replies.forEach(reply => (replyUsers[reply._id] = reply._source.userId));
  return replyUsers;
}

/**
 * Given stats report for a sourceType and docType, store them in db
 *
 * @param {string} sourceType    One of the values defined by statsSources.
 * @param {string} docType       One of the values defined by docTypes.
 * @param {array}  rows          Rows of data to process; each row is an object
    of the form {dimensions: [{field: value}], metrics:[{values:[values]}]}}
 * @param {Date}   fetchedAt     Timestamp of the fetched time
 * @param {object} lastParams    Stats for the last processed row from previous
    call of the same sourceType and docType; It's an object of the form {
      sourceType: string, docType: string, path: string, date: string,
      docId: string, visits: number, users: number }

 * @return {object} Return the stats of last processed row, same format as lastParams.
 */
const processReport = async function(
  sourceType,
  docType,
  rows,
  fetchedAt,
  lastParams
) {
  let replyUsers;
  if (docType === docTypes.REPLY) {
    replyUsers = await fetchReplyUsers(rows);
  }

  let bulkUpdates = [];
  const sourceName = sourceType.toLowerCase();

  rows.forEach(row => {
    const docId = parseIdFromRow(row);
    const date = formatDate(row.dimensions[1]);
    const [visits, users] = row.metrics[0].values.map(v => parseInt(v, 10));
    const isSameEntry =
      lastParams && lastParams.date === date && lastParams.docId === docId;
    let docUserId, stats;

    if (docType === docTypes.REPLY && replyUsers[docId]) {
      docUserId = replyUsers[docId];
    }

    stats = {
      [`${sourceName}Visit`]: parseInt(visits, 10),
      [`${sourceName}User`]: parseInt(users, 10),
    };

    if (isSameEntry) {
      // Since `stats` is a reference to a field that's been pushed to `bulkUpdates`,
      // the following lines will modify the values of the last entry in `bulkUpdates`.
      stats = lastParams.stats;
      stats[`${sourceName}Visit`] += parseInt(visits, 10);
      stats[`${sourceName}User`] += parseInt(users, 10);
    }

    const id = `${docType}_${docId}_${date}`;
    lastParams = { fetchedAt, date, docId, docUserId, stats, type: docType };

    // Page views on the same reply/article could have different `pagePathLevel2`
    // values due to query parameters in the url.  Checking if bulkUpdates is empty
    // handles the edge case where the same (document id, date) pair spans more
    // than one page.
    if (!isSameEntry || bulkUpdates.length == 0) {
      bulkUpdates.push({
        update: { _index: 'analytics', _type: 'doc', _id: id },
      });

      bulkUpdates.push({
        scripted_upsert: true,
        script: {
          id: upsertScriptID,
          params: lastParams,
        },
        upsert: {},
      });
    }
  });

  try {
    await upsertDocStats(bulkUpdates);
  } catch (err) {
    console.error(err);
    rollbar.error('fetchGA error', err);
  }

  if (bulkUpdates.length > 0) {
    return {
      sourceType,
      docType,
      date: lastParams.date,
      docId: lastParams.docId,
      docUserId: lastParams.docUserId,
      stats: lastParams.stats,
    };
  }
};

/**
 * Fetch GA stats for given time period and store in db.
 *
 * @param {object} params        Object of the from:
    {isCron: [bool=true], [startDate: string], [endDate: string]}
 */
const updateStats = async function(params = { isCron: true }) {
  for (const sourceType of allSourceTypes) {
    let results,
      pageTokens,
      hasMore = true,
      prevLastRows = {};
    while (hasMore) {
      try {
        ({ results, pageTokens, hasMore } = await fetchReports(
          sourceType,
          pageTokens,
          params
        ));
        const fetchAt = new Date();
        for (const docType of allDocTypes) {
          if (results[docType])
            prevLastRows[docType] = await processReport(
              sourceType,
              docType,
              results[docType],
              fetchAt,
              prevLastRows[docType]
            );
        }
      } catch (err) {
        hasMore = false;
        console.error(err);
        rollbar.error('fetchGA error', err);
      }
    }
  }
};

async function main() {
  try {
    const argv = yargs
      .options({
        startDate: {
          alias: 's',
          description: 'start date in the format of YYYY-MM-DD',
          type: 'string',
        },
        endDate: {
          alias: 'e',
          description: 'end date in the format of YYYY-MM-DD',
          type: 'string',
        },
        loadScript: {
          default: false,
          description: 'whether to store upsert script in db',
        },
      })
      .help('help').argv;

    const params = processCommandLineArgs(argv);

    if (argv.loadScript) {
      await storeScriptInDB();
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_OAUTH_KEY_PATH,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    google.options({ auth });

    updateStats(params);
  } catch (e) {
    console.error(e);
  }
}

export default {
  allDocTypes,
  allSourceTypes,
  fetchReports,
  main,
  parseIdFromRow,
  processCommandLineArgs,
  processReport,
  requestBodyBuilder,
  statsSources,
  storeScriptInDB,
  updateStats,
  upsertDocStats,
  upsertScriptID,
};
if (require.main === module) {
  main();
}
