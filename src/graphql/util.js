import {
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLEnumType,
  GraphQLFloat,
} from 'graphql';

import client from 'util/client';

// Deprecated.
//
export function scoredDocFactory(name, type) {
  return new GraphQLObjectType({
    name,
    fields: {
      score: { type: GraphQLFloat },
      doc: { type },
    },
  });
}

// https://www.graph.cool/docs/tutorials/designing-powerful-apis-with-graphql-query-parameters-aing7uech3
//
// Filtering args definition & parsing
//

export function getArithmeticExpressionType(typeName, argType) {
  return new GraphQLInputObjectType({
    name: typeName,
    fields: {
      LT: { type: argType },
      GT: { type: argType },
      EQ: { type: argType },
    },
  });
}

export function getOperatorAndOperand(expression) {
  if (typeof expression.EQ !== 'undefined') {
    return { operator: '==', operand: expression.EQ };
  } else if (typeof expression.LT !== 'undefined') {
    return { operator: '<', operand: expression.LT };
  } else if (typeof expression.GT !== 'undefined') {
    return { operator: '>', operand: expression.GT };
  }
  return {};
}

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

export function createSortType(typeName, filterableFieldNames = []) {
  return new GraphQLList(new GraphQLInputObjectType({
    name: typeName,
    description: 'An entry of orderBy argument. Specifies field name and the sort order. Only one field name is allowd per entry.',
    fields: filterableFieldNames.reduce(
      (fields, fieldName) => ({ ...fields, [fieldName]: { type: SortOrderEnum } }),
      {},
    ),
  }));
}

export const pagingArgs = {
  first: {
    type: GraphQLInt,
    description: 'Returns only first <first> results',
    defaultValue: 10,
  },
  after: {
    type: GraphQLString,
    description: 'Specify a cursor, returns results after this cursor. cannot be used with "before".',
  },
  before: {
    type: GraphQLString,
    description: 'Specify a cursor, returns results before this cursor. cannot be used with "after".',
  },
};

export function getSortArgs(orderBy, fieldFnMap = {}) {
  return orderBy
    .map((item) => {
      const field = Object.keys(item)[0];
      const order = item[field];
      const defaultFieldFn = o => ({ [field]: { order: o } });

      return (fieldFnMap[field] || defaultFieldFn)(order);
    }).concat({ _uid: { order: 'desc' } }); // enforce at least 1 sort order for pagination
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

// All search
//
export function createConnectionType(
  typeName,
  nodeType,
  {
    // Default resolvers
    //
    // eslint-disable-next-line no-unused-vars
    resolveTotalCount = async ({ first, before, after, ...searchContext }) =>
      // .count() does not accept sort & size
      (await client.count({
        ...searchContext,
        body: {
          ...searchContext.body,
          sort: undefined,
        },
      })).count,

    resolveEdges = async ({ first, before, after, ...searchContext }, args, { loaders }) => {
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
          sort: before ? reverseSortArgs(searchContext.body.sort) : searchContext.body.sort,
        },
      });

      if (before) {
        nodes.reverse();
      }

      return nodes.map(({ _score: score, _cursor, ...node }) => ({
        node, cursor: getCursor(_cursor), score,
      }));
    },

    // eslint-disable-next-line no-unused-vars
    resolveLastCursor = async ({ first, before, after, ...searchContext }, args, { loaders }) => {
      const lastNode = (await loaders.searchResultLoader.load({
        ...searchContext,
        body: {
          ...searchContext.body,
          sort: reverseSortArgs(searchContext.body.sort),
        },
        size: 1,
      }))[0];

      return getCursor(lastNode._cursor);
    },

    // eslint-disable-next-line no-unused-vars
    resolveFirstCursor = async ({ first, before, after, ...searchContext }, args, { loaders }) => {
      const firstNode = (await loaders.searchResultLoader.load({
        ...searchContext,
        size: 1,
      }))[0];

      return getCursor(firstNode._cursor);
    },

  } = {},
) {
  return new GraphQLObjectType({
    name: typeName,
    fields: {
      totalCount: {
        type: GraphQLInt,
        description: 'The total count of the entire collection, regardless of "before", "after".',
        resolve: resolveTotalCount,
      },
      edges: {
        type: new GraphQLList(new GraphQLObjectType({
          name: `${typeName}Edges`,
          fields: {
            node: { type: nodeType },
            cursor: { type: GraphQLString },
            score: { type: GraphQLFloat },
          },
        })),
        resolve: resolveEdges,
      },
      pageInfo: {
        type: new GraphQLObjectType({
          name: `${typeName}PageInfo`,
          fields: {
            lastCursor: {
              type: GraphQLString,
              description: 'The cursor pointing to the last node of the entire collection, regardless of "before" and "after". Can be used to determine if is in the last page.',
              resolve: resolveLastCursor,
            },
            firstCursor: {
              type: GraphQLString,
              description: 'The cursor pointing to the first node of the entire collection, regardless of "before" and "after". Can be used to determine if is in first page.',
              resolve: resolveFirstCursor,
            },
          },
        }),
        resolve: params => params,
      },
    },
  });
}

export function assertUser({ userId, from }) {
  if (!userId) {
    const err = new Error('userId is not set via query string.');
    err.status = 403; err.expose = true; throw err;
  }

  if (userId && !from) {
    const err = new Error('userId is set, but x-app-id or x-app-secret is not set accordingly.');
    err.status = 403; err.expose = true; throw err;
  }
}
