import client, { processMeta } from 'util/client';
import getIn from 'util/getInFactory';

async function main() {
  const allRumors = getIn(await client.search({
    index: 'rumors',
    body: {
      size: 10000,
    },
  }))(['hits', 'hits'], []).map(processMeta);

  console.log(allRumors);
  allRumors.forEach(({text}) => {
    // perform graphql search...
  })
}

main();
