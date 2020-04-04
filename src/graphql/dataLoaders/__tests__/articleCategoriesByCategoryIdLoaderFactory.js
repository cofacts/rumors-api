import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/articleCategoriesByCategoryIdLoaderFactory';

import DataLoaders from '../index';
const loader = new DataLoaders();

describe('articleCategoriesByCategoryIdLoaderFactory', () => {
  beforeAll(() => loadFixtures(fixtures));

  it('load id', async () => {
    expect(
      await loader.articleCategoriesByCategoryIdLoader.load({
        id: 'c1',
      })
    ).toMatchSnapshot();
  });

  it('load id with first', async () => {
    expect(
      await loader.articleCategoriesByCategoryIdLoader.load({
        id: 'c1',
        first: 2,
      })
    ).toMatchSnapshot();
  });

  it('load id with before', async () => {
    expect(
      await loader.articleCategoriesByCategoryIdLoader.load({
        id: 'c1',
        before: [+new Date('2020-02-09T15:11:05.472Z')],
      })
    ).toMatchSnapshot();
  });

  it('load id with after', async () => {
    expect(
      await loader.articleCategoriesByCategoryIdLoader.load({
        id: 'c1',
        after: [+new Date('2020-02-09T15:11:05.472Z')],
      })
    ).toMatchSnapshot();
  });

  it('should fail if before and after both exist', async () => {
    expect.assertions(1);
    try {
      await loader.articleCategoriesByCategoryIdLoader.load({
        id: 'c1',
        after: [+new Date('2020-02-09T15:11:05.472Z')],
        before: [+new Date('2020-02-09T15:11:05.472Z')],
      });
    } catch (e) {
      expect(e).toMatchSnapshot();
    }
  });

  afterAll(() => unloadFixtures(fixtures));
});
