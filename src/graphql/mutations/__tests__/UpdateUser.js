import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/UpdateUser';

describe('UpdateUser', () => {
  beforeEach(() => {
    MockDate.set(1485593157011);
    return loadFixtures(fixtures);
  });

  it('should throw exception when trying to set the original name', async () => {
    const userId = 'error';
    const appId = 'test';

    const { errors } = await gql`
      mutation {
        updatedUser: UpdateUser(name: "Bill") {
          name
          updatedAt
        }
      }
    `({}, { userId, appId });

    expect(errors).toMatchSnapshot();
  });

  it('should set user name field correctly', async () => {
    const userId = 'normal';
    const appId = 'test';

    const { data } = await gql`
      mutation {
        updatedUser: UpdateUser(name: "Mark") {
          name
          updatedAt
        }
      }
    `({}, { userId, appId });

    expect(data).toMatchSnapshot();

    const { _source: normal } = await client.get({
      index: 'users',
      type: 'doc',
      id: userId,
    });
    expect(normal).toMatchSnapshot();

    // Cleanup
    await resetFrom(fixtures, '/users/doc/normal');
  });

  afterEach(() => {
    MockDate.reset();
    return unloadFixtures(fixtures);
  });
});
