import { vectorWithSimilarity } from 'util/vectors';

export default {
  '/replies/doc/moreLikeThis1': {
    text: 'foo foo',
    reference: 'bar bar',
    type: 'NOT_ARTICLE',
    createdAt: '2020-02-06T00:00:00.000Z',
  },
  '/replies/doc/moreLikeThis2': {
    text: 'bar bar bar',
    reference: 'foo foo foo',
    type: 'NOT_ARTICLE',
    createdAt: '2020-02-05T00:00:00.000Z',
  },
  '/replies/doc/userFoo': {
    text: 'bar',
    reference: 'barbar',
    type: 'NOT_ARTICLE',
    userId: 'foo',
    appId: 'test',
    createdAt: '2020-02-07T00:00:00.000Z',
  },
  '/replies/doc/rumor': {
    text: 'bar',
    reference: 'barbar',
    type: 'RUMOR',
    createdAt: '2020-02-04T00:00:00.000Z',
  },
  '/replies/doc/referenceUrl': {
    text: '國文課本',
    reference: 'http://gohome.com',
    hyperlinks: [
      {
        url: 'http://gohome.com',
        normalizedUrl: 'http://gohome.com/',
        title: '馮諼很餓',
        summary:
          '居有頃，倚柱彈其劍，歌曰：「長鋏歸來乎！食無魚。」左右以告。孟嘗君曰：「食之，比門下之客。」',
      },
    ],
    type: 'NOT_RUMOR',
    createdAt: '2020-02-04T00:00:00.000Z',
  },
  '/urls/doc/gohome': {
    url: 'http://gohome.com/',
    title: '馮諼很餓',
    summary:
      '居有頃，倚柱彈其劍，歌曰：「長鋏歸來乎！食無魚。」左右以告。孟嘗君曰：「食之，比門下之客。」',
    topImageUrl: 'http://gohome.com/image.jpg',
  },
  '/urls/doc/foobar': {
    url: 'http://foo.com/',
    title: 'bar',
    summary: 'bar',
    topImageUrl: 'http://foo.com/image.jpg',
  },
};

// The fixtures below are loaded only in the kNN tests that need them, to keep
// the snapshots of the default fixtures unaffected.

export const knnHighlightFixtures = {
  // Matches the query both by BM25 and by kNN
  '/replies/doc/knnHighlightBoth': {
    text: 'kiwifruit smoothie recipe with banana',
    reference: 'kiwifruit recipe book',
    type: 'NOT_ARTICLE',
    createdAt: '2020-02-06T00:00:00.000Z',
    embeddings: [{ vector: vectorWithSimilarity(1) }],
  },
  // Matches the query by kNN only
  '/replies/doc/knnHighlightSemantic': {
    text: 'tropical fruit beverage',
    reference: 'drink book',
    type: 'NOT_ARTICLE',
    createdAt: '2020-02-06T00:00:00.000Z',
    embeddings: [{ vector: vectorWithSimilarity(0.95) }],
  },
  // Matches the query by BM25 only
  '/replies/doc/knnHighlightFar': {
    text: 'kiwifruit smoothie recipe',
    reference: 'kiwifruit recipe book',
    type: 'NOT_ARTICLE',
    createdAt: '2020-02-06T00:00:00.000Z',
    embeddings: [{ vector: vectorWithSimilarity(0) }],
  },
};

export const knnPageFixtures = {
  '/replies/doc/knnPage1': {
    text: 'durian milkshake',
    reference: 'book',
    type: 'NOT_ARTICLE',
    createdAt: '2020-02-07T00:00:04.000Z',
    embeddings: [{ vector: vectorWithSimilarity(1) }],
  },
  '/replies/doc/knnPage2': {
    text: 'mango lassi',
    reference: 'book',
    type: 'NOT_ARTICLE',
    createdAt: '2020-02-07T00:00:03.000Z',
    embeddings: [{ vector: vectorWithSimilarity(0.95) }],
  },
  '/replies/doc/knnPage3': {
    text: 'papaya juice',
    reference: 'book',
    type: 'NOT_ARTICLE',
    createdAt: '2020-02-07T00:00:02.000Z',
    embeddings: [{ vector: vectorWithSimilarity(0.9) }],
  },
  // Not similar enough to the query vector
  '/replies/doc/knnPageFar': {
    text: 'car insurance',
    reference: 'book',
    type: 'NOT_ARTICLE',
    createdAt: '2020-02-07T00:00:01.000Z',
    embeddings: [{ vector: vectorWithSimilarity(0) }],
  },
};
