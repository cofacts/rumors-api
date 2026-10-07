import { loadFixtures, unloadFixtures } from 'util/fixtures';
import gql from 'util/GraphQL';
import { createEmbedding } from 'util/embedding';
import fixtures, {
  knnHighlightFixtures,
  knnPageFixtures,
  knnHardFilterFixtures,
} from '../__fixtures__/ListReplies';
import { queryVector } from 'util/vectors';

jest.mock('util/embedding', () => ({
  createEmbedding: jest.fn(),
  getQueryEmbeddingCacheId: (text) => `query-text:${text}`,
  getReplyEmbeddingCacheId: (text, ref) => `reply:${text}:${ref || ''}`,
}));

describe('ListReplies', () => {
  beforeAll(() => loadFixtures(fixtures));

  const getCursor = async (id) => {
    const {
      data: {
        ListReplies: { edges },
      },
    } = await gql`
      {
        ListReplies {
          edges {
            node {
              id
            }
            cursor
          }
        }
      }
    `();
    return edges.find(({ node }) => node.id === id).cursor;
  };

  it('lists all replies', async () => {
    expect(
      await gql`
        {
          ListReplies {
            totalCount
            edges {
              node {
                id
              }
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('sorts', async () => {
    expect(
      await gql`
        {
          ListReplies(orderBy: [{ createdAt: DESC }]) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('filters', async () => {
    expect(
      await gql`
        {
          ListReplies(
            filter: { moreLikeThis: { like: "foo", minimumShouldMatch: "5%" } }
          ) {
            edges {
              node {
                id
                text
              }
              highlight {
                text
                reference
                hyperlinks {
                  url
                  title
                  summary
                }
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('moreLikeThis = foo');

    expect(
      await gql`
        {
          ListReplies(filter: { selfOnly: true }) {
            edges {
              node {
                id
                user {
                  id
                }
              }
            }
            totalCount
          }
        }
      `(
        {},
        {
          userId: 'foo',
          appId: 'test',
        }
      )
    ).toMatchSnapshot('selfOnly (userId = foo)');

    // Deprecated
    expect(
      await gql`
        {
          ListReplies(filter: { type: RUMOR }) {
            edges {
              node {
                id
                type
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('type = RUMOR');

    expect(
      await gql`
        {
          ListReplies(filter: { types: [RUMOR, NOT_RUMOR] }) {
            edges {
              node {
                id
                type
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('types = RUMOR, NOT_RUMOR');

    expect(
      await gql`
        {
          ListReplies(filter: { userId: "foo" }) {
            edges {
              node {
                id
                user {
                  id
                }
              }
            }
            totalCount
          }
        }
      `(
        {},
        {
          userId: 'foo',
          appId: 'test',
        }
      )
    ).toMatchSnapshot('userId = foo');

    expect(
      await gql`
        {
          ListReplies(filter: { userIds: ["foo"] }) {
            edges {
              node {
                id
                user {
                  id
                }
              }
            }
            totalCount
          }
        }
      `(
        {},
        {
          userId: 'foo',
          appId: 'test',
        }
      )
    ).toMatchSnapshot('userIds = [foo]');
  });

  it('filters by moreLikeThis and given text, find replies containing hyperlinks with the said text', async () => {
    expect(
      await gql`
        {
          ListReplies(
            filter: { moreLikeThis: { like: "「長鋏歸來乎！食無魚。」" } }
          ) {
            edges {
              node {
                id
              }
              highlight {
                text
                reference
                hyperlinks {
                  url
                  title
                  summary
                }
              }
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it("filters by moreLikeThis and given text, find replies with the said URL's content", async () => {
    expect(
      await gql`
        {
          ListReplies(
            filter: {
              moreLikeThis: {
                like: "請看 http://foo.com"
                minimumShouldMatch: "5%"
              }
            }
          ) {
            edges {
              node {
                id
              }
              highlight {
                text
                reference
                hyperlinks {
                  url
                  title
                  summary
                }
              }
            }
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('filters by time range', async () => {
    expect(
      await gql`
        {
          ListReplies(
            filter: { createdAt: { GT: "2020-02-06T00:00:00.000Z" } }
          ) {
            edges {
              node {
                id
                createdAt
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('createdAt > 2020/2/6');
    expect(
      await gql`
        {
          ListReplies(
            filter: { createdAt: { LTE: "2020-02-06T00:00:00.000Z" } }
          ) {
            edges {
              node {
                id
                createdAt
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('createdAt <= 2020/2/6');
    expect(
      await gql`
        {
          ListReplies(
            filter: {
              createdAt: {
                GTE: "2020-02-04T00:00:00.000Z"
                LTE: "2020-02-06T00:00:00.000Z"
              }
            }
          ) {
            edges {
              node {
                id
                createdAt
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot('2020/2/4 <= createdAt <= 2020/2/6');
  });

  it('filters by mixed query', async () => {
    // Mixes 'should' and 'filter' query. At least 1 'should' must match.
    // Therefore, this query should only match 2 results instead of all that satisfies type = NOT_ARTICLE

    expect(
      await gql`
        {
          ListReplies(
            filter: { type: NOT_ARTICLE, moreLikeThis: { like: "foo" } }
          ) {
            edges {
              node {
                id
              }
              highlight {
                text
                reference
                hyperlinks {
                  url
                  title
                  summary
                }
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot();
  });

  it('supports after', async () => {
    expect(
      await gql`
        query ($cursor: String) {
          ListReplies(after: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: await getCursor('moreLikeThis2') })
    ).toMatchSnapshot();
  });

  it('supports before', async () => {
    expect(
      await gql`
        query ($cursor: String) {
          ListReplies(before: $cursor) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `({ cursor: await getCursor('moreLikeThis1') })
    ).toMatchSnapshot();
  });

  it('handles selfOnly filter properly if not logged in', async () => {
    expect(
      await gql`
        {
          ListReplies(filter: { selfOnly: true }) {
            edges {
              node {
                id
              }
            }
            totalCount
          }
        }
      `()
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});

describe('ListReplies kNN search with highlight', () => {
  // Unlike the kNN retriever tests above, these go through `gql` and hit ES, so
  // that the highlight on the kNN search request is exercised too.

  beforeAll(() => loadFixtures(knnHighlightFixtures));
  beforeEach(() => {
    createEmbedding.mockReset();
    createEmbedding.mockResolvedValue([{ vector: queryVector }]);
  });
  afterAll(() => unloadFixtures(knnHighlightFixtures));

  const query = gql`
    query ($embedding: Float) {
      ListReplies(
        filter: {
          moreLikeThis: { like: "kiwifruit smoothie recipe" }
          embedding: $embedding
        }
        orderBy: [{ _score: DESC }]
      ) {
        edges {
          node {
            id
          }
          highlight {
            text
            reference
          }
        }
      }
    }
  `;

  it('returns the BM25 highlights when kNN is applied', async () => {
    const { data, errors } = await query({ embedding: 0.8 });
    expect(errors).toBeUndefined();
    expect(createEmbedding).toHaveBeenCalledTimes(1);

    const { edges } = data.ListReplies;
    expect(edges.map(({ node }) => node.id)).toEqual([
      'knnHighlightBoth',
      'knnHighlightSemantic',
    ]);

    // Highlights are the same as the ones without kNN
    const {
      data: {
        ListReplies: { edges: bm25Edges },
      },
    } = await query();
    const bm25Highlight = bm25Edges.find(
      ({ node }) => node.id === 'knnHighlightBoth'
    ).highlight;
    expect(bm25Highlight.text).toMatch('<HIGHLIGHT>kiwifruit</HIGHLIGHT>');
    expect(bm25Highlight.reference).toMatch('<HIGHLIGHT>kiwifruit</HIGHLIGHT>');
    expect(edges[0].highlight).toEqual(bm25Highlight);

    // No BM25 match, no highlight
    expect(edges[1].highlight).toMatchObject({ text: null, reference: null });
  });
});

describe('ListReplies kNN pagination', () => {
  // Goes through `gql` and hits ES, to check that the kNN candidates are not
  // capped at the page size (`first`): totalCount and the next page must see
  // all kNN matches.

  beforeAll(() => loadFixtures(knnPageFixtures));
  beforeEach(() => {
    createEmbedding.mockReset();
    createEmbedding.mockResolvedValue([{ vector: queryVector }]);
  });
  afterAll(() => unloadFixtures(knnPageFixtures));

  const query = gql`
    query ($after: String) {
      ListReplies(
        filter: { moreLikeThis: { like: "fruit drink" }, embedding: 0.8 }
        orderBy: [{ createdAt: DESC }]
        first: 2
        after: $after
      ) {
        totalCount
        edges {
          node {
            id
          }
          cursor
        }
      }
    }
  `;

  it('paginates through and counts all kNN matches', async () => {
    const page1 = await query();
    expect(page1.errors).toBeUndefined();
    expect(page1.data.ListReplies.totalCount).toBe(3);
    const page1Edges = page1.data.ListReplies.edges;
    expect(page1Edges.map(({ node }) => node.id)).toEqual([
      'knnPage1',
      'knnPage2',
    ]);

    const page2 = await query({
      after: page1Edges[page1Edges.length - 1].cursor,
    });
    expect(page2.errors).toBeUndefined();
    expect(page2.data.ListReplies.totalCount).toBe(3);
    expect(page2.data.ListReplies.edges.map(({ node }) => node.id)).toEqual([
      'knnPage3',
    ]);
  });
});

describe('ListReplies kNN as a hard filter', () => {
  // Goes through `gql` and hits ES with hand-crafted vectors.

  beforeAll(() => loadFixtures(knnHardFilterFixtures));
  beforeEach(() => {
    createEmbedding.mockReset();
    createEmbedding.mockResolvedValue([{ vector: queryVector }]);
  });
  afterAll(() => unloadFixtures(knnHardFilterFixtures));

  const query = gql`
    query ($embedding: Float) {
      ListReplies(
        filter: {
          moreLikeThis: { like: "earthquake drill schedule" }
          embedding: $embedding
        }
        orderBy: [{ _score: DESC }]
      ) {
        edges {
          score
          node {
            id
          }
        }
      }
    }
  `;

  // kNN is applied as a hard filter, so a document that matches the keywords
  // perfectly is still excluded when its embedding is far away or missing
  // (e.g. not backfilled yet). This is a side effect of the current design,
  // not a goal. If we later find a ranking that combines kNN and keyword
  // relevance, revisit this test and its fixtures.
  it('excludes keyword matches without a similar embedding', async () => {
    const { data, errors } = await query({ embedding: 0.8 });
    expect(errors).toBeUndefined();
    expect(data.ListReplies.edges.map(({ node }) => node.id)).toEqual([
      'knnHardFilterSemantic',
    ]);

    expect(createEmbedding).toHaveBeenCalledTimes(1);
    const [queryInfo, parts, , options] = createEmbedding.mock.calls[0];
    expect(queryInfo).toEqual({
      id: expect.stringMatching(/^query-text:/),
      type: 'text',
    });
    expect(parts).toEqual([{ text: 'earthquake drill schedule' }]);
    expect(options).toEqual({ taskType: 'RETRIEVAL_QUERY' });

    // Without kNN, the keyword match is found.
    createEmbedding.mockClear();
    const { data: bm25Data, errors: bm25Errors } = await query();
    expect(bm25Errors).toBeUndefined();
    expect(createEmbedding).not.toHaveBeenCalled();
    expect(bm25Data.ListReplies.edges.map(({ node }) => node.id)).toEqual([
      'knnHardFilterNoEmbedding',
    ]);
  });
});
