import { ImageAnnotatorClient } from '@google-cloud/vision';
import {
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLEnumType,
  GraphQLFloat,
  GraphQLNonNull,
  GraphQLID,
  GraphQLBoolean,
} from 'graphql';
import fetch from 'node-fetch';
import ffmpeg from 'fluent-ffmpeg';
import { toFile } from 'openai';

import Connection from './interfaces/Connection';
import Edge from './interfaces/Edge';
import PageInfo from './interfaces/PageInfo';
import Highlights from './models/Highlights';
import client from 'util/client';
import delayForMs from 'util/delayForMs';
import openai from 'util/openai';

// https://www.graph.cool/docs/tutorials/designing-powerful-apis-with-graphql-query-parameters-aing7uech3
//
// Filtering args definition & parsing
//

/**
 * @param {string} typeName
 * @param {GraphQLScalarType} argType
 * @param {string} description
 * @returns {GraphQLInputObjectType}
 */
function getArithmeticExpressionType(typeName, argType, description) {
  return new GraphQLInputObjectType({
    name: typeName,
    description,
    fields: {
      LT: { type: argType },
      LTE: { type: argType },
      GT: { type: argType },
      GTE: { type: argType },
      EQ: { type: argType },
    },
  });
}

export const timeRangeInput = getArithmeticExpressionType(
  'TimeRangeInput',
  GraphQLString,
  'List only the entries that were created between the specific time range. ' +
    'The time range value is in elasticsearch date format (https://www.elastic.co/guide/en/elasticsearch/reference/current/mapping-date-format.html)'
);
export const intRangeInput = getArithmeticExpressionType(
  'RangeInput',
  GraphQLInt,
  'List only the entries whose field match the criteria.'
);

/**
 * @param {object} arithmeticFilterObj - {LT, LTE, GT, GTE, EQ}, the structure returned by getArithmeticExpressionType
 * @returns {object} Elasticsearch range filter param
 * @see https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-range-query.html#range-query-field-params
 */
export function getRangeFieldParamFromArithmeticExpression(
  arithmeticFilterObj
) {
  // EQ overrides all other operators
  if (typeof arithmeticFilterObj.EQ !== 'undefined') {
    return {
      gte: arithmeticFilterObj.EQ,
      lte: arithmeticFilterObj.EQ,
    };
  }

  const conditionEntries = Object.entries(arithmeticFilterObj);

  if (conditionEntries.length === 0) throw new Error('Invalid Expression!');

  return Object.fromEntries(
    conditionEntries.map(([key, value]) => [key.toLowerCase(), value])
  );
}

export const moreLikeThisInput = new GraphQLInputObjectType({
  name: 'MoreLikeThisInput',
  description:
    'Parameters for Elasticsearch more_like_this query.\n' +
    'See: https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-mlt-query.html',
  fields: {
    like: {
      type: GraphQLString,
      description: 'The text string to search for.',
    },
    minimumShouldMatch: {
      type: GraphQLString,
      description:
        'more_like_this query\'s "minimum_should_match" query param.\n' +
        'See https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-minimum-should-match.html for possible values.',
    },
  },
});

export const userAndExistInput = new GraphQLInputObjectType({
  name: 'UserAndExistInput',
  fields: {
    userId: {
      type: new GraphQLNonNull(GraphQLString),
    },
    exists: {
      type: GraphQLBoolean,
      defaultValue: true,
      description: `
        When true (or not specified), return only entries with the specified user's involvement.
        When false, return only entries that the specified user did not involve.
      `,
    },
  },
});

export function createFilterType(typeName, args) {
  const filterType = new GraphQLInputObjectType({
    name: typeName,
    fields: () => ({
      ...args,
      // TODO: converting nested AND / OR to elasticsearch
      // AND: { type: new GraphQLList(filterType) },
      // OR: { type: new GraphQLList(filterType) },
    }),
  });
  return filterType;
}

//
// Sort args definition & parsing
//

const SortOrderEnum = new GraphQLEnumType({
  name: 'SortOrderEnum',
  values: {
    ASC: { value: 'asc' },
    DESC: { value: 'desc' },
  },
});

/**
 * @param {string} typeName
 * @param {Array<string|{name: string, description: string}>} filterableFields
 * @returns {GraphQLList<GarphQLInputObjectType>} sort input type for an field input argument.
 */
export function createSortType(typeName, filterableFields = []) {
  return new GraphQLList(
    new GraphQLInputObjectType({
      name: typeName,
      description:
        'An entry of orderBy argument. Specifies field name and the sort order. Only one field name is allowd per entry.',
      fields: filterableFields.reduce((fields, field) => {
        const fieldName = typeof field === 'string' ? field : field.name;
        const description =
          typeof field === 'string' ? undefined : field.description;

        return {
          ...fields,
          [fieldName]: { type: SortOrderEnum, description },
        };
      }, {}),
    })
  );
}

export const pagingArgs = {
  first: {
    type: GraphQLInt,
    description: 'Returns only first <first> results',
    defaultValue: 10,
  },
  after: {
    type: GraphQLString,
    description:
      'Specify a cursor, returns results after this cursor. cannot be used with "before".',
  },
  before: {
    type: GraphQLString,
    description:
      'Specify a cursor, returns results before this cursor. cannot be used with "after".',
  },
};

/**
 * @param {object[]} orderBy - sort input object type
 * @param {{[string]: (order: object) => object}} fieldFnMap - Defines one elasticsearch sort argument entry for a field
 * @returns {Array<{[string]: {order: string}}>} Elasticsearch sort argument in query body
 */
export function getSortArgs(orderBy, fieldFnMap = {}) {
  return orderBy
    .map((item) => {
      const field = Object.keys(item)[0];
      const order = item[field];
      const defaultFieldFn = (o) => ({ [field]: { order: o } });

      return (fieldFnMap[field] || defaultFieldFn)(order);
    })
    .concat({ _id: { order: 'desc' } }); // enforce at least 1 sort order for pagination
}

// sort: [{fieldName: {order: 'desc'}}, {fieldName2: {order: 'desc'}}, ...]
// This utility function reverts the direction of each sort params.
//
function reverseSortArgs(sort) {
  if (!sort) return undefined;
  return sort.map((item) => {
    const field = Object.keys(item)[0];
    const order = item[field].order === 'desc' ? 'asc' : 'desc';
    return {
      [field]: {
        ...item[field],
        order,
      },
    };
  });
}

// Export for custom resolveEdges() and resolveLastCursor()
//
export function getCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

export function getSearchAfterFromCursor(cursor) {
  if (!cursor) return undefined;
  return JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
}

async function defaultResolveTotalCount({
  first, // eslint-disable-line no-unused-vars
  before, // eslint-disable-line no-unused-vars
  after, // eslint-disable-line no-unused-vars
  ...searchContext
}) {
  try {
    return (
      await client.count({
        ...searchContext,
        body: {
          // count API only supports "query"
          query: searchContext.body.query,
        },
      })
    ).body.count;
  } catch (e) /* istanbul ignore next */ {
    console.error('[defaultResolveTotalCount]', JSON.stringify(e));
    throw e;
  }
}

export async function defaultResolveEdges(
  { first, before, after, ...searchContext },
  args,
  { loaders }
) {
  if (before && after) {
    throw new Error('Use of before & after is prohibited.');
  }

  const nodes = await loaders.searchResultLoader.load({
    ...searchContext,
    body: {
      ...searchContext.body,
      size: first,
      search_after: getSearchAfterFromCursor(before || after),

      // if "before" is given, reverse the sort order and later reverse back
      //
      sort: before
        ? reverseSortArgs(searchContext.body.sort)
        : searchContext.body.sort,
      highlight: {
        order: 'score',
        fields: {
          text: {
            number_of_fragments: 1, // Return only 1 piece highlight text
            fragment_size: 200, // word count of highlighted fragment
            type: 'plain',
          },
          reference: {
            number_of_fragments: 1, // Return only 1 piece highlight text
            fragment_size: 200, // word count of highlighted fragment
            type: 'plain',
          },
        },
        pre_tags: ['<HIGHLIGHT>'],
        post_tags: ['</HIGHLIGHT>'],
      },
    },
  });

  if (before) {
    nodes.reverse();
  }

  return nodes.map(
    ({ _score: score, highlight, inner_hits, _cursor, ...node }) => ({
      node,
      cursor: getCursor(_cursor),
      score,
      highlight,
      inner_hits,
    })
  );
}

async function defaultResolveLastCursor(
  {
    first, // eslint-disable-line no-unused-vars
    before, // eslint-disable-line no-unused-vars
    after, // eslint-disable-line no-unused-vars
    ...searchContext
  },
  args,
  { loaders }
) {
  const lastNode = (
    await loaders.searchResultLoader.load({
      ...searchContext,
      body: {
        ...searchContext.body,
        sort: reverseSortArgs(searchContext.body.sort),
      },
      size: 1,
    })
  )[0];

  return lastNode && getCursor(lastNode._cursor);
}

async function defaultResolveFirstCursor(
  {
    first, // eslint-disable-line no-unused-vars
    before, // eslint-disable-line no-unused-vars
    after, // eslint-disable-line no-unused-vars
    ...searchContext
  },
  args,
  { loaders }
) {
  const firstNode = (
    await loaders.searchResultLoader.load({
      ...searchContext,
      size: 1,
    })
  )[0];

  return firstNode && getCursor(firstNode._cursor);
}

async function defaultResolveHighlights(edge) {
  const { highlight: { text, reference } = {}, inner_hits } = edge;

  const hyperlinks = inner_hits?.hyperlinks.hits.hits?.map(
    ({
      _source: { url },
      highlight: {
        'hyperlinks.title': title,
        'hyperlinks.summary': summary,
      } = {},
    }) => ({
      url,
      title: title ? title[0] : undefined,
      summary: summary ? summary[0] : undefined,
    })
  );

  // Elasticsearch highlight returns an array because it can be multiple fragments,
  // We directly returns first element(text, title, summary) here because we set number_of_fragments to 1.
  return {
    text: text ? text[0] : undefined,
    reference: reference ? reference[0] : undefined,
    hyperlinks,
  };
}

// All search
//
export function createConnectionType(
  typeName,
  nodeType,
  {
    // Default resolvers
    resolveTotalCount = defaultResolveTotalCount,
    resolveEdges = defaultResolveEdges,
    resolveLastCursor = defaultResolveLastCursor,
    resolveFirstCursor = defaultResolveFirstCursor,
    resolveHighlights = defaultResolveHighlights,
    extraEdgeFields = {},
  } = {}
) {
  return new GraphQLObjectType({
    name: typeName,
    interfaces: [Connection],
    fields: () => ({
      totalCount: {
        type: new GraphQLNonNull(GraphQLInt),
        description:
          'The total count of the entire collection, regardless of "before", "after".',
        resolve: resolveTotalCount,
      },
      edges: {
        type: new GraphQLNonNull(
          new GraphQLList(
            new GraphQLNonNull(
              new GraphQLObjectType({
                name: `${typeName}Edge`,
                interfaces: [Edge],
                fields: {
                  node: { type: new GraphQLNonNull(nodeType) },
                  cursor: { type: new GraphQLNonNull(GraphQLString) },
                  score: { type: GraphQLFloat },
                  highlight: {
                    type: Highlights,
                    resolve: resolveHighlights,
                  },
                  ...extraEdgeFields,
                },
              })
            )
          )
        ),
        resolve: resolveEdges,
      },
      pageInfo: {
        type: new GraphQLNonNull(
          new GraphQLObjectType({
            name: `${typeName}PageInfo`,
            interfaces: [PageInfo],
            fields: {
              lastCursor: {
                type: GraphQLString,
                resolve: resolveLastCursor,
              },
              firstCursor: {
                type: GraphQLString,
                resolve: resolveFirstCursor,
              },
            },
          })
        ),
        resolve: (params) => params,
      },
    }),
  });
}

/**
 * @param {{status: T}[]} entriesWithStatus - list of objects with "status" field
 * @param {T[]} statuses - list of status to keep
 * @returns {Object[]}
 */
export function filterByStatuses(entriesWithStatus, statuses) {
  return entriesWithStatus
    .filter(Boolean) // Ensure no null inside
    .filter(({ status }) => statuses.includes(status));
}

export const DEFAULT_ARTICLE_STATUSES = ['NORMAL'];
export const DEFAULT_ARTICLE_REPLY_STATUSES = ['NORMAL'];
export const DEFAULT_ARTICLE_CATEGORY_STATUSES = ['NORMAL'];
export const DEFAULT_REPLY_REQUEST_STATUSES = ['NORMAL'];
export const DEFAULT_ARTICLE_REPLY_FEEDBACK_STATUSES = ['NORMAL'];

/**
 * @param {string} pluralEntityName - the name to display on argument description
 * @returns {object} GraphQL args for common list filters
 */
export function createCommonListFilter(pluralEntityName) {
  return {
    appId: {
      type: GraphQLString,
      description: `Show only ${pluralEntityName} created by a specific app.`,
    },
    userId: {
      type: GraphQLString,
      description: `Show only ${pluralEntityName} created by the specific user.`,
    },
    userIds: {
      type: new GraphQLList(new GraphQLNonNull(GraphQLString)),
      description: `Show only ${pluralEntityName} created by the specified users.`,
    },
    createdAt: {
      type: timeRangeInput,
      description: `List only the ${pluralEntityName} that were created between the specific time range.`,
    },
    ids: {
      type: new GraphQLList(new GraphQLNonNull(GraphQLID)),
      description: `If given, only list out ${pluralEntityName} with specific IDs`,
    },
    selfOnly: {
      type: GraphQLBoolean,
      description: `Only list the ${pluralEntityName} created by the currently logged in user`,
    },
  };
}

/**
 * Attach (mutates) filterQueries with Elasticsearch query objects by args.filter in GraphQL resolver
 *
 * @param {Array<Object>} filterQueries - list of filter queries of Elasticsearch bool query
 * @param {object} filter - args.filter in resolver
 * @param {string} userId - userId for the currently logged in user
 * @param {string} appid - appId for the currently logged in user
 * @param {string?} fieldPrefix - If given, filters fields will be prefixed with the given string. Disables handling of `ids`.
 */
export function attachCommonListFilter(
  filterQueries,
  filter,
  userId,
  appId,
  fieldPrefix = ''
) {
  ['userId', 'appId'].forEach((field) => {
    if (!filter[field]) return;
    filterQueries.push({ term: { [`${fieldPrefix}${field}`]: filter[field] } });
  });

  if (filter.userIds) {
    filterQueries.push({ terms: { [`${fieldPrefix}userId`]: filter.userIds } });
  }

  if (filter.createdAt) {
    filterQueries.push({
      range: {
        [`${fieldPrefix}createdAt`]: getRangeFieldParamFromArithmeticExpression(
          filter.createdAt
        ),
      },
    });
  }

  if (!fieldPrefix && filter.ids) {
    filterQueries.push({ ids: { values: filter.ids } });
  }

  if (filter.selfOnly) {
    if (!userId) throw new Error('selfOnly can be set only after log in');
    filterQueries.push(
      { term: { [`${fieldPrefix}userId`]: userId } },
      { term: { [`${fieldPrefix}appId`]: appId } }
    );
  }
}

/**
 * Read a successful AI response of a given `type` and `docId`.
 * If not, it tries to wait for the latest (within 1min) loading AI response.
 * Returns null if there is no successful nor latest loading AI response.
 *
 * @param {object} param
 * @param {'AI_REPLY'} param.type
 * @param {string} param.docId
 * @returns {AIReponse | null}
 */
export async function getAIResponse({ type, docId }) {
  // Try reading successful AI response.
  //
  //
  for (;;) {
    // First, find latest successful airesponse. Return if found.
    //
    const {
      body: {
        hits: {
          hits: [successfulAiResponse],
        },
      },
    } = await client.search({
      index: 'airesponses',
      type: 'doc',
      body: {
        query: {
          bool: {
            must: [
              { term: { type } },
              { term: { docId } },
              { term: { status: 'SUCCESS' } },
            ],
          },
        },
        sort: {
          createdAt: 'desc',
        },
        size: 1,
      },
    });

    if (successfulAiResponse) {
      return {
        id: successfulAiResponse._id,
        ...successfulAiResponse._source,
      };
    }

    // If no successful AI responses, find loading responses created within 1 min.
    //
    const {
      body: { count },
    } = await client.count({
      index: 'airesponses',
      type: 'doc',
      body: {
        query: {
          bool: {
            must: [
              { term: { type } },
              { term: { docId } },
              { term: { status: 'LOADING' } },
              {
                // loading document created within 1 min
                range: {
                  createdAt: {
                    gte: 'now-1m',
                  },
                },
              },
            ],
          },
        },
      },
    });

    // No AI response available now, break the loop
    //
    if (count === 0) {
      break;
    }

    // Wait a bit to search for successful AI response again.
    // If there are any loading AI response becomes successful during the wait,
    // it will be picked up when the loop is re-entered.
    await delayForMs(1000);
  }

  // Nothing is found
  return null;
}

/**
 * Creates a loading AI Response.
 * Returns an updater function that can be used to record real AI response.
 *
 *
 * @param {object} loadingResponseBody
 * @param {string} loadingResponseBody.request
 * @param {string} loadingResponseBody.type
 * @param {string} loadingResponseBody.docId
 * @param {object} loadingResponseBody.user
 *
 * @returns {(responseBody) => Promise<AIResponse>} updater function that updates the created AI
 *   response and returns the updated result
 */
export function createAIResponse({ user, ...loadingResponseBody }) {
  const newResponse = {
    userId: user.id,
    appId: user.appId,
    status: 'LOADING',
    createdAt: new Date(),
    ...loadingResponseBody,
  };

  // Resolves to loading AI Response.
  const newResponseIdPromise = client
    .index({
      index: 'airesponses',
      type: 'doc',
      body: newResponse,
    })
    .then(({ body: { result, _id } }) => {
      /* istanbul ignore if */
      if (result !== 'created') {
        throw new Error(`Cannot create AI response: ${result}`);
      }
      return _id;
    });

  // Update using aiResponse._id according to apiResult
  async function update(responseBody) {
    const aiResponseId = await newResponseIdPromise;

    const {
      body: {
        get: { _source },
      },
    } = await client.update({
      index: 'airesponses',
      type: 'doc',
      id: aiResponseId,
      _source: true,
      body: {
        doc: {
          updatedAt: new Date(),
          ...responseBody,
        },
      },
    });

    return {
      id: aiResponseId,
      ..._source,
    };
  }

  return update;
}

const imageAnnotator = new ImageAnnotatorClient();
const OCR_CONFIDENCE_THRESHOLD = 0.75;

/**
 * @param {ITextAnnotation} fullTextAnnotation - The fullTextAnnotation returned by client.documentTextDetection
 * @returns {string} The extracted text that is comprised of paragraphs passing OCR_CONFIDENCE_THRESHOLD
 */
function extractTextFromFullTextAnnotation(fullTextAnnotation) {
  const {
    pages: [{ blocks }],
  } = fullTextAnnotation;

  // Hierarchy described in https://cloud.google.com/vision/docs/fulltext-annotations#annotating_an_image_using_document_text_ocr
  //
  return blocks
    .flatMap(({ paragraphs }) =>
      paragraphs
        .filter(({ confidence }) => confidence >= OCR_CONFIDENCE_THRESHOLD)
        .flatMap(({ words }) =>
          words.flatMap(({ symbols }) =>
            symbols.map(({ text, property }) => {
              if (!property || !property.detectedBreak) return text;

              // Word break type described in
              // http://googleapis.github.io/googleapis/java/grpc-google-cloud-vision-v1/0.1.5/apidocs/com/google/cloud/vision/v1/TextAnnotation.DetectedBreak.BreakType.html#UNKNOWN
              const breakStr = [
                'EOL_SURE_SPACE',
                'HYPHEN',
                'LINE_BREAK',
              ].includes(property.detectedBreak.type)
                ? '\n'
                : ' ';
              return property.detectedBreak.isPrefix
                ? `${breakStr}${text}`
                : `${text}${breakStr}`;
            })
          )
        )
    )
    .join('');
}

/**
 * @param {object} queryInfo - contains type and media entry ID of contents after fileUrl
 * @param {string} fileUrl - the audio, image or video file to process
 * @param {object} user - the user who requested the transcription
 */
export async function createTranscript(queryInfo, fileUrl, user) {
  if (!user) throw new Error('[createTranscript] user is required');

  const update = createAIResponse({
    user,
    type: 'TRANSCRIPT',
    docId: queryInfo.id,
  });

  try {
    switch (queryInfo.type) {
      case 'image': {
        const [{ fullTextAnnotation }] =
          await imageAnnotator.documentTextDetection(fileUrl);

        console.log('[createTranscript]', queryInfo.id, fullTextAnnotation);

        // This should not happen, but just in case
        //
        if (
          !fullTextAnnotation ||
          !fullTextAnnotation.pages ||
          fullTextAnnotation.pages.length === 0
        ) {
          return update({
            status: 'SUCCESS',
            // No text detected
            text: '',
          });
        }

        return update({
          status: 'SUCCESS',
          // Write '' if no text detected
          text: extractTextFromFullTextAnnotation(fullTextAnnotation),
        });
      }

      case 'video':
      case 'audio': {
        const fileResp = await fetch(fileUrl);

        // Ref: https://github.com/openai/openai-node/issues/77#issuecomment-1500899486
        const audio = ffmpeg(fileResp.body).noVideo().format('mp3').pipe();

        const data = await openai.audio.transcriptions.create({
          // Ref: https://github.com/openai/openai-node/issues/77#issuecomment-2265072410
          file: await toFile(audio, 'file.mp3', { type: 'audio/mp3' }),
          model: 'whisper-1',
          prompt: '接下來，是一則在網際網路上傳播的影片的逐字稿。內容如下：',
          response_format: 'verbose_json',
          temperature: 0,
        });

        // Remove tokens keep only useful fields
        const dataToLog = data.segments.map(
          ({
            start,
            end,
            seek,
            text,
            avg_logprob,
            compression_ratio,
            no_speech_prob,
          }) => ({
            start,
            end,
            seek,
            text,
            avg_logprob,
            compression_ratio,
            no_speech_prob,
          })
        );

        console.log('[createTranscript]', queryInfo.id, dataToLog);

        return update({
          status: 'SUCCESS',
          text: dataToLog
            .reduce((allText, segment, idx) => {
              // Ignore segments with identical text & prob with previous segment.
              // This is apparently hallucination.
              if (idx > 0) {
                const prevSegment = dataToLog[idx - 1];

                if (
                  prevSegment.text === segment.text &&
                  prevSegment.avg_logprob === segment.avg_logprob
                ) {
                  return allText;
                }
              }

              return allText + '\n' + segment.text;
            }, '')
            .trim(),
        });
      }
      default:
        throw new Error(`Type ${queryInfo.type} not supported`);
    }
  } catch (e) {
    console.error('[createTranscript]', e);
    return update({
      status: 'ERROR',
      text: e.toString(),
    });
  }
}
