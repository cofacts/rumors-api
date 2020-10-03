/*
  A script that loads all documents in db and create user for all occurrences of non-web users.

  The followings are current references to user records in db:
    - analytics: (1825k)
      - (docUserId, docAppId) via docId (reply/article)

    - articlecategoryfeedbacks: (less than 1k)
      id = ${articleId}__${categoryId}__${userId}__${appId},
      - (userId, appId)

    - articlereplyfeedbacks: (~179k)
      id = ${articleId}__${replyId}__${userId}__${appId},
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
import rollbar from 'rollbarInstance';
import {
  generatePseudonym,
  generateOpenPeepsAvatar,
  AvatarTypes,
  convertAppUserIdToUserId,
} from 'graphql/models/User';
import { get, set } from 'lodash';

const AGG_NAME = 'userIdPair';

const AGG_SCRIPT = `
  boolean valueExists(def map, def key) { map.containsKey(key) && map[key] != ''}
  String getUserIdPair(def map, def docRef, def emptyAllowed) { 
    boolean appIdExists = valueExists(map, 'appId') ;
    boolean userIdExists = valueExists(map, 'userId');
    if (!appIdExists || !userIdExists) {
      if (emptyAllowed) {
        return '';
      } else {
        return '{"error":"appId and/or userId do not exist on '+ docRef + '"}';    
      }
    } else {
      return '{"appId":"' + map.appId + '", "userId":"' + map.userId + '"}';
    }
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
  userIds[0] = getUserIdPair(params._source, docRef, false);
  for (field in params.additionalFields) {
    if (params._source.containsKey(field)) {
      boolean emptyAllowed = params.emptyUserIdAllowedFields.containsKey(doc._index + '__' + field);
      for (int i = 0; i < params._source[field].length; i++) {
        userIds[currentIndex] = getUserIdPair(params._source[field][i], 'some reference of ' + docRef, emptyAllowed);
        currentIndex += 1;
      }
    }
  }  
  return userIds;
`;

const BATCH_SIZE = 10000;
const AGG_BATCH_SIZE = 10000;
const SCROLL_TIMEOUT = '30s';
const SCRIPT_ID = 'appIdUserIdAggScript';
const SCHEMA_VERSION = 'v1_0_2';

const matchAllQuery = {
  match_all: {},
};

const backendUserQuery = {
  bool: {
    must_not: [
      { term: { appId: 'WEBSITE' } },
      { term: { appId: 'DEVELOPMENT_FRONTEND' } },
    ],
  },
};

const isBackendApp = appId =>
  appId !== 'WEBSITE' && appId !== 'DEVELOPMENT_FRONTEND';

const userReferenceInSchema = {
  articlecategoryfeedbacks: {
    fields: [],
    genId: doc =>
      `${doc.articleId}__${doc.categoryId}__${doc.userId}__${doc.appId}`,
  },
  articlereplyfeedbacks: {
    fields: [],
    genId: doc =>
      `${doc.articleId}__${doc.replyId}__${doc.userId}__${doc.appId}`,
  },
  articles: {
    fields: ['references', 'articleReplies', 'articleCategories'],
  },
  replies: { fields: [] },
  replyrequests: {
    fields: ['feedbacks'],
    genId: doc => `${doc.articleId}__${doc.userId}__${doc.appId}`,
  },
};

const emptyUserIdAllowedFields = { articles: ['articleCategories'] };

const logError = error => {
  console.error(`createBackendUserError: ${error}`);
  rollbar.error(`createBackendUserError: ${error}`);
};

export default class CreateBackendUsers {
  // TODO: maybe not hardcode version number?
  constructor({ batchSize, schemaVersion, aggBatchSize } = {}) {
    this.userIdMap = {}; // {[appID]: {[appUserId]: dbUserId}}
    this.reversedUserIdMap = {}; // {[dbUserId]: [appId, appUserId]};
    this.batchSize = batchSize ?? BATCH_SIZE;
    this.version = schemaVersion ?? SCHEMA_VERSION;
    this.aggBatchSize = aggBatchSize ?? AGG_BATCH_SIZE;
    this.bulk = new Bulk(client, this.batchSize);

    this.emptyUserIdAllowedFields = {};
    for (const index in emptyUserIdAllowedFields) {
      for (const field of emptyUserIdAllowedFields[index]) {
        this.emptyUserIdAllowedFields[
          `${this.getIndexName(index)}__${field}`
        ] = true;
      }
    }
  }

  getIndexName(index) {
    return `${index}_${this.version}`;
  }

  async storeScriptInDB() {
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
      logError(e);
    }
  }

  // buckets is an array of {
  //  key: {
  //    [AGG_NAME]: "{appId:[appId], userId:[userId]}" || "{error:[errorMessage]}"
  //  },
  //  doc_count: [doc_count]
  // }
  async processUsers(buckets) {
    let bulkOperations = [];
    const now = new Date().toISOString();
    for (const {
      key: { [AGG_NAME]: userIdPair },
    } of buckets) {
      if (userIdPair === '') {
        continue;
      }
      const { userId, appId, error } = JSON.parse(userIdPair);
      if (error) {
        continue;
        // console.info(error);
        // logError(error);
      } else if (isBackendApp(appId)) {
        const dbUserId = convertAppUserIdToUserId(appId, userId);
        const appUserId = get(this.reversedUserIdMap, [dbUserId, 1]);
        // if the hashed id already exists, check for collision
        if (appUserId !== undefined) {
          if (appUserId !== userId) {
            logError(
              `collision found! ${userId} and ${appUserId} both hash to ${dbUserId}`
            );
          }
        } else {
          set(this.userIdMap, [appId, userId], dbUserId);
          set(this.reversedUserIdMap, dbUserId, [appId, userId]);
          bulkOperations.push(
            {
              index: {
                _index: this.getIndexName('users'),
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
    }
    await this.bulk.push(bulkOperations, bulkOperations.length / 2);
  }

  // response is of the form {
  //   aggregations: { [AGG_NAME]: {
  //     after_key: {[AGG_NAME]: [lastKey]},
  //     buckets: [{...}]
  // }}}
  async fetchUniqueUsers(indexName, pageIndex = undefined) {
    try {
      const {
        body: {
          aggregations: {
            [AGG_NAME]: { after_key: lastKey, buckets },
          },
        },
      } = await client.search({
        index: this.getIndexName(indexName),
        size: 0,
        body: {
          aggs: {
            [AGG_NAME]: {
              composite: {
                size: this.aggBatchSize,
                after: pageIndex,
                sources: [
                  {
                    [AGG_NAME]: {
                      terms: {
                        script: {
                          id: SCRIPT_ID,
                          params: {
                            emptyUserIdAllowedFields: this
                              .emptyUserIdAllowedFields,
                            additionalFields:
                              userReferenceInSchema[indexName].fields,
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
      await this.processUsers(buckets);
      return lastKey;
    } catch (e) {
      logError(
        `error while fetching users for indexName:${indexName} with pageIndex ${pageIndex}`
      );
      logError(e);
    }
  }

  async fetchUsersFromAllDocs() {
    for (const indexName in userReferenceInSchema) {
      let pageIndex;
      do {
        pageIndex = await this.fetchUniqueUsers(indexName, pageIndex);
      } while (pageIndex !== undefined);
    }
  }

  /**
   * A generator that fetches all docs in the specified index.
   *
   * @param {String} indexName The name of the index to fetch
   * @yields {Object} the document
   */
  async *getAllDocs(indexName, hasAdditionalUserFields = false) {
    let resp = await client.search({
      index: this.getIndexName(indexName),
      scroll: SCROLL_TIMEOUT,
      size: this.batchSize,
      body: {
        query: hasAdditionalUserFields ? matchAllQuery : backendUserQuery,
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

  getUserIds(appId, userId) {
    return isBackendApp(appId)
      ? {
        userId: get(this.userIdMap, [appId, userId], userId),
        appUserId: userId,
      }
      : { userId };
  }

  async updateAllDocs() {
    for (const indexName in userReferenceInSchema) {
      const { genId, fields } = userReferenceInSchema[indexName];
      for await (const doc of this.getAllDocs(
        indexName,
        fields && fields.length > 0
      )) {
        const { appId, userId } = doc._source;
        let newFields = {};

        newFields = this.getUserIds(appId, userId);
        for (const field of fields) {
          if (doc._source[field]) {
            newFields[field] = doc._source[field].map(entry => ({
              ...entry,
              ...this.getUserIds(entry.appId, entry.userId),
            }));
          }
        }
        if (genId !== undefined) {
          await this.bulk.push(
            [
              {
                delete: {
                  _index: doc._index,
                  _type: 'doc',
                  _id: doc._id,
                },
              },
              {
                index: {
                  _index: doc._index,
                  _type: 'doc',
                  _id: genId({ ...doc._source, ...newFields }),
                },
              },
              {
                ...doc._source,
                ...newFields,
              },
            ],
            2
          );
        } else {
          await this.bulk.push([
            {
              update: {
                _index: doc._index,
                _type: 'doc',
                _id: doc._id,
              },
            },
            {
              doc: newFields,
            },
          ]);
        }
      }
    }
  }

  async execute() {
    await this.storeScriptInDB();
    await this.fetchUsersFromAllDocs();
    await this.bulk.flush();
    await this.updateAllDocs();
    await this.bulk.flush();
    // update analytics
  }
}

async function main() {
  try {
    await new CreateBackendUsers().execute();
    /*
    await loadFixtures(fixtures.fixturesToLoad);
      await new CreateBackendUsers({
      batchSize: 10,
      aggBatchSize: 5
    }).execute();
    */
  } catch (e) {
    logError(e);
  }
}

if (require.main === module) {
  console.log('I dont belong here!!!!!!!!!!!!!!!!!!!');
  main();
}
