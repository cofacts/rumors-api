import config from 'config';
import elasticsearch from 'elasticsearch';
import '../util/catchUnhandledRejection';

import * as schema from '../schema';

const client = new elasticsearch.Client({
  host: config.get('ELASTICSEARCH_URL'),
  log: 'trace',
});

Object.keys(schema).forEach((index) => {
  client.indices.create({
    index,
    body: {
      mappings: { basic: schema[index] },
    },
  }).then(() => {
    console.log(`Index "${index}" created with mappings`);
  });
});
