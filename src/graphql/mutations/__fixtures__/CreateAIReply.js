export default {
  '/articles/doc/reported-article': {
    text:
      '我優秀的斐陶斐大姐是中央銀行退休，她剛看了一下，上網登記除要身份証號碼，還要健保卡號，健保卡號很少會要求提供，被洩漏機會相對少，但這次登記要一次完整的登入雙證件的號碼有點讓人擔憂，連同銀行帳號一併洩漏後果可怕！ ',
  },
  '/articles/doc/ai-replied-article': {
    text: 'foo',
  },
  '/articles/doc/some-article': {
    text: 'Some article',
  },
  '/airesponses/doc/ai-reply-old': {
    docId: 'ai-replied-article',
    type: 'AI_REPLY',
    status: 'SUCCESS',
    createdAt: '2020-01-01T00:00:00.000Z',
  },
  '/airesponses/doc/ai-reply-latest': {
    docId: 'ai-replied-article',
    type: 'AI_REPLY',
    status: 'SUCCESS',
    createdAt: '2020-01-02T00:00:00.000Z',
  },
  '/airesponses/doc/expired-loading': {
    docId: 'ai-replied-article',
    type: 'AI_REPLY',
    status: 'LOADING',
    createdAt: '2020-01-04T00:00:00.000Z', // Should have expired by the time the tests are run.
  },
  '/airesponses/doc/loading': {
    docId: 'some-article',
    type: 'AI_REPLY',
    status: 'LOADING',
    createdAt: '2020-01-01T00:00:00.000Z', // Will be filled during test setup
  },
};
