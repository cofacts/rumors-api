import type { User } from 'rumors-db/schema/users';

export default {
  '/users/doc/user-to-award-badge': {
    name: 'user-to-award-badge',
    createdAt: '2020-01-01T00:00:00.000Z',
    googleId: 'some-google-id',
    badges: [],
  } satisfies User,

  '/users/doc/user-already-award-badge': {
    name: 'user-already-award-badge',
    createdAt: '2020-01-01T00:00:00.000Z',
    googleId: 'some-google-id',
    badges: [
      {
        badgeId: 'test-certification-001',
        badgeMetaData: '{"from":"some-orgnization}',
        isDisplayed: false,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
    ],
  } satisfies User,
};
