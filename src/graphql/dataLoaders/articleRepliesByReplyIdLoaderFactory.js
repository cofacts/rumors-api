import DataLoader from 'dataloader';
import client from 'util/client';

export default () =>
  new DataLoader(async (replyIds) => {
    const body = [];

    replyIds.forEach((id) => {
      body.push({ index: 'articles', type: 'doc' });

      body.push({
        query: {
          nested: {
            path: 'articleReplies',
            query: {
              term: {
                'articleReplies.replyId': id,
              },
            },
          },
        },
      });
    });

    return (
      await client.msearch({
        body,
      })
    ).body.responses.map(({ hits }, idx) => {
      if (!hits || !hits.hits) return [];

      const replyId = replyIds[idx];
      return hits.hits.map(({ _id, _source: { articleReplies } }) => {
        // Find corresponding articleReply and insert articleId
        //
        const articleReply = articleReplies.find(
          (articleReply) => articleReply.replyId === replyId
        );
        articleReply.articleId = _id;
        return articleReply;
      });
    });
  });
