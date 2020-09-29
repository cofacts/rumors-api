/*
  A script that loads all documents in db and create user for all occurrences of non-web users.

  The followings are current references to user records in db:
    - analytics: (1825k)
      - (docUserId, docAppId) via docId (reply/article)

    - articlecategoryfeedbacks: (less than 1k)
      id = ${articleId}__${categoryId}__${userId}__${appId}",
      - (userId, appId)

    - articlereplyfeedbacks: (~179k)
      id = ${articleId}__${replyId}__${userId}__${appId}",
      - (userId, appId)

    - articles:  (~ 40k)
      - (userId, appId)
      - [references]: 
          - (userId, appId)
      - [articleReplies]:
          - (userId, appId)
      - [articleCategories]:
          - (userId, appId)

    - replies: (~42k)
      - (userId, appId)

    - replyrequests: (~61k)
      id = ${articleId}__${userId}__${appId}
      - (userId, appId)
      - [feedbacks]:
        - (userId, appId)
*/

import 'dotenv/config';
import client from 'util/client';
import Bulk from 'util/bulk';
// import rollbar from 'rollbarInstance';
import { google } from 'googleapis';
import yargs from 'yargs';
import {
  generatePseudonym,
  generateOpenPeepsAvatar,
  encodeAppId,
  sha256,
  AvatarTypes,
  convertAppUserIdToUserId,
} from 'graphql/models/User';
import _ from 'lodash';

// TODO: maybe not hardcode version number?
const getIndexName = index => `${index}_v1_0_2`;

const AGG_NAME = 'userIdPair';

const AGG_SCRIPT = `
  boolean valueExists(def map, def key) { map.containsKey(key) && map[key] != ''}
  String getUserIdPair(def map, def docRef) { 
    boolean appIdExists = valueExists(map, 'appId') ;
    boolean userIdExists = valueExists(map, 'userId');
    if (!appIdExists && !userIdExists) {
      return '{\'error\':\'appId and userId do not exist for some reference in '+ docRef + '\'}';
    } if (!userIdExists){
      return '{\'error\':\'userId does not exist for some reference in '+ docRef + '\'}';
    } if (!appIdExists){
      return '{\'error\':\'appId does not exist for some reference in '+ docRef + '\'}';
    }
    return '{\'appId\':\'' + map.appId + '\', \'userId\':\'' + map.userId + '\'}';
  }

  int totalLength = 1;
  for (field in params.additionalFields) {
    if (params._source.containsKey(field)) {
      totalLength += params._source[field].length;
    }
  }

  String [] userIds = new String[totalLength];
  String docRef = doc._index.value + ' ' + doc._id.value;
  int currentIndex = 1;
  userIds[0] = getUserIdPair(params._source, doc._id.value);
  for (field in params.additionalFields) {
    if (params._source.containsKey(field)) {
      for (int i = 0; i < params._source[field].length; i++) {
        userIds[currentIndex] = getUserIdPair(params._source[field][i], doc._id.value);
        currentIndex += 1;
      }
    }
  }  
  return userIds;
`;

const BATCH_SIZE = 10000;
const AGG_BATCH_SIZE = 100;
const SCROLL_TIMEOUT = '30s';
const SCRIPT_ID = 'appIdUserIdAggScript';

const userReferenceInSchema = {
  articlecategoryfeedbacks: [],
  articlereplyfeedbacks: [],
  articles: ['references', 'articleReplies', 'articleCategories'],
  replies: [],
  replyrequests: ['feedbacks'],
};

const logError = error => {
  console.error(`createBackendUserError: ${error}`);
  // rollbar.error(`createBackendUserError: ${error}`);
};

let userIdMap = {}; // {[appID]: {[appUserId]: dbUserId}}
let reversedUserIdMap = {}; // {[dbUserId]: [appId, appUserId]};

async function storeScriptInDB() {
  console.log('storing script');
  try {
    await client.put_script({
      id: SCRIPT_ID,
      body: {
        script: {
          lang: 'painless',
          source: AGG_SCRIPT,
        },
      },
    });
  } catch (e) {
    console.log(e);
  }
}

const bulk = new Bulk(BATCH_SIZE);

// {
//   "aggregations": {
//     "userId": {
//       "after_key": {
//         [AGG_NAME]: ""
//       },
//       "buckets": [
//         {
//           "key": {
//             [AGG_NAME]: "{'appId':'', 'userId':''}" || "{'error':docId}"
//           },
//           "doc_count": 3819
//         },
//       ]
//     }
//   }
// }

function processUsers(buckets) {
  let bulkOperations = [];
  const now = new Date().toISOString();
  buckets.forEach(({ key: { [AGG_NAME]: userIdPair } }) => {
    const { userId, appId, error } = userIdPair;
    if (error) {
      logError(error);
    } else {
      const dbUserId = convertAppUserIdToUserId(appId, userId);
      const appUserId = _.get(reversedUserIdMap, [dbUserId, 1]);
      if (appUserId !== undefined) {
        if (appUserId !== userId) {
          logError(
            `collision found! ${userId} and ${appUserId} both hash to ${dbUserId}`
          );
        }
      } else {
        _.set(userIdMap, [appId, userId], dbUserId);
        _.set(reversedUserIdMap, dbUserId, [appId, userId]);
        bulkOperations.push(
          {
            create: {
              _index: getIndexName('users'),
              _type: 'doc',
              _id: dbUserId,
            },
          },
          {
            name: generatePseudonym(),
            avatarType: AvatarTypes.OpenPeeps,
            avatarData: JSON.stringify(generateOpenPeepsAvatar()),
            appId,
            appUserId: userId,
            createdAt: now,
            updatedAt: now,
          }
        );
      }
    }
  });
  console.log(JSON.stringify(bulkOperations));
  // bulk.push(bulkOperations);
}

async function fetchUniqueUsers(indexName, pageIndex = '') {
  try {
    const {
      body: {
        aggregations: {
          [AGG_NAME]: { after_key: lastKey, buckets },
        },
      },
    } = await client.search({
      index: getIndexName(indexName),
      size: 0,
      body: {
        aggs: {
          [AGG_NAME]: {
            composite: {
              size: AGG_BATCH_SIZE,
              after: {
                [AGG_NAME]: pageIndex,
              },
              sources: [
                {
                  [AGG_NAME]: {
                    terms: {
                      script: {
                        id: SCRIPT_ID,
                        params: {
                          additionalFields: userReferenceInSchema[indexName],
                        },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    });
    processUsers(buckets);
    return pageIndex ? lastKey : undefined;
  } catch (e) {
    console.log(`indexName=${indexName}, pageIndex=${pageIndex}`);
    console.log(e);
    debugger;
  }
}

async function fetchUsersFromAllDocs() {
  for (let indexName in userReferenceInSchema) {
    let pageIndex = '',
      bulkOperations;
    do {
      pageIndex = await fetchUniqueUsers(indexName, pageIndex);
      bulk.push(bulkOperations);
    } while (pageIndex !== undefined);
  }
}

/**
 * A generator that fetches all docs in the specified index.
 *
 * @param {String} indexName The name of the index to fetch
 * @yields {Object} the document
 */
async function* getAllDocs(indexName) {
  let resp = await client.search({
    index: getIndexName(indexName),
    scroll: SCROLL_TIMEOUT,
    size: BATCH_SIZE,
    body: {
      query: {
        match_all: {},
      },
    },
  });

  while (true) {
    const docs = resp.body.hits.hits;
    if (docs.length === 0) break;

    for (const doc of docs) {
      yield doc;
    }

    if (!resp.body._scroll_id) {
      break;
    }

    resp = await client.scroll({
      scroll: SCROLL_TIMEOUT,
      scrollId: resp.body._scroll_id,
    });
  }
}

/*async function updateAllDocs() {
  for (let indexName in userReferenceInSchema) {
    
  }
}*/

async function main() {
  console.log('in main');
  await storeScriptInDB();
  console.log('script stored');
  await fetchUsersFromAllDocs();
  // await updateAllDocs();
}

main();
