/* eslint no-console: off, import/no-extraneous-dependencies: off */

import 'util/catchUnhandledRejection';
import Progress from 'progress';
import client, { processMeta } from 'util/client';
import getIn from 'util/getInFactory';
import gql from '../util/GraphQL';
import { truncate } from '../util/strings';

async function main() {
  console.log('=== False Negative Validation ===');

  // Get all rummors with answer specified.
  //
  const allRumors = getIn(await client.search({
    index: 'articles',
    body: {
      size: 10000,

      // https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-script-query.html
      //
      query: { bool: { must: { script: { script: {
        lang: 'painless',
        inline: "doc['replyIds'].length > 0",
      } } } } },
    },
  }))(['hits', 'hits'], []).map(processMeta);

  console.log('Querying articles in DB...');
  const progress = new Progress('[:bar] :current/:total :etas', { total: allRumors.length });

  const allResults = await Promise.all(allRumors.map(({ text }) =>
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
      text,
    }).then((data) => {
      progress.tick();
      return data;
    }),
  ));

  let invalidCount = 0;
  allResults.forEach(({ data }, i) => {
    const rumor = allRumors[i];
    if (data.Search.suggestedResult && data.Search.suggestedResult.id === rumor.id) {
      return; // continue
    }
    invalidCount += 1;

    if (data.Search.suggestedResult === null) {
      console.log(`\n[NOT FOUND] ${rumor.id} ------`);
    } else {
      console.log(`\n[WRONG DOC] ${rumor.id} ------`);
    }

    console.log(truncate(rumor.text, 50));
    console.log('Search result:');
    console.log(data.Search.articles.map((r, idx) => `\t#${idx + 1} (score=${r.score} / id=${r.doc.id}) ${truncate(r.doc.text)}`).join('\n'));
  });

  console.log('---- Summary ----');
  console.log(`${invalidCount} false negatives out of ${allRumors.length} articles.`);
  console.log(`${(100 * ((allRumors.length - invalidCount) / allRumors.length)).toFixed(2)} % correct.`);
}

main();
