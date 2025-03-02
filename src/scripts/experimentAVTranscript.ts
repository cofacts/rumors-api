import yargs from 'yargs';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import { transcribeAV } from 'graphql/util';
import langfuse from 'util/langfuse';

// Default arguments
const DATASET_NAME = 'audio and video messages';
const MODEL = 'gemini-1.5-pro-002';
const LOCATION = 'asia-east1';

async function main({
  datasetName = DATASET_NAME,
  model = MODEL,
  location = LOCATION,
} = {}) {
  const dataset = await langfuse.getDataset(datasetName);
  const project = await new GoogleAuth().getProjectId();
  const vertexAI = new VertexAI({ project, location });
  const geminiModel = vertexAI.getGenerativeModel({ model });

  for (const item of dataset.items) {
    const fileUri = item.input as string; // Already a GCS path starting with gs://
    const mimeType = 'video/mp4'; // All items are video/mp4

    const trace = langfuse.trace({
      name: `Experiment transcript for ${fileUri}`,
      input: fileUri,
      metadata: { model, location },
    });

    const { text } = await transcribeAV({
      fileUri,
      mimeType,
      langfuseTrace: trace,
      geminiModel,
    });

    // Link execution trace to dataset item
    await item.link(trace, `${model}-${location}`, {
      description: `Transcript experiment using ${model} @ ${location}`,
      metadata: { model, location },
    });

    // Score the result if expected output exists
    if (item.expectedOutput) {
      const { text: expectedText } = JSON.parse(item.expectedOutput);

      // Character-level similarity scoring
      const levDistance = levenshteinDistance(text, expectedText);
      const similarity =
        1 - levDistance / Math.max(text.length, expectedText.length);
      trace.score({
        name: 'char-similarity',
        value: similarity,
        comment: `Levenshtein distance: ${levDistance}`,
      });
    }
  }

  await langfuse.flushAsync();
}

// Levenshtein distance implementation for text similarity scoring
function levenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1,
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

/* istanbul ignore if */
if (require.main === module) {
  const argv = yargs
    .options({
      datasetName: {
        description: 'Name of the Langfuse dataset to use',
        type: 'string',
        default: DATASET_NAME,
      },
      model: {
        description: 'Gemini model to use',
        type: 'string',
      },
      location: {
        description: 'Model location',
        type: 'string',
      },
    })
    .help('help').argv;

  main(argv).catch(console.error);
}

export default main;
