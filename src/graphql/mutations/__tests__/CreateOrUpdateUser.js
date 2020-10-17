import { loadFixtures, saveStateForIndices, clearIndices } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateOrUpdateUser';
import rollbar from 'rollbarInstance';
import { getUserId } from 'graphql/models/User';
import { createOrUpdateUser } from '../CreateOrUpdateUser';

jest.mock('../../models/User', () => {
  const UserModel = jest.requireActual('../../models/User');
  return {
    ...UserModel,
    __esModule: true,
    generatePseudonym: jest
      .fn()
      .mockReturnValue('Friendly Neighborhood Spider Man'),
    generateOpenPeepsAvatar: jest.fn().mockReturnValue({ accessory: 'mask' }),
    getUserId: jest.spyOn(UserModel, 'getUserId'),
  };
});

jest.mock('../../../rollbarInstance', () => ({
  __esModule: true,
  default: { error: jest.fn() },
}));

let dbStates = {};

describe('CreateOrUpdateUser', () => {
  beforeAll(async () => {
    dbStates = await saveStateForIndices(['users']);
    await clearIndices(['users']);
    await loadFixtures(fixtures);
  });

  afterAll(async () => {
    await clearIndices(['users']);
    // restore db states to prevent affecting other tests
    await loadFixtures(dbStates);
  });

  it('creates backend user if not existed', async () => {
    MockDate.set(1602288000000);
    const userId = 'testUser2';
    const appId = 'TEST_BACKEND';

    const { user, isCreated } = await createOrUpdateUser({
      appUserId: userId,
      appId,
    });

    expect(isCreated).toBe(true);
    expect(user).toMatchSnapshot();

    const id = getUserId({ appUserId: userId, appId });

    const {
      body: { _source: source },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id,
    });
    expect(source).toMatchSnapshot();

    MockDate.reset();
  });

  it("updates backend users' last active time if user already existed", async () => {
    MockDate.set(1602291600000);

    const userId = 'testUser1';
    const appId = 'TEST_BACKEND';

    const { user, isCreated } = await createOrUpdateUser({
      appUserId: userId,
      appId,
    });

    expect(isCreated).toBe(false);
    expect(user).toMatchSnapshot();

    const id = getUserId({ appUserId: userId, appId });
    const {
      body: { _source: source },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id,
    });
    expect(source).toMatchSnapshot();
  });

  it('logs error if collision occurs', async () => {
    MockDate.set(1602291600000);

    const userId = 'testUser3';
    const appId = 'TEST_BACKEND';
    const id = getUserId({ appUserId: 'testUser1', appId });

    getUserId.mockReturnValueOnce(id);
    const { user, isCreated } = await createOrUpdateUser({
      appUserId: userId,
      appId,
    });

    expect(isCreated).toBe(false);
    expect(user).toMatchSnapshot();

    const {
      body: { _source: source },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id,
    });
    expect(source).toMatchSnapshot();
    expect(rollbar.error.mock.calls).toMatchSnapshot();
  });
});
