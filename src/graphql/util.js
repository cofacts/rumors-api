import {
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLEnumType,
  GraphQLFloat,
} from 'graphql';

import client, { processMeta } from 'util/client';

import getIn from 'util/getInFactory';

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

export function getFilterableType(typeName, args) {
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
    ASC: { value: 'ASC' },
    DESC: { value: 'DESC' },
  },
});

export function getSortableType(typeName, filterableFieldNames = [], defaultValue = null) {
  return new GraphQLList(new GraphQLInputObjectType({
    name: typeName,
    fields: {
      field: {
        type: new GraphQLEnumType({
          name: `${typeName}Enum`,
          values: filterableFieldNames.reduce(
            (values, field) => ({ ...values, [field]: { value: field } }), {},
          ),
        }),
        defaultValue: defaultValue === null ? filterableFieldNames[0] : defaultValue,
      },
      order: {
        type: SortOrderEnum,
        defaultValue: 'DESC',
      },
    },
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

export function getSortArgs(orderBy, fieldMap = {}) {
  return orderBy
    .map(({ field, order }) => fieldMap[field] || ({ [field]: { order: order.toLowerCase() } }))
    .concat({ _uid: { order: 'desc' } }); // enforce at least 1 sort order for pagination
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
export function getPagedType(
  typeName,
  nodeType,
  {
    // Default resolvers
    //

    resolveTotalCount = async searchContext =>
      // .count() does not accept sort & size
       (await client.count({
         ...searchContext,
         size: undefined,
         body: {
           ...searchContext.body,
           sort: undefined,
         },
       })).count,

    resolveEdges = async (searchContext) => {
      const nodes = getIn(await client.search(searchContext))(['hits', 'hits'], []).map(processMeta);
      return nodes.map(({ _score: score, _cursor, ...node }) => ({
        node, cursor: getCursor(_cursor), score,
      }));
    },

    resolvePageInfo = async (searchContext) => {
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

      const lastNode = getIn(await client.search({
        ...searchContext,
        body: {
          ...searchContext.body,
          sort: newSort,
        },
        size: 1,
      }))(['hits', 'hits'], []).map(processMeta)[0];

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
