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

 - Make sure `*_DATASET`, `GA_*_STREAM_ID`, and `TIMEZONE=Asia/Taipei` are set with correct settings in .env.
*/

import 'dotenv/config';
import assert from 'assert';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import DataLoader from 'dataloader';
import client from 'util/client';
// import rollbar from '../rollbarInstance';
import { BigQuery } from '@google-cloud/bigquery';
import yargs from 'yargs';

const bigquery = new BigQuery();

const BATCH_SIZE = 1000;

const formatDate = date =>
  `${date.substr(0, 4)}-${date.substr(4, 2)}-${date.substr(6, 2)}`;

function getId({ dateStr, type, docId }) {
  return `${type}_${docId}_${formatDate(dateStr)}`;
}

/**
 * Create a transform stream to batch objects
 * @param {number} batchSize
 */
function createBatchTransform(batchSize) {
  let batch = [];

  return new Transform({
    objectMode: true,
    transform(object, _, callback) {
      batch.push(object);

      if (batch.length >= batchSize) {
        this.push(batch);
        batch = [];
      }

      callback();
    },
    flush(callback) {
      if (batch.length > 0) {
        this.push(batch);
      }

      callback();
    },
  });
}

const TYPE_TO_ESIDX = { article: 'articles', reply: 'replies' };

/**
 * Given the {type, docId} from BigQuery result,
 * return the author information {docUserId, docAppId} of the given `docId` of `type`.
 */
const docUserAppLoader = new DataLoader(
  /** @param {{type: 'article' | 'reply', docId: string }} typeDocIds */
  async typeDocIds => {
    const docs = typeDocIds
      .map(({ type, docId }) => {
        const index = TYPE_TO_ESIDX[type];
        return !index
          ? null
          : {
              _index: index,
              _type: 'doc',
              _id: docId,
            };
      })
      .filter(Boolean);

    const docMap = (await client.mget({
      body: { docs },
      _source: ['userId', 'appId'],
    })).body.docs.reduce((map, { _source, _index, _id }) => {
      const [index] = _index.split('_v'); // take the part before versions
      map[`${index}/${_id}`] = {
        docUserId: _source.userId,
        docAppId: _source.appId,
      };
      return map;
    }, {});

    return typeDocIds.map(
      ({ type, docId }) => docMap[`${TYPE_TO_ESIDX[type]}/${docId}`]
    );
  },
  {
    cacheKeyFn: ({ type, docId }) => `${type}/${docId}`,
  }
);

/**
 * Fetch GA stats for given time period and store in db.
 * @param {object} params
 */
export async function fetchStatsFromGA(params) {
  const today = new Date(
    new Date().toLocaleString(undefined, { timeZone: params.timezone })
  );
  const todayYYYYMMDD = `${today.getFullYear()}${(today.getMonth() + 1)
    .toString()
    .padStart(2, '0')}${today
    .getDate()
    .toString()
    .padStart(2, '0')}`;

  const isGrabbingToday = !params.startDate && !params.endDate;

  if (params.startDate && params.endDate) {
    // Detect startDate and endDate format;
    assert(
      params.startDate.match(/^\d{8}$/),
      'startDate must be in YYYYMMDD format'
    );
    assert(
      params.endDate.match(/^\d{8}$/),
      'endDate must be in YYYYMMDD format'
    );
    assert(
      params.startDate < todayYYYYMMDD,
      `startDate must be earlier than ${todayYYYYMMDD}`
    );
    assert(
      params.endDate < todayYYYYMMDD,
      `endDate must be earlier than ${todayYYYYMMDD}`
    );
  } else if (!isGrabbingToday) {
    // Only 1 in startDate & endDate is given.
    throw new Error('Please provide both startDate and endDate');
  }

  const startDate = isGrabbingToday ? todayYYYYMMDD : params.startDate;
  const endDate = isGrabbingToday ? todayYYYYMMDD : params.endDate;

  const query = `
    WITH
      lineStats AS (
        SELECT
          FORMAT_DATE("%Y%m%d", DATE(createdAt, "${
            params.timezone
          }")) AS event_date,
          evt.category AS item_category,
          evt.label AS item_id,
          COUNT(*) AS lineVisit,
          COUNT(DISTINCT userId) AS lineUser
        FROM \`${params.lineBotEventDataset}.events\`, UNNEST (events) AS evt
        WHERE evt.action = 'Selected'
          -- Use createdAt so that BQ can select correct partition
          AND createdAt >= TIMESTAMP("${formatDate(
            startDate
          )} 00:00:00.000", "${params.timezone}")
          AND createdAt <= TIMESTAMP("${formatDate(endDate)} 23:59:59.999", "${
    params.timezone
  }")
        GROUP BY event_date, item_category, item_id
      ),

      webStats AS (
        SELECT
          event_date,
          item_category,
          item_id,
          COUNT(*) AS webVisit,
          COUNT(DISTINCT user_pseudo_id) AS webUser
        FROM \`${params.ga4Dataset}.events_${
    isGrabbingToday ? 'intraday_' : ''
  }*\`, UNNEST (items)
        WHERE event_name = 'view_item'
          AND stream_id = '${params.webStreamId}' -- web stream
          AND _table_suffix between '${startDate}' and '${endDate}'
        GROUP BY event_date, item_category, item_id
      ),

      liffStats AS (
        WITH t AS (
          SELECT
            event_date, item_category, item_id,
            struct(
              collected_traffic_source.manual_source as source,
              count(*) as visit, COUNT(DISTINCT user_pseudo_id) as user
            ) as liffObj
            FROM \`${params.ga4Dataset}.events_${
    isGrabbingToday ? 'intraday_' : ''
  }*\`, UNNEST (items)
          WHERE event_name = 'view_item'
            AND stream_id = '${params.liffStreamId}' -- LIFF stream
            AND _table_suffix between '${startDate}' and '${endDate}'
          GROUP BY event_date, item_category, item_id, collected_traffic_source.manual_source
        )
        SELECT event_date, item_category, item_id, ARRAY_AGG(liffObj) AS liff FROM t
        GROUP BY event_date, item_category, item_id
      )
    SELECT
      event_date AS dateStr,
      CAST(TIMESTAMP(PARSE_DATE("%Y%m%d", event_date), "${
        params.timezone
      }") AS STRING FORMAT 'YYYY-MM-DD"T"HH24:MI:SS".000"TZH:TZM' AT TIME ZONE '${
    params.timezone
  }') AS date,
      LOWER(item_category) AS type,
      item_id AS docId,
      STRUCT(lineUser, lineVisit, webUser, webVisit, liff) AS stat
    FROM lineStats
    FULL JOIN webStats USING (event_date, item_category, item_id)
    FULL JOIN liffStats USING (event_date, item_category, item_id)
  `;

  const [job] = await bigquery.createQueryJob({ query });
  console.log(`[fetchStatsFromGA] BQ job ${job.id} started.`);

  await pipeline(
    job.getQueryResultsStream(),
    createBatchTransform(BATCH_SIZE),
    async function(source) {
      let processedCount = 0;

      for await (const docs of source) {
        const esBatch = (await Promise.all(
          docs.map(async doc => {
            const { dateStr: dontcare, ...analyticsFields } = doc; // eslint-disable-line no-unused-vars

            return [
              {
                index: { _index: 'analytics', _type: 'doc', _id: getId(doc) },
              },
              {
                ...analyticsFields,
                ...(await docUserAppLoader.load(doc)),
                fetchedAt: new Date(),
              },
            ];
          })
        )).flat();

        processedCount += docs.length;

        // console.log(esBatch.map(o => JSON.stringify(o)));

        const { body: response } = await client.bulk({ body: esBatch });
        if (response.errors) {
          console.error('Elasticsearch Bulk Insert Error:', response.errors);
          process.exit(1);
        }
        console.log(
          `[fetchStatsFromGA] ${response.items.length} item(s) indexed`
        );
      }

      console.log(
        `[fetchStatsFromGA] Finished processing ${processedCount} analytics records for ${startDate} ~ ${endDate} (${
          params.timezone
        }).`
      );
    }
  );
}

async function main() {
  try {
    const argv = yargs
      .options({
        startDate: {
          alias: 's',
          description:
            'YYYYMMDD. Must be a date in the past. Must be provided together with `endDate`. Omitting this means fetching stats today.',
          type: 'string',
        },
        endDate: {
          alias: 'e',
          description:
            'YYYYMMDD. Must be a date in the past. Must be provided together with `startDate`. Omitting this means fetching stats today.',
          type: 'string',
        },
      })
      .help('help').argv;

    const params = {
      startDate: argv.startDate,
      endDate: argv.endDate,

      timezone: process.env.TIMEZONE,
      lineBotEventDataset: process.env.LINE_BOT_EVENT_DATASET,
      ga4Dataset: process.env.GA4_DATASET,
      webStreamId: process.env.GA_WEB_STREAM_ID,
      liffStreamId: process.env.GA_LIFF_STREAM_ID,
    };

    await fetchStatsFromGA(params);
  } catch (e) {
    // rollbar.error(e);
    console.error(e);
  }
}

if (require.main === module) {
  main();
}
