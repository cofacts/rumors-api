import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures, resetFrom } from 'util/fixtures';
import client from 'util/client';
import MockDate from 'mockdate';
import fixtures from '../__fixtures__/UpdateArticleCategoryStatus';

describe('UpdateArticleCategoryStatus', () => {
  beforeEach(() => {
    MockDate.set(1485593157011);
    return loadFixtures(fixtures);
  });

  it("should not allow users to delete other's article categories", async () => {
    const userId = 'foo';
    const appId = 'test';

    const { errors } = await gql`
      mutation {
        UpdateArticleCategoryStatus(
          articleId: "others"
          categoryId: "others"
          status: DELETED
        ) {
          status
          updatedAt
        }
      }
    `({}, { userId, appId });

    expect(errors).toMatchSnapshot();
  });

  it('should set article category fields correctly', async () => {
    const userId = 'foo';
    const appId = 'test';

    const { data, errors } = await gql`
      mutation {
        normal: UpdateArticleCategoryStatus(
          articleId: "normal"
          categoryId: "category"
          status: DELETED
        ) {
          articleId
          categoryId
          status
          updatedAt
        }
        deleted: UpdateArticleCategoryStatus(
          articleId: "deleted"
          categoryId: "category"
          status: NORMAL
        ) {
          articleId
          categoryId
          status
          updatedAt
        }
      }
    `({}, { userId, appId });

    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();

    const { _source: normal } = await client.get({
      index: 'articles',
      type: 'doc',
      id: 'normal',
    });
    expect(normal.articleCategories).toMatchSnapshot();
    expect(normal.normalArticleCategoryCount).toBe(0);

    const { _source: deleted } = await client.get({
      index: 'articles',
      type: 'doc',
      id: 'deleted',
    });
    expect(deleted.articleCategories).toMatchSnapshot();
    expect(deleted.normalArticleCategoryCount).toBe(1);

    // Cleanup
    await resetFrom(fixtures, '/articles/doc/normal');
    await resetFrom(fixtures, '/articles/doc/deleted');
  });

  afterEach(() => {
    MockDate.reset();
    return unloadFixtures(fixtures);
  });
});
