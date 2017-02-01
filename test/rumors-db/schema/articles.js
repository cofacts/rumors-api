export default {
  _all: { enabled: false },
  properties: {
    replyIds: { type: 'keyword' },
    text: { type: 'text', analyzer: 'cjk' },
    createdAt: { type: 'date' },
    updatedAt: { type: 'date' },

    // Where this article is posted.
    // An article may be seen in multiple places, like blogs, FB posts or LINE messages.
    // "references" field should be a list of such occurences.
    //
    references: {
      properties: {
        type: { type: 'keyword' }, // LINE, URL, etc
        permalink: { type: 'keyword' }, // permalink to the resource if applicable
        createdAt: { type: 'date' },
      },
    },
  },
};
