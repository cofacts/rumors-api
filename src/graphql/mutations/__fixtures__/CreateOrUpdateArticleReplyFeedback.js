import { getArticleReplyFeedbackId } from '../CreateOrUpdateArticleReplyFeedback';

export default {
  '/articles/doc/article1': {
    articleReplies: [
      {
        replyId: 'reply1',
        positiveFeedbackCount: 1,
        negativeFeedbackCount: 0,
      },
    ],
  },
  [`/articlereplyfeedbacks/doc/${getArticleReplyFeedbackId({
    articleId: 'article1',
    replyId: 'reply1',
    userId: 'testUser',
    clientId: 'testClient',
  })}`]: {
    score: 1,
    appId: 'testClient',
    userId: 'testUser',
  },
};
