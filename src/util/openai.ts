import OpenAI from 'openai';
import { observeOpenAI } from 'langfuse';

const openai = observeOpenAI(
  new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })
);

export default openai;
