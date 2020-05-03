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

  it('should set user name field correctly', async () => {
    const userId = 'normal';
    const appId = 'test';

    const { data } = await gql`
      mutation {
        updatedUser: UpdateUser(name: "Mark") {
          id
          name
          updatedAt
        }
      }
    `({}, { userId, appId });

    expect(data).toMatchSnapshot();

    const {
      body: { _source: normal },
    } = await client.get({
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
