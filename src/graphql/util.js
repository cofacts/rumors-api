import {
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLEnumType,
} from 'graphql';

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
  skip: {
    type: GraphQLInt,
    description: 'Skips the first <skip> results',
    defaultValue: 0,
  },
};

export function getSortArgs(orderBy) {
  return orderBy.map(({ field, order }) => ({ [field]: { order: order.toLowerCase() } }));
}
