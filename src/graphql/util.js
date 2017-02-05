import {
  GraphQLInputObjectType,
  GraphQLObjectType,
  GraphQLString,
  GraphQLInt,
  GraphQLList,
  GraphQLEnumType,
} from 'graphql';

import client from 'util/client';

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

export function getSortArgs(orderBy) {
  return orderBy
    .map(({ field, order }) => `${field}:${order}`)
    .concat('_uid:desc'); // enforce at least 1 sort order for pagination
}

export function getCursor(sortArr, node) {
  return Buffer.from(JSON.stringify(sortArr.map((key) => {
    const fieldName = key.slice(0, key.lastIndexOf(':'));
    if (fieldName === '_uid') return `basic#${node.id}`;

    return node[fieldName];
  }))).toString('base64');
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
    // .count() does not acceot sort & size
    // eslint-disable-next-line
    resolveTotalCount = async ({ sort, size, ...searchContext }) =>
      (await client.count(searchContext)).count,
    resolveEdges = () => {},
    resolvePageInfo = () => {},
  },
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
