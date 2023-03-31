jest.mock('util/openai');
import openai from 'util/openai';
import MockDate from 'mockdate';

import gql from 'util/GraphQL';
// import client from 'util/client';

import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/CreateAIReply';
import client from 'util/client';

describe('CreateAIReply', () => {
  beforeAll(async () => {
    await loadFixtures(fixtures);
  });
  afterAll(async () => {
    await unloadFixtures(fixtures);
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
      mutation($articleId: String!) {
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

  // it('waits for existing loading AI reply')

  it('returns new AI response', async () => {
    // Mocked ChatGPT success response
    //
    const mockFn = openai.createChatCompletion.mockImplementationOnce(
      async () => ({
        data: {
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
        },
        status: 200,
        statusText: 'OK',
      })
    );

    MockDate.set(1602288000000);
    const { data, errors } = await gql`
      mutation($articleId: String!) {
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

  it('returns API error', async () => {
    // Mocked ChatGPT failed response, simulate API key error
    //
    const mockFn = openai.createChatCompletion.mockImplementationOnce(() =>
      Promise.reject(new Error('Request failed with status code 401'))
    );

    const { data, errors } = await gql`
      mutation($articleId: String!) {
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
});
