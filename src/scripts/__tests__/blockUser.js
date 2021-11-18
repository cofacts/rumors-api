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
});

// it('still updates statuses of blocked user even if they are blocked previously')
