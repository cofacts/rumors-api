import {
  GraphQLString,
  GraphQLList,
} from 'graphql';
import client from 'util/client';

import Article from 'graphql/models/Article';
import { ArticleReferenceInput } from 'graphql/models/ArticleReference';

export default {
  type: Article,
  description: 'Create an article, or update its references',
  args: {
    id: {
      type: GraphQLString,
      description: 'If no id is given, a new article is created with given params. Otherwise, update the existing article.',
    },
    text: { type: GraphQLString },
    references: {
      type: new GraphQLList(ArticleReferenceInput),
      description: 'When updating, createdAt will be automatically inserted.',
    },
  },
  async resolve(rootValue, { id, text, references }, { loaders }) {
    // If ID does not exist (i.e. creating new rumor),
    // throw an error if any of its data is missing
    //
    if (!id && (!text || !references || !references.length)) {
      throw new Error('When id is not given (creating new Articles), text & references are required.');
    }

    // TODO: If exists a rumor that has same ID or text, just merge the change of replyIds.
    // Otherwise, create a new rumor document.

    const { created, _id: newId, result } = await client.index({
      index: 'articles',
      type: 'basic',
      body: {
        replyIds: [],
        text,
        createdAt: new Date(),
        updatedAt: new Date(),
        references,
      },
    });

    if (!created) {
      throw new Error(`Data insertion error: ${result}`);
    }

    return loaders.docLoader.load(`/articles/basic/${newId}`);
  },
};
