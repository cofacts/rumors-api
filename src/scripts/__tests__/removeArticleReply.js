import MockDate from 'mockdate';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import removeArticleReply from '../removeArticleReply';
import fixtures from '../__fixtures__/removeArticleReply';

const FIXED_DATE = 612921600000;

beforeEach(() => loadFixtures(fixtures));
afterEach(() => unloadFixtures(fixtures));

it('should block invalid usage', async () => {
  await expect(removeArticleReply()).rejects.toMatchInlineSnapshot(
    `[Error: Please provide all of articleId, replyId and userId]`
  );
  await expect(
    removeArticleReply({
      userId: 'current-user',
      articleId: 'article1' /* replyId missing */,
    })
  ).rejects.toMatchInlineSnapshot(
    `[Error: Please provide all of articleId, replyId and userId]`
  );
});

it('should abort when article or reply ID is wrong', async () => {
  await expect(
    removeArticleReply({
      userId: 'no-such-user',
      articleId: 'article1',
      replyId: 'foo',
    })
  ).rejects.toMatchInlineSnapshot(
    `[Error: Cannot change status for articleReply(articleId=article1, replyId=foo)]`
  );
  await expect(
    removeArticleReply({
      userId: 'current-user',
      articleId: 'no-such-article',
      replyId: 'foo',
    })
  ).rejects.toMatchInlineSnapshot(
    `[ResponseError: document_missing_exception]`
  );
  await expect(
    removeArticleReply({
      userId: 'current-user',
      articleId: 'article1',
      replyId: 'no-such-reply',
    })
  ).rejects.toMatchInlineSnapshot(
    `[Error: Cannot change status for articleReply(articleId=article1, replyId=no-such-reply)]`
  );
});

it('successfully deletes article-reply and updates normalArticleReplyCount', async () => {
  MockDate.set(FIXED_DATE);

  const replacedTextValue = 'This is the replaced text';

  const result = await removeArticleReply({
    userId: 'current-user',
    articleId: 'article1',
    replyId: 'foo',
    replacedText: replacedTextValue,
  });

  MockDate.reset();

  expect(result).toMatchInlineSnapshot(`
Array [
  Object {
    "appId": "WEBSITE",
    "replyId": "foo",
    "status": "DELETED",
    "updatedAt": "1989-06-04T00:00:00.000Z",
    "userId": "current-user",
  },
  Object {
    "appId": "WEBSITE",
    "replyId": "bar",
    "status": "NORMAL",
    "userId": "current-user",
  },
  Object {
    "appId": "WEBSITE",
    "replyId": "foo2",
    "status": "NORMAL",
    "userId": "other-user",
  },
]
`);
  const {
    body: { _source },
  } = await client.get({
    index: 'articles',
    type: 'doc',
    id: 'article1',
  });
  expect(_source.normalArticleReplyCount).toBe(2);

  const {
    body: { doc },
  } = await client.get({
    index: 'replies',
    type: 'doc',
    id: 'foo',
  });
  expect(doc.text).toBe(replacedTextValue);
});
