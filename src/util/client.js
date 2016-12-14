import config from 'config';
import elasticsearch from 'elasticsearch';

export default new elasticsearch.Client({
  host: config.get('ELASTICSEARCH_URL'),
  log: config.get('ELASTIC_LOG_LEVEL'),
});

// Processes {_id, _version, found, _source: {...}} to
// {id, ..._source}.
//
export function processMeta({
  _id: id,
  _source: source,

  found, // for mget queries
  _score: score, // for search queries
}) {
  if (found || score !== undefined) {
    return { id, ...source };
  }
  return null; // not found
}
