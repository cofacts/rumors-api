/**
 * Restore logic itself is covered by src/scripts/__tests__/restoreTranscript.js;
 * this only covers how the handler collects per-article results.
 */
import restoreTranscriptScript from 'scripts/restoreTranscript';
import restoreTranscript from '../restoreTranscript';

jest.mock('scripts/restoreTranscript', () => ({
  __esModule: true,
  default: jest.fn(),
}));

it('restores each article and reports failures without stopping', async () => {
  restoreTranscriptScript
    .mockResolvedValueOnce({
      text: 'foo\n',
      removedContributorIds: ['spammer'],
    })
    .mockRejectedValueOnce(new Error('Article a2 has no transcript ydoc'));

  expect(
    await restoreTranscript({
      articles: [
        { articleId: 'a1', versionCreatedAt: '2026-11-19T00:00:00.000Z' },
        { articleId: 'a2', versionCreatedAt: '2026-11-19T00:00:00.000Z' },
      ],
    })
  ).toEqual({
    count: 1,
    results: [
      { id: 'a1', status: 'SUCCESS', removedContributorIds: ['spammer'] },
      {
        id: 'a2',
        status: 'ERROR',
        reason: 'Article a2 has no transcript ydoc',
      },
    ],
  });
  expect(restoreTranscriptScript).toHaveBeenCalledWith({
    articleId: 'a1',
    versionCreatedAt: '2026-11-19T00:00:00.000Z',
  });
});
