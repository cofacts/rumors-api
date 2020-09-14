import { random, sample } from 'lodash';
import { generatePseudonym, generateOpenPeepsAvatar } from '../User';

jest.mock('lodash', () => ({
  random: jest.fn(),
  sample: jest.fn(),
}));

describe('User model', () => {
  describe('pseudo name and avatar generators', () => {
    it('should generate pseudo names for user', () => {
      [0, 1, 2, 3, 4, 44, 890, 349, 2, 0].forEach(index =>
        sample.mockImplementationOnce(ary => ary[index])
      );

      expect(generatePseudonym()).toBe(`☞忠懇的✿信義區✿艾達☜`);
      expect(generatePseudonym()).toBe('來自金城✖一本正經的✖金城武');
    });

    it('should generate avatars for user', () => {
      [5, 12, 7, 3, 2, 9, 0, 2].forEach(index =>
        sample.mockImplementationOnce(ary => ary[index])
      );

      [0, 0, 1, 0.23, 1, 1, 0, 0.17].forEach(r =>
        random.mockReturnValueOnce(r)
      );

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
