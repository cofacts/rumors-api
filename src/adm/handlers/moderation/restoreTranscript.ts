import restoreTranscriptScript from 'scripts/restoreTranscript';

type RestoreTranscriptParams = {
  articles: { articleId: string; versionCreatedAt: string }[];
};

type RestoreTranscriptResult = {
  id: string;
  status: 'SUCCESS' | 'ERROR';
  reason?: string;
  removedContributorIds?: string[];
};

/**
 * Restore transcripts of the given articles to the specified versions.
 * Each article is processed independently; failure of one does not stop the others.
 */
async function restoreTranscript({ articles }: RestoreTranscriptParams) {
  const results: RestoreTranscriptResult[] = [];

  // Sequential to keep ES writes simple and logs readable; the list is short.
  for (const { articleId, versionCreatedAt } of articles) {
    try {
      const { removedContributorIds } = await restoreTranscriptScript({
        articleId,
        versionCreatedAt,
      });
      results.push({ id: articleId, status: 'SUCCESS', removedContributorIds });
    } catch (e) {
      console.error(`[restoreTranscript] ${articleId}:`, e);
      results.push({
        id: articleId,
        status: 'ERROR',
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    count: results.filter(({ status }) => status === 'SUCCESS').length,
    results,
  };
}

export default restoreTranscript;
