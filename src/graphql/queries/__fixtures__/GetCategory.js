export default {
  '/categories/doc/c1': {
    title: '性少數與愛滋病',
    description: '對同性婚姻的恐懼、愛滋病的誤解與的防疫相關釋疑。',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  '/articles/doc/GetCategory1': {
    text: 'Lorum ipsum',
    articleCategories: [
      {
        categoryId: 'c1',
        status: 'NORMAL',
        createdAt: '2015-01-01T12:10:30Z',
        updatedAt: '2015-01-02T12:10:30Z',
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 0,
      },
    ],
    normalArticleCategoryCount: 1,
  },
  '/articles/doc/GetCategory2': {
    text: 'Lorum ipsum',
    articleCategories: [
      {
        categoryId: 'c1',
        status: 'DELETED',
        createdAt: '2015-01-01T12:10:30Z',
        updatedAt: '2015-01-02T12:10:30Z',
        positiveFeedbackCount: 0,
        negativeFeedbackCount: 1,
      },
    ],
    normalArticleCategoryCount: 1,
  },
};
