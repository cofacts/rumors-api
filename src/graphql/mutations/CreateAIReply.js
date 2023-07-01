import { GraphQLString, GraphQLNonNull } from 'graphql';

import openai from 'util/openai';
import { assertUser } from 'util/user';
import client from 'util/client';
import delayForMs from 'util/delayForMs';
import { AIReply } from 'graphql/models/AIResponse';

const monthFormatter = Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: 'long',
  timeZone: 'Asia/Taipei',
});

/**
 * Create an new AIReply, initially in LOADING state, then becomes ERROR or SUCCESS,
 * and returns the AI reply.
 * If there is no enough content for AI, it resolves to null.
 */
export async function createNewAIReply({
  article,
  user,
  completionOptions = {},
}) {
  // article.hyperlinks deduped by URL.
  const dedupedHyperlinks = Object.values(
    (article.hyperlinks ?? []).reduce((map, hyperlink) => {
      if (
        !map[hyperlink.url] ||
        /* hyperlink exists, but fetch failed */ !map[hyperlink.url].title
      ) {
        map[hyperlink.url] = hyperlink;
      }
      return map;
    }, {})
  );

  /**
   * Determine if article has no content by replacing all URLs with its scrapped content.
   * This will become empty string if and only if:
   * - The article only contains URLs, no other text, and
   * - All URL scrapping results fail (no title, no summary)
   *
   * Abort AI reply generation in this case.
   */
  const replacedArticleText = dedupedHyperlinks
    .reduce(
      (text, { url, title, summary }) =>
        text.replaceAll(url, `${title} ${summary}`),
      article.text
    )
    .trim();

  if (replacedArticleText.length === 0) return null;

  // Argumenting hyperlinks with summary and titles
  const argumentedArticleText = dedupedHyperlinks.reduce(
    (text, { url, title, summary }) =>
      title
        ? text.replaceAll(url, `[${title} ${summary}](${url})`)
        : /* Fetch failed, don't replace */ text,
    article.text
  );

  const thisMonthParts = monthFormatter.formatToParts(new Date());
  const thisYearStr = thisMonthParts.find(p => p.type === 'year').value;
  const thisROCYearStr = (+thisYearStr - 1911).toString();
  const thisMonthStr = thisMonthParts.find(p => p.type === 'month').value;
  const createdMonth = monthFormatter.format(new Date(article.createdAt));

  const chatCompletionArgs = [
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
    [
      {
        role: 'system',
        content: `現在是${thisYearStr}年（民國${thisROCYearStr}年）${thisMonthStr}月。你是協助讀者進行媒體識讀的小幫手。你說話時總是使用台灣繁體中文。有讀者傳了一則網路訊息給你。這則訊息${createdMonth}就在網路上流傳。`,
      },
      {
        role: 'user',
        content: argumentedArticleText,
      },
      {
        role: 'user',
        content:
          '請問作為閱聽人，我應該注意這則訊息的哪些地方呢？請節錄訊息中需要特別留意或懷疑的地方，說明為何閱聽人需要注意它。請只就以上內文回應，不要編造。謝謝',
      },
    ],
    {
      user: user.id,
      temperature: 0,
      ...completionOptions,
    },
  ];

  const newResponse = {
    userId: user.id,
    appId: user.appId,
    docId: article.id,
    type: 'AI_REPLY',
    status: 'LOADING',
    request: JSON.stringify(chatCompletionArgs),
    createdAt: new Date(),
  };

  // Resolves to loading AI Response.
  const newResponseIdPromise = client
    .index({
      index: 'airesponses',
      type: 'doc',
      body: newResponse,
    })
    .then(({ body: { result, _id } }) => {
      /* istanbul ignore if */
      if (result !== 'created') {
        throw new Error(`Cannot create AI reply: ${result}`);
      }
      return _id;
    });

  const openAIResponsePromise = openai
    .getChatCompletions(...chatCompletionArgs)
    .catch(error => {
      console.error(error);

      /* Resolve with Error instance, which will be used to update AI response below */
      /* istanbul ignore else */
      if (error instanceof Error) return error;
      return new Error(error);
    });

  // Resolves to completed or errored AI response.
  return Promise.all([openAIResponsePromise, newResponseIdPromise])
    .then(([apiResult, aiResponseId]) =>
      // Update using aiResponse._id according to apiResult
      client.update({
        index: 'airesponses',
        type: 'doc',
        id: aiResponseId,
        _source: true,
        body: {
          doc:
            apiResult instanceof Error
              ? {
                  status: 'ERROR',
                  text: apiResult.toString(),
                  updatedAt: new Date(),
                }
              : {
                  status: 'SUCCESS',
                  text: apiResult.choices[0].message.content,
                  ...(apiResult.usage
                    ? {
                        usage: {
                          promptTokens: apiResult.usage.prompt_tokens,
                          completionTokens: apiResult.usage.completion_tokens,
                          totalTokens: apiResult.usage.total_tokens,
                        },
                      }
                    : undefined),
                  updatedAt: new Date(),
                },
        },
      })
    )
    .then(({ body: { _id, get: { _source } } }) => ({ id: _id, ..._source }));
}

export default {
  type: AIReply,
  description:
    'Create an AI reply for a specific article. If existed, returns an existing one. If information in the article is not sufficient for AI, return null.',
  args: {
    articleId: { type: new GraphQLNonNull(GraphQLString) },
  },
  async resolve(rootValue, { articleId }, { loaders, user }) {
    assertUser(user);

    const article = await loaders.docLoader.load({
      index: 'articles',
      id: articleId,
    });

    if (!article) throw new Error(`Article ${articleId} does not exist.`);

    // Try reading successful AI response.
    // Break the loop when there is no latest loading AI response.
    //
    for (;;) {
      // First, find latest successful airesponse. Return if found.
      //
      const {
        body: {
          hits: {
            hits: [successfulAiResponse],
          },
        },
      } = await client.search({
        index: 'airesponses',
        type: 'doc',
        body: {
          query: {
            bool: {
              must: [
                { term: { type: 'AI_REPLY' } },
                { term: { docId: articleId } },
                { term: { status: 'SUCCESS' } },
              ],
            },
          },
          sort: {
            createdAt: 'desc',
          },
          size: 1,
        },
      });

      if (successfulAiResponse) {
        return {
          id: successfulAiResponse._id,
          ...successfulAiResponse._source,
        };
      }

      // If no successful AI responses, find loading responses created within 1 min.
      //
      const {
        body: { count },
      } = await client.count({
        index: 'airesponses',
        type: 'doc',
        body: {
          query: {
            bool: {
              must: [
                { term: { type: 'AI_REPLY' } },
                { term: { docId: articleId } },
                { term: { status: 'LOADING' } },
                {
                  // loading document created within 1 min
                  range: {
                    createdAt: {
                      gte: 'now-1m',
                    },
                  },
                },
              ],
            },
          },
        },
      });

      // No AI response available now, break the loop and try create.
      //
      if (count === 0) {
        break;
      }

      // Wait a bit to search for successful AI response again.
      // If there are any loading AI response becomes successful during the wait,
      // it will be picked up when the loop is re-entered.
      await delayForMs(1000);
    }

    return createNewAIReply({ article, user });
  },
};
