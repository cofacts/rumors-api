import MockDate from 'mockdate';

import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import awardBadge from '../awardBadge';
import fixtures from '../__fixtures__/awardBadge';

const FIXED_DATE = 612921600000;

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
  MockDate.set(FIXED_DATE);
  const result = await awardBadge({
    userId: 'user-to-award-badge',
    badgeId: 'test-certification-001',
    badgeMetaData: '{"from":"some-orgnization}',
  });
  MockDate.reset();

  expect(result).toMatchInlineSnapshot(`
    Object {
      "badgeId": "test-certification-001",
      "badgeMetaData": "{\\"from\\":\\"some-orgnization}",
    }
  `);

  const {
    body: { _source: userWithBadge },
  } = await client.get({
    index: 'users',
    type: 'doc',
    id: 'user-to-award-badge',
  });

  // Assert that badgeId is written on the user
  expect(userWithBadge).toMatchInlineSnapshot(`
    Object {
      "badges": Array [
        Object {
          "badgeId": "test-certification-001",
          "badgeMetaData": "{\\"from\\":\\"some-orgnization}",
          "createdAt": "1989-06-04T00:00:00.000Z",
          "isDisplayed": true,
          "updatedAt": "1989-06-04T00:00:00.000Z",
        },
      ],
      "createdAt": "2020-01-01T00:00:00.000Z",
      "googleId": "some-google-id",
      "name": "user-to-award-badge",
    }
  `);
});
