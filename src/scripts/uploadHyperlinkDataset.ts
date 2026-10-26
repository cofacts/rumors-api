/**
 * Uploads the hyperlink validity dataset (scraped URL content + label of whether
 * the content is the real page content or a login wall / 404 / block page, etc.)
 * to Langfuse, so that classifiers for rumors-api#409 can be evaluated and their
 * prompts tuned with Langfuse experiments.
 *
 * Usage:
 *   npx tsx src/scripts/uploadHyperlinkDataset.ts \
 *     [--file test/datasets/hyperlink-validity/dataset.jsonl] \
 *     [--datasetName "hyperlink validity"]
 *
 * Items are upserted by their `id`, so re-running the script updates labels in place.
 */
import 'dotenv/config';
import fs from 'fs';
import yargs from 'yargs';

import langfuse from 'util/langfuse';

const FILE = 'test/datasets/hyperlink-validity/dataset.jsonl';
const DATASET_NAME = 'hyperlink validity';

type DatasetItem = {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  metadata: unknown;
};

async function main({
  file = FILE,
  datasetName = DATASET_NAME,
}: {
  file?: string;
  datasetName?: string;
}) {
  const items: DatasetItem[] = fs
    .readFileSync(file, 'utf-8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

  await langfuse.createDataset({
    name: datasetName,
    description:
      'URLs from Cofacts articles & replies with content scraped by url-resolver, labeled by whether the content is the real page content. See test/datasets/hyperlink-validity/README.md in rumors-api.',
  });

  for (const [index, item] of items.entries()) {
    console.info(`Uploading item ${index + 1}/${items.length}: ${item.id}`);
    await langfuse.createDatasetItem({
      datasetName,
      id: item.id,
      input: item.input,
      expectedOutput: item.expectedOutput,
      metadata: item.metadata,
    });
  }

  await langfuse.flushAsync();
}

/* istanbul ignore if */
if (require.main === module) {
  const argv = yargs
    .options({
      file: {
        description: 'Path to the dataset JSONL file',
        type: 'string',
        default: FILE,
      },
      datasetName: {
        description: 'Name of the Langfuse dataset to create or update',
        type: 'string',
        default: DATASET_NAME,
      },
    })
    .help('help')
    .parseSync();

  main(argv).catch(console.error);
}

export default main;
