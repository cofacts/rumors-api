export default {
  '/articles/doc/createReplyRequestTest1': {
    text: 'foofoo',
    replyRequestCount: 1,
    lastRequestedAt: new Date(0).toISOString(),
  },

  '/articles/doc/createReplyRequestConcurrent': {
    text: 'concurrent reply requests',
    replyRequestCount: 0,
    lastRequestedAt: new Date(0).toISOString(),
  },
};
