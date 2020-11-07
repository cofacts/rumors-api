import { loadFixtures, unloadFixtures } from 'util/fixtures';
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

describe('CreateOrUpdateUser', () => {
  beforeAll(() => loadFixtures(fixtures));

  afterAll(() => unloadFixtures(fixtures));

  it('creates backend user if not existed', async () => {
    MockDate.set(1602288000000);
    const userId = 'testUser2';
    const appId = 'TEST_BACKEND';

    const { user, isCreated } = await createOrUpdateUser({
      userId,
      appId,
    });

    expect(isCreated).toBe(true);
    expect(user).toMatchSnapshot();

    const id = getUserId({ userId, appId });

    const {
      body: { _source: source },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id,
    });
    expect(source).toMatchSnapshot();
    expect(rollbar.error).not.toHaveBeenCalled();
    rollbar.error.mockClear();

    MockDate.reset();
    await client.delete({ index: 'users', type: 'doc', id });
  });

  it("updates backend users' last active time if user already existed", async () => {
    MockDate.set(1602291600000);

    const userId = 'testUser1';
    const appId = 'TEST_BACKEND';

    const { user, isCreated } = await createOrUpdateUser({
      userId,
      appId,
    });

    expect(isCreated).toBe(false);
    expect(user).toMatchSnapshot();

    const id = getUserId({ userId, appId });
    const {
      body: { _source: source },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id,
    });
    expect(source).toMatchSnapshot();
    expect(rollbar.error).not.toHaveBeenCalled();
    rollbar.error.mockClear();
  });

  it('logs error if collision occurs', async () => {
    MockDate.set(1602291600000);

    const userId = 'testUser3';
    const appId = 'TEST_BACKEND';
    const id = getUserId({ userId: 'testUser1', appId });

    getUserId.mockReturnValueOnce(id);
    const { user, isCreated } = await createOrUpdateUser({
      userId,
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
    rollbar.error.mockClear();
  });
});
