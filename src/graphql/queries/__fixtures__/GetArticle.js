export default {
  '/categories/doc/c1': {
    title: '性少數與愛滋病',
    description: '對同性婚姻的恐懼、愛滋病的誤解與的防疫相關釋疑。',
  },
  '/categories/doc/c2': {
    title: '免費訊息詐騙',
    description: '詐騙貼圖、假行銷手法。',
  },
  '/articles/doc/GetArticle1': {
    text: '愛滋病毒比保險套的孔隙更小，保險套無法達到保護的效果',
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
};
