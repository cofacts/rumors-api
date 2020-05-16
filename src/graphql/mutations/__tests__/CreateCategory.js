jest.mock('util/grpc');

import gql from 'util/GraphQL';
import client from 'util/client';
import MockDate from 'mockdate';

describe('CreateCategory', () => {
  it('creates a category', async () => {
    MockDate.set(1485593157011);
    const { data, errors } = await gql`
      mutation($title: String!, $description: String!) {
        CreateCategory(title: $title, description: $description) {
          id
        }
      }
    `(
      {
        title: '保健秘訣、食品安全',
        description:
          '各種宣稱會抗癌、高血壓、糖尿病等等的偏方秘笈、十大恐怖美食、不要吃海帶、美粒果',
      },
      { userId: 'test', appId: 'test' }
    );

    const categoryId = data.CreateCategory.id;
    const { body: category } = await client.get({
      index: 'categories',
      type: 'doc',
      id: categoryId,
    });

    expect(errors).toBeUndefined();
    expect(category._source).toMatchSnapshot('created category');

    // Cleanup
    await client.delete({ index: 'categories', type: 'doc', id: categoryId });
  });
});
