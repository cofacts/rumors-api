export default {
  '/articles/doc/reported-article': {
    text: '我優秀的斐陶斐大姐是中央銀行退休，她剛看了一下，上網登記除要身份証號碼，還要健保卡號，健保卡號很少會要求提供，被洩漏機會相對少，但這次登記要一次完整的登入雙證件的號碼有點讓人擔憂，連同銀行帳號一併洩漏後果可怕！ ',
    createdAt: '2020-01-01T00:00:00.000Z',
  },
  '/articles/doc/ai-replied-article': {
    text: 'foo',
    createdAt: '2020-01-01T00:00:00.000Z',
  },
  '/articles/doc/some-article': {
    text: 'Some article',
    createdAt: '2020-01-01T00:00:00.000Z',
  },
  '/articles/doc/with-resolved-urls': {
    text: 'https://foo.com https://foo.com https://bar.com https://bar.com',
    createdAt: '2020-01-01T00:00:00.000Z',
    hyperlinks: [
      { url: 'https://foo.com', title: 'Foo-title!', summary: 'Foo summary' },
      // Simulate the edge case when there are multiple different entries for 1 URL (should not happen, though...)
      { url: 'https://foo.com', title: '', summary: '' },
      // Simulate the case when URL resolution is failed
      { url: 'https://bar.com', title: '', summary: '' },
      { url: 'https://bar.com', title: '', summary: '' },
    ],
  },
  '/articles/doc/with-no-resolved-urls': {
    text: 'https://foo.com\nhttps://bar.com',
    createdAt: '2020-01-01T00:00:00.000Z',
    hyperlinks: [
      { url: 'https://foo.com', title: '', summary: '' },
      { url: 'https://bar.com', title: '', summary: '' },
    ],
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

/** @type {import('openai').ChatCompletion} */
export const SUCCESS_OPENAI_RESP = {
  id: 'chatcmpl-some-id',
  object: 'chat.completion',
  created: 1679847676,
  model: 'gpt-3.5-turbo-0301',
  usage: {
    prompt_tokens: 343,
    completion_tokens: 64,
    total_tokens: 407,
  },
  choices: [
    {
      message: {
        role: 'assistant',
        content:
          '閱聽人應該確保登記網站的正確性和安全性，並記得定期更改密碼和密鑰，以保護自己的資訊安全。',
      },
      finish_reason: 'stop',
      index: 0,
    },
  ],
};
