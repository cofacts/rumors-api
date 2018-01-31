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
};
