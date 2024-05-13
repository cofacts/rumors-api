import elasticsearch from '@elastic/elasticsearch';

export default new elasticsearch.Client({
  node: process.env.ELASTICSEARCH_URL,
});

type ProcessMetaArgs<T> = {
  _id: string;
  _source: T;
  found: boolean;
  _score: number;
  highlight: object; // FIXME: use ES type
  inner_hits: object; // FIXME: use ES type
  sort: string;
  fields: object;
};

// Processes {_id, _version, found, _source: {...}} to
// {id, ..._source}.
//
export function processMeta<T extends object>({
  _id: id,
  _source: source,

  found, // for mget queries
  _score, // for search queries

  highlight, // search result highlighting. Should be {<fieldName>: ['...']}

  inner_hits, // nested query search result highlighting.

  sort, // cursor when sorted

  fields, // scripted fields (if any)
}: ProcessMetaArgs<T>) {
  if (found || _score !== undefined) {
    return {
      id,
      ...source,
      _cursor: sort,
      _score,
      highlight,
      inner_hits,
      _fields: fields,
    };
  }
  return null; // not found
}
