/**
 * Script to run transcription experiments using the Gemini model.
 *
 * Usage:
 *   npx tsx src/scripts/experimentAVTranscript.ts \
 *     --runName "experiment-1" \
 *     [--datasetName "audio and video messages"] \
 *     [--model "gemini-1.5-pro-002"] \
 *     [--location "asia-east1"]
 *
 * Required args:
 *   --runName: Name to identify this experiment run in Langfuse
 *
 * Optional args:
 *   --datasetName: Name of the Langfuse dataset to use
 *   --model: Gemini model to use
 *   --location: Model location to use
 */
import 'dotenv/config';
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
  runName,
}: {
  datasetName?: string;
  model?: string;
  location?: string;
  runName: string;
}) {
  const dataset = await langfuse.getDataset(datasetName);

  for (const [index, item] of dataset.items.entries()) {
    console.info(
      `Processing item ${index + 1}/${dataset.items.length}: ${item.id}`
    );
    const fileUri = item.input as string; // Already a GCS path starting with gs://
    const mimeType = 'video/mp4'; // All items are video/mp4

    const trace = langfuse.trace({
      name: `Transcript for Dataset Item ${item.id}`,
      input: fileUri,
      metadata: { model, location },
    });

    const { text } = await transcribeAV({
      fileUri,
      mimeType,
      langfuseTrace: trace,
      location,
      modelName: model,
    });

    // Link execution trace to dataset item
    await item.link(trace, runName, {
      description: `Transcript experiment using ${model} @ ${location}`,
      metadata: { model, location },
    });

    // Score the result if expected output exists
    if (item.expectedOutput) {
      const expectedText = item.expectedOutput as string;

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
      runName: {
        description: 'Name to identify this experiment run in Langfuse',
        type: 'string',
        demandOption: true,
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
    .help('help')
    .parseSync();

  main(argv).catch(console.error);
}

export default main;
