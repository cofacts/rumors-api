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

import Connection from './interfaces/Connection';
import Edge from './interfaces/Edge';
import PageInfo from './interfaces/PageInfo';
import Highlights from './models/Highlights';
import client from 'util/client';
import { imageHash } from 'image-hash';

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
    .map(item => {
      const field = Object.keys(item)[0];
      const order = item[field];
      const defaultFieldFn = o => ({ [field]: { order: o } });

      return (fieldFnMap[field] || defaultFieldFn)(order);
    })
    .concat({ _id: { order: 'desc' } }); // enforce at least 1 sort order for pagination
}

// sort: [{fieldName: {order: 'desc'}}, {fieldName2: {order: 'desc'}}, ...]
// This utility function reverts the direction of each sort params.
//
function reverseSortArgs(sort) {
  if (!sort) return undefined;
  return sort.map(item => {
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
  return (await client.count({
    ...searchContext,
    body: {
      ...searchContext.body,

      // totalCount cannot support these
      sort: undefined,
      track_scores: undefined,
    },
  })).body.count;
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
  const lastNode = (await loaders.searchResultLoader.load({
    ...searchContext,
    body: {
      ...searchContext.body,
      sort: reverseSortArgs(searchContext.body.sort),
    },
    size: 1,
  }))[0];

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
  const firstNode = (await loaders.searchResultLoader.load({
    ...searchContext,
    size: 1,
  }))[0];

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
        resolve: params => params,
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
  return entriesWithStatus.filter(({ status }) => statuses.includes(status));
}

/**
 * @param {Buffer} fileBuffer
 * @param {ArticleTypeEnum} type The article type
 * @returns {string} The hash for identifying if two files are similar
 */
export async function getMediaFileHash(fileBuffer, type) {
  let hash = '';
  if (type === 'IMAGE') {
    hash = await new Promise((resolve, reject) => {
      imageHash({ data: fileBuffer }, 16, true, (error, data) => {
        if (error) {
          console.error(error);
          reject(error);
        } else {
          resolve(data);
        }
      });
    });
  }

  return hash;
}

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
 */
export function attachCommonListFilter(filterQueries, filter, userId, appId) {
  ['userId', 'appId'].forEach(field => {
    if (!filter[field]) return;
    filterQueries.push({ term: { [field]: filter[field] } });
  });

  if (filter.createdAt) {
    filterQueries.push({
      range: {
        createdAt: getRangeFieldParamFromArithmeticExpression(filter.createdAt),
      },
    });
  }

  if (filter.ids) {
    filterQueries.push({ ids: { values: filter.ids } });
  }

  if (filter.selfOnly) {
    if (!userId) throw new Error('selfOnly can be set only after log in');
    filterQueries.push({ term: { userId } }, { term: { appId } });
  }
}
