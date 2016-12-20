import 'util/catchUnhandledRejection';
import client, { processMeta } from 'util/client';
import getIn from 'util/getInFactory';
import GraphQL from '../util/GraphQL';

async function main() {
  const allRumors = getIn(await client.search({
    index: 'rumors',
    body: {
      size: 10000,
    },
  }))(['hits', 'hits'], []).map(processMeta);

  let invalidCount = 0;
  for (const { id, text } of allRumors) {
    // perform graphql search...
    const { data } = await GraphQL({
      query: `
        query ($text: String) {
          Search(text: $text, findInCrawled: false) {
            rumors {
              score
              doc {
                id
                text
                answers {
                  versions {
                    text
                  }
                }
              }
            }
            suggestedResult {
              __typename
              ... on Rumor {
                id
                text
              }
            }
          }
        }
      `,
      variables: {
        text,
      },
    });

    if (data.Search.suggestedResult === null || data.Search.suggestedResult.id !== id) {
      invalidCount += 1;
      console.log(id, data.Search.suggestedResult && data.Search.suggestedResult.id);
    }
  }

  console.log("=========");
  console.log(`${allRumors.length - invalidCount}/${allRumors.length} correct`)
  console.log(`${(100*(allRumors.length - invalidCount)/allRumors.length).toFixed(2)} % correct.`)
}

main();
