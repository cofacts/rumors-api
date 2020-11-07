import fixtures from '../__fixtures__/User';
import { userFieldResolver, currentUserOnlyField } from '../User';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import DataLoaders from '../../dataLoaders';

describe('User model', () => {
  beforeAll(() => loadFixtures(fixtures));
  afterAll(() => unloadFixtures(fixtures));

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
