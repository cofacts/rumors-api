import { GraphQLInterfaceType, GraphQLString } from 'graphql';

const PageInfo = new GraphQLInterfaceType({
  name: 'PageInfo',
  description:
    'PageInfo in Connection. Modeled after GraphQL connection model.',
  fields: {
    firstCursor: {
      description:
        'The cursor pointing to the first node of the entire collection, regardless of "before" and "after". Can be used to determine if is in the last page. Null when the collection is empty.',
      type: GraphQLString,
    },
    lastCursor: {
      description:
        'The cursor pointing to the last node of the entire collection, regardless of "before" and "after". Can be used to determine if is in the last page. Null when the collection is empty.',
      type: GraphQLString,
    },
  },
});

export default PageInfo;
