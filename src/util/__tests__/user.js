import { loadFixtures, unloadFixtures } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/user';
import rollbar from 'rollbarInstance';
import { random, sample } from 'lodash';

import {
  generatePseudonym,
  generateOpenPeepsAvatar,
  getUserId,
  createOrUpdateUser,
  assertUser,
  AUTH_ERROR_MSG,
  avatarUrlResolver,
  getAvailableAvatarTypes,
  AvatarTypes,
} from '../user';

jest.mock('lodash', () => {
  const actualLodash = jest.requireActual('lodash');
  return {
    random: jest.spyOn(actualLodash, 'random'),
    sample: jest.spyOn(actualLodash, 'sample'),
  };
});

jest.mock('../user', () => {
  const userUtils = jest.requireActual('../user');

  return {
    ...userUtils,
    generatePseudonym: jest.spyOn(userUtils, 'generatePseudonym'),
    generateOpenPeepsAvatar: jest.spyOn(userUtils, 'generateOpenPeepsAvatar'),
    getUserId: jest.spyOn(userUtils, 'getUserId'),
  };
});

describe('user utils', () => {
  describe('assertUser', () => {
    it('should throw error if userId is not present', () => {
      expect(() => assertUser({})).toThrow(AUTH_ERROR_MSG);
      expect(() => assertUser({ appId: 'appId' })).toThrow(AUTH_ERROR_MSG);
      expect(() => assertUser(null)).toThrow(AUTH_ERROR_MSG);
      expect(() => assertUser()).toThrow(AUTH_ERROR_MSG);
    });

    it('should throw error if appId is not present', () => {
      expect(() => assertUser({ userId: 'userId' })).toThrow(
        'userId is set, but x-app-id or x-app-secret is not set accordingly.'
      );
    });

    it('should not throw error if userId and appId are both present', () => {
      expect(() =>
        assertUser({ appId: 'appId', userId: 'userId' })
      ).not.toThrow();
    });

    it('should not throw error for user doc', async () => {
      const { user } = await createOrUpdateUser({
        userId: 'foo',
        appId: 'bar',
      });
      expect(() => assertUser(user)).not.toThrow();

      // Cleanup
      await client.delete({ index: 'users', type: 'doc', id: user.id });
    });
  });

  describe('pseudo name and avatar generators', () => {
    it('should generate pseudo names for user', () => {
      [
        0, // adjectives
        1, // names
        2, // towns
        3, // separators
        4, // decorators
        44, // adjectives
        890, // names
        349, // towns
        17, // separators
        42, // decorators
      ].forEach(index => sample.mockImplementationOnce(ary => ary[index]));

      expect(generatePseudonym()).toBe(`忠懇的信義區艾達`);
      expect(generatePseudonym()).toBe('㊣來自金城✖一本正經的✖金城武㊣');
    });

    it('should generate avatars for user', () => {
      [
        5, // face
        12, // hair
        7, // body
        3, // accessory
        2, // facialHair
        9, // face
        0, // hair
        2, // body
      ].forEach(index => sample.mockImplementationOnce(ary => ary[index]));
      [
        0, // with accessory or not
        0, // with facialHair or not
        1, // to flip image or not
        0.23, // backgroundColorIndex
        1, // with accessory or not
        1, // with facialHair or not
        0, // to flip image or not
        0.17, // backgroundColorIndex
      ].forEach(r => random.mockReturnValueOnce(r));

      expect(generateOpenPeepsAvatar()).toMatchObject({
        accessory: 'None',
        body: 'PointingUp',
        face: 'Contempt',
        hair: 'HatHip',
        facialHair: 'None',
        backgroundColorIndex: 0.23,
        flip: true,
      });

      expect(generateOpenPeepsAvatar()).toMatchObject({
        accessory: 'SunglassWayfarer',
        body: 'ButtonShirt',
        face: 'EyesClosed',
        hair: 'Afro',
        facialHair: 'FullMajestic',
        backgroundColorIndex: 0.17,
        flip: false,
      });
    });
  });

  describe('avatarResolvers', () => {
    it('avatarUrlResolver returns avatar url based on avatar type', () => {
      const user = {
        id: '123',
        facebookId: 'facebookId',
        githubId: 'githubId',
      };
      expect(avatarUrlResolver()(user)).toBe(
        'https://www.gravatar.com/avatar/?s=100&d=mp'
      );
      expect(
        avatarUrlResolver()({ ...user, email: ' UserId@Example.com  ' })
      ).toBe(
        'https://www.gravatar.com/avatar/6a5ba97dfa6cd3a497a73a517342c643?s=100&d=identicon&r=g'
      );
      expect(
        avatarUrlResolver()({
          ...user,
          email: 'userid@example.com',
          avatarType: 'Gravatar',
        })
      ).toBe(
        'https://www.gravatar.com/avatar/6a5ba97dfa6cd3a497a73a517342c643?s=100&d=identicon&r=g'
      );
      expect(avatarUrlResolver()({ ...user, avatarType: 'Facebook' })).toBe(
        `https://graph.facebook.com/v9.0/${user.facebookId}/picture?height=100`
      );
      expect(avatarUrlResolver()({ ...user, avatarType: 'Github' })).toBe(
        `https://avatars2.githubusercontent.com/u/${user.githubId}?s=100`
      );
    });

    it('getAvailableAvatarTypes returns a list of avatar types based on available fields', () => {
      expect(getAvailableAvatarTypes()).toStrictEqual([AvatarTypes.OpenPeeps]);
      expect(
        getAvailableAvatarTypes({ facebookId: 'facebookId' })
      ).toStrictEqual([AvatarTypes.OpenPeeps, AvatarTypes.Facebook]);
      expect(
        getAvailableAvatarTypes({ facebookId: 'facebookId', email: 'email' })
      ).toStrictEqual([
        AvatarTypes.OpenPeeps,
        AvatarTypes.Gravatar,
        AvatarTypes.Facebook,
      ]);
      expect(
        getAvailableAvatarTypes({ githubId: 'githubId', email: 'email' })
      ).toStrictEqual([
        AvatarTypes.OpenPeeps,
        AvatarTypes.Gravatar,
        AvatarTypes.Github,
      ]);
      expect(
        getAvailableAvatarTypes({
          facebookId: 'facebookId',
          githubId: 'githubId',
          email: 'email',
        })
      ).toStrictEqual([
        AvatarTypes.OpenPeeps,
        AvatarTypes.Gravatar,
        AvatarTypes.Facebook,
        AvatarTypes.Github,
      ]);
    });
  });

  describe('CreateOrUpdateUser', () => {
    beforeAll(async () => {
      await loadFixtures(fixtures);
      generatePseudonym.mockReturnValue('Friendly Neighborhood Spider Man');
      generateOpenPeepsAvatar.mockReturnValue({ accessory: 'mask' });
    });

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

    it('fills appId for website users', async () => {
      MockDate.set(1602291600000);

      const userId = 'web-user';
      const appId = 'WEBSITE';

      const { user, isCreated } = await createOrUpdateUser({
        userId,
        appId,
      });

      expect(isCreated).toBe(false);
      expect(user).toMatchSnapshot();
    });
  });
});
