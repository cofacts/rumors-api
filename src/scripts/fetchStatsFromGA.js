// eslint-disable no-console
/*
  A script that fetches user activities stats between `startDate` and `endDate` from GA.

  - Default values for `startDate` and `endDate` are the current date (in GMT+8),
    they can be set by command line arguments.  Date should be in the format of
    YYYY-MM-DD or see https://developers.google.com/analytics/devguides/reporting/core/v3/reference#startDate
    for relative date pattern.

  - All update operations in db are handled by the script with id `analyticsUpsertScript`,
    if `analyticsUpsertScript` is not in db yet, run with `--loadScript`` to save
    the script to db.

  - A content group that extracts docId from URL should be set by admin in GA
    as the first content group.  Because content group is not retroactive, to
    fetch data without content group, run with `--useContentGroup=false`.
    It would use pagePathLevel2 as primary dimension and extracts docId from there.

  - Make sure `GA_WEB_VIEW_ID`, `GA_LINE_VIEW_ID`, `GA_LINE_TIMEZONE`, and
   `GA_WEB_TIMEZONE` are set with correct settings in .env.  Each view's timezone
   can be found at view settings, see https://support.google.com/analytics/answer/1010249
   for more details.
*/

import 'dotenv/config';
import client from 'util/client';
import rollbar from '../rollbarInstance';
import { google } from 'googleapis';
import yargs from 'yargs';
import { pick, get } from 'lodash';

const analyticsreporting = google.analyticsreporting('v4');

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

const docIndices = {
  article: 'articles',
  reply: 'replies'
};

const allDocTypes = [docTypes.ARTICLE, docTypes.REPLY];

const statsSources = {
  WEB: {
    filtersExpression: docType => `ga:pagePathLevel1==/${docType}/`,
    name: 'WEB',
    primaryDimension: (useContentGroup = true) =>
      useContentGroup ? 'ga:contentGroup1' : 'ga:pagePathLevel2',
    primaryMetric: 'ga:pageviews',
    viewId: webViewId,
    timezone: process.env.GA_WEB_TIMEZONE || '+08:00',
  },
  LINE: {
    filtersExpression: docType =>
      `ga:eventCategory==${toTitleCase(docType)};ga:eventAction==Selected`,
    name: 'LINE',
    primaryDimension: () => 'ga:eventLabel',
    primaryMetric: 'ga:hits',
    viewId: lineViewId,
    timezone: process.env.GA_LINE_TIMEZONE || '+08:00',
  },
};

const allSourceTypes = [statsSources.WEB.name, statsSources.LINE.name];
const upsertScriptID = 'analyticsUpsertScript';

// since web stats and line stats are fetched separately, need to do a merge
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
  if (params.docAppId != null) {
    ctx._source.docAppId = params.docAppId;
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

const parseIdFromRow = function (row) {
  const id = row.dimensions[0];
  const match = idExtractor.exec(id);
  return match ? match[1] : id;
};

// Constructs request body for google reporting API.
const requestBodyBuilder = function (sourceType, docType, pageToken, params) {
  const {
    useContentGroup = true,
    startDate = 'today',
    endDate = 'today',
  } = params;
  let {
    filtersExpression,
    primaryDimension,
    primaryMetric,
    viewId,
  } = statsSources[sourceType];
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: primaryDimension(useContentGroup) },
      { name: 'ga:date' },
    ],
    filtersExpression: filtersExpression(docType),
    includeEmptyRows: false,
    metrics: [{ expression: primaryMetric }, { expression: 'ga:users' }],
    orderBys: [
      { fieldName: 'ga:date' },
      { fieldName: primaryDimension(useContentGroup) },
    ],
    pageSize,
    pageToken,
    viewId,
  };
};

/**
 * Given a sourceType, fetch stats for all doc types from startDate to endDate (inclusive).

 * @param {string} sourceType
 * @param {object} [pageTokens={}]   Mapping of each doc type to its page token
 * @param {object} params            Object of the from:
    {useContentGroup: [bool=true], [startDate: string], [endDate: string]}

 * @return {
    results: {object} a mapping of doc type to its result,
    pageTokens: {object} a mapping of doc type to its pageToken,
    hasMore: {bool} whether there's more data to fetch
 }
 */
const fetchReports = async function (sourceType, pageTokens = {}, params) {
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
    const rows = report.data.rows;
    if (rows) {
      console.log(
        `fetched ${rows.length} starting at ${pageTokens[docType] || 0} ` +
        `out of total ${report.data.rowCount
        } rows for ${sourceType} ${docType}` +
        ` ${report.nextPageToken
          ? `with next pageToken ${report.nextPageToken}`
          : ''
        }`
      );
    } else {
      console.log(`no entries for ${sourceType} ${docType}`);
    }
    results[docType] = rows;
    nextPageTokens[docType] = report.nextPageToken || -1;
    hasMore = hasMore || report.nextPageToken != null;
  });

  return { results, pageTokens: nextPageTokens, hasMore };
};

const upsertDocStats = async function (body) {
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

async function fetchDocUsers(index, rows) {
  const ids = rows.map(row => parseIdFromRow(row));
  const {
    body: {
      hits: { hits: docs },
    },
  } = await client.search({
    index,
    size: pageSize,
    body: {
      query: {
        ids: { values: ids },
      },
      _source: {
        includes: ['userId', 'appId'],
      },
    },
  });
  let docUsers = {};
  docs.forEach(doc => (docUsers[doc._id] = {
    docUserId: doc._source.userId,
    docAppId: doc._source.appId
  }));
  console.log(`docs: ${JSON.stringify(docs, null, 2)}`);
  console.log(`docUsers: ${JSON.stringify(docUsers, null, 2)}`);
  return docUsers;
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
const processReport = async function (
  sourceType,
  docType,
  rows,
  fetchedAt,
  lastParams
) {
  const docUsers = await fetchDocUsers(docIndices[docType], rows);
  console.log(`docUsers: ${JSON.stringify(docUsers, null, 2)}`);

  let bulkUpdates = [];
  const sourceName = sourceType.toLowerCase();
  const timezone = statsSources[sourceType].timezone;

  rows.forEach(row => {
    const docId = parseIdFromRow(row);
    const date = formatDate(row.dimensions[1]);
    const timestamp = `${date}T00:00:00.000${timezone}`;
    const [visits, users] = row.metrics[0].values.map(v => parseInt(v, 10));
    const isSameEntry =
      lastParams && lastParams.date === timestamp && lastParams.docId === docId;
    let stats = {
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
    console.log(`docUser: ${get(docUsers, docId)}`);

    const id = `${docType}_${docId}_${date}`;
    lastParams = {
      fetchedAt,
      date: timestamp,
      docId,
      stats,
      type: docType,
      ...get(docUsers, docId, {})
    };

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
      docAppId: lastParams.docAppId,
      stats: lastParams.stats,
    };
  }
};

/**
 * Fetch GA stats for given time period and store in db.
 *
 * @param {object} params        Object of the from:
    {useContentGroup: [bool=true], [startDate: string], [endDate: string]}
 */
const updateStats = async function (params) {
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
          description:
            'start date in the format of YYYY-MM-DD or see https://developers.google.com/analytics/devguides/reporting/core/v3/reference#startDate for accepted patterns for relative dates',
          type: 'string',
        },
        endDate: {
          alias: 'e',
          description:
            'end date in the format of YYYY-MM-DD or see https://developers.google.com/analytics/devguides/reporting/core/v3/reference#endDate for accepted patterns for relative dates',
          type: 'string',
        },
        loadScript: {
          default: false,
          description: 'whether to store upsert script in db',
          type: 'boolean',
        },
        useContentGroup: {
          default: true,
          description:
            'whether to use ga:contentGroup1 as a dimension for web stats',
          type: 'boolean',
        },
      })
      .help('help').argv;

    const params = {
      startDate: argv.startDate,
      endDate: argv.endDate,
      useContentGroup: argv.useContentGroup,
    };

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
