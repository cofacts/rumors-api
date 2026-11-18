// Extracts a small set of signals from a page's HTML that hint whether the page is the URL's
// own content (vs. a login wall, error page, or a page the URL was redirected to).
// Meant to be passed to the decision model as a compact JSON next to title & summary.
// Runs with url-resolver's dependencies (htmlparser2 v3).
const { parseDOM, DomUtils } = require('htmlparser2');

const MAX_STR = 200;
const clip = s => {
  if (typeof s !== 'string') return null;
  const t = s.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > MAX_STR ? t.slice(0, MAX_STR) + '…' : t;
};

function attr(el, name) {
  return el && el.attribs ? el.attribs[name] : undefined;
}

function inSvg(el) {
  for (let p = el.parent; p; p = p.parent) if (p.name === 'svg') return true;
  return false;
}

function metaContent(metas, key) {
  const el = metas.find(
    m => (attr(m, 'property') || attr(m, 'name') || '').toLowerCase() === key
  );
  return clip(attr(el, 'content'));
}

function visibleText(nodes) {
  let out = '';
  (function walk(ns) {
    for (const n of ns) {
      if (n.type === 'text') out += n.data + ' ';
      else if (n.children && !['script', 'style', 'noscript', 'template', 'svg'].includes(n.name))
        walk(n.children);
    }
  })(nodes);
  return out.replace(/\s+/g, ' ').trim();
}

function jsonLd(scripts) {
  const types = new Set();
  let headline = null;
  for (const s of scripts) {
    if ((attr(s, 'type') || '').toLowerCase() !== 'application/ld+json') continue;
    let data;
    try {
      data = JSON.parse(DomUtils.getText(s));
    } catch (e) {
      continue;
    }
    const stack = [data];
    while (stack.length) {
      const d = stack.pop();
      if (Array.isArray(d)) stack.push(...d);
      else if (d && typeof d === 'object') {
        const t = d['@type'];
        (Array.isArray(t) ? t : [t]).forEach(x => typeof x === 'string' && types.add(x));
        if (!headline && typeof d.headline === 'string') headline = clip(d.headline);
        if (d['@graph']) stack.push(d['@graph']);
      }
    }
  }
  return { types: [...types].slice(0, 8), headline };
}

/**
 * @param {string} html
 * @returns {object} features
 */
function htmlFeatures(html) {
  const dom = parseDOM(html, { decodeEntities: true });
  const all = name => DomUtils.findAll(el => el.name === name, dom);
  const metas = all('meta');
  const htmlEl = all('html')[0];
  const body = all('body')[0];
  const inputs = all('input');
  const forms = all('form');
  const canonicalEl = all('link').find(l => (attr(l, 'rel') || '').toLowerCase() === 'canonical');
  const ld = jsonLd(all('script'));
  const text = visibleText(body ? body.children : dom);
  const links = all('a');
  const linkText = links.map(a => DomUtils.getText(a)).join(' ').replace(/\s+/g, ' ').trim();
  const h1 = all('h1')[0];

  return {
    // Skip <title> inside inline SVG icons
    htmlTitle: clip(DomUtils.getText(all('title').find(t => !inSvg(t)) || [])),
    lang: clip(attr(htmlEl, 'lang')),
    canonicalLink: clip(attr(canonicalEl, 'href')),
    ogUrl: metaContent(metas, 'og:url'),
    ogType: metaContent(metas, 'og:type'),
    ogSiteName: metaContent(metas, 'og:site_name'),
    metaRobots: metaContent(metas, 'robots'),
    jsonLdTypes: ld.types,
    jsonLdHeadline: ld.headline,
    h1: clip(h1 && DomUtils.getText(h1)),
    hasPasswordInput: inputs.some(i => (attr(i, 'type') || '').toLowerCase() === 'password'),
    formCount: forms.length,
    bodyClass: clip(attr(body, 'class')),
    textLength: text.length,
    linkCount: links.length,
    linkTextRatio: text.length ? Math.round((linkText.length / text.length) * 100) / 100 : 0,
  };
}

module.exports = htmlFeatures;
