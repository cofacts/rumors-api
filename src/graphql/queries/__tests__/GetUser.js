import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/GetUser';

const currentUser = fixtures['/users/doc/current-user'];
const testEmailUser = fixtures['/users/doc/test-email-user'];
describe('GetUser', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('Get current user specified in context when no ID is given', async () => {
    expect(
      await gql`
        {
          GetUser {
            name
            email
            repliedArticleCount
            votedArticleReplyCount
            level
            points {
              total
              currentLevel
              nextLevel
            }
          }
        }
      `({}, { user: currentUser })
    ).toMatchSnapshot();
  });

  it('Get limited data', async () => {
    expect(
      await gql`
        {
          GetUser(id: "test-user") {
            name
            email # should be null
            repliedArticleCount
            votedArticleReplyCount
            level
            points {
              total
              currentLevel
              nextLevel
            }
          }
        }
      `({}, { user: currentUser })
    ).toMatchSnapshot();
  });

  it('Get user avatar url from gravatar', async () => {
    expect(
      await gql`
        {
          GetUser(id: "test-email-user") {
            name
            avatarUrl
          }
        }
      `({}, { user: testEmailUser })
    ).toMatchSnapshot();

    // extra padding & capital letter case
    testEmailUser.email = ' COfacts.tw@gmail.coM    ';

    expect(
      await gql`
        {
          GetUser(id: "test-email-user") {
            name
            avatarUrl
          }
        }
      `({}, { user: testEmailUser })
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
