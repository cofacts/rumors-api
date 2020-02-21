export default {
  '/articles/doc/listArticleTest1': {
    userId: 'user1',
    appId: 'app1',
    replyRequestCount: 2,
    normalArticleReplyCount: 2,
    updatedAt: 1,
    text: `
      憶昔封書與君夜，金鑾殿後欲明天。今夜封書在何處？廬山庵裏曉燈前。籠鳥檻猿俱未死，人間相見是何年？

      微之，微之！此夕此心，君知之乎！
    `,
    articleReplies: [
      {
        status: 'NORMAL',
        createdAt: '2020-02-08T15:11:04.472Z',
        updatedAt: '2020-02-08T15:11:04.472Z',
      },
      {
        status: 'NORMAL',
        createdAt: '2020-02-05T14:41:19.044Z',
        updatedAt: '2020-02-05T14:41:19.044Z',
      },
    ],
  },
  '/articles/doc/listArticleTest2': {
    userId: 'user1',
    appId: 'app1',
    replyRequestCount: 1,
    normalArticleReplyCount: 1,
    updatedAt: 2,
    text:
      '臣亮言：先帝創業未半，而中道崩殂。今天下三分，益州 疲弊，此誠危急存亡之秋也。',
    articleReplies: [
      {
        status: 'NORMAL',
        createdAt: '2020-02-09T15:11:04.472Z',
        updatedAt: '2020-02-09T15:11:04.472Z',
      },
    ],
  },
  '/articles/doc/listArticleTest3': {
    userId: 'user2',
    appId: 'app1',
    replyRequestCount: 0,
    normalArticleReplyCount: 0,
    updatedAt: 3,
    text:
      '人生幾何，離闊如此！況以膠漆之心，置於胡越之身，進不得相合，退不能相忘，牽攣乖隔，各欲白首。',
    articleReplies: [
      {
        status: 'NORMAL',
        createdAt: '2020-02-05T15:11:04.472Z',
        updatedAt: '2020-02-05T15:11:04.472Z',
      },
    ],
  },
  '/articles/doc/listArticleTest4': {
    userId: 'user2',
    appId: 'app1',
    replyRequestCount: 0,
    normalArticleReplyCount: 0,
    updatedAt: 4,
    text: '我好餓 http://gohome.com',
    hyperlinks: [
      {
        url: 'http://gohome.com',
        normalizedUrl: 'http://gohome.com/',
        title: '馮諼很餓',
        summary:
          '居有頃，倚柱彈其劍，歌曰：「長鋏歸來乎！食無魚。」左右以告。孟嘗君曰：「食之，比門下之客。」',
      },
    ],
    articleReplies: [
      {
        status: 'NORMAL',
        createdAt: '2020-02-11T15:11:04.472Z',
        updatedAt: '2020-02-11T15:11:04.472Z',
      },
      {
        status: 'NORMAL',
        createdAt: '2020-02-10T15:11:04.472Z',
        updatedAt: '2020-02-10T15:11:04.472Z',
      },
      {
        status: 'NORMAL',
        createdAt: '2020-02-09T15:11:04.472Z',
        updatedAt: '2020-02-09T15:11:04.472Z',
      },
    ],
  },
  '/urls/doc/gohome': {
    url: 'http://gohome.com/',
    title: '馮諼很餓',
    summary:
      '居有頃，倚柱彈其劍，歌曰：「長鋏歸來乎！食無魚。」左右以告。孟嘗君曰：「食之，比門下之客。」',
    topImageUrl: 'http://gohome.com/image.jpg',
  },
  '/urls/doc/biau': {
    url: 'http://出師表.com/',
    title: '出師表',
    summary:
      '臣亮言：先帝創業未半，而中道崩殂。今天下三分，益州 疲弊，此誠危急存亡之秋也。',
    topImageUrl: 'http://出師表.com/image.jpg',
  },
};
