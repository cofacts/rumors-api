import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/GetUser';

const currentUser = {
  ...fixtures['/users/doc/current-user'],
  id: 'current-user',
};
const testEmailUser = {
  ...fixtures['/users/doc/test-email-user'],
  id: 'test-email-user',
};
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

  it('Get user by slug', async () => {
    expect(
      await gql`
        {
          GetUser(slug: "abc123") {
            id
            slug
            name
          }
        }
      `({}, { user: currentUser })
    ).toMatchSnapshot('testUser');
    expect(
      await gql`
        {
          GetUser(slug: "def456") {
            id
            slug
            name
          }
        }
      `({}, { user: currentUser })
    ).toMatchSnapshot('currentUser');
    expect(
      await gql`
        {
          GetUser(slug: "ghi789") {
            id
            slug
            name
          }
        }
      `({}, { user: currentUser })
    ).toMatchSnapshot('testEmailUser');
  });

  it('Get user by id and slug should fail', async () => {
    const { errors } = await gql`
      {
        GetUser(slug: "ghi789", id: "id") {
          id
          slug
        }
      }
    `({}, { user: currentUser });
    expect(errors).toMatchSnapshot();
  });

  it('Get user by non existing slug return null', async () => {
    const { data, errors } = await gql`
      {
        GetUser(slug: "adsf") {
          id
          slug
        }
      }
    `({}, { user: currentUser });
    expect(data).toMatchObject({ GetUser: null });
    expect(errors).toBe(undefined);
  });

  it('Get user by non existing id return null', async () => {
    const { data, errors } = await gql`
      {
        GetUser(id: "adsf") {
          id
          slug
        }
      }
    `({}, { user: currentUser });
    expect(data).toMatchObject({ GetUser: null });
    expect(errors).toBe(undefined);
  });

  it('returns avatarUrl/avatarData based on avatarType selected by User', async () => {
    expect(
      await gql`
        {
          GetUser(id: "test-user") {
            id
            avatarType
            avatarUrl
            avatarData
            availableAvatarTypes
          }
        }
      `({}, { user: currentUser })
    ).toMatchSnapshot('testUser');
    expect(
      await gql`
        {
          GetUser(id: "current-user") {
            id
            avatarType
            avatarUrl
            avatarData
            availableAvatarTypes
          }
        }
      `({}, { user: currentUser })
    ).toMatchSnapshot('currentUser');
    expect(
      await gql`
        {
          GetUser(id: "test-email-user") {
            id
            avatarType
            avatarUrl
            avatarData
            availableAvatarTypes
          }
        }
      `({}, { user: testEmailUser })
    ).toMatchSnapshot('testEmailUser');
    expect(
      await gql`
        {
          GetUser(id: "another-user") {
            id
            avatarType
            avatarUrl
            avatarData
            availableAvatarTypes
          }
        }
      `({}, { user: currentUser })
    ).toMatchSnapshot('openPeepsUser');
  });

  it('returns contributions of a user', async () => {
    expect(
      await gql`
        {
          GetUser {
            id
            contributions(dateRange: { GTE: "2020-02-01", LTE: "2020-02-05" }) {
              date
              count
            }
          }
        }
      `({}, { user: currentUser })
    ).toMatchSnapshot();
  });

  afterAll(() => unloadFixtures(fixtures));
});
