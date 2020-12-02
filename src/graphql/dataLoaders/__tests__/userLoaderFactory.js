import { loadFixtures, unloadFixtures } from 'util/fixtures';
import DataLoaders from '../index';
import fixtures from '../__fixtures__/userLoaderFactory';

const loader = new DataLoaders();

describe('userLoaderFactory', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('should return correct user with given slug', async () => {
    expect(
      await loader.userLoader.load({
        slug: 'abc123',
      })
    ).toMatchSnapshot();
    expect(
      await loader.userLoader.load({
        slug: 'def456',
      })
    ).toMatchSnapshot();
  });

  it('should return null if slug does not exist', async () => {
    expect(
      await loader.userLoader.load({
        slug: 'asdf',
      })
    ).toBe(null);
  });

  afterAll(() => unloadFixtures(fixtures));
});
