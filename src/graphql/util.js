import {
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLEnumType,
} from 'graphql';

// https://www.graph.cool/docs/tutorials/designing-powerful-apis-with-graphql-query-parameters-aing7uech3
//

export function getArithmeticExpressionType(typeName, argType) {
  return new GraphQLInputObjectType({
    name: typeName,
    fields: {
      LT: { type: argType },
      LTE: { type: argType },
      GT: { type: argType },
      GTE: { type: argType },
      EQ: { type: argType },
    },
  });
}

/*
  input expressionMap = {
    fieldName: {EQ: xxx},
    fieldName2: {LTE: xxx, GT: xxx},
    ...
  }

  returns {
    fieldName: xxx,
    fieldName2: {lte: xxx, gt: xxx},
    ...
  }
*/
export function getRangeFilter(expressionMap) {
  if (!expressionMap) return null;

  return Object.keys(expressionMap).reduce((map, fieldName) => {
    if (typeof expressionMap[fieldName].EQ !== 'undefined') {
      return { ...map, [fieldName]: expressionMap[fieldName].EQ };
    }

    return {
      ...map,
      [fieldName]: Object.keys(expressionMap[fieldName]).reduce(
        (agg, operand) => ({ ...agg, [operand.toLowerCase()]: expressionMap[fieldName][operand] }),
        {},
      ),
    };
  }, {});
}

export function getFilterableType(typeName, args) {
  const filterType = new GraphQLInputObjectType({
    name: typeName,
    fields: () => ({
      ...args,
      // AND: { type: new GraphQLList(filterType) },
      // OR: { type: new GraphQLList(filterType) },
    }),
  });
  return filterType;
}

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

export function getSearchArgs({ first = 10, skip = 0 }) {
  return {
    from: skip,
    size: first,
  };
}

// http://stackoverflow.com/a/36299930/1582110
//
export function getBody({ filter, orderBy = [] }, query, otherBodyParams = {}) {
  const args = otherBodyParams;
  if (orderBy.length) {
    // https://www.elastic.co/guide/en/elasticsearch/reference/5.1/search-request-sort.html#_sort_values
    //
    args.sort = orderBy.map(({ field, order }) => ({ [field]: { order: order.toLowerCase() } }));
  }

  if (!query) {
    throw new Error('getBody should have both filter and query specified.');
  }
  if (!filter) {
    return { query, ...args };
  }
  return {
    query: {
      bool: {
        must: query,
        filter: getRangeFilter(filter),
      },
    },
    ...args,
  };
}
