import type { User } from 'rumors-db/schema/users';
import type { Badge } from 'rumors-db/schema/badges';

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
        badgeMetaData: '{"from":"some-orgnization"}',
        isDisplayed: false,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
    ],
  } satisfies User,

  '/badges/doc/test-certification-001': {
    name: 'Test Certification',
    displayName: 'Test Certification',
    description: 'A test certification badge',
    link: 'https://badge.source.com',
    icon: 'https://badge.source.com/icon.png',
    borderImage: 'https://badge.source.com/border.png',
    issuers: ['authorized-issuer@test.com', 'service-token-123'],
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
  } satisfies Badge,
};
