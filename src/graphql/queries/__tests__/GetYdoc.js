import gql from 'util/GraphQL';
import { loadFixtures, unloadFixtures } from 'util/fixtures';
import fixtures from '../__fixtures__/GetYdoc';

describe('GetYdoc', () => {
  beforeAll(() => loadFixtures(fixtures));
  afterAll(() => unloadFixtures(fixtures));

  it('should get the specified doc', async () => {
    expect(
      await gql`
        {
          GetYdoc(id: "foo") {
            data
            versions {
              createdAt
              snapshot
            }
          }
        }
      `({}, { user: { id: 'test', appId: 'test' } })
    ).toMatchSnapshot();
  });

  it('should return empty versions when there is none', async () => {
    expect(
      await gql`
        {
          GetYdoc(id: "foo2") {
            data
            versions {
              createdAt
              snapshot
            }
          }
        }
      `({}, { user: { id: 'test', appId: 'test' } })
    ).toMatchSnapshot();
  });
});
