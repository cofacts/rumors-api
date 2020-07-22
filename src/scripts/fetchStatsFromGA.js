// eslint-disable no-console
// TODO: add commend line arguments for migrations
// TODO: consider the edge case when the cron job runs at midnight
//       the first cron job of the day should also update the value for yesterday

import 'dotenv/config';

import client from 'util/client';
import { google } from 'googleapis';

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

export const allDocTypes = [docTypes.ARTICLE, docTypes.REPLY];

export const statsSources = {
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

export const allSourceTypes = [statsSources.WEB.name, statsSources.LINE.name];

const upsertScript = `
  // since web stats and line stats are fetched seperately, need to update each
  // stats field seperately so existing values won't be overwritten
  if (ctx._source.size() == 0 || ctx._source.stats.size() == 0) {
    ctx._source.stats = params.stats;
  } else {
    if (params.stats.webUser != null) {
      ctx._source.stats.put('webUser', params.stats.webUser);
    } if (params.stats.webVisit != null) {
      ctx._source.stats.put('webVisit', params.stats.webVisit);
    } if (params.stats.lineUser != null) {
      ctx._source.stats.put('lineUser', params.stats.lineUser);
    } if (params.stats.lineVisit != null) {
      ctx._source.stats.put('lineVisit', params.stats.lineVisit);
    }
  }
  ctx._source.fetchedAt = params.fetchedAt;
  ctx._source.date = params.date;
  ctx._source.docId = params.docId;
  ctx._source.type = params.type;
`;

export const parseIdFromRow = function(row) {
  const id = row.dimensions[0];
  const match = idExtractor.exec(id);
  return match ? match[1] : id;
};

// Contructs request body for google reporting API.
export const requestBodyBuilder = function(
  sourceType,
  docType,
  pageToken,
  params
) {
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
export const fetchReports = async function(
  sourceType,
  pageTokens = {},
  params
) {
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
      // useResourceQuotas: true
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

export const upsertDocStats = async function(body) {
  try {
    const res = await client.bulk({
      body,
      refresh: 'true',
    });
    if (res.body.errors) {
      console.log('something went wrong in bulk updates');
    }
  } catch (err) {
    console.error(err);
  }
};

/*
async function fetchReplyUsers(sourceType, rows) {
  const replyIds = rows.map((row) => parseIdFromRow (row))
  const { hits } = client.search({
    index: 'replies',
    size: pageSize,
    body: {
      query: {
        ids: {values: ids}
      },
      _source: {
        includes: ['userId', '_id'],
      },
    }
  })
  let replyUsers = {}
  hits.hits.forEach((reply) => replyUsers[reply._id] = reply.userId)
  return replyUsers
}
*/

/**
 * Given stats report for a sourceType and docType, store them in db
 *
 * @param {string} sourceType    One of the values defined by statsSources.
 * @param {string} docType       One of the values defined by docTypes.
 * @param {array}  rows          Rows of data to process; each row is an object
    of the form {dimensions: [{field: value}], metrics:[{values:[values]}]}}
 * @param {Date}   fetchedAt     Timestamp of the fetched time
 * @param {object} prevLastRow   Stats for the last processed row from previous
    call of the same sourceType and docType; It's an object of the form {
      sourceType: string, docType: string, path: string, date: string,
      docId: string, visits: number, users: number }

 * @return {object} Return the stats of last processed row, same format as prevLastRow.
 */
export const processReport = async function(
  sourceType,
  docType,
  rows,
  fetchedAt,
  prevLastRow
) {
  /* TODO: logics for updating reply docUserId
  let replyUsers
  if (docType === docTypes.REPLY) {
    replyUsers = await fetchReplyUsers(sourceType, report.rows)
  }
  */
  let bulkUpdates = [];
  const sourceName = sourceType.toLowerCase();

  rows.forEach(row => {
    const docId = parseIdFromRow(row);
    const date = formatDate(row.dimensions[1]);
    const [visits, users] = row.metrics[0].values;

    const prevParams =
      bulkUpdates.length > 0 &&
      bulkUpdates[bulkUpdates.length - 1].script.params;
    if (prevParams && prevParams.date === date && prevParams.docId === docId) {
      prevParams.stats[`${sourceName}Visit`] += eval(visits);
      prevParams.stats[`${sourceName}User`] += eval(users);
    } else {
      const stats = {
        [`${sourceName}Visit`]: eval(visits),
        [`${sourceName}User`]: eval(users),
      };

      // Page views on the same reply/article could have different `pagePathLevel2`
      // values due to query parameters in the url.  This is handling the edge case
      // where the same (document id, date) pair span more than one page
      if (
        prevLastRow &&
        bulkUpdates.length == 0 &&
        prevLastRow.date == date &&
        prevLastRow.docId == docId
      ) {
        stats[`${sourceName}Visit`] += prevLastRow.visits;
        stats[`${sourceName}User`] += prevLastRow.users;
      }

      const id = `${docType}_${docId}_${date}`;
      bulkUpdates.push({
        update: { _index: 'analytics', _type: 'doc', _id: id },
      });
      bulkUpdates.push({
        scripted_upsert: true,
        script: {
          source: upsertScript,
          // TODO: include replyUserId for replies here
          params: { fetchedAt, date, docId, stats, type: docType },
        },
        upsert: {},
      });
    }
  });

  try {
    await upsertDocStats(bulkUpdates);
  } catch (err) {
    console.error(err);
  }

  if (bulkUpdates.length > 0) {
    const lastRowParams = bulkUpdates[bulkUpdates.length - 1].script.params;
    return {
      sourceType,
      docType,
      path: rows[rows.length - 1].dimensions[0],
      date: lastRowParams.date,
      docId: lastRowParams.docId,
      visits: lastRowParams.stats[`${sourceName}Visit`],
      users: lastRowParams.stats[`${sourceName}User`],
    };
  }
};

/**
 * Fetch GA stats for given time period and store in db.
 *
 * @param {object} params        Object of the from:
    {isCron: [bool=true], [startDate: string], [endDate: string]}
 */
export const updateStats = async function(params = { isCron: true }) {
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
      }
    }
  }
};

async function main() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_OAUTH_KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  google.options({ auth });
  updateStats();
}

export default main;

if (require.main === module) {
  main();
}
