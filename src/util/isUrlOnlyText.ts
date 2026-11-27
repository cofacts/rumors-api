import urlRegex from 'url-regex-safe';

/** Same URLs as scrapUrls and archiveUrlsFromText pick up. Built once: it is large. */
const URL_REGEX = urlRegex({ strict: true });

/**
 * Below this many letters and digits left after removing URLs, a text is
 * treated as URL-only. Covers a bare link plus a word or two such as "轉傳" or
 * "這是真的嗎".
 */
const URL_ONLY_MAX_REMAINING_CHARS = 10;

/**
 * Whether the text is (almost) nothing but URLs.
 *
 * The embedding of such a text is the embedding of the URL string: links of the
 * same shape (YouTube, FB reels) score 0.98+ against each other whatever they
 * link to, so kNN on it finds unrelated links. Searches skip kNN for these and
 * rely on BM25, which also matches the hyperlinks' titles and summaries.
 * Ref: the 2026-10-08 staging report of cofacts/rumors-api#388 (observation 2).
 */
export default function isUrlOnlyText(
  text: string | null | undefined
): boolean {
  if (!text) return false;

  let hasUrl = false;
  // Each match is replaced where it is, so a URL that is a prefix of another
  // does not leave part of the other behind. The regex takes any non-space
  // after the host, so text glued right after a link (common in forwarded
  // messages, e.g. "https://x.com/a看完記得分享") ends up in the match; only the
  // ASCII part of a match is the URL, the rest still counts as text.
  const remaining = text.replace(URL_REGEX, (match) => {
    hasUrl = true;
    return ' ' + match.replace(/^[\x21-\x7e]+/, '');
  });
  if (!hasUrl) return false;

  const meaningful = remaining.match(/[\p{L}\p{N}]/gu) || [];
  return meaningful.length < URL_ONLY_MAX_REMAINING_CHARS;
}
