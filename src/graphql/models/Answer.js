import {
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';

import Rumor from './Rumor';

export default new GraphQLObjectType({
  name: 'Answer',
  fields: () => ({
    id: {type: GraphQLString},
    text: {type: GraphQLString},
    rumors: {
      type: Rumor,
      resolve: ({id}, args, {loaders}) =>
        loaders.rumorsByAnswerIdLoader.load(id)
    }
  })
});
