import main from 'scripts/cleanupUrls';
import client from 'util/client';

const checkDocs = async () => {
  const {body: {hits: {total, hits}}} = await client.search({
    _source: 'false'
  })

  if (total > 0) {
    console.log('\x1b[33m');
    console.log('WARNING: test db is not cleaned up properly.');
    console.log(JSON.stringify(hits.map(d => `/${d._index}/${d._type}/${d._id}`), null, 2));
    console.log('\x1b[0m');
  }    
}

checkDocs();

