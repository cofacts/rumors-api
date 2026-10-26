// Usage: NODE_PATH=<url-resolver dir>/node_modules node resolve.js <url-resolver dir> <input.txt (one URL per line)> <output.jsonl>
// Calls url-resolver's resolveUrls() in-process, one URL per call, appending results.
// Also records compact HTML features (see htmlFeatures.js): from the browser-rendered DOM when
// url-resolver used the browser, otherwise from the raw HTML (fetched the way unfurl does).
const path = require('path');
const fs = require('fs');
const [, , dir, input, output] = process.argv;
const { resolveUrls } = require(path.resolve(dir, 'src/resolvers/resolveUrls'));
const fetch = require(path.resolve(dir, 'node_modules/node-fetch'));
const htmlFeatures = require('./htmlFeatures');

// Raw fetch, same user agent as unfurl.js. Gives the HTTP status & final URL after redirects,
// and the HTML to extract features from when url-resolver did not open a browser.
async function rawFetch(url) {
  try {
    const res = await fetch(/^https?:/.test(url) ? url : 'https://' + url, {
      headers: { 'User-Agent': 'facebookexternalhit' },
      timeout: 8000,
      size: 5e6,
    });
    const type = res.headers.get('content-type') || '';
    const html = type.includes('html') ? await res.text() : null;
    return { status: res.status, finalUrl: res.url, html };
  } catch (e) {
    return { status: null, finalUrl: null, html: null, error: e.message.slice(0, 200) };
  }
}

function features(html) {
  try {
    return htmlFeatures(html);
  } catch (e) {
    return null;
  }
}

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
      const raw = await rawFetch(url);
      const browserHtml = r.html && /<(html|body)[\s>]/i.test(r.html) ? r.html : null;
      const featureHtml = browserHtml || raw.html;
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
        httpStatus: raw.status,
        finalUrl: raw.finalUrl,
        fetchError: raw.error || null,
        htmlSource: browserHtml ? 'browser' : raw.html ? 'fetch' : null,
        htmlLength: featureHtml ? featureHtml.length : 0,
        htmlFeatures: featureHtml ? features(featureHtml) : null,
      }) + '\n');
      console.log(i, '/', urls.length, url, r.error || 'ok');
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  process.exit(0);
})();
