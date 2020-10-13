import fixtures from '../__fixtures__/User';
import { random, sample } from 'lodash';
import {
  generatePseudonym,
  generateOpenPeepsAvatar,
  userFieldResolver,
} from '../User';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import DataLoaders from '../../dataLoaders';

jest.mock('lodash', () => ({
  random: jest.fn(),
  sample: jest.fn(),
}));

describe('User model', () => {
  it('userFieldResolver returns the right user', async () => {
    await loadFixtures(fixtures);

    const loaders = new DataLoaders();
    expect(
      await userFieldResolver(
        {
          appId: 'TEST_BACKEND',
          userId: 'userTest1',
        },
        {},
        { loaders }
      )
    ).toMatchSnapshot();

    expect(
      await userFieldResolver(
        {
          userId: '6LOqD_z5A8BwUr4gh1P2gw_2zFU3IIrSchTSl-vemod7CChMU',
          appId: 'TEST_BACKEND',
        },
        {},
        { loaders }
      )
    ).toMatchSnapshot();

    expect(
      await userFieldResolver(
        {
          userId: 'userTest2',
          appId: 'WEBSITE',
        },
        {},
        { loaders }
      )
    ).toMatchSnapshot();

    expect(
      await userFieldResolver(
        {
          userId: 'userTest3',
          appId: 'WEBSITE',
        },
        {},
        { loaders }
      )
    ).toBe(null);

    expect(
      await userFieldResolver(
        {
          userId: 'userTest3',
          appId: 'TEST_BACKEND',
        },
        {},
        { loaders, appId: 'TEST_BACKEND' }
      )
    ).toStrictEqual({ id: 'userTest3' });

    await unloadFixtures(fixtures);
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
});
