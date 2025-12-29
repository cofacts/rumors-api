import main from 'scripts/cleanupUrls';
import client, { getTotalCount } from 'util/client';


const checkDocs = async () => {

  const aliases = await client.cat.aliases({
    format: 'JSON'
  })
  
  const indices = aliases.map(i => i.alias);

  const { hits: { total, hits } } = await client.search({
    index: indices,
    _source: 'false'
  })

  if (getTotalCount(total) > 0) {
    console.log('\x1b[33m');
    console.log('WARNING: test db is not cleaned up properly.');
    const docs = hits.map(d => `/${d._index}/doc/${d._id}`)
    console.log(JSON.stringify(docs, null, 2));
    console.log('\x1b[0m');

    for (const d of hits) {
      await client.delete({index: d._index, id: d._id})
    }
    process.exit(1) 
  }    
}

checkDocs()
