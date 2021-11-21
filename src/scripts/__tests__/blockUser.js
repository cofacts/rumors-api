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

  //
  // Check reply requests
  //

  // Assert reply requests that is already blocked are not selected to update
  //
  const {
    body: { _source: someArticleWithAlreadyBlockedReplyRequest },
  } = await client.get({
    index: 'articles',
    type: 'doc',
    id: 'some-article',
  });
  expect(someArticleWithAlreadyBlockedReplyRequest).toMatchObject(
    fixtures['/articles/doc/some-article']
  );

  // Assert normal reply requests being blocked and article being updated
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
    // Only replyrequests/doc/valid-reply-request
    replyRequestCount: 1,
    lastRequestedAt:
      fixtures['/replyrequests/doc/valid-reply-request'].createdAt,
  });
});

// it('still updates statuses of blocked user even if they are blocked previously')
