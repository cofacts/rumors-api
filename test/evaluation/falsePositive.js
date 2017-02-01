/* eslint no-console: off, import/no-extraneous-dependencies: off */

import 'util/catchUnhandledRejection';
import parse from 'csv-parse/lib/sync';
import fs from 'fs';
import path from 'path';
import Progress from 'progress';
import gql from '../util/GraphQL';
import { truncate } from '../util/strings';

const NON_DB_SAMPLES = path.join(__dirname, './non-db-samples-20170201.csv');

async function main() {
  console.log('=== False Postitive Validation ===');

  const samples = parse(fs.readFileSync(NON_DB_SAMPLES), { columns: true });
  console.log('Querying user input non-db samples in DB...');

  const progress = new Progress('[:bar] :current/:total :etas', { total: samples.length });

  const allResults = await Promise.all(samples.map(({ rumor }) =>
    gql`
      query ($text: String) {
        Search(text: $text, findInCrawled: false) {
          articles {
            score
            doc {
              id
              text
            }
          }
          suggestedResult {
            __typename
            ... on Article {
              id
              text
            }
          }
        }
      }
    `({
      text: rumor,
    }).then((data) => {
      progress.tick();
      return data;
    }),
  ));

  let invalidCount = 0;

  allResults.forEach(({ data }, i) => {
    if (data.Search.suggestedResult === null || data.Search.suggestedResult.__typename !== 'Article') {
      return; // continue
    }
    invalidCount += 1;
    const sample = samples[i];
    console.log(`\n[FALSE POSITIVE] Sample #${i + 1} ------`);
    console.log('Queried Sample --');
    console.log(truncate(sample.rumor, 50));
    console.log('Returned Result --');
    console.log(truncate(data.Search.suggestedResult.text, 50));
    console.log('Other search results --');
    console.log(data.Search.articles.map((r, idx) => `\t#${idx + 1} (score=${r.score} / id=${r.doc.id}) ${truncate(r.doc.text)}`).join('\n'));
  });

  console.log('---- Summary ----');
  console.log(`${invalidCount} false positive out of ${samples.length} sample queries.`);
  console.log(`${(100 * ((samples.length - invalidCount) / samples.length)).toFixed(2)} % correctly rejected.`);
}

main();
