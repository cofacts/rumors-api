export default {
  '/urls/doc/fb-login': {
    url: 'https://www.facebook.com/page/posts/1',
    title: '登入 Facebook',
    summary: '真正的貼文內容',
  },
  '/urls/doc/fb-login-2': {
    url: 'https://www.facebook.com/page/posts/2',
    title: '登入 Facebook',
    summary: '',
  },
  '/urls/doc/normal': {
    url: 'https://example.com/news/1',
    title: '一般新聞標題',
    summary: '一般新聞內容',
  },
  '/urls/doc/site-name': {
    url: 'https://www.fda.gov.tw/tc/newsContent.aspx?id=1',
    title: '衛生福利部食品藥物管理署',
    summary: '衛生福利部食品藥物管理署',
  },
  '/articles/doc/a1': {
    text: 'https://www.facebook.com/page/posts/1 https://example.com/news/1',
    hyperlinks: [
      {
        url: 'https://www.facebook.com/page/posts/1',
        title: '登入 Facebook',
        summary: '真正的貼文內容',
      },
      {
        url: 'https://example.com/news/1',
        title: '一般新聞標題',
        summary: '一般新聞內容',
      },
    ],
  },
  '/replies/doc/r1': {
    text: 'https://www.facebook.com/page/posts/3',
    hyperlinks: [
      {
        url: 'https://www.facebook.com/page/posts/3',
        title: '登入 Facebook',
        summary: '',
      },
    ],
  },
};
