import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import awardBadge from '../awardBadge';
import fixtures from '../__fixtures__/awardBadge';

beforeEach(() => loadFixtures(fixtures));
afterEach(() => unloadFixtures(fixtures));

it('fails if userId is not valid', async () => {
  await expect(
    awardBadge({
      userId: 'not-exist',
      badgeId: 'badge id',
      badgeMetaData: '{}',
    })
  ).rejects.toMatchInlineSnapshot(
    `[HTTPError: User with ID=not-exist does not exist]`
  );
});

/**
 * Asserts the document in database is the same as in the fixture,
 * i.e. the document is not modified
 *
 * @param {string} fixtureKey
 * @param {{index: string; id: string;}} clientGetArgs - Arguments for client.get()
 */

it('correctly sets the awarded badge id and updates status of their works', async () => {
  const result = await awardBadge({
    userId: 'user-to-award-badge',
    badgeId: 'test-certification-001',
    badgeMetaData: '{"from":"some-orgnization}',
  });

  expect(result).toMatchInlineSnapshot(`
    Object {
      badgeId: 'test-certification-001',
      badgeMetaData: '{"from":"some-orgnization}',
    }
  `);

  const {
    body: { _source: awardBadge },
  } = await client.get({
    index: 'users',
    type: 'doc',
    id: 'user-id',
  });

  // Assert that badgeId is written on the user
  expect(awardBadge).toMatchInlineSnapshot(`
    Object {
      'badgeId': 'test-certification-001',
      'badgeMetaData': '{"from":"some-orgnization}',
    }
  `);
});
