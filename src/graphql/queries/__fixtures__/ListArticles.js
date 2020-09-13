export default {
  '/articles/doc/listArticleTest1': {
    userId: 'user1',
    appId: 'app1',
    replyRequestCount: 2,
    normalArticleReplyCount: 2,
    normalArticleCategoryCount: 2,
    updatedAt: 1,
    createdAt: '2020-02-03T00:00:00.000Z',
    text: `
      憶昔封書與君夜，金鑾殿後欲明天。今夜封書在何處？廬山庵裏曉燈前。籠鳥檻猿俱未死，人間相見是何年？

      微之，微之！此夕此心，君知之乎！
    `,
    articleReplies: [
      {
        replyType: 'NOT_RUMOR',
        status: 'NORMAL',
        createdAt: '2020-02-08T15:11:04.472Z',
        updatedAt: '2020-02-08T15:11:04.472Z',
        userId: 'user1',
        appId: 'WEBSITE',
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 0,
      },
      {
        replyType: 'NOT_ARTICLE',
        status: 'NORMAL',
        createdAt: '2020-02-05T14:41:19.044Z',
        updatedAt: '2020-02-05T14:41:19.044Z',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 1,
      },
    ],
    articleCategories: [
      {
        categoryId: 'category1',
        status: 'NORMAL',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      },
      {
        categoryId: 'category-author-1',
        status: 'NORMAL',
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 0,
      },
    ],
  },
  '/articles/doc/listArticleTest2': {
    userId: 'user1',
    appId: 'app1',
    replyRequestCount: 1,
    normalArticleReplyCount: 1,
    normalArticleCategoryCount: 2,
    updatedAt: 2,
    createdAt: '2020-02-05T00:00:00.000Z',
    text:
      '臣亮言：先帝創業未半，而中道崩殂。今天下三分，益州 疲弊，此誠危急存亡之秋也。',
    articleReplies: [
      {
        replyType: 'RUMOR',
        status: 'NORMAL',
        createdAt: '2020-02-09T15:11:04.472Z',
        updatedAt: '2020-02-09T15:11:04.472Z',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      },
      {
        // Deleted article replies are not taken into account for createdAt and feedbacks
        replyType: 'NOT_RUMOR',
        status: 'DELETED',
        createdAt: '2020-02-15T15:11:04.472Z',
        updatedAt: '2020-02-16T15:11:04.472Z',
        userId: 'user1',
        appId: 'WEBSITE',
        positiveFeedbackCount: 3,
        negativeFeedbackCount: 0,
      },
      {
        // Deleted article replies are not taken into account for createdAt and feedbacks
        replyType: 'OPINIONATED',
        status: 'DELETED',
        createdAt: '2020-02-04T15:11:04.472Z',
        updatedAt: '2020-02-04T15:11:04.472Z',
        positiveFeedbackCount: 3,
        negativeFeedbackCount: 0,
      },
    ],
    articleCategories: [
      {
        categoryId: 'category1',
        status: 'NORMAL',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      },
      {
        categoryId: 'category-author-2',
        status: 'NORMAL',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 0,
      },
    ],
  },
  '/articles/doc/listArticleTest3': {
    userId: 'user2',
    appId: 'app1',
    replyRequestCount: 0,
    normalArticleReplyCount: 0,
    updatedAt: 3,
    createdAt: '2020-02-06T00:00:00.000Z',
    text:
      '人生幾何，離闊如此！況以膠漆之心，置於胡越之身，進不得相合，退不能相忘，牽攣乖隔，各欲白首。',
    articleReplies: [],
    articleCategories: [
      {
        // Ineffective articleCategory since it's deleted
        categoryId: 'category1',
        status: 'DELETED',
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 0,
      },
    ],
  },
  '/articles/doc/listArticleTest4': {
    userId: 'user2',
    appId: 'app1',
    replyRequestCount: 0,
    normalArticleReplyCount: 3,
    updatedAt: 4,
    createdAt: '2020-02-07T00:00:00.000Z',
    text: '我好餓 http://gohome.com',
    hyperlinks: [
      {
        url: 'http://gohome.com',
        normalizedUrl: 'http://gohome.com/',
        title: '馮諼很餓',
        summary:
          '居有頃，倚柱彈其劍，歌曰：「長鋏歸來乎！食無魚。」左右以告。孟嘗君曰：「食之，比門下之客。」',
      },
      {
        url: 'http://qoo.com',
        normalizedUrl: 'http://qoo.com/',
        title: '出師表',
        summary: '今天下三分，益州 疲弊，此誠危急存亡之秋也。',
      },
      {
        url: 'http://boo.com',
        normalizedUrl: 'http://boo.com/',
        title: 'title should not match.',
        summary: 'summary should not match.',
      },
    ],
    articleReplies: [
      {
        replyType: 'OPINIONATED',
        status: 'NORMAL',
        createdAt: '2020-02-11T15:11:04.472Z',
        updatedAt: '2020-02-11T15:11:04.472Z',
        positiveFeedbackCount: 10,
        negativeFeedbackCount: 11,
      },
      {
        replyType: 'NOT_ARTICLE',
        status: 'NORMAL',
        createdAt: '2020-02-10T15:11:04.472Z',
        updatedAt: '2020-02-10T15:11:04.472Z',
        positiveFeedbackCount: 5,
        negativeFeedbackCount: 7,
      },
      {
        replyType: 'NOT_ARTICLE',
        status: 'NORMAL',
        createdAt: '2020-02-09T15:11:04.472Z',
        updatedAt: '2020-02-09T15:11:04.472Z',
        positiveFeedbackCount: 3,
        negativeFeedbackCount: 4,
      },
    ],
    articleCategories: [
      {
        // Ineffective articleCategory since it has more negative feedback
        categoryId: 'category1',
        status: 'NORMAL',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 1,
      },
    ],
  },
  '/categories/doc/category1': {
    title: '文言文',
    description: '就是文言文',
  },
  '/categories/doc/category-author-1': {
    title: '白居易',
    description: '白居易，字樂天',
  },
  '/categories/doc/category-author-2': {
    title: '諸葛亮',
    description: '諸葛亮，字孔明',
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
  '/users/doc/user1': {
    name: 'user1',
  },
  '/analytics/doc/article_listArticleTest1_2020-01-02': {
    date: '2020-01-02',
    docId: 'listArticleTest1',
    type: 'article',
    stats: { webVisit: 30, webUser: 19, lineVisit: 7, lineUser: 5 },
  },
  '/analytics/doc/article_listArticleTest1_2020-01-03': {
    date: '2020-01-03',
    docId: 'listArticleTest1',
    type: 'article',
    stats: { webVisit: 26, webUser: 18, lineVisit: 7, lineUser: 1 },
  },
  '/analytics/doc/article_listArticleTest1_2020-01-04': {
    date: '2020-01-04',
    docId: 'listArticleTest1',
    type: 'article',
    stats: { webVisit: 15, webUser: 6 },
  },
  '/analytics/doc/article_listArticleTest1_2020-01-05': {
    date: '2020-01-05',
    docId: 'listArticleTest1',
    type: 'article',
    stats: { webVisit: 44, webUser: 37, lineVisit: 15, lineUser: 9 },
  },
  '/analytics/doc/article_listArticleTest2_2020-01-02': {
    date: '2020-01-02',
    docId: 'listArticleTest2',
    type: 'article',
    stats: { webVisit: 22, webUser: 5, lineVisit: 5, lineUser: 1 },
  },
  '/analytics/doc/article_listArticleTest2_2020-01-03': {
    date: '2020-01-03',
    docId: 'listArticleTest2',
    type: 'article',
    stats: { webVisit: 21, webUser: 6, lineVisit: 2, lineUser: 1 },
  },
  '/analytics/doc/article_listArticleTest2_2020-01-04': {
    date: '2020-01-04',
    docId: 'listArticleTest2',
    type: 'article',
    stats: { webVisit: 15, webUser: 7, lineVisit: 15, lineUser: 9 },
  },
  '/analytics/doc/article_listArticleTest2_2020-01-05': {
    date: '2020-01-05',
    docId: 'listArticleTest2',
    type: 'article',
    stats: { webVisit: 44, webUser: 37 },
  },
};
