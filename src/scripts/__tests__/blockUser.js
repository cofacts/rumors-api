import { loadFixtures, unloadFixtures } from 'util/fixtures';
// import client from 'util/client';
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

it('Cannot block with identical reason', async () => {
  expect(
    blockUser({ userId: 'already-blocked', blockedReason: 'Some annoucement' })
  ).rejects.toMatchInlineSnapshot();
});
