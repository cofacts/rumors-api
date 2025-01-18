jest.mock('util/openai', () => ({
  __esModule: true,
  default: () => ({
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  }),
}));
import MockDate from 'mockdate';
import getOpenAI from 'util/openai';
import delayForMs from 'util/delayForMs';

import gql from 'util/GraphQL';

import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import fixtures, { SUCCESS_OPENAI_RESP } from '../__fixtures__/CreateAIReply';
import client from 'util/client';

describe('CreateAIReply', () => {
  beforeAll(async () => {
    await loadFixtures(fixtures);
  });
  afterAll(async () => {
    await unloadFixtures(fixtures);
  });
  afterEach(() => {
    getOpenAI().chat.completions.create.mockReset();
  });

  it('throws when specified article does not exist', async () => {
    const { errors } = await gql`
      mutation {
        CreateAIReply(articleId: "does-not-exist") {
          id
        }
      }
    `({}, { user: { id: 'test', appId: 'test' } });

    expect(errors).toMatchInlineSnapshot(`
      Array [
        [GraphQLError: Article does-not-exist does not exist.],
      ]
    `);
  });

  it('returns latest successful AI reply if one already exists', async () => {
    const { data, errors } = await gql`
      mutation ($articleId: String!) {
        CreateAIReply(articleId: $articleId) {
          id
          status
        }
      }
    `(
      {
        articleId: 'ai-replied-article',
      },
      { user: { id: 'test', appId: 'test' } }
    );

    expect(errors).toBeUndefined();

    // Expect latest successful reply
    expect(data).toMatchInlineSnapshot(`
      Object {
        "CreateAIReply": Object {
          "id": "ai-reply-latest",
          "status": "SUCCESS",
        },
      }
    `);
  });

  it.only('returns new AI response', async () => {
    // Mocked ChatGPT success response
    //
    let resolveAPI;
    const mockFn = getOpenAI().chat.completions.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAPI = resolve;
        })
    );

    MockDate.set(1602288000000);

    const resp = gql`
      mutation ($articleId: String!) {
        CreateAIReply(articleId: $articleId) {
          id
          text
          status
          updatedAt
          usage {
            promptTokens
            completionTokens
            totalTokens
          }
        }
      }
    `(
      {
        articleId: 'reported-article',
      },
      { user: { id: 'test', appId: 'test' } }
    );

    await delayForMs(2000); // Wait a bit until airesponse is indexed

    const {
      body: {
        hits: { hits: loadingAIReplies },
      },
    } = await client.search({
      index: 'airesponses',
      type: 'doc',
      body: {
        query: {
          bool: {
            must: [
              { term: { type: 'AI_REPLY' } },
              { term: { docId: 'reported-article' } },
            ],
          },
        },
      },
    });

    // Expect we get a loading reply before API resolves.
    //
    expect(loadingAIReplies).toHaveLength(1);
    const {
      _id: dontcare, // eslint-disable-line no-unused-vars
      ...loadingAIReply
    } = loadingAIReplies[0]._source;
    expect(loadingAIReply).toMatchInlineSnapshot(`
      Object {
        "appId": "test",
        "createdAt": "2020-10-10T00:00:00.000Z",
        "docId": "reported-article",
        "request": "{\\"model\\":\\"gpt-3.5-turbo\\",\\"messages\\":[{\\"role\\":\\"system\\",\\"content\\":\\"現在是2020年（民國109年）10月。你是協助讀者進行媒體識讀的小幫手。你說話時總是使用台灣繁體中文。有讀者傳了一則網路訊息給你。這則訊息2020年1月就在網路上流傳。\\"},{\\"role\\":\\"user\\",\\"content\\":\\"我優秀的斐陶斐大姐是中央銀行退休，她剛看了一下，上網登記除要身份証號碼，還要健保卡號，健保卡號很少會要求提供，被洩漏機會相對少，但這次登記要一次完整的登入雙證件的號碼有點讓人擔憂，連同銀行帳號一併洩漏後果可怕！ \\"},{\\"role\\":\\"user\\",\\"content\\":\\"請問作為閱聽人，我應該注意這則訊息的哪些地方呢？請節錄訊息中需要特別留意或懷疑的地方，說明為何閱聽人需要注意它。請只就以上內文回應，不要編造。謝謝\\"}],\\"user\\":\\"test\\",\\"temperature\\":0}",
        "status": "LOADING",
        "type": "AI_REPLY",
        "userId": "test",
      }
    `);

    // Simulates API resolves
    //
    resolveAPI(SUCCESS_OPENAI_RESP);

    const { data, errors } = await resp;
    MockDate.reset();

    expect(errors).toBeUndefined();
    expect(mockFn).toHaveReturned();

    const {
      CreateAIReply: { id, ...aiReplyContent },
    } = data;

    expect(aiReplyContent).toMatchInlineSnapshot(`
      Object {
        "status": "SUCCESS",
        "text": "閱聽人應該確保登記網站的正確性和安全性，並記得定期更改密碼和密鑰，以保護自己的資訊安全。",
        "updatedAt": "2020-10-10T00:00:00.000Z",
        "usage": Object {
          "completionTokens": 64,
          "promptTokens": 343,
          "totalTokens": 407,
        },
      }
    `);

    // Cleanup
    await client.delete({
      index: 'airesponses',
      type: 'doc',
      id,
    });
  });

  it('waits for existing loading AI replies', async () => {
    // Prepare a recently loading AI reply.
    // Date cannot be mocked on NodeJS, because CreateAIReply calls Elasticsearch to calculate date.
    //
    await client.update({
      index: 'airesponses',
      type: 'doc',
      id: 'loading',
      body: {
        doc: {
          createdAt: new Date(),
        },
      },
      refresh: 'true',
    });

    let isAIReplyPromiseResolved = false;
    const createAIReplyPromise = gql`
      mutation ($articleId: String!) {
        CreateAIReply(articleId: $articleId) {
          id
          status
        }
      }
    `(
      {
        articleId: fixtures['/airesponses/doc/loading'].docId,
      },
      { user: { id: 'test', appId: 'test' } }
    ).then((ret) => {
      isAIReplyPromiseResolved = true;
      return ret;
    });

    // Wait for some time for the loop in CreateAIReply to repeat itself.
    // The AI reply promise should not resolve before the AI Reply turns "SUCCESS".
    delayForMs(2000);
    expect(isAIReplyPromiseResolved).toBe(false);

    // Simulate that the AI reply turns "SUCCESS" by another process
    //
    await client.update({
      index: 'airesponses',
      type: 'doc',
      id: 'loading',
      body: {
        doc: {
          status: 'SUCCESS',
          updatedAt: new Date(),
        },
      },
      refresh: 'true',
    });

    // Expect the promise to resolve to the successfully loaded AI reply
    //
    expect(await createAIReplyPromise).toMatchInlineSnapshot(`
      Object {
        "data": Object {
          "CreateAIReply": Object {
            "id": "loading",
            "status": "SUCCESS",
          },
        },
      }
    `);

    // Cleanup
    await resetFrom(fixtures, '/airesponses/doc/loading');
  });

  it('returns API error', async () => {
    // Mocked ChatGPT failed response, simulate API key error
    //
    const mockFn = getOpenAI().chat.completions.create.mockImplementationOnce(
      () => Promise.reject(new Error('Request failed with status code 401'))
    );

    const { data, errors } = await gql`
      mutation ($articleId: String!) {
        CreateAIReply(articleId: $articleId) {
          id
          status
          text
        }
      }
    `(
      {
        articleId: 'reported-article',
      },
      { user: { id: 'test', appId: 'test' } }
    );
    MockDate.reset();

    expect(mockFn).toHaveReturned();
    expect(errors).toBeUndefined;

    const {
      CreateAIReply: { id, ...aiReplyContent },
    } = data;

    // Should return an errored AI reply
    expect(aiReplyContent).toMatchInlineSnapshot(`
      Object {
        "status": "ERROR",
        "text": "Error: Request failed with status code 401",
      }
    `);

    // Cleanup
    await client.delete({
      index: 'airesponses',
      type: 'doc',
      id,
    });
  });

  it('replaces URL with hyperlink info', async () => {
    const mockFn = getOpenAI().chat.completions.create.mockImplementationOnce(
      async () => SUCCESS_OPENAI_RESP
    );

    MockDate.set(1602288000000);

    const {
      data: {
        CreateAIReply: { id },
      },
    } = await gql`
      mutation ($articleId: String!) {
        CreateAIReply(articleId: $articleId) {
          id
        }
      }
    `(
      {
        articleId: 'with-resolved-urls',
      },
      { user: { id: 'test', appId: 'test' } }
    );

    MockDate.reset();

    // Note the URLs being replaced in the message content
    //
    expect(mockFn.mock.calls).toMatchInlineSnapshot(`
      Array [
        Array [
          Object {
            "messages": Array [
              Object {
                "content": "現在是2020年（民國109年）10月。你是協助讀者進行媒體識讀的小幫手。你說話時總是使用台灣繁體中文。有讀者傳了一則網路訊息給你。這則訊息2020年1月就在網路上流傳。",
                "role": "system",
              },
              Object {
                "content": "[Foo-title! Foo summary](https://foo.com) [Foo-title! Foo summary](https://foo.com) https://bar.com https://bar.com",
                "role": "user",
              },
              Object {
                "content": "請問作為閱聽人，我應該注意這則訊息的哪些地方呢？請節錄訊息中需要特別留意或懷疑的地方，說明為何閱聽人需要注意它。請只就以上內文回應，不要編造。謝謝",
                "role": "user",
              },
            ],
            "model": "gpt-3.5-turbo",
            "temperature": 0,
            "user": "test",
          },
        ],
      ]
    `);

    // Cleanup
    await client.delete({
      index: 'airesponses',
      type: 'doc',
      id,
    });
  });

  it('returns null if all URL scrapping are failed', async () => {
    const {
      data: { CreateAIReply },
    } = await gql`
      mutation ($articleId: String!) {
        CreateAIReply(articleId: $articleId) {
          id
        }
      }
    `(
      {
        articleId: 'with-no-resolved-urls',
      },
      { user: { id: 'test', appId: 'test' } }
    );

    expect(CreateAIReply).toBe(null);
    expect(getOpenAI().chat.completions.create).toBeCalledTimes(0);
  });
});
