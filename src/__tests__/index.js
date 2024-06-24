import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import { apolloServer } from '../index';
import fixtures from '../__fixtures__/index';
import { createTestClient } from 'apollo-server-testing';
import MockDate from 'mockdate';
import GetUser from '../graphql/queries/GetUser';

jest.mock('koa', () => {
  const Koa = jest.requireActual('koa');
  Koa.prototype.listen = () => null;
  return {
    default: Koa,
    __esModule: true,
  };
});

jest.mock('../graphql/queries/GetUser', () => {
  const GetUser = jest.requireActual('../graphql/queries/GetUser').default;
  return {
    default: {
      ...GetUser,
      resolve: jest.spyOn(GetUser, 'resolve'),
    },
    __esModule: true,
  };
});

describe('apolloServer', () => {
  const actualGraphQLServerOptions = apolloServer.graphQLServerOptions;
  const mockGraphQLServerOptions = (ctx) => async () =>
    actualGraphQLServerOptions.call(apolloServer, { ctx });
  let now;

  const getCurrentUser = async (ctx = {}) => {
    apolloServer.graphQLServerOptions = mockGraphQLServerOptions(ctx);

    const testClient = createTestClient(apolloServer);
    const {
      data: { GetUser: res },
      errors,
    } = await testClient.query({
      query: `{
        GetUser {
          id
          appId
          appUserId
          name
          lastActiveAt
        }
      }`,
    });
    return { res, errors };
  };

  beforeAll(async () => {
    MockDate.set(1602288000000);
    now = new Date().toISOString();

    await loadFixtures(fixtures);
  });

  afterAll(async () => {
    MockDate.reset();

    await unloadFixtures(fixtures);
    await client.delete({
      index: 'users',
      type: 'doc',
      id: '6LOqD_gsUWLlGviSA4KFdKpsNncQfTYeueOl-DGx9fL6zCNeA',
    });
  });

  afterEach(() => GetUser.resolve.mockClear());

  it('gracefully handles no auth request', async () => {
    const { res, errors } = await getCurrentUser();
    expect(errors).toBeUndefined();
    expect(res).toBe(null);
  });

  it('resolves current web user', async () => {
    const appId = 'WEBSITE';
    const userId = 'testUser1';

    const { res, errors } = await getCurrentUser({
      appId,
      userId,
      state: { user: { id: userId } },
      query: { userId },
    });

    const expectedUser = {
      id: 'testUser1',
      name: 'test user 1',
      appId: 'WEBSITE',
      lastActiveAt: now,
    };

    expect(errors).toBeUndefined();
    expect(res).toMatchObject(expectedUser);
    const {
      user: ctxUser,
      userId: ctxUserId,
      appUserId: ctxAppUserId,
      appId: ctxAppId,
    } = GetUser.resolve.mock.calls[0][2];
    expect(ctxUser).toMatchObject(expectedUser);
    expect(ctxUserId).toBe(userId);
    expect(ctxAppUserId).toBe(userId);
    expect(ctxAppId).toBe(appId);
  });

  it('resolves current backend user', async () => {
    const appId = 'TEST_BACKEND';
    const userId = 'testUser2';

    const { res, errors } = await getCurrentUser({
      appId,
      userId,
      state: {},
      query: { userId },
    });

    const expectedUser = {
      id: '6LOqD_3gpe4ZVaxRvemf7KNTfm6y3WNBu1hbs-5MRdSWiWVss',
      name: 'test user 2',
      appId: 'TEST_BACKEND',
      appUserId: 'testUser2',
      lastActiveAt: now,
    };
    expect(errors).toBeUndefined();
    expect(res).toMatchObject(expectedUser);
    const {
      user: ctxUser,
      userId: ctxUserId,
      appUserId: ctxAppUserId,
      appId: ctxAppId,
    } = GetUser.resolve.mock.calls[0][2];
    expect(ctxUser).toMatchObject(expectedUser);
    expect(ctxUserId).toBe(expectedUser.id);
    expect(ctxAppUserId).toBe(userId);
    expect(ctxAppId).toBe(appId);
  });

  it('creates new backend user if not existed', async () => {
    const appId = 'TEST_BACKEND';
    const userId = 'testUser3';

    const { res, errors } = await getCurrentUser({
      appId,
      userId,
      state: {},
      query: { userId },
    });

    const expectedUser = {
      id: '6LOqD_gsUWLlGviSA4KFdKpsNncQfTYeueOl-DGx9fL6zCNeA',
      name: expect.any(String),
      appId: 'TEST_BACKEND',
      appUserId: 'testUser3',
      lastActiveAt: now,
    };
    expect(errors).toBeUndefined();
    expect(res).toMatchObject(expectedUser);
    const {
      user: ctxUser,
      userId: ctxUserId,
      appUserId: ctxAppUserId,
      appId: ctxAppId,
    } = GetUser.resolve.mock.calls[0][2];
    expect(ctxUser).toMatchObject(expectedUser);
    expect(ctxUserId).toBe(expectedUser.id);
    expect(ctxAppUserId).toBe(userId);
    expect(ctxAppId).toBe(appId);
  });
});
