import OpenAI from 'openai';
import { observeOpenAI } from 'langfuse';

const openai = observeOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  }),
  {
    tags: [process.env.ROLLBAR_ENV],
  }
);

export default openai;
