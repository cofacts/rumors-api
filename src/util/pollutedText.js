import { navPrefix, rules } from './pollutedTextRules.json';

const NAV_RE = new RegExp(navPrefix);

/**
 * Splits a regex source by top-level `|`, so that each alternative can be matched on its own.
 */
function splitAlternatives(pattern) {
  const alternatives = [];
  let depth = 0,
    inClass = false,
    start = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '\\') {
      i += 1;
    } else if (inClass) {
      if (ch === ']') inClass = false;
    } else if (ch === '[') {
      inClass = true;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
    } else if (ch === '|' && depth === 0) {
      alternatives.push(pattern.slice(start, i));
      start = i + 1;
    }
  }
  alternatives.push(pattern.slice(start));
  return alternatives;
}

const ALTERNATIVES = rules.flatMap(({ category, pattern, fields }) =>
  splitAlternatives(pattern).map((alternative) => ({
    category,
    fields,
    pattern: alternative,
    // Sticky flag anchors the match at start of field: fixed texts always lead the field
    re: new RegExp(alternative, 'y'),
  }))
);

/**
 * Login walls with real page content appended (e.g. FB page intro) are longer than this
 * and are kept for human / LLM review instead of being cleared.
 */
const LOGIN_WALL_MAX_LENGTH = 400;

/**
 * @param {string} text - title or summary of a scrapped URL
 * @param {'title'|'summary'} field - some rules (e.g. site names) only apply to specific fields
 * @returns {{category: string, pattern: string}|null} the matched rule alternative, if text is a known fixed text
 */
export function matchPollutedText(text, field) {
  const t = (text || '').trim().replace(NAV_RE, '');
  if (!t) return null;

  for (const { category, fields, pattern, re } of ALTERNATIVES) {
    if (fields && !fields.includes(field)) continue;
    re.lastIndex = 0;
    if (!re.test(t)) continue;

    if (
      category === 'login_wall' &&
      t.length > LOGIN_WALL_MAX_LENGTH &&
      !t.startsWith('See what')
    )
      return null;
    return { category, pattern };
  }
  return null;
}

/**
 * @param {string} text - title or summary of a scrapped URL
 * @param {'title'|'summary'} field
 * @returns {string|null} pollution category if text is a known fixed text, otherwise null
 */
export function classifyPollutedText(text, field) {
  const match = matchPollutedText(text, field);
  return match ? match.category : null;
}

/**
 * Clears title / summary of a scrap result if they are login walls, error pages, etc.
 *
 * @param {ScrapResult} scrapResult
 * @returns {ScrapResult}
 */
export function cleanScrapResult(scrapResult) {
  const { title, summary } = scrapResult;
  return {
    ...scrapResult,
    title: classifyPollutedText(title, 'title') ? '' : title,
    summary: classifyPollutedText(summary, 'summary') ? '' : summary,
  };
}
