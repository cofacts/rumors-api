import { getRelatedArticles, scoreQuery, summarize } from '../evalHybridSearch';

describe('getRelatedArticles', () => {
  it('relates the articles that share a reply', () => {
    const related = getRelatedArticles(
      new Map([
        ['reply1', new Set(['a', 'b'])],
        ['reply2', new Set(['b', 'c'])],
        ['lonely', new Set(['d'])],
      ])
    );
    expect([...related.get('a')]).toEqual(['b']);
    expect([...related.get('b')].sort()).toEqual(['a', 'c']);
    expect(related.has('d')).toBe(false);
  });

  it('skips generic replies linked to too many articles', () => {
    const many = new Set(Array.from({ length: 31 }, (_, i) => `a${i}`));
    expect(getRelatedArticles(new Map([['spam', many]])).size).toBe(0);
  });
});

describe('scoreQuery', () => {
  const query = { id: 'q', relevant: ['r1', 'r2'] };

  it('ranks without the query article itself', () => {
    expect(scoreQuery(query, ['q', 'x', 'r2'])).toEqual({
      ids: ['x', 'r2'],
      firstRank: 2,
      recall: 0.5,
    });
  });

  it('gives rank 0 when nothing relevant is in the top 10', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `x${i}`).concat('r1');
    expect(scoreQuery(query, ids)).toMatchObject({ firstRank: 0, recall: 0 });
  });
});

describe('summarize', () => {
  it('averages the hits and reciprocal ranks', () => {
    const summary = summarize([
      { firstRank: 1, recall: 1, total: 3, ms: 10 },
      { firstRank: 4, recall: 0.5, total: 0, ms: 30 },
      { firstRank: 0, recall: 0, total: 0, ms: 20 },
      { firstRank: 2, recall: 0.5, total: 5, ms: 40 },
    ]);
    expect(summary).toEqual({
      hit1: 0.25,
      hit5: 0.75,
      hit10: 0.75,
      recall10: 0.5,
      mrr10: (1 + 0.25 + 0 + 0.5) / 4,
      zeroResult: 0.5,
      medianTotal: 3,
      p50ms: 30,
      p95ms: 40,
    });
  });
});
