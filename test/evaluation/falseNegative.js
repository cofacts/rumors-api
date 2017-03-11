/* eslint no-console: off, import/no-extraneous-dependencies: off */

import 'util/catchUnhandledRejection';
import Progress from 'progress';
import client, { processMeta } from 'util/client';
import getIn from 'util/getInFactory';
import gql from '../util/GraphQL';
import { truncate } from '../util/strings';

function isHit(edges, queriedRumor) {
  // considered a search hit if queriedRumor exists in first 3 results
  //
  for (let i = 0; i < 3 && i < edges.length; i += 1) {
    if (edges[i].node.id === queriedRumor.id) return true;
  }

  return false;
}

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
        inline: "doc['replyConnectionIds'].length > 0",
      } } } } },
    },
  }))(['hits', 'hits'], []).map(processMeta);

  console.log('Querying articles in DB...');
  const progress = new Progress('[:bar] :current/:total :etas', { total: allRumors.length });

  const allResults = await Promise.all(allRumors.map(({ text }) =>
    gql`
      query ($text: String) {
        SearchArticles(text: $text) {
          edges {
            score
            node {
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
    if (isHit(data.SearchArticles.edges, rumor)) return; // continue

    invalidCount += 1;

    if (!data.SearchArticles.edges.length) {
      console.log(`\n[NOT FOUND] ${rumor.id} ------`);
    } else {
      console.log(`\n[WRONG DOC] ${rumor.id} ------`);
    }

    console.log(truncate(rumor.text, 50));
    console.log('Search result:');
    console.log(data.SearchArticles.edges.map(({ score, node }, idx) => `\t#${idx + 1} (score=${score} / id=${node.id}) ${truncate(node.text)}`).join('\n'));
  });

  console.log('---- Summary ----');
  console.log(`${invalidCount} false negatives out of ${allRumors.length} articles.`);
  console.log(`${(100 * ((allRumors.length - invalidCount) / allRumors.length)).toFixed(2)} % correct.`);
}

main();
