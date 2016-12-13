import config from 'config';
import elasticsearch from 'elasticsearch';

export default new elasticsearch.Client({
  host: config.get('ELASTICSEARCH_URL'),
  log: 'trace',
});

// Processes {_id, _version, found, _source: {...}} to
// {id, ..._source}.
//
export function processMeta({ _id: id, found, _source: doc }) {
  if (found) {
    return { id, ...doc };
  }
  return null; // not found
}
