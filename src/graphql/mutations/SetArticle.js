import {
  GraphQLString,
  GraphQLList,
} from 'graphql';

import Article from 'graphql/models/Article';
import { ArticleReferenceInput } from 'graphql/models/ArticleReference';

export default {
  type: Article,
  description: 'Create or update an article',
  args: {
    id: {
      type: GraphQLString,
      description: 'If no id is given, a new article is created with given params. Otherwise, update the existing article.',
    },
    text: { type: GraphQLString },
    replyIds: { type: new GraphQLList(GraphQLString) },
    references: {
      type: new GraphQLList(ArticleReferenceInput),
      description: 'When updating, createdAt will be automatically inserted.',
    },
  },
  async resolve(rootValue, { id, text, replyIds, references }, { loaders }) {
    // TODO: If ID does not exist (i.e. creating new rumor) but text is empty,
    // throw an error.
    //

    // TODO: If exists a rumor that has same ID or text, just merge the change of replyIds.
    // Otherwise, create a new rumor document.
    const rumor = loaders.docLoader.load(`/rumors/basic/${id}`);

    return rumor;
  },
};
