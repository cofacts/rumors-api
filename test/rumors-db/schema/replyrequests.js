// A request from users for an article to be replied.
// (articleId, userId, from) should be unique throughout DB.
//
export default {
  _all: { enabled: false },
  properties: {
    articleId: { type: 'keyword' },

    // only recognizable for within a client.
    //
    userId: { type: 'keyword' },

    // The user submits the request with which client.
    // Should be something like API-key in the future.
    from: { type: 'keyword' },

    createdAt: { type: 'date' },
    updatedAt: { type: 'date' },
  },
};
