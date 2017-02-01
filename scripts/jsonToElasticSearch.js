import config from 'config';
import elasticsearch from 'elasticsearch';
import { readFileSync } from 'fs';

import '../util/catchUnhandledRejection';

if (process.argv.length !== 3) {
  console.log('Usage: babel-node scripts/jsonToElasticSearch.js <PATH_TO_CSV_FILE>');
  process.exit(1);
}

const client = new elasticsearch.Client({
  host: config.get('ELASTICSEARCH_URL'),
  log: 'info',
});

function writeToElasticSearch(indexName, records) {
  const body = [];

  records.forEach(({ id, ...doc }) => {
    // action description
    body.push({ index: { _index: indexName, _type: 'basic', _id: id } });
    // document
    body.push(doc);
  });

  console.log(`Writing ${records.length} document(s) to index ${indexName}...`);

  return client.bulk({
    body,
  });
}

const { rumors, answers } = JSON.parse(readFileSync(process.argv[2]));
writeToElasticSearch('articles', rumors.map((article) => {
  article.references = [{ type: 'LINE' }];
  article.replyIds = article.answerIds;
  delete article.answerIds;
  return article;
}));
writeToElasticSearch('replies', answers.map((reply) => {
  reply.versions[0].type = reply.versions[0].type || 'RUMOR';
  return reply;
}));
