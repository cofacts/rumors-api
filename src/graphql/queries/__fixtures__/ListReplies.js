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
