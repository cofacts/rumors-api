import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/UpdateUser';

const testUser1 = fixtures['/users/doc/testUser1'];
const testUser2 = fixtures['/users/doc/testUser2'];

const updateUser = (variableString, userId) => 
  gql`
      mutation {
        updatedUser: UpdateUser(${variableString}) {
          id
          name
          slug
          bio
          avatarType
          avatarUrl
          avatarData
          updatedAt
        }
      }
    `({}, { userId });

const getUser = async (userId) => {
  const {
      body: { _source: user },
    } = await client.get({
      index: 'users',
      type: 'doc',
      id: userId,
    });
  return user
}


describe('UpdateUser', () => {
  let now = 1485593157011;
  beforeAll(() => loadFixtures(fixtures));
  beforeEach(() => {
    MockDate.set(now);
    now += 10000;
  })

  it('should set user name field correctly', async () => {
    const userId = 'normal';
    const appId = 'test';

    const { data, errors } = await gql`
      mutation {
        updatedUser: UpdateUser(name: "Mark") {
          id
          name
          updatedAt
        }
      }
    `({}, { userId, appId });

    expect(errors).toBe(undefined);
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

  it('should set user slug field correctly', async () => {

    const { data, errors } = await updateUser(`slug: "test-user-1"`, testUser1.id);

    expect(errors).toBe(undefined);
    expect(data).toMatchSnapshot();

    expect(await getUser(testUser1.id)).toMatchSnapshot();
  });

  it('cannot set duplicated slug', async () => {

    const { errors } = await updateUser(`slug: "${testUser2.slug}"`, testUser1.id);

    expect(errors).toMatchSnapshot();

    expect(await getUser(testUser1.id)).toMatchSnapshot();

  });

  it('should set all provided fields correctly', async () => {

    const { data, errors } = await updateUser(`slug: "test-user-3", name: "new name", avatarType: Gravatar, bio: "blahblahblah"`, testUser1.id);    

    expect(errors).toBe(undefined);
    expect(data).toMatchSnapshot();

    expect(await getUser(testUser1.id)).toMatchSnapshot();
  });

  it('should not set unsupported fields', async () => {

    const { errors } = await updateUser(`email: "newemail@example.com"`, testUser1.id);    

    expect(errors).toMatchSnapshot();

    expect(await getUser(testUser1.id)).toMatchSnapshot();
  });

  it('should not unset fields', async () => {

    const { errors } = await updateUser(`slug: "", name: null`, testUser1.id);    

    expect(errors).toMatchSnapshot();

    expect(await getUser(testUser1.id)).toMatchSnapshot();
  });

  it('should clear avatarData field for non openpeeps avatar', async () => {

    let { data, errors } = await updateUser(`avatarData:"""{"key":"value"}""", avatarType: OpenPeeps`, testUser1.id);    
    expect(errors).toBe(undefined);
    expect(data).toMatchSnapshot('openpeeps');

    ({ data, errors } = await updateUser(`avatarType: Facebook`, testUser1.id)); 
    expect(errors).toBe(undefined);
    expect(data).toMatchSnapshot('facebook');

    ({ data, errors } = await updateUser(`avatarType: Github, avatarData:"""{"key":"value"}"""`, testUser1.id)); 
    expect(errors).toBe(undefined);
    expect(data).toMatchSnapshot('github');

    expect(await getUser(testUser1.id)).toMatchSnapshot();
  });

  afterAll(() => {
    MockDate.reset();
    return unloadFixtures(fixtures);
  });
});
