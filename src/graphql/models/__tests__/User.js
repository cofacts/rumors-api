import fixtures from '../__fixtures__/User';
import { random, sample } from 'lodash';
import {
  generatePseudonym,
  generateOpenPeepsAvatar,
  userFieldResolver,
  currentUserOnlyField,
} from '../User';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import DataLoaders from '../../dataLoaders';

jest.mock('lodash', () => ({
  random: jest.fn(),
  sample: jest.fn(),
}));

describe('User model', () => {
  beforeAll(async () => await loadFixtures(fixtures));
  afterAll(async () => await unloadFixtures(fixtures));

  describe('currentUserOnlyField', () => {
    const user = {
      id: 'testuser1',
      name: 'test user 1',
      appUserId: 'userTest1',
      appId: 'TEST_BACKEND',
    };
    const mockResolver = jest.fn().mockReturnValue('John Doe');

    it('handles null current user gracefully', async () => {
      const args = [user, 'arg', {}, { fieldName: 'name' }];
      expect(
        await currentUserOnlyField('type', mockResolver).resolve(...args)
      ).toBe(null);
      expect(mockResolver).not.toHaveBeenCalled();

      expect(await currentUserOnlyField('type').resolve(...args)).toBe(null);
    });

    it('returns requested field for current user', async () => {
      const args = [user, 'arg', { user }, { fieldName: 'name' }];
      expect(
        await currentUserOnlyField('type', mockResolver).resolve(...args)
      ).toBe('John Doe');
      expect(mockResolver).toHaveBeenLastCalledWith(...args);
      mockResolver.mockClear();
      expect(await currentUserOnlyField('type').resolve(...args)).toBe(
        user.name
      );
    });

    it('does not return requested field for another user', async () => {
      const args = [
        user,
        'arg',
        { user: { id: 'foo' } },
        { fieldName: 'name' },
      ];
      expect(
        await currentUserOnlyField('type', mockResolver).resolve(...args)
      ).toBe(null);
      expect(mockResolver).not.toHaveBeenCalled();

      expect(await currentUserOnlyField('type').resolve(...args)).toBe(null);
    });
  });

  describe('userFieldResolver', () => {
    const loaders = new DataLoaders();
    const resolveUser = ({ userId, appId }, ctx = {}) =>
      userFieldResolver({ userId, appId }, {}, { loaders, ...ctx });

    it('handles missing arguments gracefully', async () => {
      expect(await resolveUser({ appId: 'WEBSITE' })).toBe(null);
      expect(await resolveUser({ appId: 'TEST_BACKEND' })).toBe(null);
      expect(await resolveUser({ userId: 'abc' })).toBe(null);
    });

    it('returns the right backend user given appUserId', async () => {
      expect(
        await resolveUser({
          appId: 'TEST_BACKEND',
          userId: 'userTest1',
        })
      ).toMatchSnapshot();
    });

    it('returns the right backend user given db userId', async () => {
      expect(
        await resolveUser({
          userId: '6LOqD_z5A8BwUr4gh1P2gw_2zFU3IIrSchTSl-vemod7CChMU',
          appId: 'TEST_BACKEND',
        })
      ).toMatchSnapshot();
    });

    it('returns the right web user given userId', async () => {
      expect(
        await resolveUser({
          userId: 'userTest2',
          appId: 'WEBSITE',
        })
      ).toMatchSnapshot();
    });

    it('returns appUserId only to requests from the same client', async () => {
      expect(
        await resolveUser({
          userId: 'userTest3',
          appId: 'WEBSITE',
        })
      ).toBe(null);

      expect(
        await resolveUser(
          {
            userId: 'userTest3',
            appId: 'TEST_BACKEND',
          },
          { appId: 'TEST_BACKEND' }
        )
      ).toStrictEqual({ id: 'userTest3' });
    });
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
