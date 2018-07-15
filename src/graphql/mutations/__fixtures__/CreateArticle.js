import { getArticleId } from '../CreateArticle';

export const fixture1Text = 'I think I am I exist';
export const fixture2Text = 'I think I exist I am';

export default {
  [`/articles/doc/${getArticleId(fixture2Text)}`]: {
    text: fixture2Text,
    replyRequestCount: 1,
    references: [{ type: 'LINE' }],
  },
  [`/articles/doc/${getArticleId(fixture1Text)}`]: {
    text: fixture1Text,
    replyRequestCount: 1,
    references: [{ type: 'LINE' }],
  },
  '/urls/doc/hyperlink1': {
    canonical: 'http://foo.com/article/1',
    title: 'FOO title',
    summary: 'FOO article content',
    url: 'http://foo.com/article/1-super-long-url-for-SEO',
  },
};
