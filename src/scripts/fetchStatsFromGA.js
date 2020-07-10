// eslint-disable no-console
import 'dotenv/config';

import client from 'util/client';
import { google } from 'googleapis';

const analyticsreporting = google.analyticsreporting('v4');
const pageSize = process.env.GA_PAGE_SIZE || '10000';
const webViewId = process.env.GA_WEB_VIEW_ID;
const lineViewId = process.env.GA_LINE_VIEW_ID;

const idExtractor = /\/([^?\/]+).*/
const toTitleCase = (str) => str.charAt(0).toUpperCase() + str.substr(1).toLowerCase()
const formatDate = (date) => `${date.substr(0, 4)}-${date.substr(4,2)}-${date.substr(6,2)}`

const docTypes = {
  ARTICLE: 'article',
  REPLY: 'reply'
}

const allDocTypes = [docTypes.ARTICLE, /*docTypes.REPLY*/];

const statsSources = {
  WEB: {
    filtersExpression: (docType) => `ga:pagePathLevel1==/${docType}/`,
    name: 'WEB',
    primaryDimension: 'ga:pagePathLevel2',
    primaryMetric: 'ga:pageviews',
    viewId: webViewId,
  },
  LINE: {
    filtersExpression: (docType) => `ga:eventCategory==${toTitleCase(docType)};ga:eventAction==Selected`,
    name: 'LINE',
    primaryDimension: 'ga:eventLabel',
    primaryMetric: 'ga:hits',
    viewId: lineViewId,
  }
}

const upsertScript = `
  // since web stats and line stats are fetched seperately, need to do
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
`

function requestBodyBuilder(sourceType, docType, startDate, endDate, pageToken) {
  let {filtersExpression, primaryDimension, primaryMetric, viewId} = statsSources[sourceType];
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      {name: primaryDimension},
      {name: 'ga:date'}
    ],
    filtersExpression: filtersExpression(docType),
    includeEmptyRows: false,
    metrics: [
      { expression: primaryMetric },
      { expression: 'ga:users' }
    ],
    orderBys: [{fieldName: 'ga:date', fieldName:primaryDimension}],
    pageSize: pageSize,
    pageToken: pageToken || '',
    viewId,
  };
}

/* Given a sourceType(line or web), fetch stats for all doc types (articles and replys) from
   startDate to endDate (inclusive).

   pageTokens is a mapping of each doc types' page token.
   returns a mapping for each doc types to its report.
 */
async function fetchReports(sourceType, startDate, endDate, pageTokens={}) {
  // TODO: consider the edge case when the cron job runs at midnight
  // the first cron job of the day should also update the value for yesterday
  let reportRequests = [];

  // when pageToken is -1, it means there's no more rows to fetch
  let requestDocTypes = allDocTypes.filter((docType) => {
    let pageToken = pageTokens[docType] || 0;
    if (pageToken !== -1) {
      console.log(`fetching GA data for ${sourceType} ${docType} \
        rows ${pageToken}-${eval(pageToken)+eval(pageSize)}`)
      reportRequests.push(
        requestBodyBuilder(sourceType, docType, startDate, endDate, pageToken))
      return true
    } else {
      console.log(`no more rows to fetch for ${sourceType} ${docType}`)
      return false
    }
  });

  if (requestDocTypes.length == 0) {
    // if we got here, something is wrong...
    console.log(`no more rows to fetch for ${sourceType} from ${startDate} to ${endDate}`)
    return
  }

  // fetching article and reply stats from GA
  const res = await analyticsreporting.reports.batchGet({
    requestBody: {
      reportRequests
      // useResourceQuotas: true
    },
  });
  const reports = res.data.reports;
  let results = {}
  let nextPageTokens = {}
  let hasMore = false;
  requestDocTypes.forEach((docType, i) => {
    let report = reports[i]
    console.log(`fetched ${report.data.rows.length} starting at ${pageTokens[docType]||0} `
      + `out of total ${report.data.rowCount} rows for ${sourceType} ${docType}`
      + ` from ${startDate} to ${endDate}, with next pageToken ${report.nextPageToken}`)
    results[docType] = report.data.rows
    nextPageTokens[docType] = report.nextPageToken || -1
    hasMore = hasMore || report.nextPageToken != null
  })

  return {results, pageTokens: nextPageTokens, hasMore};
}

async function upsertDocStats(body) {
  try {
    const res = await client.bulk({
      body,
      refresh: 'true'
    })
    if (res.body.errors) {
      console.log(JSON.stringify(res.body.items[0]))
      console.log('something went wrong in bulk updates')
    }
  } catch (err) {
    console.error(err)
  }
}

function parseIdFromRow(sourceType, row) {
  const id = row.dimensions[0]
  if (sourceType === statsSources.WEB.name) {
    const match = idExtractor.exec(id)
  return match && match[1];
  } else {
    return id
  }
}
/*
async function fetchReplyUsers(sourceType, rows) {
  const replyIds = rows.map((row) => parseIdFromRow (sourceType, row))
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

// given stats report for a sourceType and docType, store them in db
// --report an object of {data: {rows: [rows], maximums: [values], minimums: [values], rowCount: number, totals: [values]}, nextPageToken}--
async function processReport(sourceType, docType, rows, fetchedAt, prevLastRow) {
  /* TODO: logics for updating reply docUserId
  let replyUsers
  if (docType === docTypes.REPLY) {
    replyUsers = await fetchReplyUsers(sourceType, report.rows)
  }
  */
  let bulkUpdates = []
  const sourceName = sourceType.toLowerCase()

  rows.forEach((row) => {
    const docId = parseIdFromRow(sourceType, row)
    const date = formatDate(row.dimensions[1])
    const [visits, users] = row.metrics[0].values


    const prevParams = bulkUpdates.length > 0 && bulkUpdates[bulkUpdates.length-1].script.params
    if (prevParams && prevParams.date === date && prevParams.docId === docId) {
      prevParams.stats[`${sourceName}Visit`] += eval(visits)
      prevParams.stats[`${sourceName}User`] += eval(users)
    } else {
      const stats = {
        [`${sourceName}Visit`]: eval(visits),
        [`${sourceName}User`]: eval(users)
      }

      // Page views on the same reply/article could have different `pagePathLevel2`
      // values due to query parameters in the url.  This is handling the edge case
      // where the same (document id, date) pair span more than one page
      if (prevLastRow && bulkUpdates.length == 0) {
        debugger
        console.log(`date: ${date}, id: ${docId}`)
        if (sourceType!=prevLastRow.sourceType || docType  !=prevLastRow.docType) {
          console.error('how??????')
        }
      }
      if (prevLastRow && bulkUpdates.length == 0 && prevLastRow.date == date && prevLastRow.docId == docId) {
        debugger
        console.log('bingo!!!!!!')
        console.log(`last: ${JSON.stringify(prevLastRow)}`)
        console.log(`curr: ${JSON.stringify({
          sourceType,
          docType,
          path: row.dimensions[0],
          date: date,
          docId: docId,
          visits,
          users,
        })}`)
        stats[`${sourceName}Visit`] += prevLastRow.visits
        stats[`${sourceName}User`] += prevLastRow.users
      }

      const id = `${docType}_${docId}_${date}`
      bulkUpdates.push({update: {_index: 'analytics', _type: 'doc', _id: id}});
      bulkUpdates.push({
        scripted_upsert: true,
        script: {
          source: upsertScript,
          // TODO: include replyUserId for replies here
          params : { fetchedAt, date, docId, stats, type: docType }
        },
        upsert: {}
      })
    }
  })
  try {
    upsertDocStats(bulkUpdates)
  } catch(err) {
    console.error(err);
  }
  debugger
  if (bulkUpdates.length > 0) {
    const lastRowParams = bulkUpdates[bulkUpdates.length-1].script.params
    return {
      sourceType,
      docType,
      path: rows[rows.length - 1].dimensions[0],
      date: lastRowParams.date,
      docId: lastRowParams.docId,
      visits: lastRowParams.stats[`${sourceName}Visit`],
      users: lastRowParams.stats[`${sourceName}User`],
    }
  }
}

async function updateStats(startDate='today', endDate='today') {
  [statsSources.WEB.name, statsSources.LINE.name].forEach(async (sourceType) => {
    let hasMore = true;
    let pageTokens = {};
    let results;
    let prevLastRows = {};
    while(hasMore) {
      try {
       ({results, pageTokens, hasMore} = await fetchReports(sourceType, startDate, endDate, pageTokens));
        const fetchAt = new Date()
        allDocTypes.forEach((async (docType) => {
          prevLastRows[docType] = await processReport(sourceType, docType, results[docType], fetchAt, prevLastRows[docType]);
          console.log(`prevLastRows[${docType}] = ${JSON.stringify(prevLastRows[docType])}`)
        }))
      } catch(err) {
        console.error(err);
      }
    }
  })
}




async function main() {
  // TODO: add commend line arguments
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_OAUTH_KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  google.options({auth});
  updateStats()
}

export default main;

if (require.main === module) {
  main();
}