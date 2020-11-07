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
  });
});
