import MockDate from 'mockdate';

import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import revokeBadge from '../revokeBadge';
import fixtures from '../__fixtures__/revokeBadge';

const FIXED_DATE = 612921600000;

beforeEach(async () => {
  await loadFixtures(fixtures);
  MockDate.set(FIXED_DATE);
});

afterEach(async () => {
  await unloadFixtures(fixtures);
  MockDate.reset();
});

describe('revokeBadge', () => {
  it('fails if userId is not valid', async () => {
    await expect(
      revokeBadge({
        userId: 'not-exist',
        badgeId: 'test-certification-001',
        request: { userId: 'authorized-issuer@test.com' },
      })
    ).rejects.toMatchInlineSnapshot(
      `[HTTPError: User with ID=not-exist does not exist]`
    );
  });

  it('correctly revokes the badge when authorized', async () => {
    const result = await revokeBadge({
      userId: 'user-with-badge',
      badgeId: 'test-certification-001',
      request: { userId: 'authorized-issuer@test.com' },
    });

    expect(result).toMatchInlineSnapshot(`
      Object {
        "badgeId": "test-certification-001",
        "success": true,
      }
    `);

    const {
      body: { _source: userWithBadge },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id: 'user-with-badge',
    });

    // Assert that the badge is removed from the user
    expect(userWithBadge.badges).toHaveLength(1);
    expect(userWithBadge.badges[0].badgeId).toBe('test-certification-002');
  });

  it('allows service token to revoke badge', async () => {
    const result = await revokeBadge({
      userId: 'user-with-badge',
      badgeId: 'test-certification-002',
      request: { userId: 'service-token-123' },
    });

    expect(result).toMatchInlineSnapshot(`
      Object {
        "badgeId": "test-certification-002",
        "success": true,
      }
    `);

    const {
      body: { _source: userWithBadge },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id: 'user-with-badge',
    });

    // Assert that the badge is removed from the user
    expect(userWithBadge.badges).toHaveLength(1);
    expect(userWithBadge.badges[0].badgeId).toBe('test-certification-001');
  });

  it('does nothing if the user does not have the badge', async () => {
    const result = await revokeBadge({
      userId: 'user-without-badge',
      badgeId: 'test-certification-001',
      request: { userId: 'authorized-issuer@test.com' },
    });

    expect(result).toMatchInlineSnapshot(`
      Object {
        "badgeId": "test-certification-001",
        "success": true,
      }
    `);

    const {
      body: { _source: userWithoutBadge },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id: 'user-without-badge',
    });

    // Assert that the user still has no badges
    expect(userWithoutBadge.badges).toHaveLength(0);
  });

  it('does nothing if the user has other badges but not the specified one', async () => {
    const result = await revokeBadge({
      userId: 'user-without-badge',
      badgeId: 'test-certification-003',
      request: { userId: 'authorized-issuer@test.com' },
    });

    expect(result).toMatchInlineSnapshot(`
      Object {
        "badgeId": "test-certification-003",
        "success": true,
      }
    `);

    const {
      body: { _source: userWithBadge },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id: 'user-with-badge',
    });

    // Assert that the user still has both original badges
    expect(userWithBadge.badges).toHaveLength(2);
    expect(userWithBadge.badges[0].badgeId).toBe('test-certification-001');
    expect(userWithBadge.badges[1].badgeId).toBe('test-certification-002');
  });
});
