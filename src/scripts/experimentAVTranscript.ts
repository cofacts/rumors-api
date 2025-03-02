import yargs from 'yargs';
import { VertexAI } from '@google-cloud/vertexai';
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';

import langfuse from 'util/langfuse';
import { uploadMedia } from 'graphql/util';

const DATASET_NAME = 'audio and video messages';

async function main({ datasetName = DATASET_NAME, model, location } = {}) {
  try {
    const dataset = await langfuse.getDataset(datasetName);
    const project = await new GoogleAuth().getProjectId();
    const vertexAI = new VertexAI({ project, location });
    const geminiModel = vertexAI.getGenerativeModel({ model });

    for (const item of dataset.items) {
      const { fileUrl, type } = JSON.parse(item.input);

      // Upload to GCS first and get the file
      const [mediaEntry, mimeType] = await Promise.all([
        // Wait until file is fully uploaded so LLM can read without error
        new Promise((resolve) => {
          let isUploadStopped = false;
          let mediaEntryToResolve = undefined;
          uploadMedia({
            mediaUrl: fileUrl,
            articleType: type.toUpperCase(),
            onUploadStop: () => {
              isUploadStopped = true;
              if (mediaEntryToResolve) resolve(mediaEntryToResolve);
            },
          }).then((mediaEntry) => {
            if (isUploadStopped) {
              resolve(mediaEntry);
            } else {
              mediaEntryToResolve = mediaEntry;
            }
          });
        }),
        // Get content-type via HEAD request
        fetch(fileUrl, { method: 'HEAD' })
          .then((res) => res.headers.get('content-type'))
          .catch(() => (type === 'video' ? 'video/mp4' : 'audio/mpeg')),
      ]);

      const fileUri = mediaEntry.getFile().cloudStorageURI.href;

      const trace = langfuse.trace({
        name: `Experiment transcript for ${fileUrl}`,
        input: fileUri,
        metadata: { model, location },
      });

      try {
        const { text, usage } = await transcribeAV({
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

          // Simple exact match scoring
          trace.score({
            name: 'exact-match',
            value: text === expectedText ? 1 : 0,
            comment: text === expectedText ? 'Exact match' : 'No match',
          });

          // Character-level similarity scoring
          const similarity =
            1 -
            levenshteinDistance(text, expectedText) /
              Math.max(text.length, expectedText.length);
          trace.score({
            name: 'char-similarity',
            value: similarity,
            comment: `Character-level similarity: ${(similarity * 100).toFixed(
              2
            )}%`,
          });
        }
      } catch (error) {
        console.error('[experimentAVTranscript]', error);
        trace.error({
          message: error.message,
          stack: error.stack,
        });
      }
    }

    await langfuse.flushAsync();
  } catch (error) {
    console.error('[experimentAVTranscript]', error);
    process.exit(1);
  }
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
        demandOption: true,
      },
      location: {
        description: 'Model location',
        type: 'string',
        demandOption: true,
      },
    })
    .help('help').argv;

  main(argv).catch(console.error);
}

export default main;
