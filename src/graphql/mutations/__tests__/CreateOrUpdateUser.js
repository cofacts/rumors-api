import gql from 'util/GraphQL';
import { loadFixtures, saveStateForIndices, clearIndices } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/CreateOrUpdateUser';
import rollbar from 'rollbarInstance';
import { convertAppUserIdToUserId } from 'graphql/models/User';

jest.mock('../../models/User', () => {
  const UserModel = jest.requireActual('../../models/User');
  return {
    ...UserModel,
    __esModule: true,
    generatePseudonym: jest
      .fn()
      .mockReturnValue('Friendly Neighborhood Spider Man'),
    generateOpenPeepsAvatar: jest.fn().mockReturnValue({ accessory: 'mask' }),
    convertAppUserIdToUserId: jest.spyOn(UserModel, 'convertAppUserIdToUserId'),
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

    const { data, errors } = await gql`
      mutation {
        CreateOrUpdateUser {
          id
          name
          createdAt
          updatedAt
        }
      }
    `({}, { userId, appId });

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = convertAppUserIdToUserId({ appUserId: userId, appId });

    const {
      body: { _source: user },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id,
    });
    expect(user).toMatchSnapshot();

    MockDate.reset();
  });

  it("updates backend users' last active time if user already existed", async () => {
    MockDate.set(1602291600000);

    const userId = 'testUser1';
    const appId = 'TEST_BACKEND';

    const { data, errors } = await gql`
      mutation {
        CreateOrUpdateUser {
          id
          name
          createdAt
          updatedAt
        }
      }
    `({}, { userId, appId });

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const id = convertAppUserIdToUserId({ appUserId: userId, appId });
    const {
      body: { _source: user },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id,
    });
    expect(user).toMatchSnapshot();
  });

  it('logs error if collision occurs', async () => {
    MockDate.set(1602291600000);

    const userId = 'testUser2';
    const appId = 'TEST_BACKEND';
    const id = convertAppUserIdToUserId({ appUserId: 'testUser1', appId });

    convertAppUserIdToUserId.mockReturnValueOnce(id);
    const { data, errors } = await gql`
      mutation {
        CreateOrUpdateUser {
          id
          name
        }
      }
    `({}, { userId, appId });

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const {
      body: { _source: user },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id,
    });
    expect(user).toMatchSnapshot();
    expect(rollbar.error.mock.calls).toMatchSnapshot();
  });
});
