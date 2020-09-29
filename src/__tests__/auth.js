import MockDate from 'mockdate';
import { loadFixtures, unloadFixtures, unloadDocs } from 'util/fixtures';
import fixtures from '../__fixtures__/auth';
import { verifyProfile } from '../auth';

const FIXED_DATE = 612921600000;

describe('verifyProfile', () => {
  beforeEach(() => loadFixtures(fixtures));
  afterEach(() => unloadFixtures(fixtures));

  it('authenticates user via profile ID', async () => {
    const passportProfile = {
      provider: 'facebook',
      id: 'secret-fb-id',
    };

    expect(
      await verifyProfile(passportProfile, 'facebookId')
    ).toMatchSnapshot();
  });

  it('authenticates user via same email of existing user; also updates profile ID', async () => {
    const passportProfile = {
      provider: 'twitter',
      id: 'secret-twitter-id',
      emails: [{ type: 'office', value: 'secret@secret.com' }],
    };

    MockDate.set(FIXED_DATE);
    expect(await verifyProfile(passportProfile, 'twitterId')).toMatchSnapshot();
    MockDate.reset();
  });

  it('creates new user if user does not exist', async () => {
    const passportProfile = {
      provider: 'facebook',
      id: 'another-fb-id',
      emails: [{ type: 'home', value: 'another@user.com' }],
      photos: [{ value: 'url-to-photo' }],
      displayName: 'New user',
    };

    MockDate.set(FIXED_DATE);
    // eslint-disable-next-line no-unused-vars
    const { id, ...newUser } = await verifyProfile(
      passportProfile,
      'facebookId'
    );
    MockDate.reset();

    expect(newUser).toMatchSnapshot();
    await unloadDocs([`/users/doc/${id}`]);
  });
});
