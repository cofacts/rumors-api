import OpenAI from 'openai';
import { observeOpenAI, type LangfuseConfig } from 'langfuse';
import { CURRENT_ENV } from './langfuse';

const getOpenAI = (langfuseConfig: LangfuseConfig = {}) =>
  observeOpenAI(
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }),
    {
      ...langfuseConfig,
      tags: [
        ...(('tags' in langfuseConfig && langfuseConfig.tags) || []),
        CURRENT_ENV,
      ],
    }
  );

export default getOpenAI;
