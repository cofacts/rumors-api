// A request from users for an article to be replied.
// (articleId, userId, from) should be unique throughout DB.
//
export default {
  _all: { enabled: false },
  properties: {
    articleId: { type: 'keyword' },
    userId: { type: 'keyword' },
    from: { type: 'keyword' },
    createdAt: { type: 'date' },
    updatedAt: { type: 'date' },
  },
};
