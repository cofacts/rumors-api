export default {
  '/categories/doc/c1': {
    title: '性少數與愛滋病',
    description: '對同性婚姻的恐懼、愛滋病的誤解與的防疫相關釋疑。',
  },
  '/categories/doc/c2': {
    title: '免費訊息詐騙',
    description: '詐騙貼圖、假行銷手法。',
  },
  '/articles/doc/GetCategory1': {
    text: 'Lorum ipsum',
    articleCategories: [
      {
        categoryId: 'c1',
        status: 'NORMAL',
      },
      {
        categoryId: 'c2',
        status: 'DELETED',
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
      },
      {
        categoryId: 'c2',
        status: 'NORMAL',
      },
    ],
    normalArticleCategoryCount: 1,
  },
};
