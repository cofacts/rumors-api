import { OpenAIClient, AzureKeyCredential } from '@azure/openai';

const openai = new OpenAIClient(
  process.env.AZURE_OPENAI_ENDPOINT,
  new AzureKeyCredential(process.env.AZURE_OPENAI_KEY)
);

export default openai;
