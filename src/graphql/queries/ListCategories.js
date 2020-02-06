import { createSortType, createConnectionType, pagingArgs } from 'graphql/util';

import Category from 'graphql/models/Category';

const MOCK_CATEGORY_DATA = [
  {
    id: 'c1',
    title: '性少數與愛滋病',
    description: '對同性婚姻的恐懼、愛滋病的誤解與的防疫相關釋疑。',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  {
    id: 'c2',
    title: '女權與性別刻板印象',
    description: '對性別平等教育的恐慌與抹黑',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  {
    id: 'c3',
    title: '保健秘訣、食品安全',
    description:
      '各種宣稱會抗癌、高血壓、糖尿病等等的偏方秘笈、十大恐怖美食、不要吃海帶、美粒果',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  {
    id: 'c4',
    title: '基本人權問題',
    description: '新疆集中營、警暴、709大抓捕',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  {
    id: 'c5',
    title: '中國影響力',
    description:
      '兩岸三地、疆獨藏獨相關事件，如六四、飛越海峽中線事件、反送中、非洲豬瘟等等。對中國事務全然正面的描述、疑似為大外宣一環的訊息。',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  {
    id: 'c6',
    title: '農林漁牧政策',
    description: '花生、高麗菜等物價波動；農損補助、廚餘養豬轉型、老農津貼等等',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  {
    id: 'c7',
    title: '能源轉型',
    description: '能源占比、核能、火力、風電、夏季電價等等',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  {
    id: 'c8',
    title: '環境生態保護',
    description: '石虎、全球暖化、亞泥、COP',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  {
    id: 'c9',
    title: '優惠措施、新法規',
    description: '高鐵優惠票、節電獎勵、老人津貼、旅遊補助之類、交通新法規 etc',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  {
    id: 'c10',
    title: '科技、資安、隱私',
    description: '5G、大數據、人工智慧、臉部辨識',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
  {
    id: 'c11',
    title: '免費訊息詐騙',
    description: '詐騙貼圖、假行銷手法',
    createdAt: '2020-02-06T05:34:45.862Z',
    updatedAt: '2020-02-06T05:34:45.862Z',
  },
];

function getMockCursor(category) {
  return category.id;
}

export default {
  args: {
    orderBy: {
      type: createSortType('ListCategoryOrderBy', ['createdAt']),
    },
    ...pagingArgs,
  },
  async resolve(rootValue, { first = 10, after, before }) {
    // TODO: Remove mockdata
    let firstIdx = 0;
    if (after) {
      firstIdx =
        MOCK_CATEGORY_DATA.findIndex(
          category => getMockCursor(category) === after
        ) + 1;
    } else if (before) {
      const lastIdx = MOCK_CATEGORY_DATA.findIndex(
        category => getMockCursor(category) === before
      );
      firstIdx = lastIdx - first;
    }
    return MOCK_CATEGORY_DATA.slice(Math.max(0, firstIdx), firstIdx + first);
  },
  type: createConnectionType('ListCategoryConnection', Category, {
    // TODO: When we fetch data from Elasticsearch, createConnectionType()'s default resolvers should
    // do its job, and we won't need any of the following mock resolvers below.
    //
    resolveEdges: function mockResolveEdges(mockData) {
      return mockData.map(category => ({
        node: category,
        cursor: getMockCursor(category),
      }));
    },
    resolveTotalCount: function mockResolveTotalCount() {
      return MOCK_CATEGORY_DATA.length;
    },
    resolveLastCursor: function mockResolveLastCursor() {
      return getMockCursor(MOCK_CATEGORY_DATA[MOCK_CATEGORY_DATA.length - 1]);
    },
    resolveFirstCursor: function mockResolveFirstCursor() {
      return getMockCursor(MOCK_CATEGORY_DATA[0]);
    },
  }),
};
