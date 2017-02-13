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
    return { operator: '=', operand: expression.EQ };
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
    description: 'Returns result after this cursor',
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

// Export for custom resolveEdges() and resolvePageInfo()
//
export function getCursor(cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString('base64');
}

export function getSearchAfterFromCursor(cursor) {
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

    resolveTotalCount = async searchContext =>
      // .count() does not accept sort & size
       (await client.count({
         ...searchContext,
         body: {
           ...searchContext.body,
           size: undefined,
           sort: undefined,
         },
       })).count,

    resolveEdges = async (searchContext, args, { loaders }) => {
      const nodes = await loaders.searchResultLoader.load(searchContext);
      return nodes.map(({ _score: score, _cursor, ...node }) => ({
        node, cursor: getCursor(_cursor), score,
      }));
    },

    resolvePageInfo = async (searchContext, args, { loaders }) => {
      // sort: [{fieldName: {order: 'desc'}}, {fieldName2: {order: 'desc'}}, ...]
      //
      const newSort = searchContext.body.sort.map((item) => {
        const field = Object.keys(item)[0];
        const order = item[field].order === 'desc' ? 'asc' : 'desc';
        return {
          [field]: {
            ...item[field],
            order,
          },
        };
      });

      const lastNode = (await loaders.searchResultLoader.load({
        ...searchContext,
        body: {
          ...searchContext.body,
          sort: newSort,
        },
        size: 1,
      }))[0];

      return {
        lastCursor: getCursor(lastNode._cursor),
      };
    },
  } = {},
) {
  return new GraphQLObjectType({
    name: typeName,
    fields: {
      totalCount: {
        type: GraphQLInt,
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
            lastCursor: { type: GraphQLString },
          },
        }),
        resolve: resolvePageInfo,
      },
    },
  });
}
