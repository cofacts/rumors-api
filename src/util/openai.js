import OpenAI from 'openai';
import { observeOpenAI } from 'langfuse';

const getOpenAI = (langfuseConfig = {}) =>
  observeOpenAI(
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }),
    {
      tags: [process.env.ROLLBAR_ENV],
      ...langfuseConfig,
    }
  );

export default getOpenAI;
