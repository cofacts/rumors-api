import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/GetUser';

const currentUser = fixtures['/users/basic/current-user'];
describe('GetUser', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('Get current user specified in context when no ID is given', async () => {
    expect(
      await gql`{
      GetUser {
        name
        email
      }
    }`({}, { user: currentUser })
    ).toMatchSnapshot();
  });

  it('Get limited data', async () => {
    expect(
      await gql`{
      GetUser(id: "test-user") {
        name
        email
      }
    }`({}, { user: currentUser })
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
