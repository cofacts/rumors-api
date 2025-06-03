import type { User } from 'rumors-db/schema/users';
import type { Badge } from 'rumors-db/schema/badges';

export default {
  '/users/doc/user-with-badge': {
    name: 'user-with-badge',
    createdAt: '2020-01-01T00:00:00.000Z',
    googleId: 'some-google-id',
    badges: [
      {
        badgeId: 'test-certification-001',
        badgeMetaData: '{"from":"some-orgnization"}',
        isDisplayed: true,
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
      {
        badgeId: 'test-certification-002',
        badgeMetaData: '{"from":"another-orgnization"}',
        isDisplayed: false,
        createdAt: '2020-01-02T00:00:00.000Z',
        updatedAt: '2020-01-02T00:00:00.000Z',
      },
    ],
  } satisfies User,

  '/users/doc/user-without-badge': {
    name: 'user-without-badge',
    createdAt: '2020-01-01T00:00:00.000Z',
    googleId: 'some-google-id',
    badges: [],
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

  '/badges/doc/test-certification-002': {
    name: 'Another Test Certification',
    displayName: 'Another Test Certification',
    description: 'Another test certification badge',
    link: 'https://badge.source.com',
    icon: 'https://badge.source.com/icon2.png',
    borderImage: 'https://badge.source.com/border2.png',
    issuers: ['authorized-issuer@test.com', 'service-token-123'],
    createdAt: '2020-01-02T00:00:00.000Z',
    updatedAt: '2020-01-02T00:00:00.000Z',
  } satisfies Badge,
};
