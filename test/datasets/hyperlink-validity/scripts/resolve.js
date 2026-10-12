// Usage: node resolve.js <url-resolver dir> <input.txt (one URL per line)> <output.jsonl>
// Calls url-resolver's resolveUrls() in-process, one URL per call, appending results.
const path = require('path');
const fs = require('fs');
const [, , dir, input, output] = process.argv;
const { resolveUrls } = require(path.resolve(dir, 'src/resolvers/resolveUrls'));

const done = new Set(
  fs.existsSync(output)
    ? fs.readFileSync(output, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l).url)
    : []
);
const urls = fs.readFileSync(input, 'utf8').split('\n').map(s => s.trim()).filter(u => u && !done.has(u));

// Stray socket errors (e.g. ECONNRESET from a proxied keep-alive socket) must not kill the run.
process.on('uncaughtException', e => console.error('[uncaughtException]', e.message));
process.on('unhandledRejection', e => console.error('[unhandledRejection]', e && e.message));

function resolveOne(url) {
  return new Promise(resolve => {
    const results = [];
    const timer = setTimeout(() => resolve({ url, error: 'HARNESS_TIMEOUT' }), 60000);
    resolveUrls({
      request: { urls: [url] },
      write: r => results.push(r),
      end: () => { clearTimeout(timer); resolve(results[0] || { url, error: 'NO_RESULT' }); },
    });
  });
}

(async () => {
  const CONC = 3;
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const url = urls[i++];
      const r = await resolveOne(url);
      fs.appendFileSync(output, JSON.stringify({
        url,
        canonical: r.canonical || null,
        title: r.title || null,
        summary: r.summary || null,
        topImageUrl: r.top_image_url || r.topImageUrl || null,
        status: r.status || null,
        error: r.error || null,
        successfullyResolved: !!r.successfully_resolved,
        resolvedAt: new Date().toISOString(),
      }) + '\n');
      console.log(i, '/', urls.length, url, r.error || 'ok');
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  process.exit(0);
})();
