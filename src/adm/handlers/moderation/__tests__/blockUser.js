import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import blockUser from '../blockUser';
import fixtures from '../__fixtures__/blockUser';

beforeEach(() => loadFixtures(fixtures));
afterEach(() => unloadFixtures(fixtures));

it('fails if userId is not valid', async () => {
  expect(
    blockUser({ userId: 'not-exist', blockedReason: 'announcement url' })
  ).rejects.toMatchInlineSnapshot(
    `[Error: User with ID=not-exist does not exist]`
  );
});

/**
 * Asserts the document in database is the same as in the fixture,
 * i.e. the document is not modified
 *
 * @param {string} fixtureKey
 * @param {{index: string; id: string;}} clientGetArgs - Arguments for client.get()
 */
async function expectSameAsFixture(fixtureKey, clientGetArgs) {
  const {
    body: { _source: docInDb },
  } = await client.get({ ...clientGetArgs, type: 'doc' });
  expect(docInDb).toMatchObject(fixtures[fixtureKey]);
}

it('correctly sets the block reason and updates status of their works', async () => {
  await blockUser({
    userId: 'user-to-block',
    blockedReason: 'announcement url',
  });

  const {
    body: { _source: blockedUser },
  } = await client.get({
    index: 'users',
    type: 'doc',
    id: 'user-to-block',
  });

  // Assert that blockedReason is written on the user
  expect(blockedUser).toMatchInlineSnapshot(`
    Object {
      "blockedReason": "announcement url",
      "name": "Naughty spammer",
    }
  `);

  // Assert valid contents remain as-is
  //
  await expectSameAsFixture('/replyrequests/doc/valid-reply-request', {
    index: 'replyrequests',
    id: 'valid-reply-request',
  });
  await expectSameAsFixture('/articlereplyfeedbacks/doc/f-normal', {
    index: 'articlereplyfeedbacks',
    id: 'f-normal',
  });

  // Assert contents that is already blocked are not selected to update
  //
  await expectSameAsFixture('/articles/doc/some-article', {
    index: 'articles',
    id: 'some-article',
  });
  await expectSameAsFixture('/articlereplyfeedbacks/doc/f-already-blocked', {
    index: 'articlereplyfeedbacks',
    id: 'f-already-blocked',
  });

  // Assert normal contents being blocked and article being updated
  //
  const {
    body: { _source: replyRequestToBlock },
  } = await client.get({
    index: 'replyrequests',
    type: 'doc',
    id: 'replyrequest-to-block',
  });
  expect(replyRequestToBlock.status).toEqual('BLOCKED');

  const {
    body: { _source: modifiedArticle },
  } = await client.get({
    index: 'articles',
    type: 'doc',
    id: 'modified-article',
  });
  expect(modifiedArticle).toMatchObject({
    // Only the article reply by valid-user
    normalArticleReplyCount: 1,

    // Only replyrequests/doc/valid-reply-request
    replyRequestCount: 1,
    lastRequestedAt:
      fixtures['/replyrequests/doc/valid-reply-request'].createdAt,
  });

  // Assert article reply being blocked
  expect(modifiedArticle.articleReplies[1]).toMatchObject({
    userId: 'user-to-block',
    status: 'BLOCKED',

    // the negative feedback given by valid user is still there
    positiveFeedbackCount:
      fixtures['/articles/doc/modified-article'].articleReplies[1]
        .positiveFeedbackCount,
    negativeFeedbackCount:
      fixtures['/articles/doc/modified-article'].articleReplies[1]
        .negativeFeedbackCount,
  });

  // Assert article reply feedback is being blocked
  //
  const {
    body: { _source: articleReplyFeedbackToBlock },
  } = await client.get({
    index: 'articlereplyfeedbacks',
    type: 'doc',
    id: 'f-spam',
  });
  expect(articleReplyFeedbackToBlock.status).toEqual('BLOCKED');

  // Assert malicious negative feedback is removed from normal article reply
  //
  expect(modifiedArticle.articleReplies[0]).toMatchObject({
    userId: 'valid-user',
    status: 'NORMAL',
    positiveFeedbackCount:
      fixtures['/articles/doc/modified-article'].articleReplies[0]
        .positiveFeedbackCount,
    negativeFeedbackCount: 0, // Originally 1
  });

  // Expect spammer's article's status are changed to blocked
  const {
    body: { _source: spammerArticle },
  } = await client.get({
    index: 'articles',
    type: 'doc',
    id: 'spammers-article',
  });
  expect(spammerArticle.status).toEqual('BLOCKED');
});

// it('still updates statuses of blocked user even if they are blocked previously')
